terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws", configuration_aliases = [aws.global]
    }
  }
}

variable "name" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnets" {
  type = list(string)
}

variable "security_group" {
  type = string
}

variable "production" {
  type = bool
}

locals {
  origin_domain = "origin.${var.app_domain}"
}

data "aws_caller_identity" "current" {
}

resource "aws_acm_certificate" "regional" {
  domain_name               = var.app_domain
  subject_alternative_names = [var.api_domain, local.origin_domain]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "global" {
  provider                  = aws.global
  domain_name               = var.app_domain
  subject_alternative_names = [var.api_domain]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = {
    for d in aws_acm_certificate.regional.domain_validation_options : d.domain_name => d
  }
  zone_id = var.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "regional" {
  certificate_arn         = aws_acm_certificate.regional.arn
  validation_record_fqdns = [for d in aws_route53_record.validation : d.fqdn]
}

resource "aws_acm_certificate_validation" "global" {
  provider                = aws.global
  certificate_arn         = aws_acm_certificate.global.arn
  validation_record_fqdns = [for domain, d in aws_route53_record.validation : d.fqdn if domain != local.origin_domain]
}

resource "aws_lb" "this" {
  name                       = var.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.security_group]
  subnets                    = var.subnets
  enable_deletion_protection = var.production
  drop_invalid_header_fields = true
  # Raw ALB access logs include query-string reset/download tokens. Use sanitized API logs and ALB metrics.
}

resource "aws_lb_target_group" "service" {
  for_each = {
    api = 3001, web = 3000
  }
  name                 = "${var.name}-${each.key}"
  port                 = each.value
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30
  health_check {
    path                = each.key == "api" ? "/health/ready" : "/login"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "random_password" "origin" {
  length  = 48
  special = false
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.regional.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      status_code  = "403"
      message_body = "Forbidden"
    }
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  condition {
    path_pattern {
      values = ["/api/*", "/health", "/health/*"]
    }
  }
  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin.result]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["api"].arn
  }
}

resource "aws_lb_listener_rule" "web" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20
  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin.result]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["web"].arn
  }
}

resource "aws_route53_record" "origin" {
  zone_id = var.zone_id
  name    = local.origin_domain
  type    = "A"
  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

resource "aws_wafv2_web_acl" "this" {
  provider = aws.global
  name     = var.name
  scope    = "CLOUDFRONT"
  default_action {
    allow {
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = var.name
    sampled_requests_enabled   = false
  }
  rule {
    name     = "managed-common"
    priority = 10
    override_action {
      none {
      }
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = false
    }
  }
  rule {
    name     = "ip-rate-limit"
    priority = 20
    action {
      block {
      }
    }
    statement {
      rate_based_statement {
        limit              = 3000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = false
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = [var.app_domain, var.api_domain]
  web_acl_id      = aws_wafv2_web_acl.this.arn
  http_version    = "http2and3"
  origin {
    domain_name = aws_route53_record.origin.fqdn
    origin_id   = "application"
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin.result
    }
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  # No private application/API response is cached, including cookies and tenant data.
  default_cache_behavior {
    target_origin_id         = "application"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.viewer.id
    compress                 = true
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.global.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

resource "aws_route53_record" "app" {
  for_each = toset([var.app_domain, var.api_domain])
  zone_id  = var.zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}

output "target_groups" {
  value = {
    for k, v in aws_lb_target_group.service : k => v.arn
  }
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "target_group_suffix" {
  value = aws_lb_target_group.service["api"].arn_suffix
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}
