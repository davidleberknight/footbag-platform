# =============================================================================
# Providers — production
# Primary region: configured via var.aws_region
# us-east-1 alias: required for ACM certificates used with CloudFront
# =============================================================================

terraform {
  # Minimum 1.11: native S3 backend locking (use_lockfile in backend.tf)
  # was introduced in Terraform 1.10. The staging module pins the same floor.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "footbag-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ACM certificates for CloudFront must exist in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "footbag-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# us-west-2 alias for the DR bucket (cross-region replication target).
# Backup region: us-west-2.
provider "aws" {
  alias  = "us_west_2"
  region = "us-west-2"

  default_tags {
    tags = {
      Project     = "footbag-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
