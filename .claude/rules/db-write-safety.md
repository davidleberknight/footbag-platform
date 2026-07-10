---
paths:
  - "scripts/**"
  - "legacy_data/scripts/**"
  - "legacy_data/tools/**"
  - "freestyle/loaders/**"
  - "freestyle/scripts/**"
  - "freestyle/tools/**"
---

# DB write safety rules

## When to Use
- Any DB mutation
- Seed load
- Bulk update
- Identity patch

## Rules
- Always run read-only diagnostic first
- Validate preconditions
- Require explicit apply flag
- Generate audit CSV + rollback SQL
- Execute inside transaction

## Do NOT
- Write without audit trail
- Bypass service layer
- Modify DB directly without review
