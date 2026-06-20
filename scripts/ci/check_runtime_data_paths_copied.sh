#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every runtime file
# read that resolves under the repo root has a matching COPY in the web runtime
# image, so a non-compiled data file the app reads is actually shipped.
#
# tsc emits only .js into dist/, which the runtime stage picks up via
# `COPY --from=builder /app/dist ./dist`. Views, static assets, and rules
# content are not compiled, so they reach the container only through an explicit
# COPY. A read of a new repo data root with no matching COPY would ship a broken
# image that fails safe to empty at runtime, which masks the miss in production.
#
# Repo-relative runtime paths are anchored as path.join/resolve(process.cwd(),
# <segments>). This gate enumerates those sites in src/, extracts the literal
# leading segments, and asserts each resolves under a path the web runtime stage
# copies. A site whose first segment is a non-literal (a variable) cannot be
# resolved statically and must be allowlisted with a reason.
#
# Allowlisted roots are read at runtime but intentionally NOT shipped in the
# image; each entry below states why.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DOCKERFILE="docker/web/Dockerfile"

# Files whose process.cwd()-anchored read is intentionally absent from the
# runtime image. A new entry needs a real reason on the same line.
allowlist=$(cat <<'EOF'
src/services/curatorMediaService.ts	curated content is served from the database and object store in production; the on-disk sidecar tree is dev-only
src/adapters/secretsAdapter.ts	local-only secrets file; production injects secrets at deploy time
src/adapters/jwtSigningAdapter.ts	JWT signing keypair path is env-provided runtime config, not committed repo data
EOF
)

# Runtime-stage COPY sources: COPY lines after the final FROM (so the builder
# stage's `COPY src ./src` is excluded), minus --from build-artifact copies.
# The source is the first argument after COPY.
last_from=$(grep -n '^FROM ' "$DOCKERFILE" | tail -1 | cut -d: -f1)
copy_sources=$(tail -n +"$last_from" "$DOCKERFILE" \
  | grep -E '^[[:space:]]*COPY ' \
  | grep -vE '^[[:space:]]*COPY[[:space:]]+--from' \
  | sed -E 's/^[[:space:]]*COPY[[:space:]]+//' \
  | awk '{ sub(/\/+$/, "", $1); print $1 }')

# Every repo-relative runtime read site (skip comment lines).
hits=$(grep -rnE --include='*.ts' 'path\.(join|resolve)\([[:space:]]*process\.cwd\(\)' src/ \
  | grep -vE ':[0-9]+:[[:space:]]*//' \
  || true)

report=$(printf '%s\n' "$hits" \
  | COPY_SOURCES="$copy_sources" ALLOWLIST="$allowlist" perl -e '
    my %copy  = map { $_ => 1 } grep { length } split /\n/, ($ENV{COPY_SOURCES} // "");
    my %allow;
    for my $l (split /\n/, ($ENV{ALLOWLIST} // "")) {
      my ($f) = split /\t/, $l;
      $allow{$f} = 1 if defined $f && length $f;
    }
    while (my $line = <STDIN>) {
      chomp $line;
      next unless length $line;
      my ($file, $no, $content) = split /:/, $line, 3;
      next unless defined $content;
      next if $allow{$file};
      next unless $content =~ /process\.cwd\(\)(.*)$/;
      my $tail = $1;
      my @segs;
      my $dynamic = 0;
      if ($tail =~ /^\s*,(.*)$/s) {
        my $args = $1;
        while (1) {
          $args =~ s/^\s*//;
          if ($args =~ /^(["\x27])([^"\x27]*)\1(.*)$/s) {
            push @segs, $2;
            my $after = $3;
            $after =~ s/^\s*//;
            if ($after =~ /^,(.*)$/s) { $args = $1; next; }
            last;
          } else {
            $dynamic = 1 if length $args && $args !~ /^\)/;
            last;
          }
        }
      }
      if (!@segs) {
        if ($dynamic) {
          print "$file:$no: dynamic process.cwd() path; add a COPY to the web Dockerfile or an allowlist entry with a reason\n";
        }
        next;
      }
      my @parts = @segs;
      my $covered = 0;
      while (@parts) {
        my $prefix = join("/", @parts);
        if ($copy{$prefix}) { $covered = 1; last; }
        pop @parts;
      }
      if (!$covered) {
        my $cand = join("/", @segs);
        print "$file:$no: reads repo path \x27$cand\x27 with no matching COPY in the web runtime image\n";
      }
    }
  ')

if [ -n "$report" ]; then
  printf '%s\n' "$report" >&2
  echo "  FAIL: add the missing COPY to $DOCKERFILE, or allowlist the path with a reason" >&2
  exit 1
fi
echo "[runtime-data-copy] pass"
