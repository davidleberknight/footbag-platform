#!/usr/bin/env bash
# shellcheck shell=bash
# terminal.sh — "is a human here?", asked once for the whole tree.
#
# Three files had their own copy of this test, and the copies had already begun
# to differ. It decides whether a script may show a secret, mint one, or take a
# typed confirmation, so a copy that drifts is a script that asks a question
# nobody can answer or, worse, proceeds as though one had been.
#
# Two things have to be true, and each was once thought sufficient on its own.
#
# A controlling terminal outlives the redirection of the standard streams. A
# script spawned by a test runner from a developer's shell still reaches that
# developer's terminal through /dev/tty while its own stdout and stderr are
# pipes, so probing the device alone prints a prompt into their session and
# blocks the suite on a keystroke. Requiring the streams as well makes the
# refusal deterministic wherever output is captured.
#
# And the device has to be opened, not stat'd. `[ -r /dev/tty ]` checks the
# node's permissions, which pass in a process with no controlling terminal at
# all, while the open then fails with "No such device or address" -- so the
# permission test reports a terminal that is not there.

# terminal_present [--with-stdin]
#
# True when output can reach a human and a human can answer.
#
# stdin is excluded by default, deliberately: under the credential-pipe pattern
# it belongs to the piped secret, which is the whole reason these callers read
# from /dev/tty instead. --with-stdin is for the scripts that ask a human to
# TYPE a secret, where a redirected stdin means someone is feeding one in and
# the run should refuse rather than consume whatever the pipe holds.
terminal_present() {
  if [[ "${1:-}" == "--with-stdin" && ! -t 0 ]]; then
    return 1
  fi
  [[ -t 1 && -t 2 ]] || return 1
  { true >/dev/tty; } 2>/dev/null || return 1
  return 0
}

# tty_discard_pending
#
# Throws away whatever is already waiting on the terminal, so that the next
# read takes only what is typed after the prompt is shown. A line typed while
# the run was still busy, or pasted along with the command, otherwise becomes
# the answer to a question nobody has read yet: a waiting "APPLY" accepts a
# confirmation, a waiting "no" declines one in no time at all.
#
# The terminal holds a line it has not yet delivered in its own line buffer,
# and reports input as available only once Enter has been pressed, so a check
# with `read -t 0` never sees a half-typed word. A later Enter would then
# complete it into the answer. Reading with -n makes bash take the terminal out
# of line mode for that one read and put it back afterwards, which hands over
# the half-typed part as well; a read that times out still keeps what it got,
# which is why the loop goes on while anything arrived. The bound stops a
# terminal that never goes quiet from holding the run here forever.
#
# Run it immediately before printing a prompt. It costs one short wait when
# nothing is pending. Without a terminal it does nothing, and it always
# returns 0, so a caller under errexit reaches its own refusal rather than
# dying here.
tty_discard_pending() {
  local fd junk rc rounds=0
  { exec {fd}</dev/tty; } 2>/dev/null || return 0
  while (( rounds < 256 )); do
    junk=""
    rc=0
    IFS= read -r -d "" -n 4096 -t 0.05 -u "$fd" junk || rc=$?
    [[ $rc -eq 0 || -n "$junk" ]] || break
    rounds=$((rounds + 1))
  done
  exec {fd}<&-
  return 0
}
