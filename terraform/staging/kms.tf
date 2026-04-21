# =============================================================================
# KMS Keys
# One key per environment for SSM SecureString parameter encryption.
# =============================================================================

resource "aws_kms_key" "main" {
  description             = "${local.prefix} main encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRootFullAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowSSMUse"
        Effect = "Allow"
        Principal = {
          Service = "ssm.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}

# =============================================================================
# JWT signing key — RSA-2048 asymmetric, SIGN_VERIFY.
# Used by src/adapters/jwtSigningAdapter.ts (KmsJwtAdapter) to sign session
# JWTs. Per DD §3.4: alg=RS256; header.kid must equal this key's ARN or an
# agreed-upon identifier for key rotation.
#
# This key was originally created by hand via the AWS Console during Path H
# §8.6 of DEV_ONBOARDING.md. Declaring it here closes finding 7.1 of
# code_doc_review.md (IaC drift). To reconcile existing state on first apply:
#
#   terraform import aws_kms_key.jwt_signing <key-id-from-console>
#   terraform import aws_kms_alias.jwt_signing alias/footbag-staging-jwt
#
# Only needed once. Subsequent plans will show no diff.
# =============================================================================

resource "aws_kms_key" "jwt_signing" {
  description              = "${local.prefix} JWT session signing key (RS256)"
  customer_master_key_spec = "RSA_2048"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30
  # NOTE: asymmetric keys do not support automatic rotation. Rotation, when
  # implemented, is operator-driven (new key + alias swap + 24h overlap per
  # DD §3.4; currently out of scope per IMPLEMENTATION_PLAN).

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRootFullAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowRuntimeRoleSign"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.app_runtime.arn
        }
        Action = [
          "kms:Sign",
          "kms:GetPublicKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "jwt_signing" {
  name          = "alias/${local.prefix}-jwt"
  target_key_id = aws_kms_key.jwt_signing.key_id
}
