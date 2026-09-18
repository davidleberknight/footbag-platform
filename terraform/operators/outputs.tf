# =============================================================================
# Outputs — operators
# =============================================================================

# The IAM role Identity Center generates behind the permission set, named
# AWSReservedSSO_<PermissionSetName>_<suffix> with a suffix nobody chooses.
#
# It is read here rather than in the identity tree because it does not exist
# until the permission set has been ASSIGNED to the account — assignment is what
# provisions it — and assignment is what this tree does. The ARN is what both
# runtime-role trust policies must name, and deleting and recreating the
# permission set regenerates the suffix and breaks both of them silently, which
# is why scripts/verify-account-baseline.sh compares the live value against what
# each policy actually holds.
data "aws_iam_roles" "operator" {
  name_regex  = "AWSReservedSSO_.*"
  path_prefix = "/aws-reserved/sso.amazonaws.com/"

  depends_on = [aws_ssoadmin_account_assignment.operator]
}

output "operator_role_arns" {
  description = "Every generated reserved-SSO role ARN in the account. The standup script picks the one matching the permission set's name and refuses if more than one matches, because a recreated permission set leaves an older role behind."
  value       = sort(tolist(data.aws_iam_roles.operator.arns))
}

output "operator_user_names" {
  description = "The current roster. Reading this is how you answer who holds operator access in AWS."
  value       = sort(keys(var.operators))
}

output "identity_store_id" {
  description = "The Identity Center directory holding the roster's records."
  value       = local.identity_store_id
}
