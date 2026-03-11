# Project Documentation

Design and specification documents for the footbag-platform modernization project.

> **AI tools:** read `[PROJECT_SUMMARY_CONCISE.md](../PROJECT_SUMMARY_CONCISE.md)` (repo root) for orientation before reading these files.

---

## Documents

### Present


| File                                                   | Purpose                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `[PROJECT_SUMMARY_V0_1.md](PROJECT_SUMMARY_V0_1.md)`   | Human-oriented big picture: goals, technology, philosophy, solution design. |
| `[DESIGN_DECISIONS_V0_1.md](DESIGN_DECISIONS_V0_1.md)` | Rationale and non-negotiable design commitments; explains trade-offs.       |
| `[DATA_MODEL_V0_1.md](DATA_MODEL_V0_1.md)`             | Canonical entities, relationships, schema conventions, storage structure.   |
| `[USER_STORIES_V0_1.md](USER_STORIES_V0_1.md)`         | Functional scope and acceptance criteria for all major features.            |
| `[DIAGRAMS_V0_1.md](DIAGRAMS_V0_1.md)`                 | Architecture and data flow diagrams for humans.                             |
| `[GLOSSARY_V0_1.md](GLOSSARY_V0_1.md)`                 | Terminology and definitions used across all project documents for humans.   |
| `[SERVICE_CATALOG_V0_1.md](SERVICE_CATALOG_V0_1.md)`   | Service contracts, business logic expectations, error semantics.            |
| `[VIEW_CATALOG_V0_1.md](VIEW_CATALOG_V0_1.md)`         | User-facing views, flows, actors, and authorization at the flow level.      |
| `[DEVOPS_GUIDE_V0_1.md](DEVOPS_GUIDE_V0_1.md)`         | Build, test, release, operate, recover, CI/CD, infrastructure procedures.   |
| `[DEV_ONBOARDING_V0_1.md](DEV_ONBOARDING_V0_1.md)`     | Step-by-step guide for setting up and running the project from scratch.     |


---

## Where to look


| Question                                                   | Read                              |
| ---------------------------------------------------------- | --------------------------------- |
| What must the system do?                                   | User Stories                      |
| Why was it designed this way?                              | Design Decisions                  |
| What entities exist and how are they related?              | Data Model + /database/schema SQL |
| What does a page/flow look like?                           | View Catalog                      |
| What does a service do and what errors can it return?      | Service Catalog                   |
| How does a route behave / what HTTP status does it return? | Service Catalog                   |
| How do I build, deploy, or recover?                        | DevOps Guide                      |
| Big picture / architecture overview?                       | Project Summary                   |
| How do I build the system from scratch as a dev?           | Dev Onboarding                    |


