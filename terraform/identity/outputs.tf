# =============================================================================
# Outputs — identity
#
# The job role's definition. Nothing about who the dev-and-testers are: the
# named users are created and retired by the lifecycle script, not by this tree.
# =============================================================================

output "dev_tester_role_arn" {
  description = "The shared job role a named dev-and-tester assumes. Staging's runtime trust policy names this ARN, and the value is predictable from the account id and the role name rather than generated, so it can be written into a values file without being read back from the account first."
  value       = aws_iam_role.dev_tester.arn
}

output "dev_tester_role_name" {
  description = "The job role's name. The lifecycle script names it when it writes a dev-and-tester's assume-role profile, and staging's variable validation requires the ARN to end in exactly this name."
  value       = aws_iam_role.dev_tester.name
}
