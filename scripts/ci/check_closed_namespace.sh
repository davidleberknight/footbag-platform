#!/usr/bin/env bash
# Closed-namespace gate. The design rules that from go-live the served set under
# the domain is the apex, www and the archive, and that no subzone is delegated
# to a third party. The platform's own preview and origin names are served from
# the zone too; they are IFPA-operated, not delegations, and are outside what this
# gate is about. The design also requires that the absence of a delegation be
# ASSERTED rather than left to convention, and this is that assertion: without it
# nothing but a comment in route53.tf stands between the zone and a delegated
# child.
#
# Why the namespace rather than the arrangement. Certificate authorisation is
# read at the closest node, so a delegated child publishing its own CAA overrides
# the apex record for its whole subtree and can obtain a certificate for a name
# under this domain from ANY authority, rather than only from the one the apex
# record names. Relaxed
# DMARC alignment lets a child that publishes its own sender policy send mail
# that authenticates as the domain. The archive's access cookies are scoped to
# the whole domain, because CloudFront requires it, and cookie matching is
# suffix matching with no exclusion syntax, so any name answering over HTTPS
# receives a signed-in member's archive credentials. None of that is preventable
# by agreement with whoever operates the child.
#
# What fails:
#   - a record of type NS naming anything but the zone apex
#   - a record whose type is computed from anything but a certificate's own
#     domain_validation_options, because a type read out of a values file is how
#     an NS record arrives without the word NS appearing anywhere in the tree
#
# The apex NS set is the one legitimate case, and it is not a delegation: Route
# 53 creates it together with the hosted zone and Terraform declares it solely
# to lower its TTL.
#
# A delegated child IS permitted BEFORE go-live, as a migration bridge, by the
# same decision that closes the namespace after it. That bridge permission ends
# at launch. It is not the only route: the same decision allows a name to survive
# go-live on a technical reason given in writing, with merit, that IFPA accepts,
# with the risks stated and explicitly accepted. Either way honouring it is a
# deliberate act: change this gate and record why, rather than working around it.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=""
scanned=0
records=0

# Every Terraform file under the tree, at any depth, in both syntaxes. The glob
# this replaced reached exactly two levels and one extension, so a shared DNS
# module at terraform/modules/dns/main.tf, a file at the top of the tree, and the
# JSON form -- which `terraform plan` loads and this did not see -- were all
# unscanned. A module directory is the likeliest place a shared record helper
# would go, which makes it the likeliest place for this to have mattered.
#
# Errors are swallowed and the emptiness is judged below rather than here: a
# missing tree, an unreadable one and an empty one all have to reach the same
# refusal, because "nothing was scanned" is the condition that matters and a
# find that died is not a pass.
tf_files="$(find terraform -type f \( -name '*.tf' -o -name '*.tf.json' \) 2>/dev/null | sort || true)"

# And nothing declaring infrastructure outside that tree. There is none today,
# and a gate that only looks where the files currently are stops being a gate the
# day somebody puts one somewhere else.
stray="$(find . -path ./node_modules -prune -o -path ./terraform -prune -o -type f \( -name '*.tf' -o -name '*.tf.json' \) -print | sort)"
if [ -n "$stray" ]; then
  violations="${violations}terraform files outside terraform/, which this gate does not scan:"$'\n'
  violations="${violations}$(printf '%s\n' "$stray" | sed 's/^/  /')"$'\n'
fi

while IFS= read -r tf; do
  [ -n "$tf" ] || continue
  [ -f "$tf" ] || continue
  scanned=$((scanned + 1))

  # JSON is first-class Terraform: `terraform plan` loads a .tf.json exactly as
  # it loads HCL. Everything below reads HCL, so a record declared in JSON would
  # be scanned and not judged, which is the same as not being scanned while
  # counting towards the total that says something was. Refused rather than
  # half-read, on the same footing as the exclusive-record-set resource.
  case "$tf" in
    *.tf.json)
      violations="${violations}${tf}: declares Terraform in JSON, which terraform loads and this gate does not read"$'\n'
      continue
      ;;
  esac

  # A record set minted by a shell provisioner or a CLI call is not declared in
  # HCL at all, so no amount of reading resource blocks finds it.
  if grep -qE 'change-resource-record-sets' "$tf"; then
    violations="${violations}${tf}: calls change-resource-record-sets, which can write any record set including a delegation, past every check below"$'\n'
  fi

  # This resource manages a zone's record sets as a set and can carry an NS
  # record among them. The gate does not read its nested blocks, so rather than
  # read it half-way it refuses it: adopting it means teaching this gate first.
  # It ships inside the provider version this tree pins, so it is reachable now.
  if grep -qE '^resource[[:space:]]+"aws_route53_records_exclusive"' "$tf"; then
    violations="${violations}${tf}: declares aws_route53_records_exclusive, which can carry a delegation in a shape this gate does not read"$'\n'
  fi

  found="$(awk -v file="$tf" '
    # Comments never declare anything. Strip them before any matching, so a
    # commented-out example record cannot fail the gate and a trailing comment
    # cannot smuggle a word past it.
    { line = $0; sub(/#.*$/, "", line) }

    # Brace depth is counted on a copy with every quoted string blanked. Counting
    # the raw line let one unmatched brace inside a value -- a set identifier
    # ending in "{" is enough -- keep the block open forever, so the record was
    # never emitted and never judged. The total printed at the end is a global
    # zero check and cannot see one record go missing, so the pass line read as
    # evidence while the record it should have caught was invisible.
    {
      braces = line
      gsub(/"[^"]*"/, "", braces)
    }

    line ~ /^resource[[:space:]]+"aws_route53_record"/ {
      inblock = 1; kind = "record"; depth = 0; dvo = 0; name = ""; type = ""; recs = ""
      label = $3; gsub(/"/, "", label)
    }

    # A child hosted zone delegates just as surely as an NS record set does, and
    # it additionally breaks the apex authorisation record, whose reach over the
    # subtree holds only while no child zone exists. The child publishes its own,
    # and any authority may then issue for a name beneath it.
    line ~ /^resource[[:space:]]+"aws_route53_zone"/ {
      inblock = 1; kind = "zone"; depth = 0; dvo = 0; name = ""; type = ""; recs = ""
      label = $3; gsub(/"/, "", label)
    }

    inblock {
      opens = gsub(/\{/, "{", braces)
      closes = gsub(/\}/, "}", braces)

      # Read top-level attributes only. depth is 1 inside the resource body, so
      # a name inside a nested alias block is not mistaken for the record name.
      if (depth == 1) {
        if (line ~ /^[[:space:]]*name[[:space:]]*=/) {
          name = line; sub(/^[^=]*=[[:space:]]*/, "", name); gsub(/[[:space:]]+$/, "", name)
        }
        if (line ~ /^[[:space:]]*type[[:space:]]*=/) {
          type = line; sub(/^[^=]*=[[:space:]]*/, "", type); gsub(/[[:space:]]+$/, "", type)
        }
        if (line ~ /^[[:space:]]*records[[:space:]]*=/) {
          recs = line; sub(/^[^=]*=[[:space:]]*/, "", recs); gsub(/[[:space:]]+$/, "", recs)
        }
        # The certificate exemption is read from the iteration expression only,
        # and that expression spans several lines: for_each opens a comprehension
        # and the certificate it reads is named inside it. So the window opens on
        # the for_each line and closes when the expression does.
        #
        # Read from anywhere in the block instead, a mention in an ignore_changes
        # list, a depends_on, a set identifier or a dummy value laundered a
        # computed type through: the test proving a COMMENT could not do it
        # passed while a line of live code could.
        if (line ~ /^[[:space:]]*(for_each|count)[[:space:]]*=/) { infor = 1 }
      }
      if (infor && line ~ /domain_validation_options/) { dvo = 1 }

      depth += opens - closes

      # The window shuts as soon as the expression returns to the resource body.
      # A single-line for_each therefore gets exactly its own line, which is what
      # refuses an iteration lifted into a local: the gate reads what is written
      # here and resolves nothing, because anything it resolves is something an
      # author can redirect.
      if (infor && depth <= 1) { infor = 0 }

      if (depth <= 0) {
        print file "\t" kind "\t" label "\t" name "\t" type "\t" dvo "\t" recs
        inblock = 0
      }
    }
  ' "$tf")"

  [ -n "$found" ] || continue

  while IFS=$'\t' read -r file kind label name type dvo recs; do
    [ -n "$label" ] || continue
    records=$((records + 1))

    if [ "$kind" = "zone" ]; then
      # The apex zone itself is this tree's whole subject. A zone whose name is
      # built from the domain variable is that one; anything else is a child.
      case "$name" in
        'var.domain_name'|'"${var.domain_name}"'|'local.zone_name'|'local.domain_name') ;;
        *)
          violations="${violations}${file}: hosted zone '${label}' is declared for ${name}. A child zone is a delegation, and it breaks the apex CAA record, whose reach over the subtree holds only while no child zone exists: the child publishes its own, and any authority may then issue for a name beneath it."$'\n'
          ;;
      esac
      continue
    fi

    # Classified by SHAPE, not by quoting. The old test was "starts and ends with
    # a quote", which sent "N${local.s}" down the literal branch, compared it to
    # NS as a whole string, found it different and passed it -- defeating both
    # branches at once with two quotation marks. Anything carrying an
    # interpolation is computed, whatever it is wrapped in.
    case "$type" in
      *'${'*)
        computed=1
        ;;
      '"'*'"')
        computed=0
        ;;
      *)
        computed=1
        ;;
    esac

    if [ "$computed" -eq 0 ]; then
      literal="${type%\"}"
      literal="${literal#\"}"
      if [ "$literal" = "NS" ]; then
        # The apex nameserver set is the one legitimate NS record, and it is not
        # a delegation: Route 53 creates it with the zone and Terraform declares
        # it solely to lower its lifetime. Several spellings name the same apex,
        # and rejecting the others made a terraform-fmt-clean refactor fail this
        # gate for no reason.
        case "$name" in
          'var.domain_name'|'"${var.domain_name}"'|'local.apex'|'local.zone_name'|'aws_route53_zone.primary.name'|'""')
            # Allowed only when it carries the zone's OWN nameservers. Without
            # this the apex set could be repointed at a third party and pass:
            # every resolver that takes its nameservers from the zone rather than
            # from the registry would follow, which is a worse outcome than any
            # child delegation and was the one shape this gate whitelisted.
            case "$recs" in
              *name_servers*) ;;
              *)
                violations="${violations}${file}: record '${label}' is the apex NS set but its records are ${recs:-<none>} rather than the zone's own name_servers output. Declaring it is for lowering its lifetime, not for repointing the domain."$'\n'
                ;;
            esac
            ;;
          *)
            violations="${violations}${file}: record '${label}' declares type NS for ${name}, which delegates a child of the zone"$'\n'
            ;;
        esac
      fi
    else
      if [ "$dvo" != "1" ]; then
        violations="${violations}${file}: record '${label}' takes its type from ${type}, and the resource does not iterate a certificate's own domain_validation_options. A type read from a values file is how a delegation arrives without the word NS appearing anywhere in the tree. Lifting that iteration into a local is refused here deliberately: the gate reads the for_each line and nothing else, because anything it has to resolve is something an author can redirect."$'\n'
      fi
    fi
  done <<< "$found"
done <<< "$tf_files"

if [ "$scanned" -eq 0 ]; then
  echo "FAIL: no terraform files were scanned; the gate would pass without having looked at anything" >&2
  exit 1
fi

# Files scanned is not the same as records read. If the extraction stops matching
# -- a renamed resource type, a brace inside a string throwing off the depth
# count, a reformat -- this gate prints a pass having examined no record at all,
# and the green line reads as evidence. Count what was actually judged.
if [ "$records" -eq 0 ]; then
  echo "FAIL: ${scanned} terraform files were read and no DNS record was extracted from any of them." >&2
  echo "      That is a defect in this gate rather than a clean tree: it cannot pass without judging something." >&2
  exit 1
fi

if [ -n "$violations" ]; then
  printf '%s' "$violations" >&2
  echo "FAIL: the domain's namespace is closed from go-live, and the absence of a delegated child is asserted here rather than left to convention. A delegated subzone is permitted only as a migration bridge BEFORE go-live; if that is what this is, change this gate deliberately and record why." >&2
  exit 1
fi

echo "[closed-namespace] pass (${records} DNS records across ${scanned} terraform files)"
