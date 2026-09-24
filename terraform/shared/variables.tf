variable "aws_region" {
  description = "AWS region for shared resources."
  type        = string
  default     = "us-east-1"
}

variable "enable_account_alternate_contacts" {
  description = <<-EOT
    Set the account's billing, operations and security alternate contacts.
    Flip this when all three identities have been decided AND their values are
    in this tree's companion secrets file. Off, every notice of those three
    kinds reaches only the root mailbox, and nobody is told if it goes unread.
    The three account controls beside them carry no values and do not wait on
    this, which is why they are not behind the same gate.
  EOT
  type        = bool
  default     = false
}

# One object per contact rather than a map, because Terraform refuses `for_each`
# over a sensitive collection and these are sensitive for the reason alarm_email
# is: the address is the AWS account's own recovery identity, and the phone
# number beside it is a named person's.
variable "alternate_contact_billing" {
  description = "Billing alternate contact. Vault-governed: set from the gitignored secrets file, never from a committed one."
  type = object({
    name          = string
    title         = string
    email_address = string
    phone_number  = string
  })
  sensitive = true
  default   = null
}

variable "alternate_contact_operations" {
  description = "Operations alternate contact. Vault-governed: set from the gitignored secrets file, never from a committed one."
  type = object({
    name          = string
    title         = string
    email_address = string
    phone_number  = string
  })
  sensitive = true
  default   = null
}

variable "alternate_contact_security" {
  description = "Security alternate contact, the one that matters most: it is where a security notice lands when the root mailbox is unattended. Vault-governed: set from the gitignored secrets file, never from a committed one."
  type = object({
    name          = string
    title         = string
    email_address = string
    phone_number  = string
  })
  sensitive = true
  default   = null
}

variable "state_bucket_suffix" {
  description = <<-EOT
    Globally unique suffix appended to the Terraform state bucket name.
    # TODO: Set to a short random string (e.g. the last 8 chars of your AWS account ID).
    Example: "a1b2c3d4"
  EOT
  type        = string
  default     = "TODO-set-unique-suffix"
}
