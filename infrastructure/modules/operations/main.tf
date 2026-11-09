variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "ops_email" {
  type = string
}

variable "budget" {
  type = number
}

variable "cluster" {
  type = string
}

variable "db_identifier" {
  type = string
}

variable "redis_identifier" {
  type = string
}

variable "alb_suffix" {
  type = string
}

variable "target_group_suffix" {
  type = string
}

variable "log_groups" {
  type = map(string)
}

variable "app_domain" {
  type = string
}

variable "api_domain" {
  type = string
}

data "aws_caller_identity" "current" {
}

data "aws_partition" "current" {
}

resource "aws_kms_key" "notifications" {
  description         = "${var.name} operational notifications"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Sid = "Owner", Effect = "Allow", Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        },
        Action = "kms:*", Resource = "*"
      },
      {
        Sid = "AWSNotifications", Effect = "Allow", Principal = {
          Service = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "ses.amazonaws.com"]
        },
        Action = ["kms:GenerateDataKey*", "kms:Decrypt"], Resource = "*", Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
    }]
  })
}

resource "aws_sns_topic" "ops" {
  name              = "${var.name}-operations"
  kms_master_key_id = aws_kms_key.notifications.arn
}

resource "aws_sns_topic_policy" "ops" {
  arn = aws_sns_topic.ops.arn
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        },
        Action = "SNS:*", Resource = aws_sns_topic.ops.arn
      },
      {
        Effect = "Allow", Principal = {
          Service = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "ses.amazonaws.com"]
        },
        Action = "SNS:Publish", Resource = aws_sns_topic.ops.arn, Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
    }]
  })
}

resource "aws_sns_topic_subscription" "ops" {
  topic_arn = aws_sns_topic.ops.arn
  protocol  = "email"
  endpoint  = var.ops_email
}

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain_name
}

resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = var.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.${var.region == "af-south-1" ? "af-south-1." : ""}amazonses.com"]
}

resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "mail.${var.domain_name}"
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_route53_record" "mail_mx" {
  zone_id = var.zone_id
  name    = "mail.${var.domain_name}"
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]
}

resource "aws_route53_record" "spf" {
  zone_id = var.zone_id
  name    = "mail.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com -all"]
}

resource "aws_route53_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=quarantine; rua=mailto:${var.ops_email}; adkim=s; aspf=r"]
}

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = var.name
  reputation_options {
    reputation_metrics_enabled = true
  }
  sending_options {
    sending_enabled = true
  }
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
  delivery_options {
    tls_policy = "REQUIRE"
  }
}

resource "aws_sesv2_configuration_set_event_destination" "failures" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "operations"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "DELIVERY_DELAY"]
    sns_destination {
      topic_arn = aws_sns_topic.ops.arn
    }
  }
  depends_on = [aws_sns_topic_policy.ops]
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Environment$%s", var.environment)]
  }
  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.ops_email]
    }
  }
}

locals {
  alarms = {
    api_5xx = {
      namespace = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", statistic = "Sum", threshold = 10, dimensions = {
        LoadBalancer = var.alb_suffix, TargetGroup = var.target_group_suffix
      },
      comparison = "GreaterThanThreshold"
    }
    api_latency = {
      namespace = "AWS/ApplicationELB", metric = "TargetResponseTime", statistic = "Average", threshold = 1, dimensions = {
        LoadBalancer = var.alb_suffix, TargetGroup = var.target_group_suffix
      },
      comparison = "GreaterThanThreshold"
    }
    api_unhealthy = {
      namespace = "AWS/ApplicationELB", metric = "UnHealthyHostCount", statistic = "Maximum", threshold = 0, dimensions = {
        LoadBalancer = var.alb_suffix, TargetGroup = var.target_group_suffix
      },
      comparison = "GreaterThanThreshold"
    }
    db_cpu = {
      namespace = "AWS/RDS", metric = "CPUUtilization", statistic = "Average", threshold = 80, dimensions = {
        DBInstanceIdentifier = var.db_identifier
      },
      comparison = "GreaterThanThreshold"
    }
    db_storage = {
      namespace = "AWS/RDS", metric = "FreeStorageSpace", statistic = "Minimum", threshold = 5368709120, dimensions = {
        DBInstanceIdentifier = var.db_identifier
      },
      comparison = "LessThanThreshold"
    }
    db_connections = {
      namespace = "AWS/RDS", metric = "DatabaseConnections", statistic = "Maximum", threshold = 80, dimensions = {
        DBInstanceIdentifier = var.db_identifier
      },
      comparison = "GreaterThanThreshold"
    }
    redis_memory = {
      namespace = "AWS/ElastiCache", metric = "DatabaseMemoryUsagePercentage", statistic = "Maximum", threshold = 80, dimensions = {
        CacheClusterId = "${var.redis_identifier}-001", CacheNodeId = "0001"
      },
      comparison = "GreaterThanThreshold"
    }
    queue_backlog = {
      namespace = "Obras/Operations", metric = "QueueBacklog", statistic = "Maximum", threshold = 100, dimensions = {
        Environment = var.environment
      },
      comparison = "GreaterThanThreshold"
    }
    worker_failures = {
      namespace = "Obras/Operations", metric = "WorkerFailures", statistic = "Sum", threshold = 0, dimensions = {
        Environment = var.environment
      },
      comparison = "GreaterThanThreshold"
    }
    synthetic = {
      namespace = "Obras/Operations", metric = "SyntheticFailure", statistic = "Maximum", threshold = 0, dimensions = {
        Environment = var.environment
      },
      comparison = "GreaterThanThreshold"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = "See docs/incident-response.md; environment ${var.environment}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  dimensions          = each.value.dimensions
  comparison_operator = each.value.comparison
  period              = 60
  evaluation_periods  = 3
  treat_missing_data  = each.key == "synthetic" ? "breaching" : "notBreaching"
  alarm_actions       = [aws_sns_topic.ops.arn]
  ok_actions          = [aws_sns_topic.ops.arn]
}

resource "aws_cloudwatch_log_metric_filter" "worker_failure" {
  name           = "${var.name}-worker-failures"
  log_group_name = var.log_groups["worker"]
  pattern        = "{ $.event = \"worker_failed\" }"
  metric_transformation {
    name      = "WorkerFailures"
    namespace = "Obras/Operations"
    value     = "1"
    dimensions = {
      Environment = "$.environment"
    }
  }
}

resource "aws_cloudwatch_event_rule" "deployment" {
  name = "${var.name}-deployment-failure"
  event_pattern = jsonencode({
    source = ["aws.ecs"], "detail-type" = ["ECS Deployment State Change"], detail = {
      eventName = ["SERVICE_DEPLOYMENT_FAILED"], clusterArn = ["arn:${data.aws_partition.current.partition}:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:cluster/${var.cluster}"]
    }
  })
}

resource "aws_cloudwatch_event_target" "deployment" {
  rule = aws_cloudwatch_event_rule.deployment.name
  arn  = aws_sns_topic.ops.arn
}

resource "aws_s3_bucket" "trail" {
  bucket = "${var.name}-${data.aws_caller_identity.current.account_id}-audit"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "trail" {
  bucket                  = aws_s3_bucket.trail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    id     = "audit-retention"
    status = "Enabled"
    filter {
      prefix = "AWSLogs/"
    }
    expiration {
      days = 365
    }
    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Principal = {
          Service = "cloudtrail.amazonaws.com"
        },
        Action = "s3:GetBucketAcl", Resource = aws_s3_bucket.trail.arn, Condition = {
          StringEquals = {
            "aws:SourceArn" = "arn:${data.aws_partition.current.partition}:cloudtrail:${var.region}:${data.aws_caller_identity.current.account_id}:trail/${var.name}"
          }
        }
      },
      {
        Effect = "Allow", Principal = {
          Service = "cloudtrail.amazonaws.com"
        },
        Action = "s3:PutObject", Resource = "${aws_s3_bucket.trail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*", Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control", "aws:SourceArn" = "arn:${data.aws_partition.current.partition}:cloudtrail:${var.region}:${data.aws_caller_identity.current.account_id}:trail/${var.name}"
          }
        }
      },
      {
        Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.trail.arn, "${aws_s3_bucket.trail.arn}/*"], Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
    }]
  })
}

resource "aws_cloudtrail" "this" {
  name                          = var.name
  s3_bucket_name                = aws_s3_bucket.trail.id
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  include_global_service_events = true
  depends_on                    = [aws_s3_bucket_policy.trail]
}

output "topic_arn" {
  value = aws_sns_topic.ops.arn
}
