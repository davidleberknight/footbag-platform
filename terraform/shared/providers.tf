terraform {
  required_version = "1.14.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State lives in the S3 backend declared in backend.tf, alongside staging and
  # production. See that file for why it lives there.
  #
  # It is never kept as local state backed up by hand or in version control.
  # The repository's ignore rules exclude `*.tfstate` and the convention gate
  # refuses tracked state by magic bytes, so it could not be committed here;
  # and HashiCorp's own guidance says not to anywhere: "Avoid storing your
  # state in a version control system or other storage solution that does not
  # support Terraform state locking and secure access control, because doing
  # so can result in data loss or exposure of secrets stored in the state
  # file." A state file holds every resolved value in the clear.
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
