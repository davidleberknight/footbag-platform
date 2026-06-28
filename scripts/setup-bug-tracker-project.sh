#!/usr/bin/env bash
# setup-bug-tracker-project.sh -- one-shot setup of the GitHub Projects v2
# board that backs the bug-tracker forms in .github/ISSUE_TEMPLATE/.
#
# Creates the project, configures four custom fields with the project's
# standard bug-tracker vocabularies (defined inline below), and links this
# repository to the project. Idempotent: re-runs detect existing state and skip.
#
# The Status field is GitHub's built-in (non-deletable) field; this script
# overwrites its options via the GraphQL updateProjectV2Field mutation, so
# Status drift is also repairable by re-running the script.
#
# Prerequisites:
#   - gh CLI installed (https://cli.github.com/)
#   - gh authenticated as the repo owner with the 'project' scope
#     (`gh auth login` then `gh auth refresh -s project` if needed)
#   - jq installed
#
# After this script runs, two manual UI steps remain (Status options and
# Auto-add workflow). Both are described in the final output.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_TITLE="footbag-platform bug tracker"

command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not installed. See https://cli.github.com/" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not installed." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: not authenticated. Run 'gh auth login' first." >&2; exit 1; }

# Derive owner + repo from the current checkout so any maintainer can run this.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  || { echo "ERROR: could not resolve repo from gh; run inside a checkout of the project." >&2; exit 1; }
OWNER="${REPO%%/*}"

PROJECT_NUMBER=$(gh project list --owner "$OWNER" --format json \
  | jq -r ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" \
  | head -1)

if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "Creating project '$PROJECT_TITLE'..."
  PROJECT_NUMBER=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json | jq -r '.number')
  echo "  created project #$PROJECT_NUMBER"
else
  echo "Project '$PROJECT_TITLE' exists at #$PROJECT_NUMBER (skipping create)"
fi

# Helper: create a single-select custom field if it doesn't already exist.
# Skips if a field of that name is present; does not modify existing fields
# (gh CLI at this version has no field-edit subcommand).
ensure_field() {
  local name="$1"
  local options="$2"
  local existing_id
  existing_id=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
    | jq -r ".fields[] | select(.name==\"$name\") | .id" \
    | head -1)
  if [[ -n "$existing_id" ]]; then
    echo "  field '$name' exists (id=$existing_id); skipping. Verify options match: $options"
  else
    echo "  creating field '$name'..."
    gh project field-create "$PROJECT_NUMBER" --owner "$OWNER" \
      --name "$name" --data-type SINGLE_SELECT \
      --single-select-options "$options" >/dev/null
  fi
}

echo "Configuring custom fields with the standard bug-tracker vocabularies..."
ensure_field "Area" "auth,migration,onboarding,clubs,members,events,media,admin,staging,docs,security"
ensure_field "Environment" "local,staging,production"
ensure_field "Severity" "blocker,major,normal,minor"
ensure_field "User role" "anonymous,member,club leader,admin,event organizer,legacy claimant"

echo "Updating Status field options to the standard bug-tracker workflow states..."
STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
  | jq -r '.fields[] | select(.name=="Status") | .id')
if [[ -z "$STATUS_FIELD_ID" ]]; then
  echo "ERROR: Status field not found on project #$PROJECT_NUMBER" >&2
  exit 1
fi
gh api graphql -f query="$(cat <<GRAPHQL
mutation {
  updateProjectV2Field(input: {
    fieldId: "$STATUS_FIELD_ID",
    singleSelectOptions: [
      {name: "New", color: GRAY, description: "Freshly filed; not yet triaged."},
      {name: "In progress", color: BLUE, description: "Maintainer working on the fix."},
      {name: "In review", color: YELLOW, description: "PR open; awaiting review or merge."},
      {name: "Done", color: GREEN, description: "Fixed and regression test merged."},
      {name: "Won't fix", color: RED, description: "Closed without fix; rationale in issue thread."}
    ]
  }) {
    projectV2Field { ... on ProjectV2SingleSelectField { name } }
  }
}
GRAPHQL
)" >/dev/null
echo "  Status options set to: New, In progress, In review, Done, Won't fix"

echo "Linking repo $REPO to project #$PROJECT_NUMBER..."
gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 \
  || echo "  (link may already exist; non-fatal)"

PROJECT_URL=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json | jq -r '.url')

cat <<EOF

Done with API-configurable setup. Project board: $PROJECT_URL

The 5 lifecycle workflows below must be configured in the GitHub
Projects UI. The public API exposes only deleteProjectV2Workflow, not
create/update; UI is the only path until GitHub adds API surface.

This script does NOT verify workflow enabled-state via API. Observed
cases where API reads of workflow state coincided with bulk reverts
of enabled-state make API verification unsafe. The UI 'On' indicator
in the workflow sidebar is the source of truth.

Required workflow configuration (one-time, in the GH UI):
  - Auto-add to project              filter: is:issue
  - Item added to project            set Status -> New
  - Pull request linked to issue     set Status -> In review
  - Pull request merged              set Status -> Done
  - Item closed                      set Status -> Done

Procedure per workflow:
  1. Open $PROJECT_URL
  2. (...) menu (upper right) -> Workflows
  3. Under 'Default workflows', click the workflow name
  4. Click 'Edit' (upper right)
  5. Configure per the table above
  6. Click 'Save and turn on workflow'

Confirm 'On' in the workflow sidebar after each save. Do not run any
external API queries against the project while configuring workflows.
EOF
