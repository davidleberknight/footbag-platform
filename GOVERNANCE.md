# Governance

**Maintainer:** David Leberknight ([@davidleberknight](https://github.com/davidleberknight))

This project is developed under the auspices of the
**International Footbag Players Association (IFPA)**. The maintainer has final
authority over repository decisions within the scope below, but does not have
unilateral authority to define or publish official IFPA policy.

---

## Decision categories

**Category A — Maintainer authority (no IFPA approval needed)**

Code, architecture, schema design, documentation, tooling, repo configuration,
bug fixes, PR acceptance on technical merit.

**Category B — Requires IFPA Board approval before merge**

Official rulebook or competition rules · IFPA policy statements · data definitions
affecting official rankings or eligibility · authorised use of IFPA branding ·
repository ownership transfer.

---

## Decision status

| Status | Meaning |
|---|---|
| `Draft` | Work in progress |
| `Proposed` | Ready for review |
| `Pending IFPA Board Decision` | Awaiting formal IFPA Board action |
| `IFPA Approved` | Formally approved — cite resolution or date |
| `Approved` | Maintainer-approved (Category A) |
| `Deferred` | Postponed — reason noted |

---

## Pending IFPA decision — notice block

Add to any document section awaiting IFPA approval, and label the issue or PR
`status: pending-ifpa-board`:

```
> ⚠️ **Pending IFPA Board Decision**
> This content has been proposed but has not received formal IFPA Board approval.
> Do not treat it as authoritative IFPA policy until this notice is removed.
```

Category B changes must not be merged to `main` until IFPA approval is
documented in the PR.

---

## Merge policy

| Change type | Target branch | IFPA approval |
|---|---|---|
| Category A | `main` | No |
| Category B | `drafts/[topic]` → `main` | Required before merge |

---

## Future transfer

This repository is hosted on a personal account for attribution and contribution
graph visibility. Transfer to an IFPA GitHub organisation is planned if IFPA
establishes one. Commits and contribution history are preserved through transfers.
