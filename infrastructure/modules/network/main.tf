variable "name" {
  type = string
}

variable "cidr" {
  type = string
}

variable "region" {
  type = string
}

variable "high_availability" {
  type = bool
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = var.name
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr, 8, count.index)
  map_public_ip_on_launch = false
  tags = {
    Name = "${var.name}-public-${count.index}"
  }
}

resource "aws_subnet" "app" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr, 8, count.index + 10)
  map_public_ip_on_launch = false
  tags = {
    Name = "${var.name}-app-${count.index}"
  }
}

resource "aws_subnet" "data" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr, 8, count.index + 20)
  map_public_ip_on_launch = false
  tags = {
    Name = "${var.name}-data-${count.index}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count  = var.high_availability ? 2 : 1
  domain = "vpc"
}

resource "aws_nat_gateway" "this" {
  count         = var.high_availability ? 2 : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "app" {
  count  = 2
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[var.high_availability ? count.index : 0].id
  }
}

resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app[count.index].id
}

resource "aws_route_table" "data" {
  vpc_id = aws_vpc.this.id
}

resource "aws_route_table_association" "data" {
  count          = 2
  subnet_id      = aws_subnet.data[count.index].id
  route_table_id = aws_route_table.data.id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.app[*].id
}

resource "aws_security_group" "service" {
  for_each    = toset(["alb", "web", "api", "worker", "database", "redis"])
  name        = "${var.name}-${each.key}"
  description = "Explicit least-privilege flows for ${each.key}"
  vpc_id      = aws_vpc.this.id
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "edge" {
  security_group_id = aws_security_group.service["alb"].id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

locals {
  flows = {
    alb_web = {
      from = "alb", to = "web", port = 3000
    }
    alb_api = {
      from = "alb", to = "api", port = 3001
    }
    web_api = {
      from = "web", to = "api", port = 3001
    }
    api_db = {
      from = "api", to = "database", port = 5432
    }
    worker_db = {
      from = "worker", to = "database", port = 5432
    }
    api_redis = {
      from = "api", to = "redis", port = 6379
    }
    worker_redis = {
      from = "worker", to = "redis", port = 6379
    }
  }
}

resource "aws_vpc_security_group_ingress_rule" "flow" {
  for_each                     = local.flows
  security_group_id            = aws_security_group.service[each.value.to].id
  referenced_security_group_id = aws_security_group.service[each.value.from].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}

resource "aws_vpc_security_group_egress_rule" "flow" {
  for_each                     = local.flows
  security_group_id            = aws_security_group.service[each.value.from].id
  referenced_security_group_id = aws_security_group.service[each.value.to].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}
# HTTPS via NAT is needed for AWS APIs, ECR and external email providers. No arbitrary inbound traffic.
resource "aws_vpc_security_group_egress_rule" "https" {
  for_each          = toset(["api", "worker", "web"])
  security_group_id = aws_security_group.service[each.key].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnets" {
  value = aws_subnet.public[*].id
}

output "app_subnets" {
  value = aws_subnet.app[*].id
}

output "data_subnets" {
  value = aws_subnet.data[*].id
}

output "security_groups" {
  value = {
    for k, v in aws_security_group.service : k => v.id
  }
}
