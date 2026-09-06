terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State lives in the S3 backend declared in backend.tf, alongside staging and
  # production. See that file for why it moved there on 2026-09-05.
  #
  # This comment previously read "Shared bootstrap uses local state ... Keep
  # this state file backed up manually or in version control." Both halves were
  # wrong by then. The repository's ignore rules exclude `*.tfstate` and the
  # convention gate refuses tracked state by magic bytes, so the second half
  # could not be followed here; and HashiCorp's own guidance says not to follow
  # it anywhere: "Avoid storing your state in a version control system or other
  # storage solution that does not support Terraform state locking and secure
  # access control, because doing so can result in data loss or exposure of
  # secrets stored in the state file." A state file holds every resolved value
  # in the clear.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "footbag-platform"
      Environment = "shared"
      ManagedBy   = "terraform"
    }
  }
}
