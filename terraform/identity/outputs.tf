# =============================================================================
# Outputs — identity
#
# The roles' definition. What the roster tree needs from it, and nothing about
# who the operators are.
# =============================================================================

output "super_admin_permission_set_arn" {
  description = "The super-admin human-operator permission set. terraform/operators takes this as an input, so that tree needs no permission to describe a permission set — which neither operator policy deliberately grants."
  value       = aws_ssoadmin_permission_set.super_admin.arn
}

output "super_admin_permission_set_name" {
  description = "The permission set's name. Identity Center generates the IAM role behind it as AWSReservedSSO_<name>_<suffix>, which is what the trust policies must eventually name."
  value       = aws_ssoadmin_permission_set.super_admin.name
}

output "dev_tester_permission_set_arn" {
  description = "The dev-and-tester human-operator permission set. terraform/operators takes this as an input too, and assigns each roster entry whichever of the two their job needs."
  value       = aws_ssoadmin_permission_set.dev_tester.arn
}

output "dev_tester_permission_set_name" {
  description = "The permission set's name. Identity Center generates the IAM role behind it as AWSReservedSSO_<name>_<suffix>, which is what the staging trust policy must eventually name."
  value       = aws_ssoadmin_permission_set.dev_tester.name
}

output "identity_store_id" {
  description = "The Identity Center directory the roster's records are created in."
  value       = local.identity_store_id
}
