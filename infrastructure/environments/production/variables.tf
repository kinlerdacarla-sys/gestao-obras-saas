variable "aws_region" {
  type    = string
  default = "af-south-1"
}

variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the real authorized AWS account ID."
  }
}

variable "owner" {
  type = string
}

variable "domain_name" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[.][a-z]{2,}$", var.domain_name))
    error_message = "Supply an owned real DNS domain."
  }
}

variable "app_domain" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[.][a-z]{2,}$", var.app_domain))
    error_message = "Supply an owned real DNS domain."
  }
}

variable "api_domain" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[.][a-z]{2,}$", var.api_domain))
    error_message = "Supply an owned real DNS domain."
  }
}

variable "route53_zone_id" {
  type = string
}

variable "ops_alert_email" {
  type = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.ops_alert_email))
    error_message = "Supply an authorized real email address."
  }
}

variable "support_email" {
  type = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.support_email))
    error_message = "Supply an authorized real email address."
  }
}

variable "from_email" {
  type = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.from_email))
    error_message = "Supply an authorized real email address."
  }
}

variable "reply_to_email" {
  type = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.reply_to_email))
    error_message = "Supply an authorized real email address."
  }
}

variable "monthly_aws_budget" {
  type = number
  validation {
    condition     = try(var.monthly_aws_budget > 0, false)
    error_message = "An operator-approved monthly budget in USD is required."
  }
}

variable "github_repository" {
  type = string
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "release_sha" {
  type    = string
  default = ""
  validation {
    condition     = var.release_sha == "" || can(regex("^[a-f0-9]{40}$", var.release_sha))
    error_message = "Use the exact 40-character verified commit SHA."
  }
}

variable "enable_services" {
  type    = bool
  default = false
}

variable "vpc_cidr" {
  type    = string
  default = "10.50.0.0/16"
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "terms_url" {
  type = string
}

variable "privacy_url" {
  type = string
}

variable "legal_version" {
  type = string
}
