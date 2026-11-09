terraform {
  required_version = ">= 1.17.1, < 2.0.0"
  required_providers {
    aws = {
      source = "hashicorp/aws", version = "6.71.0"
    }
    random = {
      source = "hashicorp/random", version = "~> 3.7"
    }
    archive = {
      source = "hashicorp/archive", version = "~> 2.7"
    }
  }
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Project = "gestao-obras", Environment = "staging", ManagedBy = "terraform", Service = "platform", Owner = var.owner
    }
  }
}

provider "aws" {
  alias               = "global"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Project = "gestao-obras", Environment = "staging", ManagedBy = "terraform", Service = "edge", Owner = var.owner
    }
  }
}

module "platform" {
  source = "../../modules/platform"
  providers = {
    aws = aws, aws.global = aws.global
  }
  config = {
    environment              = "staging"
    aws_region               = var.aws_region
    owner                    = var.owner
    domain_name              = var.domain_name
    app_domain               = var.app_domain
    api_domain               = var.api_domain
    route53_zone_id          = var.route53_zone_id
    ops_alert_email          = var.ops_alert_email
    support_email            = var.support_email
    from_email               = var.from_email
    reply_to_email           = var.reply_to_email
    monthly_aws_budget       = var.monthly_aws_budget
    github_repository        = var.github_repository
    github_oidc_provider_arn = var.github_oidc_provider_arn
    db_instance_class        = var.db_instance_class
    redis_node_type          = var.redis_node_type
    release_sha              = var.release_sha
    enable_services          = var.enable_services
    vpc_cidr                 = var.vpc_cidr
    multi_az                 = var.multi_az
    terms_url                = var.terms_url
    privacy_url              = var.privacy_url
    legal_version            = var.legal_version
  }
}

output "deployment" {
  value = module.platform.deployment
}
