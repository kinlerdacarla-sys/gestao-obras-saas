variable "name" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "subnets" {
  type = list(string)
}

variable "security_groups" {
  type = map(string)
}

variable "target_groups" {
  type = map(string)
}

variable "bucket" {
  type = string
}

variable "bucket_arn" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "runtime_secret_arns" {
  type = map(string)
}

variable "redis_secret_arn" {
  type = string
}

variable "db_master_secret_arn" {
  type = string
}

variable "db_endpoint" {
  type = string
}

variable "app_domain" {
  type = string
}

variable "from_email" {
  type = string
}

variable "reply_to_email" {
  type = string
}

variable "support_email" {
  type = string
}

variable "domain_name" {
  type = string
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

variable "vpc_cidr" {
  type = string
}

variable "enable_services" {
  type = bool
}

variable "release_sha" {
  type = string
}

variable "github_repository" {
  type = string
}

variable "github_oidc_provider_arn" {
  type = string
}

data "aws_caller_identity" "current" {
}

data "aws_partition" "current" {
}

locals {
  services = {
    web = 3000, api = 3001, worker = 3003
  }
  roles     = toset(["web", "api", "worker", "migration"])
  image_tag = var.release_sha == "" ? "PENDING_INITIAL_RELEASE" : var.release_sha
  environment = [for key, value in {
    NODE_ENV                 = "production", APP_ENV = var.environment, AWS_REGION = var.region,
    RELEASE_SHA              = var.release_sha, WEB_ORIGIN = "https://${var.app_domain}",
    TRUST_PROXY              = var.vpc_cidr, STORAGE_DRIVER = "s3", S3_BUCKET = var.bucket,
    S3_KMS_KEY_ID            = var.kms_key_arn, MAIL_TRANSPORT = "ses", MAIL_FROM = var.from_email,
    FROM_EMAIL               = var.from_email, REPLY_TO = var.reply_to_email, SUPPORT_EMAIL = var.support_email,
    SALES_EMAIL              = var.support_email, SES_CONFIGURATION_SET = var.name,
    TERMS_URL                = var.terms_url, PRIVACY_URL = var.privacy_url,
    TERMS_VERSION            = var.legal_version, PRIVACY_VERSION = var.legal_version,
    DB_POOL_MAX              = "5", PGSSLROOTCERT = "/app/infrastructure/certificates/rds-global-bundle.crt",
    DOCUMENT_STORAGE_PATH    = "/tmp/documents", BUDGET_STORAGE_PATH = "/tmp/budgets",
    PLATFORM_BOOTSTRAP_EMAIL = "", SERVICE_NAME = "application"
    }
    : {
      name = key, value = value
  }]
  secrets = [for key in ["DATABASE_URL", "JWT_SECRET", "INVITATION_ENCRYPTION_KEY"] : {
    name = key, valueFrom = "${var.runtime_secret_arns["application"]}:${key}::"
  }]
}

resource "aws_ecr_repository" "this" {
  for_each             = local.roles
  name                 = "${var.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  encryption_configuration {
    encryption_type = "AES256"
  }
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  # Retain all tagged releases: rollback images are never expired by age alone.
  policy = jsonencode({
    rules = [{
      rulePriority = 1, description = "Discard untagged build layers after 7 days", selection = {
        tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7
      },
      action = {
        type = "expire"
      }
    }]
  })
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.roles
  name              = "/obras/${var.environment}/${each.key}"
  retention_in_days = var.environment == "production" ? 90 : 30
}

resource "aws_iam_role" "execution" {
  for_each = local.roles
  name     = "${var.name}-${each.key}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      },
      Action = "sts:AssumeRole", Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "execution" {
  for_each = local.roles
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({
    Version = "2012-10-17", Statement = concat([
      {
        Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*"
      },
      {
        Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = aws_ecr_repository.this[each.key].arn
      },
      {
        Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.service[each.key].arn}:*"
        }], [for statement in [
        {
          Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [var.runtime_secret_arns[each.key == "migration" ? "migration" : "application"], var.redis_secret_arn]
        },
        {
          Effect = "Allow", Action = ["kms:Decrypt"], Resource = var.kms_key_arn, Condition = {
            StringEquals = {
              "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com"
            }
          }
    }] : statement if each.key != "web"])
  })
}

resource "aws_iam_role" "task" {
  for_each           = local.roles
  name               = "${var.name}-${each.key}-task"
  assume_role_policy = aws_iam_role.execution[each.key].assume_role_policy
}

resource "aws_iam_role_policy" "application" {
  for_each = toset(["api", "worker"])
  role     = aws_iam_role.task[each.key].id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.bucket_arn, Condition = {
          StringLike = {
            "s3:prefix" = ["projects/*", "reports/*", "exports/*", "temporary/*"]
          }
        }
      },
      {
        Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:GetObjectVersion"], Resource = [for prefix in ["projects", "reports", "exports", "temporary"] : "${var.bucket_arn}/${prefix}/*"]
      },
      {
        Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = var.kms_key_arn, Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.region}.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow", Action = ["ses:SendEmail", "ses:SendRawEmail"], Resource = ["arn:${data.aws_partition.current.partition}:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/${var.domain_name}", "arn:${data.aws_partition.current.partition}:ses:${var.region}:${data.aws_caller_identity.current.account_id}:configuration-set/${var.name}"], Condition = {
          StringEquals = {
            "ses:FromAddress" = var.from_email
          }
        }
    }]
  })
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.roles
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.key == "web" ? 512 : 1024
  memory                   = each.key == "web" ? 1024 : 2048
  execution_role_arn       = aws_iam_role.execution[each.key].arn
  task_role_arn            = aws_iam_role.task[each.key].arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge({
    name      = each.key, image = "${aws_ecr_repository.this[each.key].repository_url}:${local.image_tag}",
    essential = true, user = "1000", readonlyRootFilesystem = false,
    linuxParameters = {
      initProcessEnabled = true, capabilities = {
        drop = ["ALL"]
      }
    },
    environment = each.key == "web" ? [{
      name = "NODE_ENV", value = "production"
      },
      {
        name = "HOSTNAME", value = "0.0.0.0"
      },
      {
        name = "PORT", value = "3000"
        }] : concat(local.environment, [{
          name = "PORT", value = "3001"
    }]),
    secrets = each.key == "web" ? [] : each.key == "migration" ? [{
      name = "DATABASE_URL", valueFrom = "${var.runtime_secret_arns["migration"]}:DATABASE_URL::"
      }] : concat(local.secrets, [{
        name = "REDIS_URL", valueFrom = "${var.redis_secret_arn}:REDIS_URL::"
    }]),
    logConfiguration = {
      logDriver = "awslogs", options = {
        "awslogs-group" = aws_cloudwatch_log_group.service[each.key].name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "ecs"
      }
    },
    stopTimeout = 60
    },
    jsondecode(each.key == "migration" ? jsonencode({
      command = ["sh", "infrastructure/docker/migrate-release.sh"]
      })
      : jsonencode({
        portMappings = [{
          containerPort = local.services[each.key], protocol = "tcp"
        }],
        healthCheck = {
          command = ["CMD-SHELL", "node -e \"fetch('http://localhost:${local.services[each.key]}${each.key == "web" ? "/login" : "/health/ready"}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 60
        }
  })))])
}

resource "aws_ecs_service" "this" {
  for_each                           = local.services
  name                               = each.key
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = var.enable_services ? (var.environment == "production" && each.key != "worker" ? 2 : 1) : 0
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = false
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = each.key == "worker" ? null : 90
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = var.subnets
    security_groups  = [var.security_groups[each.key]]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.key == "worker" ? [] : [each.key]
    content {
      target_group_arn = var.target_groups[load_balancer.value]
      container_name   = each.key
      container_port   = each.value
    }
  }
  # A release registers a new immutable revision. Terraform owns topology, not rollout history.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_iam_role" "deploy" {
  name = "github-${var.environment}-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Federated = var.github_oidc_provider_arn
      },
      Action = "sts:AssumeRoleWithWebIdentity", Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Action = ["ecr:GetAuthorizationToken", "ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition", "rds:DescribeDBSnapshots"], Resource = "*"
      },
      {
        Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:DescribeImages", "ecr:DescribeImageScanFindings"], Resource = [for r in aws_ecr_repository.this : r.arn]
      },
      {
        Effect = "Allow", Action = ["ecs:UpdateService", "ecs:DescribeServices"], Resource = [for s in aws_ecs_service.this : s.id]
      },
      {
        Effect = "Allow", Action = ["ecs:RunTask"], Resource = "arn:${data.aws_partition.current.partition}:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.name}-migration:*", Condition = {
          ArnEquals = {
            "ecs:cluster" = aws_ecs_cluster.this.arn
          }
        }
      },
      {
        Effect = "Allow", Action = ["ecs:DescribeTasks", "ecs:StopTask"], Resource = "arn:${data.aws_partition.current.partition}:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:task/${var.name}/*"
      },
      {
        Effect = "Allow", Action = ["rds:CreateDBSnapshot"], Resource = ["arn:${data.aws_partition.current.partition}:rds:${var.region}:${data.aws_caller_identity.current.account_id}:db:${var.name}", "arn:${data.aws_partition.current.partition}:rds:${var.region}:${data.aws_caller_identity.current.account_id}:snapshot:${var.name}-*"]
      },
      {
        Effect = "Allow", Action = ["ecs:TagResource"], Resource = "arn:${data.aws_partition.current.partition}:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.name}-*:*"
      },
      {
        Effect = "Allow", Action = ["iam:PassRole"], Resource = concat([for r in aws_iam_role.task : r.arn], [for r in aws_iam_role.execution : r.arn]), Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.runtime_secret_arns["smoke"]
      },
      {
        Effect = "Allow", Action = ["kms:Decrypt"], Resource = var.kms_key_arn, Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com"
          }
        }
    }]
  })
}

output "cluster" {
  value = aws_ecs_cluster.this.name
}

output "repositories" {
  value = {
    for k, v in aws_ecr_repository.this : k => v.repository_url
  }
}

output "task_definitions" {
  value = {
    for k, v in aws_ecs_task_definition.service : k => v.arn
  }
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "log_groups" {
  value = {
    for k, v in aws_cloudwatch_log_group.service : k => v.name
  }
}
