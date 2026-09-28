# =============================================================================
# Providers — production
# Primary region: configured via var.aws_region
# us-east-1 alias: required for ACM certificates used with CloudFront
# =============================================================================

terraform {
  # Exact, as every version in this repository is: the same Terraform the push
  # gate runs (terraform_version in the CI workflow). It is at least 1.11, which
  # native S3 backend locking (use_lockfile in backend.tf) needs. Every tree pins
  # the same version.
  required_version = "1.14.7"

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
