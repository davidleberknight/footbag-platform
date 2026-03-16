# Event Results Platform Pipeline

This directory contains the platform-side workflow for historical Footbag results.

## Scope

This is the second half of the overall system:

canonical CSVs  
→ seed builder  
→ SQLite database  
→ website

The upstream historical pipeline that produces the canonical CSVs is maintained separately.

## Directory layout

```text
legacy_data/event_results/
  canonical_input/
    events.csv
    event_disciplines.csv
    event_results.csv
    event_result_participants.csv
    persons.csv

  scripts/
    07_build_mvfp_seed_full.py
    08_load_mvfp_seed_full_to_sqlite.py

  seed/
    mvfp_full/
      seed_events.csv
      seed_event_disciplines.csv
      seed_event_results.csv
      seed_event_result_participants.csv
      seed_persons.csv
What the scripts do
07_build_mvfp_seed_full.py

Reads canonical CSV inputs from:

legacy_data/event_results/canonical_input/

and writes platform seed CSVs to:

legacy_data/event_results/seed/mvfp_full/
08_load_mvfp_seed_full_to_sqlite.py

Reads the seed CSVs from:

legacy_data/event_results/seed/mvfp_full/

and loads them into:

database/footbag.db
Basic local rebuild workflow

From the repo root:

./scripts/reset-local-db.sh
python3 legacy_data/event_results/scripts/07_build_mvfp_seed_full.py
python3 legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py
npm run build
npm start

For development:

npm run dev
Notes

The database must be initialized with ./scripts/reset-local-db.sh before running script 08.

Script 07 expects these canonical input files:

events.csv

event_disciplines.csv

event_results.csv

event_result_participants.csv

persons.csv

Script 08 loads historical person data and result participant links used by the public players and event pages.

Basic verification

After running the workflow, verify these pages:

/

/events

/events/year/1984

one event detail page

/players

one player profile page

Current purpose

This workflow makes the platform side reproducible from canonical CSV inputs.
