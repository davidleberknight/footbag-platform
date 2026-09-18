# =============================================================================
# The operator roster — who holds which human-operator role
#
# Hiring and firing, and nothing else. What each role may DO is declared in
# terraform/identity, which only the directly authenticated identity can apply.
# This tree is applied by a super admin, as themselves, through
# scripts/terraform-apply.sh.
#
# WHY THE TWO ARE APART.
#
# A role that can rewrite its own policy has no least-privilege story, so the
# tree declaring the roles is the one tree an operator cannot apply. Holding the
# roster there too would make every joiner and every leaver an act only that one
# principal could perform, which puts a privileged sign-in in front of revoking
# somebody's access at the moment speed matters most.
#
# Each permission set's own policy already draws this line. It allows assignment
# and directory writes, creates and deletes alike, and denies every write to the
# permission set. Handing somebody a role that already exists mints no privilege
# that did not, and taking it away mints nothing at all.
# =============================================================================

# The instance and its directory are read rather than supplied: listing them is
# within the operator grant, and reading them here means nobody pastes an
# instance id into a values file where it could be wrong.
data "aws_ssoadmin_instances" "this" {}

# Both permission sets come from the tree that owns them, through its published
# state, rather than from values copied into this tree's values file. A copied
# ARN is a second place for one fact to live, and it goes stale silently if a
# permission set is ever deleted and recreated.
#
# This is an S3 read, which an operator holds. Asking Identity Center to describe
# the permission set instead would need a permission they deliberately do not
# have: hand the role out and take it back, yes; inspect or change what it can
# do, no.
data "terraform_remote_state" "identity" {
  backend = "s3"

  config = {
    bucket = "footbag-terraform-state-a1b2c3d4e5"
    key    = "identity/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  instance_arn      = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]

  # Both are read, and a roster entry's role picks between them. Reading only the
  # one a roster happens to use today would make adding the first person of the
  # other job a change to this file rather than a change to the values.
  permission_set_arns = {
    super_admin = data.terraform_remote_state.identity.outputs.super_admin_permission_set_arn
    dev_tester  = data.terraform_remote_state.identity.outputs.dev_tester_permission_set_arn
  }
}

# One directory record per operator. Identity Center mails the invitation that
# sets the password and registers the second factor, so the address has to be one
# that person reads.
#
# Removing an entry deletes the record, which is the AWS half of a leaver: the
# person can no longer sign in at all, rather than signing in and finding nothing
# assigned.
resource "aws_identitystore_user" "operator" {
  for_each = var.operators

  identity_store_id = local.identity_store_id
  user_name         = each.key
  display_name      = "${each.value.given_name} ${each.value.family_name}"

  name {
    given_name  = each.value.given_name
    family_name = each.value.family_name
  }

  emails {
    value   = each.value.email
    primary = true
  }
}

# Each operator is assigned the permission set their job needs, on the one
# account. Changing somebody's role is this one field: the assignment is replaced,
# which takes the old role away in the same apply that grants the new one, so
# there is no window where a person holds both.
resource "aws_ssoadmin_account_assignment" "operator" {
  for_each = var.operators

  instance_arn       = local.instance_arn
  permission_set_arn = local.permission_set_arns[each.value.role]

  principal_id   = aws_identitystore_user.operator[each.key].user_id
  principal_type = "USER"

  target_id   = var.aws_account_id
  target_type = "AWS_ACCOUNT"
}
