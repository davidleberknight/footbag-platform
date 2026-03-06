# Legacy Event Results — 2025

Source: canonical historical footbag results dataset.

Files:

2025_events.csv
    Event-level metadata keyed by legacy_event_id.

2025_results_long.csv
    One row per participant within a placement group.

Fields:

legacy_event_id
year
discipline
placement
participant_order
participant_name
score_text

These files are intended to map into the platform database tables:

events
event_disciplines
event_result_entries
event_result_entry_participants
