# =============================================================================
# Account baseline — the account-wide backstops
#
# WHY THESE ARE HERE RATHER THAN IN A CONSOLE.
#
# None of these is required for a deploy and none blocks anything else, which is
# exactly why they drift: nothing fails without them, so nothing surfaces them.
# They were carried for a while as a console checklist, and a console-set control
# has no Terraform behind it, so nothing detects it being turned off and nothing
# notices it was never turned on. Worse, setting them by hand would make the
# console a second writer for a resource this tree owns, and the next apply
# reverts it silently.
#
# scripts/verify-account-baseline.sh reads every one of them, read-only, and
# exits non-zero on a finding, so the state is checkable before and after an
# apply without a console visit. That script is the companion to this file and
# its thresholds are the same ones asserted here.
#
# WHY THIS TREE.
#
# These are properties of the account, not of an environment, and the account is
# what the shared tree bootstraps. They are also applied by the directly
# authenticated operator identity rather than by the human job role, which is
# not a choice made here: the job role's S3 object grant reaches only the staging
# state key, so it cannot read this tree's state at all, by design.
# =============================================================================

# The account-wide backstop for any bucket created later without its own block.
# The per-bucket settings already exist; this is what survives the bucket
# somebody creates in a hurry. All four on, which is the only useful setting:
# a bucket created later inherits whatever this says.
resource "aws_s3_account_public_access_block" "account" {
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# Without one, any console password can be weak. The IAM user footbag-operator
# has a console password; the policy applies to every password set or changed
# after it, that user's next one included, and does not invalidate one already
# set. It is also the backstop for the day somebody adds another console user,
# which is precisely the day nobody is thinking about password policy. The two
# figures are the ones the verification script tests.
resource "aws_iam_account_password_policy" "account" {
  minimum_password_length        = 14
  password_reuse_prevention      = 24
  require_lowercase_characters   = true
  require_uppercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
}

# Finds resource policies granting access outside the account, which is the class
# of mistake least likely to be caught by reading Terraform: it reads correctly
# and grants an outsider anyway.
#
# type is ACCOUNT deliberately. The console offers ACCOUNT_UNUSED_ACCESS as well
# and it answers a different question — unused roles and permissions — so an
# analyzer of that type would report this control as in place while the mistake
# it exists to catch went unwatched. The verification script filters on type for
# the same reason.
resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "footbag-account-external-access"
  type          = "ACCOUNT"
}

# An analyzer sees only its own region's resources, so the disaster-recovery
# buckets in the backup region, whose policies guard the copies that outlive
# us-east-1, need their own. Each environment tree routes its findings to that
# region's alarm topic.
resource "aws_accessanalyzer_analyzer" "account_us_west_2" {
  provider      = aws.us_west_2
  analyzer_name = "footbag-account-external-access"
  type          = "ACCOUNT"
}

# Threat detection over the account's own records: the trail's management
# events, VPC flow and DNS logs, and, with S3 protection on, object-level S3
# events the trail deliberately does not store. It also reports a stopped or
# deleted trail independently of the trail's own alarms. One detector per
# region; us-east-1 is where the account runs and where global events land.
#
# Every other feature is set explicitly off rather than left to the account's
# default, so a feature AWS later turns on for new detectors cannot start
# billing unnoticed. The account runs no EKS, RDS, Lambda or EC2 volumes of its
# own, so none of them has anything to watch.
#
# Like the analyzer, this tree holds no notification path: each environment
# tree routes findings to its own alarm topic.
resource "aws_guardduty_detector" "account" {
  count                        = var.enable_guardduty ? 1 : 0
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_guardduty_detector_feature" "account" {
  for_each = var.enable_guardduty ? {
    S3_DATA_EVENTS         = "ENABLED"
    EKS_AUDIT_LOGS         = "DISABLED"
    EBS_MALWARE_PROTECTION = "DISABLED"
    RDS_LOGIN_EVENTS       = "DISABLED"
    LAMBDA_NETWORK_LOGS    = "DISABLED"
    RUNTIME_MONITORING     = "DISABLED"
  } : {}
  detector_id = aws_guardduty_detector.account[0].id
  name        = each.key
  status      = each.value

  # GuardDuty attaches its own sub-settings to some features (agent management
  # under runtime monitoring, data-risk under RDS login events), some newer than
  # the provider can declare. Undeclared, each plan would replace the feature to
  # remove them and GuardDuty would add them straight back, so no apply could
  # ever leave this tree clean. The feature's own status stays managed here.
  lifecycle {
    ignore_changes = [additional_configuration]
  }
}

# =============================================================================
# Alternate contacts
#
# The operations and security contacts name the operations group's mailbox, so
# a service or security notice that needs someone to act reaches everyone on the
# watch. Unset, those notices reach only the root mailbox, and nobody is told if
# they go unread. The support plan is Basic, so there is no case to open behind a
# missed one. Billing notices stay with the root mailbox, the shared one the
# maintainers read, so no billing contact is declared.
#
# Gated because these are the only part of the baseline carrying values, and the
# three controls above should not wait on those values being set. The values
# live in this tree's companion secrets file rather than its ordinary values
# file, for the reason production's alarm mailbox does: the address is the AWS
# account's own recovery identity, and the phone number beside it is a named
# person's.
# =============================================================================

resource "aws_account_alternate_contact" "operations" {
  count = var.enable_account_alternate_contacts ? 1 : 0

  alternate_contact_type = "OPERATIONS"
  name                   = var.alternate_contact_operations.name
  title                  = var.alternate_contact_operations.title
  email_address          = var.alternate_contact_operations.email_address
  phone_number           = var.alternate_contact_operations.phone_number

  lifecycle {
    precondition {
      condition     = var.alternate_contact_operations != null
      error_message = "enable_account_alternate_contacts is on but alternate_contact_operations is unset. Set it in this tree's secrets.auto.tfvars, which is a symlink into the private operations checkout."
    }
  }
}

resource "aws_account_alternate_contact" "security" {
  count = var.enable_account_alternate_contacts ? 1 : 0

  alternate_contact_type = "SECURITY"
  name                   = var.alternate_contact_security.name
  title                  = var.alternate_contact_security.title
  email_address          = var.alternate_contact_security.email_address
  phone_number           = var.alternate_contact_security.phone_number

  lifecycle {
    precondition {
      condition     = var.alternate_contact_security != null
      error_message = "enable_account_alternate_contacts is on but alternate_contact_security is unset. Set it in this tree's secrets.auto.tfvars, which is a symlink into the private operations checkout."
    }
  }
}
