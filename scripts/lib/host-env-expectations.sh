# Shared expectations for the operator-owned values in /srv/footbag/env.
#
# Sourced by every script that has an opinion about those values, so there is
# exactly one place that states what each should be:
#
#   scripts/set-host-env.sh        writes them
#   scripts/bringup-status.sh      reports whether they are present and valid
#   scripts/verify-staging-env.sh  warns when they are not
#
# The hop count in particular was previously written out in two of those
# scripts, once as an inline conditional and once inside a warning string.
# Three scripts describing the same host from three copies of one fact is how
# they come to disagree, and nothing would have failed when they did.
#
# TRUST_PROXY is the exact integer X-Forwarded-For hop count of the proxy chain
# in front of the application. It is not a boolean and not a guess: the value is
# how many hops `req.ip` must walk back to reach the real client. Too low and
# per-IP rate limiting buckets everyone behind the edge together; too high and a
# client can spoof its own address by sending a longer header, which is why the
# safe direction to be wrong in is downward. An unset or non-integer value falls
# back to the named-range list in `src/config/env.ts`, which fails closed to
# per-edge buckets rather than opening that hole.
#
#   staging     CloudFront -> nginx  = 2
#   production  CloudFront -> nginx  = 2
#
# Both environments run the same two-hop chain, and it does not change at the
# DNS cutover: the platform is reached through its own CloudFront distribution
# whether or not the apex still points at the legacy site, so there is no legacy
# front-door hop in front of it at any milestone. The design decision on proxy
# trust and the private devops guide's host env table both state 2 for both
# environments; a status message in one script used to say production ran 3
# until the handover, which nothing else supported and which would have had the
# setter write a value one hop too generous.

# expected_trust_proxy <staging|production>
# Prints the integer hop count. Returns non-zero on an unknown target so a
# caller cannot silently proceed with an empty value.
expected_trust_proxy() {
  local target="${1:-}"
  case "$target" in
    staging|production)
      echo 2
      ;;
    *)
      echo "expected_trust_proxy: unknown target '${target}'" >&2
      return 1
      ;;
  esac
}

# expected_trust_proxy_note <staging|production>
# One human-readable phrase naming the expected value, for status output and
# warnings, so those messages cannot drift from the number above.
expected_trust_proxy_note() {
  local target="${1:-}"
  case "$target" in
    staging|production)
      echo "2 (CloudFront then nginx)"
      ;;
    *)
      echo "expected_trust_proxy_note: unknown target '${target}'" >&2
      return 1
      ;;
  esac
}
