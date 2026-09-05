---
paths:
  - "terraform/**"
---

# Infrastructure rules

Conventions for the Terraform trees (`terraform/staging`, `terraform/production`,
`terraform/shared`). Authority order lives in root `CLAUDE.md`; this rule never
restates it. Concrete AWS facts, record values,
and activation procedures live in `AWS_OPERATIONS.md` (private GitHub repo) and
`DEVOPS_GUIDE.md` (private GitHub repo); this rule covers how to write the code,
not what the values are.

## The private operations checkout is a prerequisite, not a convenience

Every environment's `terraform.tfvars` is a symlink into the maintainers' private operations
checkout, and the bring-up runbooks live there too. Without that checkout the symlinks dangle, so
no environment can be planned or applied and no runbook step can be followed. This is a hard
prerequisite for all operations work, while a developer or tester without it stays a fully
supported configuration for everything else. When it is absent, say so in one line, carry on with
the part of the task that does not need it, and never improvise a values file: a real
`terraform.tfvars` is never created in this tree.

## New optional infrastructure ships behind a default-false gate

Both trees are applied in passes, so anything that cannot exist on the first
apply gets a `variable "enable_*"` (or `ses_enable_*` for the mail records) of
type `bool` with `default = false`, and every resource it owns carries
`count = var.enable_x ? 1 : 0`. This is why alarms do not fire
`INSUFFICIENT_DATA` from the first apply and why the certificate does not hang on
validation before the zone exists. A gate's description says what must be true
before it flips, not merely what it creates.

Match an existing resource's gate rather than assuming its shape. Some invert the
ternary deliberately, existing only while a flag is off, as the single-address
sender identity does until domain auth takes over; some key off string emptiness
instead of a bool; and some read a computed local that combines two flags, which
is still the same family. Rewriting one of these to `? 1 : 0` inverts its meaning.

## A gated record owns both of its states

A DNS record that changes at a cutover is declared once, carrying its pre-switch
value and its post-switch value in the same resource, gated by the flag that
flips. Declaring only the post-switch state means the pre-switch value is applied
by hand, and the flip then collides with it: `allow_overwrite` stays at its
default so an unimported record fails the apply loudly, and a record that also
changes type (CNAME to A) cannot coexist with its predecessor at all. The
collision lands inside the cutover window, which is the worst place to discover
it. Never "fix" such a collision by setting `allow_overwrite = true`; that trades
a loud failure for a silent overwrite of a record nobody declared.

## A resource that owns a record set owns every string in it

Route 53 keeps one record set per name and type, so a resource writing an apex
TXT owns every other TXT string at that name. Read the live zone first and list
the existing strings in the resource's variable, or the apply destroys the ones
it does not know about, and domain-verification tokens are exactly the kind of
string that lives there: destroying one withdraws the proof of ownership that
provider's own account recovery rests on. A `lifecycle { precondition }` rejects
an empty list rather than letting the omission reach an apply.

The record itself follows the both-states rule above, so Terraform writes it from
the zone move onward and there is no import to sequence against the flag. Reach
for an import only for a record Terraform did not create.

## Lifecycle blocks carry the durability guarantees

Three uses, each deliberate, none decorative. A bucket holding data that cannot
be regenerated carries `lifecycle { prevent_destroy = true }`. A resource that
cannot be deleted while something still references it carries
`create_before_destroy = true`: the ACM certificate a distribution attaches, and
the CloudFront Function a distribution references. A parameter whose flip is
out-of-band and one-way carries `ignore_changes = [value]`, so a later apply
cannot silently revert a production that has gone live and re-arm the destructive
deploy paths. A parameter Terraform is the sole writer of, including the arming
switches, the identifiers published from the resources they name, and generated
secrets, deliberately omits `ignore_changes`, so out-of-band drift reverts on the
next apply and tfvars, SSM, and the host stay in one line of custody. Removing any of these is a durability change, not a cleanup.

## Environment-scoped naming

Runtime configuration and log groups are namespaced `/footbag/{environment}/...`
using `var.environment`, never a hardcoded environment name. Providers set
`default_tags` with `Project`, `Environment`, and `ManagedBy`, so individual
resources do not restate them.

## Staging and production stay at parity

A divergence between the two trees is either removed or asserted in the Terraform
with a stated reason in a comment. Staging is smaller and its adapters are
stubbed; it is not structurally different. Staging serves on its default
CloudFront name and attaches no custom domain, so `terraform/staging/route53.tf`
is commented-out reference shape by design and no DNS change can be rehearsed
there.

## Operator specifics live in tfvars

Account ids, IP addresses, key material, and CIDR ranges are set in
`terraform.tfvars`, never in committed HCL. Committed files carry the variable
and its description; `terraform.tfvars.example` carries a placeholder. A
validation block or a `lifecycle { precondition }` rejects the placeholder rather
than letting a TODO reach an apply.

The values file itself is not held in this repository. Each environment's
`terraform.tfvars` lives in the maintainers' private operations checkout and is
reached from `terraform/<environment>/` by a gitignored symlink, because the
values carry operator CIDR ranges and gitignored keeps a file out of the history
but not out of reach of an accidental commit here. Never create a real
`terraform.tfvars` in this tree; add the value to the private file the symlink
points at.

A variable whose declaration says `sensitive = true` is excluded from that file
and from every repository. Its value goes in the companion `secrets.auto.tfvars`,
reached by the same symlink convention and gitignored on both sides, with the
credential vault holding the canonical copy. Mark a variable `sensitive`
whenever the vault governs its value, so this routing catches it: the alarm
mailbox is marked that way because it is the AWS account-recovery identity, not
because an email address is inherently secret. Terraform auto-loads that
filename, so a sensitive value never has to be passed as a command-line
argument, which would expose it to every account on the host.

## Verify without applying

`terraform validate` and `terraform fmt -check` are the checks to run, after
`terraform init -backend=false`. Applying, planning against real state, and any
state mutation are human-run operator actions, not agent actions.

## Check how the thing is actually reached before adding a resource for it

The zone's record set is fixed by the design, not inferred from a gap. The
go-live records gate and the DNS cutover decision enumerate every record the zone
carries, and the record inventory in `AWS_OPERATIONS.md` (private GitHub repo)
repeats it. A name that appears in none of them is not a missing record to add;
an operational note describing how something is reached today is a fact about the
current setup, not authority to create a record the design does not carry. The
CloudFront custom origin is the standing example: it needs a resolvable hostname
because CloudFront rejects raw IPs, and staging builds one from the static IP via
nip.io. The design's record set now carries an origin name for production, because
a certificate cannot be issued for a name that does not exist and the edge-to-origin
hop is to be encrypted; staging keeps its nip.io form. The rule is unchanged by that:
the record set is fixed by the design, and a name appearing only in an operational
note is still not authority to create one.
