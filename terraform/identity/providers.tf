terraform {
  required_version = "1.14.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State lives in the S3 backend declared in backend.tf, alongside staging,
  # production and shared.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "footbag-platform"
      Environment = "identity"
      ManagedBy   = "terraform"
    }
  }
}
