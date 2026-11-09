terraform {
  required_version = ">= 1.17.1, < 2.0.0"
  required_providers { aws = { source = "hashicorp/aws", version = "6.71.0" } }
}
variable "aws_region" {
  type    = string
  default = "af-south-1"
}
variable "aws_account_id" { type = string }
variable "state_bucket_name" { type = string }
variable "owner" { type = string }
variable "create_github_oidc_provider" {
  type    = bool
  default = false
}
provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags { tags = { Project = "gestao-obras", ManagedBy = "terraform", Environment = "bootstrap", Service = "state", Owner = var.owner } }
}
resource "aws_kms_key" "state" {
  description             = "Terraform state encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket" "state" {
  bucket        = var.state_bucket_name
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
output "bucket" { value = aws_s3_bucket.state.id }
output "kms_key_id" { value = aws_kms_key.state.arn }
output "github_oidc_provider_arn" { value = try(aws_iam_openid_connect_provider.github[0].arn, null) }
