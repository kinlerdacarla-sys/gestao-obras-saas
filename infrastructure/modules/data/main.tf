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

variable "multi_az" {
  type = bool
}

variable "db_instance_class" {
  type = string
}

variable "redis_node_type" {
  type = string
}

data "aws_caller_identity" "current" {
}

resource "aws_kms_key" "data" {
  description             = "${var.name} data and runtime secrets"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "data" {
  name          = "alias/${var.name}-data"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnets
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg18"
  family = "postgres18"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                      = var.name
  engine                          = "postgres"
  engine_version                  = "18"
  allow_major_version_upgrade     = false
  auto_minor_version_upgrade      = true
  instance_class                  = var.db_instance_class
  db_name                         = "obras"
  username                        = "obras_owner"
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = aws_kms_key.data.arn
  allocated_storage               = 30
  max_allocated_storage           = 200
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.data.arn
  db_subnet_group_name            = aws_db_subnet_group.this.name
  parameter_group_name            = aws_db_parameter_group.this.name
  vpc_security_group_ids          = [var.security_groups["database"]]
  publicly_accessible             = false
  multi_az                        = var.multi_az
  backup_retention_period         = var.environment == "production" ? 14 : 7
  backup_window                   = "01:00-02:00"
  maintenance_window              = "sun:03:00-sun:04:00"
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${var.name}-final"
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.data.arn
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnets
}

resource "random_password" "redis" {
  length  = 64
  special = false
}

resource "aws_elasticache_parameter_group" "this" {
  name   = var.name
  family = "valkey8"
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = var.name
  description                = "${var.name} private BullMQ and cache"
  engine                     = "valkey"
  engine_version             = "8.2"
  node_type                  = var.redis_node_type
  parameter_group_name       = aws_elasticache_parameter_group.this.name
  port                       = 6379
  num_cache_clusters         = var.multi_az ? 2 : 1
  automatic_failover_enabled = var.multi_az
  multi_az_enabled           = var.multi_az
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [var.security_groups["redis"]]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  kms_key_id                 = aws_kms_key.data.arn
  auth_token                 = random_password.redis.result
  auth_token_update_strategy = "ROTATE"
  snapshot_retention_limit   = var.environment == "production" ? 7 : 1
  snapshot_window            = "02:00-03:00"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${var.name}/redis"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    REDIS_URL = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  })
}
# Values are injected by the authorized operator. No runtime secrets in tfvars or output.
resource "aws_secretsmanager_secret" "runtime" {
  for_each                = toset(["application", "migration", "smoke"])
  name                    = "${var.name}/${each.key}"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 30
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "documents" {
  bucket        = "${var.name}-${data.aws_caller_identity.current.account_id}-documents"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Sid = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"], Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket     = aws_s3_bucket.documents.id
  depends_on = [aws_s3_bucket_versioning.documents]
  dynamic "rule" {
    for_each = {
      "temporary/" = 2, "reports/" = 7, "exports/" = 2
    }
    content {
      id     = "expire-${replace(rule.key, "/", "")}"
      status = "Enabled"
      filter {
        prefix = rule.key
      }
      expiration {
        days = rule.value
      }
      noncurrent_version_expiration {
        noncurrent_days = 30
      }
      abort_incomplete_multipart_upload {
        days_after_initiation = 1
      }
    }
  }
  rule {
    id     = "permanent-document-versions"
    status = "Enabled"
    filter {
      prefix = "projects/"
    }
    # Never expire current project documents. Older versions retained for 90 days.
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

output "bucket" {
  value = aws_s3_bucket.documents.id
}

output "bucket_arn" {
  value = aws_s3_bucket.documents.arn
}

output "kms_key_arn" {
  value = aws_kms_key.data.arn
}

output "runtime_secret_arns" {
  value = {
    for k, v in aws_secretsmanager_secret.runtime : k => v.arn
  }
}

output "redis_secret_arn" {
  value = aws_secretsmanager_secret.redis.arn
}

output "db_endpoint" {
  value = aws_db_instance.this.address
}

output "db_identifier" {
  value = aws_db_instance.this.identifier
}

output "db_master_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "redis_identifier" {
  value = aws_elasticache_replication_group.this.id
}
