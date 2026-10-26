# =============================================================================
# Lightsail — web instance + static IP
# Bootstrap (Docker, /srv/footbag, systemd) is performed manually via SSH
# after first apply. user_data is intentionally not used (DD §7.2).
# =============================================================================

# CloudFront origin-facing IPv4 CIDRs, fetched at apply time from the AWS-
# published prefix list. Pins port 80 ingress to actual CloudFront edges so
# direct-to-origin probes from arbitrary IPs are dropped at the firewall
# before they can reach nginx. Belt-and-suspenders with the X-Origin-Verify
# nginx gate (rendered into nginx.conf by docker/nginx/40-render-nginx-conf.sh):
# firewall rejects most direct probes; the secret header rejects anything that
# slipped through (e.g. a CloudFront edge IP that isn't ours).
#
# List refreshes on every `terraform apply`. AWS publishes prefix changes a
# few times per year; re-applying after a published syncToken bump keeps the
# allowlist fresh.
data "http" "aws_ip_ranges" {
  url = "https://ip-ranges.amazonaws.com/ip-ranges.json"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Failed to fetch AWS IP ranges: HTTP ${self.status_code}"
    }
  }
}

locals {
  cloudfront_origin_facing_cidrs = [
    for prefix in jsondecode(data.http.aws_ip_ranges.response_body).prefixes :
    prefix.ip_prefix
    if prefix.service == "CLOUDFRONT_ORIGIN_FACING"
  ]
}

resource "aws_lightsail_key_pair" "operator" {
  name       = "${local.prefix}-operator"
  public_key = var.ssh_public_key
}

resource "aws_lightsail_instance" "web" {
  name              = local.web_instance_name
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.lightsail_blueprint_id
  bundle_id         = var.lightsail_bundle_id
  key_pair_name     = aws_lightsail_key_pair.operator.name

  # Host-level recovery. The database ships to S3 every few minutes, but nothing
  # else on this host does: Docker, the systemd units, /srv/footbag/env, the AWS
  # credential files and the pinned host key are all hand-bootstrapped and
  # declared nowhere. Without this, losing the instance means rebuilding it by
  # hand before a restore can even begin. Daily, seven retained, incremental,
  # billed on space actually used.
  #
  # `add_on` is an in-place update on this resource, unlike `key_pair_name` and
  # `name`, which are ForceNew. A plan that proposes REPLACING this instance is
  # not this block and must be refused: the member database is on local disk.
  #
  # 15:00 UTC is roughly 03:00 in the operator's timezone, chosen to sit away
  # from deploys so a snapshot never captures a half-migrated database.
  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "15:00"
    status        = "Enabled"
  }

  tags = {
    Role = "web"
  }
}

# A host restored from a snapshot is a new instance under a new name, because
# Lightsail names are immutable and the old instance is kept, stopped, until the
# restore has been proved. scripts/restore-host.sh records that name in the
# values file and removes the old instance from state; this block then takes the
# restored instance in on the next plan. With no name recorded it imports
# nothing, so a fresh environment still creates its instance, and an import
# whose address is already in state is ignored, so it is safe to leave in place.
import {
  for_each = var.lightsail_instance_name == "" ? toset([]) : toset([var.lightsail_instance_name])
  to       = aws_lightsail_instance.web
  id       = each.value
}

resource "aws_lightsail_static_ip" "web" {
  name = "${local.prefix}-web-ip"
}

# Replaced with the instance. A replacement keeps the instance's name, so
# instance_name alone plans no change here, while Lightsail detaches the address
# from the instance it deletes: without this the new instance comes up on a
# fresh public address and the static one is left attached to nothing. The ARN
# is new for every instance, so it triggers on a replacement and on nothing
# else; the whole resource would also trigger on an in-place update such as its
# tags, detaching the address from a running host for no reason. A restore's
# adoption imports the restored instance under a new name, which this resource
# follows through instance_name, a replacing argument, so the address moves then
# too.
resource "aws_lightsail_static_ip_attachment" "web" {
  static_ip_name = aws_lightsail_static_ip.web.name
  instance_name  = aws_lightsail_instance.web.name

  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.web.arn]
  }
}

resource "aws_lightsail_instance_public_ports" "web" {
  instance_name = aws_lightsail_instance.web.name

  # SSH — restricted to operator CIDRs plus the lightsail-connect alias for
  # AWS-managed browser-SSH source IPs (permanent break-glass per DD §7.2).
  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = var.operator_cidrs
    cidr_list_aliases = ["lightsail-connect"]
  }

  # SSH alternate port for ISPs that block port 22 outbound to AWS EC2 ranges.
  # sshd on the host listens on both 22 and 2222.
  port_info {
    protocol  = "tcp"
    from_port = 2222
    to_port   = 2222
    cidrs     = var.operator_cidrs
  }

  # HTTP — CloudFront origins only. The CloudFront origin-facing prefix list
  # comes from data.http.aws_ip_ranges (above). Direct-to-origin probes from
  # any other source are rejected at the Lightsail firewall before reaching
  # nginx, defending the X-Forwarded-For trust chain (Express trusts RFC1918
  # peers, so reaching nginx with a spoofed XFF would otherwise spoof req.ip).
  # Belt-and-suspenders with the nginx-layer X-Origin-Verify shared-secret
  # gate.
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = local.cloudfront_origin_facing_cidrs
  }

  lifecycle {
    precondition {
      condition     = length(local.cloudfront_origin_facing_cidrs) > 0
      error_message = "No CloudFront origin-facing CIDRs in AWS IP ranges; refusing to apply (would close port 80 entirely)."
    }

    # A new instance starts on Lightsail's default firewall, SSH and HTTP open to
    # every address, and a replacement keeps the instance's name, so without
    # this the rules above are never written to it. Triggered on the ARN, which
    # changes only when the instance is replaced, for the reason given on the
    # static address's attachment.
    replace_triggered_by = [aws_lightsail_instance.web.arn]
  }
}
