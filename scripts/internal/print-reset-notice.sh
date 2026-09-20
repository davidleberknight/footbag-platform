#!/usr/bin/env bash
# print-reset-notice.sh -- what a local database rebuild costs, said before it happens.
#
# Called by scripts/reset-local-db.sh immediately before it deletes the database
# file, with nothing between this and the delete. It prints and never asks: that
# script's safety contract is positive guards only, and it is invoked
# non-interactively by the launcher and by the deploy, so a prompt here would hang
# them rather than protect anything. It refuses nothing and changes nothing.
#
# It lives in its own file so a test can run it. Inside the reset script this text
# sits below a preflight and a virtual-environment install, and the only way to
# reach it there is to run the real rebuild, which tests must not do.
#
# Usage:
#   print-reset-notice.sh <db-path>
set -euo pipefail

DB="${1:?usage: print-reset-notice.sh <db-path>}"

if [[ ! -f "${DB}" ]]; then
  # The fresh-clone and continuous-integration path. The launcher runs the reset
  # when no database is there, and that is the first command a new developer
  # types; telling them their curator work is being destroyed would be false on
  # the one run where they have none, which is how a reader learns to skip the
  # warning that matters.
  {
    echo ""
    echo "Building ${DB} from committed inputs. No database is there yet, so nothing"
    echo "is being destroyed."
    echo ""
  } >&2
  exit 0
fi

# What the caller's guards do and do not promise, since this text is the only
# place an operator meets them. The environment and path checks refuse a
# production or staging environment and the production install path, and they do
# that in every phase of the project. The in-database cutover marker is different:
# it is written at go-live, and until then a copy of a deployed database carries
# no marker and is allowed through. So this names the database and what is
# refused, and claims nothing about restored copies, which is a protection that
# does not exist yet and would be a false promise today.
{
  echo ""
  echo "WARNING: this deletes ${DB} and rebuilds it from committed inputs."
  echo "That file is a development database; the reset refuses to run against a"
  echo "staging or production environment, or against the production install path."
  echo ""
  echo "Local database-native curator work is discarded and no committed file can"
  echo "restore it: authored adjudication drafts, publication and resolution state,"
  echo "curator-created canonical tricks, and the aliases, source links and modifier"
  echo "links attached to them."
  echo ""
  echo "freestyle/run_freestyle.sh is the command that keeps that work: it pulls"
  echo "committed freestyle input changes into the database you already have,"
  echo "reconciles in place, and never deletes the database file."
  echo ""
} >&2
