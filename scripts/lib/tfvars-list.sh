#!/usr/bin/env bash
# shellcheck shell=bash
# tfvars-list.sh -- read and rewrite a top-level list of strings in a values file.
#
# A record set such as the apex TXT strings is carried in a values file as one
# list, and more than one operator script has to add to it or carry the live
# zone's strings into it. Each would otherwise write its own awk for the same
# HCL shape, and two copies of a parser drift apart on exactly the input one of
# them was never tested on (a list written over several lines, a duplicate
# assignment). These are the one copy.
#
# Every function reads the values file on standard input and writes to standard
# output, so the caller decides where the result goes and shows the diff before
# anything is written through the symlink.

# set_assignment <name> <value>: every top-level `<name> = ...` assignment, one
# line or a list over several, replaced by `<name> = <value>`, or the line added
# at the end when the file has none.
set_assignment() {
  NAME="$1" VALUE="$2" awk '
    BEGIN { name = ENVIRON["NAME"]; value = ENVIRON["VALUE"] }
    skipping { if ($0 ~ /]/) skipping = 0; next }
    $0 ~ ("^[ \t]*" name "[ \t]*=") {
      i = index($0, "=")
      print substr($0, 1, i) " " value
      done = 1
      rest = substr($0, i + 1)
      if (rest ~ /\[/ && rest !~ /]/) skipping = 1
      next
    }
    { print }
    END { if (!done) print name " = " value }
  '
}

# top_strings <name>: the strings of a top-level list assignment, one per line.
top_strings() {
  local entry
  entry="$(NAME="$1" awk '
    BEGIN { name = ENVIRON["NAME"] }
    !inside && $0 ~ ("^[ \t]*" name "[ \t]*=") { inside = 1 }
    inside { print; if ($0 ~ /]/) exit }
  ')"
  [[ -n "$entry" ]] || return 0
  printf '%s\n' "$entry" | sed '1s/^[^=]*=//' \
    | { grep -oE '"[^"]*"' || [[ $? == 1 ]]; } | sed 's/^"//; s/"$//'
}

# render_list: the strings on standard input as one HCL list.
render_list() {
  local out="" s
  while IFS= read -r s; do
    [[ -n "$s" ]] || continue
    out="${out:+${out}, }\"${s}\""
  done
  printf '[%s]' "$out"
}

# A string that would break out of its quotes is never written: every string
# here is a DNS value, and none legitimately carries a quote or a backslash.
writable_strings() {
  ! grep -q '["\\]' <<< "$1"
}

# One sorted set per list, so two lists compare whatever order they were written in.
as_set() { printf '%s\n' "$1" | sed '/^$/d' | LC_ALL=C sort -u; }
