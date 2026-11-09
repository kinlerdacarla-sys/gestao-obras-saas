terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws", configuration_aliases = [aws.global]
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

variable "config" {
  type = object({
    environment        = string, aws_region = string, owner = string, vpc_cidr = string,
    domain_name        = string, app_domain = string, api_domain = string, route53_zone_id = string,
    ops_alert_email    = string, support_email = string, from_email = string, reply_to_email = string,
    monthly_aws_budget = number, multi_az = bool, db_instance_class = string, redis_node_type = string,
    github_repository  = string, github_oidc_provider_arn = string,
    terms_url          = string, privacy_url = string, legal_version = string,
    release_sha        = string, enable_services = bool
  })
}

locals {
  name = "obras-${var.config.environment}"
}

module "network" {
  source            = "../network"
  name              = local.name
  cidr              = var.config.vpc_cidr
  region            = var.config.aws_region
  high_availability = var.config.multi_az
}

module "data" {
  source            = "../data"
  name              = local.name
  environment       = var.config.environment
  region            = var.config.aws_region
  subnets           = module.network.data_subnets
  security_groups   = module.network.security_groups
  multi_az          = var.config.multi_az
  db_instance_class = var.config.db_instance_class
  redis_node_type   = var.config.redis_node_type
}

module "edge" {
  source = "../edge"
  providers = {
    aws = aws, aws.global = aws.global
  }
  name           = local.name
  app_domain     = var.config.app_domain
  api_domain     = var.config.api_domain
  zone_id        = var.config.route53_zone_id
  vpc_id         = module.network.vpc_id
  subnets        = module.network.public_subnets
  security_group = module.network.security_groups["alb"]
  production     = var.config.environment == "production"
}

module "compute" {
  source                   = "../compute"
  name                     = local.name
  environment              = var.config.environment
  region                   = var.config.aws_region
  subnets                  = module.network.app_subnets
  security_groups          = module.network.security_groups
  target_groups            = module.edge.target_groups
  bucket                   = module.data.bucket
  bucket_arn               = module.data.bucket_arn
  kms_key_arn              = module.data.kms_key_arn
  runtime_secret_arns      = module.data.runtime_secret_arns
  redis_secret_arn         = module.data.redis_secret_arn
  db_master_secret_arn     = module.data.db_master_secret_arn
  db_endpoint              = module.data.db_endpoint
  app_domain               = var.config.app_domain
  from_email               = var.config.from_email
  reply_to_email           = var.config.reply_to_email
  support_email            = var.config.support_email
  domain_name              = var.config.domain_name
  terms_url                = var.config.terms_url
  privacy_url              = var.config.privacy_url
  legal_version            = var.config.legal_version
  vpc_cidr                 = var.config.vpc_cidr
  enable_services          = var.config.enable_services
  release_sha              = var.config.release_sha
  github_repository        = var.config.github_repository
  github_oidc_provider_arn = var.config.github_oidc_provider_arn
  depends_on               = [module.edge]
}

module "operations" {
  source              = "../operations"
  name                = local.name
  environment         = var.config.environment
  region              = var.config.aws_region
  domain_name         = var.config.domain_name
  zone_id             = var.config.route53_zone_id
  ops_email           = var.config.ops_alert_email
  budget              = var.config.monthly_aws_budget
  cluster             = module.compute.cluster
  db_identifier       = module.data.db_identifier
  redis_identifier    = module.data.redis_identifier
  alb_suffix          = module.edge.alb_arn_suffix
  target_group_suffix = module.edge.target_group_suffix
  log_groups          = module.compute.log_groups
  app_domain          = var.config.app_domain
  api_domain          = var.config.api_domain
}

output "deployment" {
  value = {
    environment         = var.config.environment, region = var.config.aws_region,
    cluster             = module.compute.cluster, repositories = module.compute.repositories,
    task_definitions    = module.compute.task_definitions, deploy_role_arn = module.compute.deploy_role_arn,
    private_subnets     = module.network.app_subnets, migration_security_group = module.network.security_groups["api"],
    app_url             = "https://${var.config.app_domain}", api_url = "https://${var.config.api_domain}",
    runtime_secret_arns = module.data.runtime_secret_arns, redis_secret_arn = module.data.redis_secret_arn,
    db_endpoint         = module.data.db_endpoint, db_master_secret_arn = module.data.db_master_secret_arn,
    bucket              = module.data.bucket, kms_key_arn = module.data.kms_key_arn,
    db_identifier       = module.data.db_identifier, distribution_id = module.edge.distribution_id
  }
}
