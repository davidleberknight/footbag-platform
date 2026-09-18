# =============================================================================
# Variables — operators
# Fill in terraform.tfvars (never commit the real values file).
# =============================================================================

variable "aws_region" {
  description = "Region the IAM Identity Center instance runs in. Must match the Region the instance was enabled in, which is fixed for the life of the instance."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID. The account each operator is assigned their permission set on."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be the twelve-digit account number. It is the assignment target, so a placeholder produces an assignment against nothing."
  }
}

# The permission set's ARN is not a variable. It is read from the identity
# tree's published state in roster.tf, so nobody copies an ARN between two values
# files and nothing drifts if the permission set is ever recreated.
#
# Reading it that way is also what keeps this tree inside the super-admin grant:
# describing a permission set needs a permission an operator deliberately does
# not hold, because they may hand a role out and take it back but may not
# inspect or alter what it can do. Reading the tree's state is an S3 read, which
# they do hold.

# The roster: who is an operator.
#
# This is the whole of hiring and firing on the AWS side. A joiner is a new
# entry; a leaver is a deleted one. Both are applied by an ordinary operator,
# through scripts/terraform-apply.sh, as themselves — revoking access must never
# wait on a privileged sign-in.
#
# Keyed by the Identity Center user name, deliberately the same
# `firstname_lastname` spelling as that operator's named account on the hosts: an
# operator reading a trail entry and an operator reading an ssh alias should not
# have to translate between two names for one person.
#
# Each person here is assigned the permission set their job needs. A role models
# a job rather than a person, so operators doing the same job share one, and two
# roles carrying the same policy would drift apart the first time only one is
# updated. The split into super-admin and dev-and-tester is by job, not person.
variable "operators" {
  description = "The operator roster, keyed by Identity Center user name (firstname_lastname, matching their named account on the hosts). A joiner is an added entry; a leaver is a removed one."
  type = map(object({
    given_name  = string
    family_name = string
    email       = string
    role        = string
  }))

  validation {
    condition     = length(var.operators) > 0
    error_message = "operators must name at least one person. A permission set nobody is assigned provisions no role and admits nobody, which leaves the directly authenticated super-admin identity carrying every action in the account."
  }

  validation {
    condition     = alltrue([for name, o in var.operators : can(regex("^[a-z]+_[a-z]+$", name))])
    error_message = "Each operator key must be lower-case firstname_lastname. It is never a nickname or an email local part, because it is the same name that operator's account on the hosts carries and the two are read side by side."
  }

  # The one thing a roster entry decides beyond whether the person exists at all.
  # A role named here that no permission set answers to would assign nothing and
  # report nothing, so it is refused at plan time.
  validation {
    condition     = alltrue([for name, o in var.operators : contains(["super_admin", "dev_tester"], o.role)])
    error_message = "Each operator's role must be super_admin or dev_tester. super_admin reaches both environments, the roster itself, and the production host; dev_tester reaches staging only and is denied the one call that opens a shell on a host. Anyone whose job is not one of those two needs a third permission set declared before they can be listed here."
  }

  validation {
    condition     = alltrue([for name, o in var.operators : can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", o.email))])
    error_message = "Each operator needs a real email address: it is where the Identity Center invitation that sets their password and registers their second factor is sent, so a placeholder leaves an account nobody can sign in to."
  }

  # The shape check above accepts this project's own placeholders, which are
  # well-formed addresses in a reserved domain. Applying with one creates the
  # directory record and mails a real invitation into nowhere, and correcting it
  # means deleting the record and re-issuing rather than editing a value.
  validation {
    condition = alltrue([for name, o in var.operators :
    !can(regex("(?i)(^TODO-|@example\\.|\\.invalid$|\\.example$|@test$)", o.email))])
    error_message = "An operator's email is still a placeholder. TODO- prefixes, example. domains, and the reserved .invalid and .example suffixes are refused here because the shape check accepts them: they are well-formed addresses that nobody reads."
  }
}
