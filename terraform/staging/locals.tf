locals {
  # Short prefix used in resource names: "footbag-staging" or "footbag-production"
  prefix = "footbag-${var.environment}"

  # SSM parameter namespace: /footbag/staging/... or /footbag/production/...
  ssm_prefix = "/footbag/${var.environment}"
}
