# =============================================================================
# Outputs — identity
#
# The job role's definition. Nothing about who the operators are: the named
# human users are created and retired by the lifecycle script, not by this tree.
# =============================================================================

output "dev_tester_role_arn" {
  description = "The shared job role a named human operator assumes. Staging's runtime trust policy names this ARN, and the value is predictable from the account id and the role name rather than generated, so it can be written into a values file without being read back from the account first."
  value       = aws_iam_role.dev_tester.arn
}

output "dev_tester_role_name" {
  description = "The job role's name. The lifecycle script names it when it writes an operator's assume-role profile, and staging's variable validation requires the ARN to end in exactly this name."
  value       = aws_iam_role.dev_tester.name
}
