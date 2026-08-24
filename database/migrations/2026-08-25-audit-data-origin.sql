-- Record whether each audit row came from real business or a rehearsal.
--
-- Production is proven before it goes live: the cutover rehearsal, the
-- payment-provider exercise and the operator bootstrap all write rows into the
-- production ledger. Without this column nothing separates them from real
-- member activity, and the table is append-only, so rows written unmarked can
-- never be corrected.
--
-- Existing rows become 'unknown' rather than 'live'. They were written before
-- the platform recorded this and cannot be shown to be real; 'unknown' renders
-- as labelled, which is the same direction every other surface takes when it
-- cannot prove a row is real money.
ALTER TABLE audit_entries ADD COLUMN data_origin TEXT NOT NULL DEFAULT 'unknown'
  CHECK (data_origin IN ('live','test','unknown'));
