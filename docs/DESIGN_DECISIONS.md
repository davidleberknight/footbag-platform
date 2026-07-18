# Footbag Website Modernization Project -- Design Decisions

**Document Purpose:**

This document captures technical decisions and rationale so that volunteers can understand why the design is the way it is, what trade-offs were made, and how future changes should be evaluated. Explains why major choices were made and which constraints are intentional. Source of Truth for design commitments from which the technical requirements follow. 

Scoping note: Numeric values in this document may represent fixed technical constants, deployment/infrastructure resource allocations and thresholds, or implementation notes. For Administrator-configurable operational, security, reminder, pricing, and retention values, normative defaults are defined in the User Stories document and loaded via configuration seeds. DD may describe parameterization, ranges, and ownership, but if a value is Administrator-configurable, DD does not define the normative default. Any numeric value in this document that conflicts with the User Stories normative defaults section is an error; User Stories wins.

Current implementation status and accepted temporary deviations are tracked in the maintainers' private tracker. This document is the long-term architecture reference only.

## Table of Contents

- [1. Architectural Foundations](#1-architectural-foundations)
  - [1.1 SQLite Database](#11-sqlite-database)
  - [1.2 Backup Strategy](#12-backup-strategy)
  - [1.3 Transaction Model](#13-transaction-model)
  - [1.4 Development Parity](#14-development-parity)
  - [1.5 Media Data in S3](#15-media-data-in-s3)
  - [1.6 Single Lightsail Instance behind CloudFront](#16-single-lightsail-instance-behind-cloudfront)
  - [1.7 Docker Containers](#17-docker-containers)
  - [1.8 Container Memory Allocation](#18-container-memory-allocation)
  - [1.9 Layered Architecture: Controllers, Services, Middleware, Adapters](#19-layered-architecture-controllers-services-middleware-adapters)
  - [1.10 Code-primary Rule Home with Markdown Overview](#110-code-primary-rule-home-with-markdown-overview)
  - [1.11 Configuration Model](#111-configuration-model)
  - [1.12 Internal-only Subtrees](#112-internal-only-subtrees)
  - [1.13 Curator Content Source of Truth](#113-curator-content-source-of-truth)
  - [1.14 Test-data Harness](#114-test-data-harness)
  - [1.15 Convention and Invariant Gates](#115-convention-and-invariant-gates)
  - [1.16 Multi-repository Structure and Companion-checkout Convention](#116-multi-repository-structure-and-companion-checkout-convention)
- [2. Data Model](#2-data-model)
  - [2.1 Schema and Versioning](#21-schema-and-versioning)
  - [2.2 Data Access Pattern](#22-data-access-pattern)
  - [2.3 Soft Deletes](#23-soft-deletes)
    - [Retention policy](#retention-policy)
  - [2.4 Member, Legacy Member, and Historical Person Entity Types](#24-member-legacy-member-and-historical-person-entity-types)
  - [2.5 Immutable Audit Logs with Privacy-safe Fields](#25-immutable-audit-logs-with-privacy-safe-fields)
  - [2.6 Hashtags and Media](#26-hashtags-and-media)
  - [2.7 Encryption at Rest](#27-encryption-at-rest)
  - [2.8 System Member Account](#28-system-member-account)
- [3. Security, Authentication, and Sessions](#3-security-authentication-and-sessions)
  - [3.1 Password Hashing](#31-password-hashing)
  - [3.2 JWT sessions](#32-jwt-sessions)
  - [3.3 CSRF Protection via SameSite Cookies and Origin Pinning](#33-csrf-protection-via-samesite-cookies-and-origin-pinning)
  - [3.4 JWT Token Lifecycle and Configuration](#34-jwt-token-lifecycle-and-configuration)
  - [3.5 JWT Signing with AWS KMS Asymmetric Keys](#35-jwt-signing-with-aws-kms-asymmetric-keys)
  - [3.6 Secrets Management via AWS Parameter Store](#36-secrets-management-via-aws-parameter-store)
  - [3.7 Ballot Encryption with AWS KMS](#37-ballot-encryption-with-aws-kms)
  - [3.8 Account Security Tokens](#38-account-security-tokens)
  - [3.9 Security, Privacy, and Historical Record Governance](#39-security-privacy-and-historical-record-governance)
  - [3.10 Trust-proxy strategy](#310-trust-proxy-strategy)
  - [3.11 Origin-verify shared-secret gate](#311-origin-verify-shared-secret-gate)
  - [3.12 Security header layering](#312-security-header-layering)
  - [3.13 Host header pinning at nginx](#313-host-header-pinning-at-nginx)
  - [3.14 Input Validation Strategy](#314-input-validation-strategy)
  - [3.15 Text Sanitization Pipeline](#315-text-sanitization-pipeline)
  - [3.16 Display Name Homograph Protection](#316-display-name-homograph-protection)
  - [3.17 External URL Validation](#317-external-url-validation)
- [4. Front-End / UI Technology](#4-front-end--ui-technology)
  - [4.1 Server-rendered HTML with Handlebars Templates](#41-server-rendered-html-with-handlebars-templates)
  - [4.2 JavaScript Required for Interactivity](#42-javascript-required-for-interactivity)
  - [4.3 Explicit UI Restrictions](#43-explicit-ui-restrictions)
  - [4.4 Accessible, Responsive HTML-first Design](#44-accessible-responsive-html-first-design)
  - [4.5 Front-end TypeScript for Interactivity](#45-front-end-typescript-for-interactivity)
  - [4.6 One Type System with Body-font Notation](#46-one-type-system-with-body-font-notation)
  - [4.7 Canonical Responsive Breakpoints](#47-canonical-responsive-breakpoints)
  - [4.8 Stylesheet Convention Gates](#48-stylesheet-convention-gates)
  - [4.9 One Public Rendering Standard](#49-one-public-rendering-standard)
  - [4.10 Search-engine and Crawler Readiness](#410-search-engine-and-crawler-readiness)
  - [4.11 Static-Asset Fingerprinting](#411-static-asset-fingerprinting)
- [5. Back-End Services and Patterns](#5-back-end-services-and-patterns)
  - [5.1 Node.js with TypeScript](#51-nodejs-with-typescript)
  - [5.2 Express-based HTTP Controllers](#52-express-based-http-controllers)
  - [5.3 Dedicated Adapters for External Services](#53-dedicated-adapters-for-external-services)
  - [5.4 Outbox Pattern for Emails](#54-outbox-pattern-for-emails)
  - [5.5 Canonical Email Addresses](#55-canonical-email-addresses)
  - [5.6 Dev and Staging Email Preview](#56-dev-and-staging-email-preview)
  - [5.7 Adapter contract parity for security-sensitive paths](#57-adapter-contract-parity-for-security-sensitive-paths)
- [6. External Services and Integrations](#6-external-services-and-integrations)
  - [6.1 Stripe Payments](#61-stripe-payments)
  - [6.2 CloudFront CDN](#62-cloudfront-cdn)
  - [6.3 CloudFront Error Pages](#63-cloudfront-error-pages)
  - [6.4 Legacy Archive (old footbag.org)](#64-legacy-archive-old-footbagorg)
  - [6.5 Legacy Data Migration](#65-legacy-data-migration)
  - [6.5a Sealed Legacy Email Archive](#65a-sealed-legacy-email-archive)
  - [6.6 AWS Service Integration](#66-aws-service-integration)
  - [6.7 Static Assets and CDN Strategy](#67-static-assets-and-cdn-strategy)
  - [6.8 Image Processing](#68-image-processing)
  - [6.9 Voting](#69-voting)
  - [6.10 Stripe webhook signing secret environment scope](#610-stripe-webhook-signing-secret-environment-scope)
- [7. DevOps](#7-devops)
  - [7.1 Dev/Prod Parity](#71-devprod-parity)
  - [7.2 AWS Lightsail and Credentials](#72-aws-lightsail-and-credentials)
  - [7.3 Docker](#73-docker)
  - [7.4 GitHub](#74-github)
  - [7.5 Local Development](#75-local-development)
  - [7.6 Health Endpoints](#76-health-endpoints)
  - [7.7 Environment Naming Convention](#77-environment-naming-convention)
- [8. Logging, Monitoring & Abuse Prevention](#8-logging-monitoring--abuse-prevention)
  - [8.1 Structured Logging](#81-structured-logging)
  - [8.2 Monitoring and Alerting](#82-monitoring-and-alerting)
  - [8.3 Rate Limiting and Abuse Prevention](#83-rate-limiting-and-abuse-prevention)
  - [8.4 Content Moderation Policy](#84-content-moderation-policy)
- [9. Performance, Cost and Scalability](#9-performance-cost-and-scalability)
  - [9.1 Performance Target Architecture](#91-performance-target-architecture)
  - [9.2 Cost Constraints](#92-cost-constraints)
  - [9.3 Scalability](#93-scalability)
  - [9.4 Backup and Recovery](#94-backup-and-recovery)
  - [9.5 Failure Modes](#95-failure-modes)
  - [9.6 Infrastructure as Code](#96-infrastructure-as-code)
  - [9.7 High Availability and Recovery](#97-high-availability-and-recovery)
  - [9.8 Monitoring and Alerting](#98-monitoring-and-alerting)

# 1. Architectural Foundations

## 1.1 SQLite Database

All application state (except media objects) are stored in a single SQLite database file (footbag.db). All data access occurs through single database module (db.ts) that exports database connection, prepared SQL statements, and transaction helper. Services call prepared statements directly with parameters (see below for the Data Access Pattern). All statements prepared once at startup for maximum performance. Unless explicitly noted for integrity or tamper-resistance reasons, the database enforces structural integrity while application services enforce workflow and business rules, the goal being to keep the database as simple as possible.

Configuration: the platform uses only 5 startup configuration PRAGMAs. Operational PRAGMAs like wal_checkpoint (used during backups) are executed at runtime and are separate from these 5 startup settings:

- journal_mode=WAL: Write-Ahead Logging for concurrent reads during writes.

- foreign_keys=ON: Enforces referential integrity (prevents orphaned records).

- busy_timeout=5000: Wait 5 seconds when database is locked before timing out.

- synchronous=NORMAL: Safe with WAL mode, provides faster writes.

- cache_size=-64000: Allocates 64MB memory for faster reads.

**Rationale:**

Query Performance: SQL with indexes provides sub-100ms queries vs O(n) file scans. Indexes added reactively when queries exceed 500ms.

Transaction Safety: ACID guarantees replace complex optimistic locking. SQLite serializes transactions automatically.

Data Integrity: Foreign key constraints (ON DELETE NO ACTION) enforced by database. Member grace-period deletion via views prevents accidental exposure of deleted member records.

Simplicity: Single file, 5 PRAGMAs, no cluster, no Litestream sidecar, zero service fees. Inspectable with sqlite3 CLI. One dependency (better-sqlite3).

Operational Simplicity: No database server, no connection pooling, no replication lag. Backup is file upload. Recovery is download + restart (RTO ~5 minutes). Migrations require maintenance window (acceptable for community site).

Cost: \$2/month S3 storage. No RDS, no per-connection charges, no IOPS fees.

Prepared Statement Performance: Statements compiled once at startup eliminates repeated SQL parsing overhead. Official SQLite-recommended pattern. better-sqlite3 auto-resets statements after execution for immediate reuse.

Single Module Organization: All queries visible in one file. Easy to grep for "WHERE email". Descriptive names enable IDE autocomplete. Manageable for small volunteer team. Repository classes would add value at 500+ queries with large team, but add unnecessary complexity here.

**Trade-offs:**

Single-Writer: One write transaction at a time. Acceptable because expected write volume is low for the community site, read-heavy pages can be served efficiently via caching, and WAL allows unlimited concurrent reads.

SQL Knowledge Required: Volunteers need basic SQL for queries and migrations. Acceptable trade-off for performance and integrity. sqlite3 CLI widely known.

Migrations Require Maintenance: Brief downtime acceptable for community site. Backward-compatible migrations preferred.

Local Database Unencrypted: SQLite file on the instance is unencrypted at rest (S3 backups are encrypted). This is an explicit MVP trade-off for non-regulated data. Mitigations: restrict instance access (SSH/IAM), keep the instance private where feasible, apply OS security updates, limit who can access backups, and rely on encrypted backups and short backup retention.

No Encapsulation: Services access prepared statements directly. Code review catches violations. Acceptable for small volunteer team, risky for large team.

Synchronous Transactions Only: Cannot span async operations. Services must batch database work, commit, then do async. better-sqlite3 design constraint but also best practice for minimizing lock contention.

**Impact:**

Database Module: Single db.ts exports connection with PRAGMAs, prepared statements grouped by domain (members, events, registrations, etc.), transaction helper. Statements ordered: reads, writes, counts. Complex queries include inline SQL comments.

Service Layer: Import db module, call queries.memberByEmail.get(email), wrap multi-step operations in transaction(() =\> {...}). Catch specific error codes, throw meaningful business errors. Never call db.prepare() or write inline SQL.

Schema Design: refer to Data_Model md file.

Minimum Indexes (added when query \>500ms): members(login_email_normalized), members(display_name), events(start_date), events(hashtag), audit_entries(occurred_at), media(member_id), registrations(event_id, member_id).

Monitoring: Query latency P95, slow query log (\>500ms), transaction duration (alert if P95 \>10s), backup success rate and age (alert if \>15 min), database size (alert at 80%), WAL size (alert if \>1GB), checkpoint latency (alert if \>5s), SQLITE_BUSY frequency (alert if \>5%).

Health Endpoints: `/health/live` is a process check. `/health/ready` validates the dependencies required to serve traffic: SQLite connectivity and container memory pressure (§7.6). Broader readiness coverage (backup freshness, dependency fan-out) remains later-phase operational design.

Recovery: Download the selected S3 snapshot, run `PRAGMA integrity_check`, replace the live file, restart services, and verify health plus smoke checks. Target RTO remains approximately five minutes for the common restore case.

Initial schema bootstrap for first public launch comes directly from `schema.sql`. A numbered migration chain is deferred until after the first stable deployed baseline (no migrations in scope).

**Follow-on Decisions:**

Schema Design: Data Model document for design standards, and the schema sql code for exact detail.

Complete Statement Catalog: All prepared statements with SQL, parameters, return types (src/db/db.ts)

S3 Backup Configuration: Retry policy, alert thresholds, recovery drill schedule (DEVOPS_GUIDE.md (private GitHub repo))

Migration Procedures: SQL conventions, maintenance mode, rollback strategies (DEVOPS_GUIDE.md (private GitHub repo))

Transaction Boundaries: Which operations require transactions, timeout policies, and temporary-unavailable / busy-handling boundaries (`.claude/rules/db-layer.md` and per-service JSDoc)

Query Performance: Index selection criteria, profiling procedures, optimization triggers (Data Model and DEVOPS_GUIDE.md (private GitHub repo))

Testing Patterns: Test database setup, state isolation, mock strategies (Developer Onboarding document)

**Alternatives Considered:**

JSON Files: Rejected for O(n) query performance, no ACID transactions, no referential integrity, bespoke code instead of using a standard approach.

SQLite + Litestream: Rejected for sidecar complexity, operational overhead. 60-second RPO acceptable for community site.

PostgreSQL on RDS: Rejected for monthly cost, connection management complexity, network latency, DBA knowledge requirement, overkill for community scale.

## 1.2 Backup Strategy

A host systemd timer runs the backup script every five minutes: (1) PRAGMA wal_checkpoint(TRUNCATE) commits WAL to the main file, (2) the SQLite backup API creates a consistent snapshot, (3) upload to S3 with retry (3 attempts, exponential backoff), (4) refresh the health timestamp and emit the backup-age and consecutive-failure metrics that drive the staleness and repeated-failure alarms. S3 versioning provides 30-day point-in-time recovery. The backup runs as a host-side script rather than inside the application process so it operates on a quiescent file and is decoupled from container lifecycle.

Transaction timeout: All transactions must complete within 30 seconds, enforced by application code. Code in db.ts wraps transaction execution and throws an error if the timeout is exceeded (defaults to 30000 ms). When timeout occurs, the wrapper executes ROLLBACK explicitly before throwing, ensuring the transaction releases locks immediately. This prevents indefinite database locks and ensures graceful failure for long-running operations.

Container shutdown (SIGTERM): Stop accepting new requests, wait up to 30 seconds for all in-flight transactions to complete (same timeout value for consistency). Any transaction still running after 30 seconds is aborted. Then checkpoint WAL, close connection, perform final S3 backup upload, and exit gracefully.

Requirements:

- A host systemd backup timer writes the SQLite snapshot to the primary backup bucket on the documented cadence (default five minutes, per the backup-script description above). A dead timer or a failing upload stops the backup-age metric from refreshing, so the staleness alarm breaches and a silent backup gap cannot accrue.
- The off-account DR replica bucket has S3 Object Lock enabled in GOVERNANCE mode for the configured retention window, so a compromised production credential cannot delete or overwrite snapshots in the disaster-recovery target.
- Retention windows are documented per artifact class (hot snapshot, DR replica, log archive). Each class has a single source of truth in DEVOPS_GUIDE.md (private GitHub repo) and matching S3 lifecycle rules; the lifecycle rules and the documented retention table cannot drift.
- The interaction between erasure (GDPR Article 17) and backup is documented: an erased record's identifier is recorded in an erasure log, and any restore from backup re-applies the erasure log before the restored data is reachable, so erasure cannot be silently undone by routine recovery.

## 1.3 Transaction Model

ACID transactions provide the platform's core write-safety guarantees, but the application still needs explicit handling for temporary contention. SQLite serializes conflicting writers through the configured busy_timeout, yet under load the app can still receive SQLITE_BUSY or SQLITE_BUSY_TIMEOUT. The platform therefore uses BEGIN IMMEDIATE to acquire the write lock early, keeps write transactions short, and applies bounded retries only for idempotent operations when a busy condition occurs. The application also enforces a 30-second transaction timeout. Transactions must remain fully synchronous: all database work finishes before commit, and any async follow-up work such as email or S3 runs only after the transaction completes.

In this project, better-sqlite3 together with SQLite's configured busy timeout is the primary contention-management mechanism. Application code should not add a second general-purpose retry loop by default. Instead, service-layer database helpers should translate busy or locked database failures into a clear temporary-unavailable service error so controllers can render the standard safe failure path.

The version column on mutable tables supports optimistic lost-update detection for human-facing edit flows. When a submitted form includes a stale version, the update can be rejected so the user reloads and reviews intervening changes. This is a user-experience safeguard, not the platform's primary write-safety mechanism. The version column is intentionally not used on append-only, ledger, junction, or reference tables because those tables are not updated.

## 1.4 Development Parity

Local development and deployed environments use the same application code, the same fixed SQLite runtime filename (`footbag.db`), the same prepared statements, and the same Dockerized process boundaries. Docker/Compose mounts the host directory that contains the DB into the application working directory at `/app/db`, so the WAL and SHM sidecar files live on the host alongside the main DB file and are shared across the web and worker containers. Backup jobs may be disabled locally, but backup behavior is validated in staging and production.

## 1.5 Media Data in S3

Decision:

Media is stored separately from the SQLite database. The database stores media metadata (gallery name, paths, captions, tags, ownership) in a `media_items` table. Media objects (photo thumbnail and display variants; system-account video bytes and posters per §2.8) are stored in Amazon S3 (production/staging) or local filesystem (development). The media storage adapter provides environment abstraction.

Rationale:

Media data is handled separately from application data, in a dedicated AWS S3 bucket (instead of the SQLite database hosted on the main AWS Lightsail container). Media data is large and will grow over time, and storing it co-located with Lightsail would blow out the host size and therefore the cost; this is why we store media data in S3. Each uploaded photo generates two variants (thumbnail at 300×300 pixels, display at 800px width) stored as JPEG at 85% quality on S3 (also processed to eliminate possible malware). System-account video bytes are stored as-is with no server-side transcoding (see §6.8 for the curator-video pipeline) alongside a Sharp-processed poster image. Original photo files are discarded after processing.

Separates structured metadata (benefits from SQL queries, transactions, referential integrity) from large binary objects (benefits from object storage scalability, CDN delivery, independent backup/replication). SQLite handles relational data well but is not optimized for large binary storage. S3 provides dedicated photo infrastructure (replication, lifecycle policies, CDN integration) without database bloat. Development filesystem maintains parity without AWS credentials.

Paths are stored as data, not calculated at runtime based on the member id and gallery name used at the time of upload.

CloudFront serves media directly from the primary bucket via the `/media-store/*` cache behavior on the single site distribution. The `/media-store/` URL prefix is dedicated to binary storage and is disjoint from the `/media` user-facing app section so app routes and storage URLs do not share a namespace. The cache-bust mechanism is URL-versioned via a `?v={media_id}` query string (a fresh UUID per upload), and the cache key includes the query string. S3 PUT sets `Cache-Control: public, max-age=31536000, immutable`. Media objects are immutable from any cache's point of view because each emitted URL is unique to its upload; the URL is the cache identity, the S3 key is the storage location, decoupled.

Scope: member-uploaded photo objects and system-account-owned media (photo + video) are stored in S3. Member video remains embed-only (YouTube/Vimeo per `M_Submit_Video`); only the system member account uploads video bytes (see §2.8 and `A_Upload_Curated_Media`). The legacy mirror at archive.footbag.org is a separate static bucket per §6.4. Pre-loaded system-account content (landing-page demo loops, page illustrations and cartoon images, well-known event photos, and similar curator items used across the platform) is written by an operator-run seeding mechanism that uses the same media storage adapter as interactive uploads. The same mechanism extends to tutorials, historical content, and any future curator categories without additional schema or render-path work. Operational specifics in DEVOPS_GUIDE.md (private GitHub repo).

Local filesystem mounted as Docker volume mirrors production S3 directory structure exactly. The media storage adapter reads identical database paths and constructs local URLs. No AWS credentials required for basic media operations in development. Path literals deferred alongside the adapter and env-var rename.

Backup and Replication:

Photos are backed up separately from database via S3 cross-region replication. The primary media bucket (us-east-1) replicates automatically to a dedicated media disaster-recovery bucket (us-west-2) using One Zone-IA storage class. Delete markers are replicated so account-erasure deletions propagate. Replication is continuous; per-object propagation typically completes within minutes. S3 Replication Time Control (RTC) is not enabled, so there is no formal RPO SLA. No backup job required; S3 native cross-region replication handles this automatically. Bucket names follow the `<env>-media` (primary) and `<env>-media-dr` (DR) Terraform convention; the SQLite-snapshot DR bucket is a separate `<env>-dr` resource.

Deletion and Retention: No referential integrity concerns from media deletion because media items are leaf nodes in the data model. When a member deletes their account, their media is automatically hard-deleted. System-account-owned media is not affected by member-erasure (see §2.8).

Access Control:

The media bucket is private. Viewer reads flow exclusively through CloudFront with Origin Access Control (OAC); the bucket policy grants `s3:GetObject` to the `cloudfront.amazonaws.com` service principal with an `aws:SourceArn` condition matching the distribution ARN, and grants nothing else. `s3:ListBucket` is intentionally omitted: with only `GetObject`, S3 returns 403 AccessDenied for both existing-but-forbidden and missing keys when the requester lacks permission, which prevents enumeration of bucket contents.

The application container's IAM grants `s3:PutObject`, `s3:DeleteObject`, `s3:GetObject` on objects, plus `s3:ListBucket` on the bucket. `GetObject` is granted because S3's HeadObject is authorized by `s3:GetObject` per IAM; the application uses HeadObject for existence checks only and never reads object bytes through the SDK. Viewer reads always flow CloudFront → OAC → bucket.

CloudFront OAC is configured with `signing_behavior = always`, which overrides any viewer-supplied `Authorization` header. OAC does not override the `Host` header; for an S3 origin, the cache behavior must omit `origin_request_policy_id` (or use a policy that excludes `Host`) so CloudFront sets `Host` to the S3 origin domain itself. With the wrong `Host`, S3 cannot identify the bucket via virtual-host routing and returns generic `NotFound` before any bucket policy is evaluated. This applies to every cache behavior targeting an S3 origin, not only `/media-store/*`.

Trade-offs:

- Members cannot download original high-resolution photos. (Curator-uploaded video bytes are stored as-is and remain re-downloadable, but the system account is the only uploader of video bytes.)

- S3 dependency in production (mitigated by cross-region backup).

- Slightly more complex deployment than all-in-database (acceptable for storage cost savings and scalability).

- No soft delete for photo data.

Impact:

- The media storage adapter interface defines: `put(key, data)`, `delete(key)`, `constructURL(key)`, `exists(key)`. Content-agnostic; used for photos, system-account video bytes, and posters identically.

- Backup procedures updated to cover media separately from database.

- CloudFront `/media-store/*` cache behavior uses OAC with no origin request policy. Operations in DEVOPS_GUIDE.md (private GitHub repo).

Alternative Considered:

- Storing photos in SQLite as BLOBs: Rejected due to database bloat and therefore Lightsail cost, as the database file is co-hosted.

## 1.6 Single Lightsail Instance behind CloudFront

Decision:

Production runs on a single modest AWS Lightsail instance hosting Docker containers (web app, workers, utilities), fronted by CloudFront for caching and TLS termination.

Rationale:

- Fits the cost ceiling and community-scale traffic profile.

- Greatly simplifies operations for volunteers: no multi-node clusters, no Kubernetes, no autoscaling groups, instead we use common and standard tech.

- CloudFront handles global delivery and offloads read traffic from Lightsail and S3.

- This design is the simplest and cheapest option that meets requirements.

Trade-offs:

- No automatic horizontal scaling; if the Lightsail instance fails, the site is down until restored (no automated failover).

- Capacity planning is capacity of a single instance (plus CloudFront), not a large cluster.

- Session Manager via Systems Manager Hybrid Activations was evaluated for operator shell access and rejected. The advanced-instances tier required for Session Manager on non-EC2 nodes costs approximately $5/month per Lightsail instance, and the SSM Agent installation, Hybrid Activations, and IAM/Terraform resources are disproportionate to a single-host volunteer-maintained deployment.

Impact:

- CI/CD and deployment scripts are written around "build a Docker image, deploy to one Lightsail host."

- CloudFront origin configuration points to this instance for dynamic content and static assets, and to S3 buckets for media and archive content.

- Production uses 4GB Lightsail instance with 2 vCPUs, 80GB SSD, 4TB transfer allowance. This will provide adequate headroom for container allocations: 4GB provides sufficient memory for four Docker containers.

- Operator shell access uses hardened per-operator SSH to named non-root host accounts. Ingress to ports 22 and 2222 is Terraform-managed via `operator_cidrs`. Runtime AWS API access uses an assumed-role chain that is independent of operator shell credentials. The two paths never share credentials.

## 1.7 Docker Containers

Decision:

Application containers are stateless and immutable (except for the database file). All other durable state lives in S3 or AWS-managed services (Parameter Store, SES, Stripe, etc.). The Lightsail instance is treated as replaceable, except for the database file. The primary durable state is the SQLite database file on the Lightsail volume. S3 stores media objects and database snapshot backups (cross-region). The instance is recoverable by restoring SQLite from S3 snapshots.

Rationale:

- Enables simple, robust recovery: destroy and recreate containers (or the entire instance) without worrying about local state.

- Makes dev and prod more similar: containers behave the same across environments.

- Avoids "snowflake" servers with manual tweaks.

Requirements:

- Runtime container images declare a non-root `USER` and the entrypoint runs as that user. Root inside the container is reserved for build-time package installation only.
- Each image build uses a `.dockerignore` that excludes `.git/`, secret files, local env files, and dev-only tooling so build context cannot leak credentials or repo metadata into image layers.
- Compose runs containers with `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]`. Capabilities are re-added explicitly only where a runtime requirement justifies them, and the justification is captured next to the compose entry.
- Base images are pinned by SHA256 digest, not by floating tag, so a hijacked upstream tag cannot replace the base layer between rebuilds.
- Native dependencies (e.g. `better-sqlite3`) are prebuilt during the build stage; runtime images do not include `python3`, `make`, or `g++`. The runtime image carries only what the running process needs.
- Every long-running container image declares a `HEALTHCHECK` so orchestration can detect a hung process without relying on TCP-level signals alone.

Trade-offs:

- No caching on local disks across restarts; everything persistent goes through adapters.

- Some performance advantages of local caching are not used.

Impact:

- All writes go through adapters to the database, S3, or external services. No code must assume persistent local files beyond temporary scratch space (or SQLite).

- Infrastructure runbooks treat instance rebuilds as routine, not emergencies.

## 1.8 Container Memory Allocation

Decision:

Container memory limits: Docker memory limits are explicitly set for each container preventing unbounded memory consumption. Authoritative allocation values are defined and implemented in docker-compose.yml. The following are deployment sizing estimates subject to tuning based on observed production usage.

Initial Allocations (Subject to Adjustment):

- nginx: 128MB - Reverse proxy, minimal footprint

- web: 512MB - Node.js app, concurrent request handling, database

- worker: 384MB - Background jobs, sequential processing

- image: 896MB - Sharp library, image processing buffers

- Total: 1,920MB (47 percent of 4GB instance)

These numeric allocations are deployment-time container resource sizing values for the AWS/Lightsail runtime and are implemented in runtime configuration (for example docker-compose.yml). They are not Administrator-configurable application parameters. The numbers provided in this document are all deployment sizing estimates and may be tuned in runtime configuration based on observed usage.

Rationale:

- **nginx** minimal allocation: handles origin HTTPS termination (CloudFront to origin) and reverse proxying; viewer TLS terminates at CloudFront. Reverse proxy performs simple request routing, and static file serving. Minimal memory footprint. 128MB provides adequate headroom for nginx process (approximately 50MB) plus connection buffers. 

- **web** needs concurrency headroom: Node.js/Express application handles business logic and concurrent HTTP requests. 512MB accommodates runtime (approximately 50MB), dependencies (approximately 80MB), application code (approximately 30MB), and 20-30 concurrent requests (approximately 100MB) with approximately 200MB headroom for spikes. SQLite database file is small initially and grows slowly, so it adds little to the memory envelope.

- **worker** is smaller due to asynchronous processing: Background jobs process sequentially or with limited concurrency. Email sending, nightly backups, do not require high memory. 384MB sufficient for runtime and job processing. 

- **image** is largest due to Sharp library: Image processing library loads entire image into memory, performs transformations, and outputs new format. Sharp decodes the entire source image into an uncompressed raster before resizing. Uploads are capped at 25MB and PNG is accepted (PNG has no shrink-on-load, so a large PNG decodes in full), and each upload generates its thumbnail and display variants as two parallel Sharp pipelines, so one upload holds two simultaneous decodes. The production host runs two uploads concurrently, so up to four decodes can be in flight; 896MB provides the safety margin, and smaller hosts scale the memory limit and the concurrency cap down together. 

Trade-offs:

- Fixed allocations may not match actual usage: Initial estimates based on typical workload patterns, not load testing. Production monitoring required to validate and adjust allocations.

- Over-allocation risk: If containers use significantly less than allocated memory, instance is under-utilized. Acceptable for operational stability.

- Under-allocation risk: If containers exceed limits, Docker kills process (OOM).

- Requires careful monitoring and adjustment during early production operation.

- No dyamic allocation: Manual configuration updates required.

Impact:

- docker-compose.yml specifies memory limits for each container using mem_limit directive.

- Container will be killed (OOM) if exceeds allocated memory. Health checks and restart policies ensure container restarts automatically.

- CloudWatch agent monitors container-level memory usage via docker stats API.

- Alerts configured: Warning at 80 percent container memory, critical at 90 percent.

- Regular review of container memory utilization during first 6 months post-launch to validate allocations and adjust if needed.

## 1.9 Layered Architecture: Controllers, Services, Middleware, Adapters

Decision:

The platform uses a four-layer separation. Each layer has a specific responsibility. A function's signature, imports, and file location follow the layer it belongs to, not its semantic association with other code. Controllers call business services directly and return HTML (for browser requests) or JSON (for webhooks/AJAX). There is no separate REST API layer between HTML controllers and services. Only webhook callbacks use REST. All high-stakes write-path business services carry a file-header JSDoc documenting their contract (ownership, required patterns, invariants, persistence, side-effects).

Layers:

1. Services (`src/services/`); pure domain logic.

   - Functions take domain arguments (ids, strings, DTOs) and return domain values. No `Request`/`Response`/`NextFunction` parameters.
   - Never read cookies or headers. Never set cookies, redirect, or emit status codes.
   - Own business rules, validation, authorization checks, and page-model shaping.
   - One service file per domain, named `src/services/<domain>Service.ts`.

2. Middleware (`src/middleware/`); Express cross-cutting handlers.

   - Signature: `(req, res, next) => void` or `(err, req, res, next) => void`.
   - Apply across multiple routes: authentication, logging, CSRF checks, origin pinning, error handling.
   - May co-locate HTTP-layer constants they own (cookie names, cookie maxAge) because those are HTTP concerns.

3. Controllers (`src/controllers/`); per-route HTTP glue.

   - Parse `req.body`/`req.params`/`req.query`, orchestrate service calls, decide response type.
   - Own `res.cookie(...)`, `res.redirect(...)`, `res.render(...)`, `res.status(...)` calls.
   - Thin: controllers do not own business rules, route-domain interpretation, or page-model shaping beyond trivial glue logic. When a page varies by authentication state or viewer role, the controller passes viewer context to the service and the service returns the appropriately shaped response. Controllers must not mutate service-returned view models based on auth state.
   - One controller file per domain, named `src/controllers/<domain>Controller.ts`.

4. Adapters (`src/adapters/`); external-service implementations behind typed interfaces.

   - Encapsulate SDK calls (AWS, Stripe, etc.) so services never import `@aws-sdk/*` or similar directly.
   - Paired structure: one interface plus one or more implementations selected by configuration.
   - Naming convention: `<Backend><Purpose>Adapter` for implementations; `<Purpose>Adapter` for interfaces.
   - File organization: one file per adapter at `src/adapters/<purpose>Adapter.ts`, containing the interface, all implementations (as factory functions, not classes), and a synchronous singleton getter `get<Purpose>Adapter()` that selects the configured implementation. Services import the getter and the interface from this single file; controllers do not. A service that depends on an adapter exposes either (a) a factory function in the service module that resolves the adapter at construction time, or (b) a module-level singleton service. Controllers receive the constructed service and never call `get*Adapter()` themselves. This keeps adapter-selection knowledge inside the service layer where dev/prod parity is enforced.
   - Test hook: each adapter file also exports `reset<Purpose>AdapterForTests()` which clears the singleton so test suites can exercise fresh wiring per file.

Why this separation matters:

- Dev/prod parity. Adapter interfaces are the single swap point between dev and production behavior. The same interface is used by services in both environments, so service code is identical across environments and tests exercise the same path production runs. When adapter implementations are defined inline inside service files, this boundary erodes: services start importing SDK types directly, the adapter seam becomes harder to enforce as new services arrive, and dev/prod parity stops being a structural guarantee.

- Long-term clean code. Clear layer boundaries make it obvious where new code belongs. A new pure helper goes in services. A new Express middleware goes in middleware. A new external-service integration goes behind an adapter interface. Contributors do not have to guess.

- Testability. Services are pure: no HTTP mocking required. Middleware is narrow: tests inject `(req, res, next)` mocks. Controllers are thin and delegate, so integration tests exercise them end-to-end. Adapters are swapped for deterministic stubs in dev and test.

Anti-patterns:

- Placing a pure helper inside `src/middleware/` because it relates conceptually to middleware (e.g., a JWT-minting helper next to the JWT-validating middleware). A function's layer is determined by its signature, not by its semantic neighborhood. Pure functions belong in `src/services/`.

- Defining adapter implementations inline inside a service file. Adapters belong in `src/adapters/`; services import the typed interface.

- Reading `req`/`res` inside a service. Services receive their dependencies as arguments from controllers.

- Reading `process.env` inside a service or any `src/` module outside `src/config/env.ts`. See §1.11 Configuration Model.

- Mixing HTTP constants (cookie names, cookie maxAge) into service files. HTTP constants belong in the HTTP layer (controllers or middleware).

Rate-limit positioning:

Rate limiting in this codebase is an in-memory bucket service (`src/services/rateLimitService.ts`), not a middleware. State-changing service methods call `rateLimitHit(key)` and throw `RateLimitedError` when the bucket is exhausted; controllers map that error to HTTP 429. Rate-limit keys are often request-shape-derived (per-account, per-target-row, per-IP, per-session); controllers pass those key inputs into the service, and enforcement lives with the action being limited. A per-route blanket middleware rate limiter is not used.

Rationale:

- Services contain all business logic and route/domain interpretation.
- Thin controllers reduce drift, simplify testing, and keep request handling predictable.
- Adapter boundaries enable dev/prod parity, SDK evolution, and per-environment testing.
- Named middleware prevents per-route auth/logging/rate-limit drift.
- A single request path through the system reduces cognitive load and better fits the project's service structure.

Trade-offs:

- No public REST API (except for required webhook callbacks).
- Requires discipline to prevent convenience logic from creeping across layer boundaries.

Impact:

- Single controller per domain entity or public section (Member, Event, Club, HoF, Home, ...).
- Services remain pure domain logic with no HTTP knowledge (no request/response objects in service signatures).
- Controllers return HTML pages (via `res.render()` or `res.redirect()`) for browser navigation, JSON for webhooks/callbacks.
- Controllers should not become the place where page contracts are assembled.
- Adapters live in `src/adapters/` and are selected by configuration at service instantiation time.
- JavaScript validation runs client-side; forms submit via traditional POST with full-page navigation.

## 1.10 Code-primary Rule Home with Markdown Overview

Decision:
Rules for page rendering and service ownership live at their strongest enforcement site. Page-rendering rules with no mechanical anchor live in the path-scoped view-layer rule and in each page service's file-header JSDoc; cross-cutting view design intent lives in §4.

Rule home precedence:

1. Mechanical enforcement (drift-impossible): TypeScript types in `src/types/` and `src/services/serviceErrors.ts`; DB triggers, CHECK constraints, and named UNIQUE indexes in `database/schema.sql`; CI convention gates in `scripts/ci/assert_conventions.sh`; test factories with coverage thresholds; PreToolUse hooks in `.claude/hooks/`.
2. Code-adjacent rule docs: file-header JSDoc on every high-stakes write-path service (Owns / Does not own / Required patterns / Persistence / Side effects / Service shape) and on every public-page service (audience, rendering contract, and sensitive-page invariants for the routes it serves), updated in the same change as the code; path-scoped `.claude/rules/*.md` files auto-attached to Claude when working in matching paths (including `view-layer.md` for view and stylesheet work); per-subtree `CLAUDE.md` files.
3. DESIGN_DECISIONS.md: design intent and cross-cutting invariants with no code anchor (anti-enumeration, member-vs-historical-person distinction, audit append-only, this decision).
4. Distributed public-rendering homes (no standalone catalog): the cross-cutting view standard (page contract, reusable primitives, CSS-vocabulary structure, visual standard) in path-scoped `.claude/rules/view-layer.md`; each page's rendering contract, audience, and sensitive-page invariants in the owning service's file-header JSDoc; the route list in `src/routes/publicRoutes.ts`; durable view design intent in DESIGN_DECISIONS.md §4; non-negotiable privacy invariants in DATA_GOVERNANCE.md and `database/schema.sql` triggers.

Controllers remain thin HTTP adapters. Templates remain logic-light rendering surfaces. Page shaping, route-domain interpretation, and page-specific read-model assembly belong in services or page-model builders owned by the service layer. Home is the one intentional composition-page exception to the generic public page contract.

When a service contract changes, the service file's JSDoc updates in the same change. The path-scoped rule file updates only if the change touches a cross-cutting rule. Any new public surface is admitted by adding it to the appropriate rule home in the same change.

Rationale:
- Rules co-located with the code they describe drift less; one-file edits are more disciplined than two-file edits.
- Path-scoped rule files auto-attach in the AI context only when working in matching paths, reducing token cost compared to always-loaded catalogs.
- Long-form markdown catalogs preserve human-readable audit value at higher abstraction levels.
- Mechanical enforcement catches drift that prose rules cannot enforce.

Trade-offs:
- Per-service rules live at the source file in each service's file-header JSDoc; a reader assembles the cross-service picture from the individual service files.
- Multiple rule homes require contributors to know where each kind of rule lives. The precedence above is explicit.

Impact:
- New mechanical rules go into `scripts/ci/assert_conventions.sh` as grep gates.
- Per-service rules live in each service's file-header JSDoc; cross-cutting invariants live in DESIGN_DECISIONS.md §3–§4, the path-scoped rule files, or schema triggers.
- High-stakes write-path services (identity, member, event, club, media, curator, membership tiering, active player) carry the full ownership file-header JSDoc. Read-only page services (history, hof, bap, sideline, rules, ifpa, freestyle, records, net, legal) carry a page-contract file-header JSDoc stating the audience, rendering contract, and sensitive-page invariants for the routes they serve.

## 1.11 Configuration Model

Decision:

Configuration has two types with distinct lifecycles and distinct code entry points.

Deploy-time configuration (environment variables) is loaded once at process startup from the host environment into a single typed `config` singleton via `src/config/env.ts`. The singleton is constructed at module load, validated fail-fast, and `Object.freeze`d to prevent mutation. Every module in `src/` reads configuration through `config`; no module reads `process.env` directly. Changing a deploy-time value requires restart.

Runtime-mutable configuration (admin-tunable thresholds, windows, retention periods, pause flags, pricing) is stored in an append-only effective-dated `system_config` table, exposed through the `system_config_current` view, and read at request time via `src/services/configReader.ts` (`readIntConfig(key, fallback)`). Changing a runtime-mutable value is an admin operation; new rows supersede old rows with an `effective_start_at` timestamp; old rows are immutable. Changes take effect without restart.

Rules:

- No `process.env` reads in `src/` outside `src/config/env.ts`. Tests may set `process.env` via `tests/setup-env.ts` before importing config-consuming modules.

- Required env vars use `requireEnv()` in env.ts and throw at startup if missing. Optional env vars have explicit typed defaults inside `loadConfig()`.

- Production-critical env vars have stricter guards than simple non-empty checks (for example `SESSION_SECRET` rejects values containing `changeme` or shorter than 32 characters; `JWT_SIGNER` and `SES_ADAPTER` must be explicit in production with no fallback default).

- `config` is `Object.freeze`d after construction.

- No inline hardcoded thresholds for admin-tunable values in application code. Read via `readIntConfig`.

- `system_config` is append-only; change a value by inserting a new row, never `UPDATE`. Read via the `system_config_current` view only.

- No secrets in `system_config`. Secrets either live in env vars (dev: gitignored `.env`; production: host env file such as `/srv/footbag/env`, root-owned 0600) or are accessed via §3.6 KMS/Parameter Store mechanisms.

- Normative defaults. Defaults for required env vars live in `src/config/env.ts` (or are required explicit in production). Defaults for `system_config` keys are defined in USER_STORIES §6.7 "Configurable Parameters" and must be seeded into the database during initial database creation.

Rationale:

- Single validation point at startup; no scattered fallbacks or silent defaults for deploy-time config.
- Type-safe access via `AppConfig`.
- Fail-fast on misconfiguration catches issues at deploy time, not at first request.
- Separating deploy-time from runtime-mutable config keeps admin operations that do not require redeploy distinct from values that do.
- Testability: tests inject env vars before module load via `tests/setup-env.ts`; runtime config reads from a test-seeded SQLite view.

Trade-offs:

- Two loader paths (env.ts + configReader) instead of one. The separation is worth the overhead because deploy-time and runtime-mutable config have genuinely different audit, rotation, and operational workflows.
- Admin-tunable thresholds are DB reads on each use; cached where performance matters but not globally memoized (would defeat runtime mutability).

Impact:

- Services and controllers import from `config` (env.ts) or call `readIntConfig(...)` (runtime config). Never `process.env`.
- Secrets-handling rules (§3.6) apply to env-var secrets; system_config is not a secret store.
- SESSION_SECRET is the canonical example of an env-var secret that lives in the host's `/srv/footbag/env` outside Git. See §3.6.

## 1.12 Internal-only Subtrees

Decision:

Internal-only code (operator, maintainer, and QC tools that are not reachable from public navigation and are gated by role) lives under dedicated subtrees at `src/internal-<purpose>/**` with matching view trees at `src/views/internal-<purpose>/**`. It is kept separate from the permanent product surface in `src/services/**`, `src/controllers/**`, and `src/views/**`. `src/internal-admin/**` is present in every environment (dev, staging, production): its separation is role-based, not environment-based. `src/internal-qc/**` is dev- and staging-only: it is temporary tooling that retires before go-live (the QC-subsystem retirement gate in `docs/MIGRATION_PLAN.md`), and a production deployment never carries it. Both separations are orthogonal to the dev/staging/production adapter parity model defined in §1.9 and §5.3.

Internal-only subtrees:

- `src/internal-qc/{controllers,services}/**`: historical-data QC tooling (net team corrections, persons data-quality review). Every file in this subtree carries the banner `// ---- QC-only (delete with pipeline-qc subsystem) ----` so the retirement scope is mechanically greppable at retirement time.
- `src/internal-admin/**`: role-gated admin tooling covering work queue, audit viewer, alarm management, and config writes. Follows the same subtree convention without the QC deletion banner.

Rationale:

- A distinct subtree signals at a glance whether code serves the public product or serves operator/maintainer needs. Nothing in `src/services/` or `src/controllers/` is silently QC-only.
- The QC-only banner on every source file makes the "delete with pipeline-qc subsystem" scope mechanically greppable at retirement time.
- Keeping internal-only code out of `src/services/` keeps the permanent product service surface free of internal-only tooling. Internal-only code is documented in its relevant runbook.
- Role-based separation is orthogonal to environment-based adapter parity: dev, staging, and production differ only at the `<Purpose>Adapter` seam (§5.3). Internal-admin surfaces exist in every environment and are gated by auth role; internal-qc surfaces are additionally excluded from production because the QC subsystem is temporary and retires before go-live.

Trade-offs:

- Two parallel subtree roots (permanent product vs internal-only) to maintain. Minor, and is the point of the separation.
- A tool transitioning in or out of the QC lifecycle requires renaming its subtree (for example, migrating a tool from `src/internal-qc/` to `src/internal-admin/` if it survives QC retirement). Acceptable: it is a deliberate lifecycle transition and should not be silent.

Impact:

- The historical-data QC subsystem lives entirely under `src/internal-qc/`; role-gated admin tooling lives under `src/internal-admin/`.
- `src/services/`, `src/controllers/`, `src/views/` hold permanent product code only. New internal-only code must land under the appropriate `src/internal-<purpose>/**` subtree on first commit. Do not merge an internal-only addition into the main trees with intent to move later.
- Integration tests for internal-only routes continue to live in `tests/integration/` alongside other route tests. Test-file paths do not mirror the src-layer separation today; if a convention for that is adopted later, it is a test-layout decision, not a change to this rule.
- Internal-only subtrees are not part of the permanent product service surface; permanent product services are, and the high-stakes write-path ones carry the file-header JSDoc convention.

## 1.13 Curator Content Source of Truth

Decision:

Curator content has two source-of-truth phases tied to the platform lifecycle.

Before go-live, curator content is sourced from `/curated/`, a directory tree in the application repository, with one JSON sidecar per item. The seeder (`scripts/seed_fh_curator.py`) is the only path from `/curated/` to the platform DB and S3. The DB and S3 are derived materializations: either can be wiped and rebuilt from `/curated/` by re-running the seeder. This is what lets curator content be authored, reviewed in git, and seeded before any persistent DB exists. The `/curated/` sidecars are themselves produced by an upstream pre-go-live data-prep layer (curator staging, discovery, and promotion inputs); that layer and the sidecars it emits are authoring inputs only.

After go-live, the persistent production DB is the source of truth. The admin UI writes curator content directly to the DB (and S3 for binaries), the same pathway member uploads use; the seeder is not run against the production DB, because its reconcile and orphan-cleanup model would treat admin- and member-created rows that have no sidecar as deletable. Durability after go-live is the standard DB backup and restore path, not `/curated/` replay. The entire pre-go-live input layer, the upstream data-prep CSVs and the `/curated/` sidecars alike, is no longer consumed once the DB is persistent; `/curated/` remains the dev and pre-go-live authoring surface and ships as a build artifact, not a runtime-mutable tree. This source-of-truth pattern, committed authoring inputs seeded into a derived database before go-live and the persistent database as the source of truth after, is reused beyond curator media: the email templates and the freestyle dictionary follow the same pre-go-live-curate-then-cut-over-to-the-database model.

The DB schema carries no filesystem coupling in either phase; admin edit and delete locate the sidecar that produced a given `media_items` row at runtime by matching the row's `(video_platform, video_url)` against sidecars on disk.

Rationale:

- Curators must be able to author and review curator content before any platform DB instance exists, and against any future DB rebuild. Sidecars in git decouple the editorial process from the DB lifecycle.

- Binary assets (photo bytes, video bytes) cannot live in git or in the DB. The sidecar holds metadata; S3 holds the bytes; the DB row is the index that joins them at render time. The seeder uploads bytes to S3 and writes the row.

- Before go-live, treating `/curated/` as the source of truth means curator changes are versioned, diffable, and reviewable in git: a bad edit is recoverable by `git revert`, and a lost DB is recoverable by replay. After go-live, curator content is durable through the same DB backup and restore path as all other persistent data.

- Admin UI write paths (upload, edit, delete) are self-sufficient against the current phase's source of truth. Before go-live they write the `/curated/` sidecar and the seeder reconstitutes the DB row. After go-live the DB write is the contract: the admin UI writes the `media_items` row directly, with no dependency on a subsequent seeder run.

- Before go-live, where `/curated/` is the committed working tree (dev), curated writes are restricted to real maintainer accounts: the curator service refuses curated and FH-owned-gallery writes from the seeded test personas (the switchable dev-harness identities), so a test persona cannot mutate the versioned source-of-truth sidecars. Staging and production write curated content to the DB and object store rather than the working tree, so the restriction does not apply there and any admin may curate.

- Sidecar identity for URL-reference items is `(videoPlatform, videoUrl)`. The seeder's filename rule is `<primarySlug>_<sha1(videoUrl)[:8]>.meta.json`, which lets the service locate a sidecar from a row by globbing for the hash suffix and verifying the URL match. No schema column duplicates this filesystem layout.

Requirements:

- `/curated/{category}/*.meta.json` is the canonical write target for URL-reference content. File-paired sidecars (`<source-stem>.meta.json` siblings of photo/video binaries) carry the same role for the file-paired curator items.

- The seeder is idempotent and runs only against a disposable DB (dev, CI, or a pre-go-live staging rebuild), never against the persistent production DB. Re-running against unchanged inputs produces zero net DB writes; orphan rows (whose sidecar was removed from `/curated/`) are deleted on the next run. Orphan cleanup is scoped to system-member-owned, sidecar-derived rows, so a run can never delete member-owned media.

- A destructive run against a persistent database is refused mechanically, not procedurally: at cutover the operator writes a post-cutover marker into the database itself (a `system_config` row, key `post_cutover`), and every destructive seeder and loader checks it through one shared guard at database-open, before any mutation, with no bypass flag. Because the marker lives in the database, it travels with every copy, snapshot, and restore, refusing cases no environment variable, path allowlist, or host-file marker can see (a restored production snapshot on a developer machine); those other guards remain as defense in depth.

- Admin edit and delete on a sidecar-backed row resolve the sidecar at runtime; if the sidecar is missing on disk, edit fails (corruption guard) and delete proceeds best-effort with the DB row removal logged in audit.

- Read paths must not assume sidecar reads are cheap. List-view shaping reads only DB-resident fields; per-item sidecar reads happen only at the edit form (one row).

Trade-offs:

- Edit and delete pay an O(n) filesystem cost (a directory glob plus one to a few JSON parses) for sidecar resolution. Negligible at the corpus scale (hundreds of sidecars at most); the alternative of a schema column would couple the DB to filesystem layout and risk staleness when sidecars are moved or renamed outside the seeder.

- Operator must re-run the seeder after committing curator changes to see the full DB state on systems where the inline update did not run (for example, a freshly cloned environment, a different host). The admin UI surfaces this with a banner.

- Three sidecar shapes coexist: file-paired sidecars (sibling of a photo or video binary), URL-reference sidecars (standalone, no binary), and gallery sidecars (standalone, declare a `member_galleries` row plus its criteria-tag and exclude-tag sets, one file per gallery under `/curated/galleries/`). All three are validated by the seeder; `src/lib/curatorUrlSidecar.ts` owns URL-reference sidecar I/O and `src/lib/curatorGallerySidecar.ts` owns gallery sidecar I/O. The system avatar is the one no-sidecar exception: any binary under `/curated/avatars/` is treated as an avatar by location alone (the seeder forces `is_avatar = 1` and the `#by_<owner_slug>` uploader marker; a sidecar in `/curated/avatars/` is rejected as a misconfiguration).

Impact:

Before go-live the admin UI, the seeder, and the gallery render paths share one mental model: `/curated/` is authoritative; everything else is derived. After go-live the persistent DB is authoritative and the admin UI is the curator lifecycle surface; `/curated/` is the pre-go-live authoring and seed source. New curator content types follow the phase-appropriate write path.

## 1.14 Test-data Harness

Decision:

The src/testkit/ subtree provides a composable test-data
harness with two layers: a composition primitive that builds a
member plus all supporting rows (tier grant, legacy-claim linkage,
historical-person link, club affiliations and leadership, onboarding-
wizard progress, payment history, mailing-list subscriptions, audit
trail) from a single structured spec; and a maintainer-curated canonical
catalog of named personas with coverage annotations. Two browser-facing affordances support
manual use: a route that issues a session cookie for any persona, and
a listing view of all loaded personas with one-click switching. The
harness is permanent test infrastructure: it is active in development
and staging, excluded from the production image at build time, never
enabled at runtime in production, and never source-deleted at cutover.
Both affordances are gated to development and staging by
config.footbagEnv with a production hard-guard, audit-log every
issuance, and contain any persona-password literals via the §3.2
single-source pattern.

Staging additionally carries the real footbag.org dataset alongside this
synthetic harness, loaded by the `--all-data` deploy, so onboarding matching,
legacy claims, and historical-person pages are exercised against real records;
the synthetic persona catalog powers the deterministic route-by-persona
authorization matrix that real data does not replace. That real dataset is
protected as it is in production, by the application's own authentication and the
public-versus-member visibility model; TESTING.md owns the detailed protection
model and the tester procedure.

Rationale:

- Without a shared composition primitive, every test slice reinvents
  the row-building logic for the same member-plus-supporting-rows
  shape. Drift between test fixtures, dev-shortcut seeds, and the
  canonical reference set is inevitable.
- A factory-style composition primitive lets test fixtures and dev-
  shortcut seeds invoke the same code. A persona's shape is identical
  whether instantiated in-process for a Vitest test or seeded in-
  database for a browser session, so behavior verified by a test
  reflects behavior reachable from a browser.
- The two-layer split separates concerns. The primitive owns row-
  building. The canonical catalog owns the maintainer-shared reference
  set with coverage notes that document which testing dimensions each
  persona exercises.
- Two browser affordances (switch route plus listing view) cover both
  expert use (direct URL with persona slug) and discovery use (paid
  testers who do not read code browse the listing to find personas).
- Browser cookie issuance uses the same JWT primitive as the production
  login path (§3.2), not a parallel auth-bypass mechanism. The harness
  chooses which member to act as; the cookie itself is real and
  verified by the same middleware production uses.
- Single-source containment of persona-password literals keeps the
  literal out of the production image and grep-confirmable to a single
  file. Personas seed only in development and staging, so their
  detection markers are zero-residue in any production database by
  construction.

Requirements:

- Composition primitive reuses the row-building primitives already
  used by tests/fixtures/factories.ts. No parallel row-building code
  path.
- Canonical catalog persona entries carry coverage notes that
  enumerate the testing dimensions the persona exercises (tier, admin
  role, legacy state, club state, payment history shape, etc.).
- Both browser affordances are active in development and staging and
  refused in production, gated by config.footbagEnv with a production
  hard-guard.
- Every cookie-issuance writes an audit entry with
  actor_type='dev-shortcut'.
- Detection markers (file-path prefix, reason_code value, audit
  action_type) are grep-able; because personas seed only in
  development and staging, the markers are zero-residue in any
  production database.

Trade-offs:

- The harness adds dev-environment DB state at boot. Acceptable: the
  cost is bounded (one row per persona times supporting rows), seed
  cost is one-time per dev-DB reset, and the alternative is per-test
  fixture re-derivation that recurs every test run.
- Per-developer extension layer can diverge across developers over
  time. Acceptable: the layer is explicitly gitignored, paid-tester
  workflows reference the canonical catalog only, and divergence
  cannot pollute the shared reference.
- Catalog grows monotonically as the testing surface expands.
  Acceptable: a new test slice adds one persona, not a new fixture
  mechanism. The catalog doubles as a coverage matrix that surfaces
  gaps.

Impact:

- Test fixtures and dev-shortcut seeds share one row-building
  primitive. Future changes to the schema for member, tier_grant,
  legacy_member, historical_person, club_affiliation, etc. update one
  primitive, not two.
- Paid testers receive a discoverable inventory of personas via the
  listing view rather than a code-reading task.
- Future test slices (onboarding, legacy claim, clubs, anti-
  enumeration, search, events, donations) add personas to the
  canonical catalog instead of inventing fixture rows. Coverage grows
  monotonically.
- The harness is excluded from the production image at build time and
  never enabled in production; its detection markers are
  grep-confirmable as zero-residue in any production database. It is
  not part of the cutover-removal surface.

## 1.15 Convention and Invariant Gates

Decision:

Layer-boundary rules and data invariants that can be checked mechanically are enforced at merge by a convention gate (`scripts/ci/assert_conventions.sh` and its delegated checkers), not left to human review. The gate covers template discipline (no branching on raw domain enums, no multi-variable URL assembly, no inline data-island serialization), controller discipline (no direct SQL execution, no direct cookie emission outside the cookie helpers), data-layer discipline (positional SQL parameters only, the canonical UTC timestamp form, presence of every documented append-only trigger), service discipline (failure audit rows route through the operational-error helper), audit-log discipline (every `action_type` is a lowercase dotted `domain.event`), supply-chain discipline (every GitHub Actions reference pinned to a commit SHA), comment hygiene (no doc-path references or delivery-epoch labels in code or template comments), deploy-image discipline (every runtime read resolving under the repository root has a matching Dockerfile COPY), and the visual-token and template restrictions of §4.8. Checks that require judgment, or that range over a growing unenumerable set such as service file-header JSDoc accuracy and completeness, are not gated; they are carried by the adversarial bug-hunt review.

Rationale:

- These rules are easy to state and easy to violate by habit. A mechanical gate catches drift that review misses, because a raw-enum branch, a stray `datetime('now')`, or an inline `JSON.stringify` renders fine while quietly breaking authorization shaping, sort correctness, or island escaping.

- Each gated rule maps to a written layer rule or data invariant with a concrete failure mode, so the gate encodes design intent, not style preference.

- A gate keyed on a hand-maintained list of covered files gives false confidence: a new file that should be covered but is never added to the list passes silently. Such checks belong in the bug-hunt review, which reasons over the whole tree by category.

- Enforcement at merge keeps the conventions authoritative without relying on every contributor remembering each rule.

Requirements:

- A new mechanically-checkable layer rule or data invariant enters the gate when it lands, paired with the rule or design decision it enforces.

- A gate rule fails closed with an offending `file:line` and a message naming the canonical site to fix.

- A rule that cannot be checked without judgment, or whose covered set grows unenumerably, is enforced by the bug-hunt review rather than added to the gate.

- The local convention gate and `./run_all_tests.sh` pass before any push.

Trade-offs:

- The gate rejects expedient one-off violations, forcing the canonical pattern even for a single use.

- Each gate rule carries a small false-positive risk that is scoped out with explicit exclusions when the rule is introduced.

Impact:

- Code that branches on a raw enum in a template, assembles a multi-variable URL in a view, executes SQL from a controller, emits a cookie outside the helpers, writes a non-canonical timestamp or a named SQL parameter, drops a documented append-only trigger, records a failure audit row without the operational-error helper, writes a non-namespaced audit `action_type`, or references a GitHub Action by a mutable tag, fails CI and must be expressed through the canonical pattern.

- Service-contract documentation correctness is owned by the bug-hunt review, which flags any write-path service missing or drifting from its file-header JSDoc.

## 1.16 Multi-repository Structure and Companion-checkout Convention

Decision:

The project is built from two git repositories the team maintains: this public application repository, and a private maintainers' operations repository holding the authoritative work tracker (GitHub Issues), private planning, the private and sensitive project data, the operations documentation (`DEVOPS_GUIDE.md` for operating runbooks, `AWS_OPERATIONS.md` for the canonical AWS reference, and `VAULT_GOVERNANCE.md` for vault and board governance), and PII-free operational evidence. Historical-pipeline work additionally reads a read-only clone of the legacy footbag.org site as a migration fact source; it is not a repository the team maintains. Both companion checkouts are reached from the application repository only through gitignored repo-root symlinks whose names are canonical and identical on every maintainer machine: `footbag_legacy_repo` for the legacy clone and `footbag_private_repo` for the operations checkout. Tooling that must name the private repository on GitHub reads the machine-local `FOOTBAG_PRIVATE_REPO` environment variable. References are one-way: the private repositories may cite public files and commits; no committed public file carries the private repository's name, owner, machine path, or issue numbers.

Rationale:

- Privacy follows classification: PII, member data, credentials, and sensitive coordination live outside the public repository, which stays fully standalone.
- Active work has exactly one authoritative home, preventing the two-status-homes failure mode. Accepted implementation deviations are tracked there too, as closable work items, so no standing status ledger accretes in either repository.
- Maintainer machines lay repositories out differently; a repo-root symlink gives every tool one stable path with zero committed locality, and the environment variable does the same for GitHub-side reads.

Requirements:

- The symlinks are gitignored; committed files never reference a machine path or the private repository's identity.
- The legacy clone is read-only (the harness deny-lists Edit and Write under its symlink); the credential vault is never committed to any repo (it lives in access-controlled external storage), consistent with the existing secrets-custody rule.
- The public repository builds, tests, and operates with no companion checkout and no `FOOTBAG_PRIVATE_REPO` value present; a tool that reaches for an absent companion reports one actionable line, then skips.

Trade-offs:

- Private planning is deliberately undiscoverable from the public repository; contributors are routed to the maintainer contact.
- Each maintainer machine wires two local items (the symlink and the environment variable) once, at onboarding.

# 2. Data Model

## 2.1 Schema and Versioning

Decision:

Standard metadata columns (for example id, created_at, created_by, updated_at, updated_by, version, and deleted_at, where applicable) are required on mutable domain tables following consistent naming conventions. Immutable, append-only, and certain junction and reference tables intentionally omit some or all mutable-table metadata columns, for example, version, updated_at, and updated_by are omitted from append-only ledger and audit tables. Base tables (with _base suffix) contain all records for their entity, including soft-deleted rows where that entity uses soft-delete semantics. Public views filter deleted_at as required for soft-deleted entities. Entity-specific lifecycle exceptions (for example clubs using status-based archival instead of deleted_at, and media, news items, and events without results using hard delete) are documented in their respective decisions. Tables use TEXT for UUIDs and timestamps (ISO-8601 format) for portability and human readability.

Rationale:

- Provides uniform metadata structure across all tables, enabling consistent tooling: migrations, audits, queries, debugging. The version field provides audit history tracking (incremented on each update).

- Supports schema evolution without bespoke data migrations for each change.

Trade-offs:

- Slight overhead, even for small or simple entities.

- Contributors must understand the metadata pattern to manipulate entities safely.

Impact:

- The domain data model defines tables with these standard columns. Data Model document specifies complete schema including column types, indexes, foreign keys, and constraints. Migrations create base tables and views following this pattern consistently.

## 2.2 Data Access Pattern

Decision:

All data access occurs through a single database module (db.ts) that exports the database connection, a collection of statement-group objects whose properties prepare SQL on first access, and a transaction helper function. Services import this module and execute queries by calling getters that resolve to prepared statements, then invoking `.all/.get/.run` with parameters. `db.prepare()` is only ever called inside a getter or a function body, never at module top level, so importing the database module against an unmigrated database does not fail at import time.

The database module prepares all SQL statements during initialization: member queries (find by email, find by ID, create, update, delete/restore), event queries (find upcoming, find by ID, search by filters), registration queries, media queries, audit log queries, and all other data access operations. Each prepared statement is exported with a descriptive name that clearly indicates its purpose.

Services import the database module and call prepared statements directly, passing parameters as needed. For multi-step operations requiring atomicity, services use the exported transaction helper function which wraps operations in BEGIN/COMMIT with automatic ROLLBACK on error.

Statement Naming Convention: Names follow consistent pattern for discoverability: entityByField for single-record queries (memberByEmail, eventById), entitiesByField (plural) for multi-record queries (eventsByOrganizer, mediaByHashtag), createEntity for inserts (createMember, createEvent), updateEntity for updates (updateMemberTier, updateEventStatus), deleteEntity for deletion operations, whether soft (deleteMember) or hard (deleteMedia, deleteEvent, deleteNewsItem).
 All names use camelCase. Queries returning counts use countEntitiesByField pattern (countRegistrationsByEvent). Boolean queries use hasEntity or isEntity pattern (hasMemberVoted, isEventPublished).

Parameter Binding: All queries use positional parameters (?) rather than named parameters for simplicity and consistency. Parameters are bound using better-sqlite3's automatic parameter binding: .get(param1, param2) for single row, .all(param1, param2) for multiple rows, .run(param1, param2) for modifications. Array parameters are spread: .all(...arrayOfParams). This follows SQLite best practices for SQL injection prevention and performance.

Error Handling: better-sqlite3 throws SqliteError with code property matching SQLite extended result codes. Services catch specific error codes and handle appropriately: SQLITE_CONSTRAINT_UNIQUE indicates duplicate key (map to 409 Conflict), SQLITE_CONSTRAINT_FOREIGNKEY indicates referential integrity violation (map to 400 Bad Request or handle as business logic error), SQLITE_BUSY indicates timeout waiting for lock (retry with exponential backoff up to 3 attempts), SQLITE_FULL indicates disk full (map to 507 Insufficient Storage), SQLITE_IOERR indicates I/O error (critical alert). Services never catch and ignore database errors. Unhandled errors propagate to controller layer where they are logged and mapped to 500 Internal Server Error.

Transaction Semantics: Transaction helper uses IMMEDIATE transaction mode (BEGIN IMMEDIATE) to acquire write lock immediately, preventing SQLITE_BUSY errors during transaction execution. Transactions do not span async operations - all database operations within transaction execute synchronously. better-sqlite3 does not support async functions in transactions because transaction would commit before async operations complete. Services structure transactions to batch all database operations, then perform async operations (email, S3 upload) after transaction commits. Transaction timeout is 30 seconds (enforced at application level), after which transaction is rolled back and error thrown.

Statement Reset: better-sqlite3 automatically resets prepared statements after execution. If a statement throws, it is automatically reset and remains usable. Each getter access compiles a fresh statement; statement objects are not retained across requests.

Example: memberByEmail: db.prepare('SELECT \* FROM members WHERE email = ?')

A service uses these prepared statements directly, wrapping multi-step operations in transactions with proper error handling. The complete pattern: prepared statements with consistent naming exported from central module, services calling them with positional parameters, transaction wrapper ensuring atomicity, and specific error handling for common database constraint violations.

Rationale:

Decoupled Module Load: Lazy preparation decouples application module load from database schema readiness. Tests, migration tooling, and any future code path that imports the database module before applying schema do not crash at import time. The single rule "no top-level `db.prepare()`" is uniformly applied across statement groups and dynamic-SQL helpers, removing the masking that per-test database isolation provided previously.

Simplicity and Transparency: All queries live in one file. Opening db.ts shows every query the application can execute. No hidden abstractions, no magic, no framework complexity. Volunteers can grep for "WHERE email" and immediately find relevant queries. Consistent naming convention makes queries discoverable through IDE autocomplete.

Small Project Appropriate: For a community site with 50-100 total queries, a single organized file is manageable and easier to navigate than dozens of repository files. Repository classes add organizational value when you have hundreds of queries and many developers, but create unnecessary complexity for small teams.

Direct Access: Services call prepared statements directly with no intermediate layers. No class instantiation, no dependency injection, no method dispatch overhead. Just import and call.

Self-Documenting: Descriptive statement names serve as documentation. queries.memberByEmail is immediately clear. The SQL is visible right next to the name for anyone who needs to understand the query. Naming convention eliminates ambiguity: singular names return one record, plural names return arrays.

SQL Injection Protection: Positional parameters (?) with bound values provide complete SQL injection protection. better-sqlite3 handles parameter escaping automatically. Services never concatenate strings into SQL.

Error Clarity: Catching specific SQLite error codes (SQLITE_CONSTRAINT_UNIQUE, SQLITE_BUSY, etc.) enables precise error handling and meaningful error messages to users. Generic catch-all error handling obscures root causes and prevents proper recovery.

Transaction Safety: BEGIN IMMEDIATE mode prevents common concurrency bugs by acquiring write lock immediately. Synchronous-only transaction restriction prevents bugs where async operations cause transactions to commit prematurely. 30-second timeout prevents runaway transactions from blocking other operations.

Testing Simplicity: Tests import the same db module. For integration tests, point at test database. For unit tests that need mocking, the module can be mocked at the import level using standard Node.js testing tools.

Trade-offs:

Per-access SQL Compilation: Lazy preparation re-runs `db.prepare(SQL)` on every getter access. better-sqlite3's prepare is a C-level operation and no statement is used in a hot loop, so the per-request cost is small. Boot-time SQL validation that eager prepares provided is recovered by an explicit test that walks every getter against the current schema.

Single File Growth: As the application grows, db.ts could contain 100+ prepared statement definitions. This remains manageable for small projects but would become unwieldy for large applications with 500+ queries. At that scale, splitting into repository modules would be appropriate.

No Encapsulation: Services directly access database connection and prepared statements. There is no enforcement preventing services from calling db.prepare() and writing ad-hoc SQL. This is acceptable for small volunteer teams where code review catches violations, but would be risky for large teams.

Global State: The database module exports singleton instances (connection and prepared statements). This is simple and performant but means tests must carefully manage database state. No issue for applications with clear test setup/teardown procedures.

Synchronous Transactions Only: Transactions cannot span async operations (HTTP calls, S3 uploads, email sending). Services must complete all database work, commit transaction, then perform async operations. This is a better-sqlite3 design constraint but also a best practice - keeping transactions short minimizes lock contention.

Positional Parameters Only: Using positional (?) rather than named (:param) parameters means parameter order matters. Developer must ensure parameters passed in correct order. Named parameters would be more readable for queries with many parameters, but positional parameters are simpler and consistent across all queries. Trade-off favors simplicity.

Manual Error Code Handling: Services must know SQLite error codes (SQLITE_CONSTRAINT_UNIQUE, etc.) and catch them explicitly. More verbose than ORM-style exceptions, but provides precise control over error handling and recovery. Better for debugging and operational troubleshooting.

Impact:

Database Module Implementation: Single db.ts file exports database connection configured with required PRAGMAs, exports object containing all prepared statements with descriptive names following naming convention, exports transaction helper function using BEGIN IMMEDIATE. Module initialization prepares all statements synchronously at startup. Module is ~200-500 lines for typical application with 50-100 queries.

Service Layer Usage: Services import database module and call prepared statements: queries.memberByEmail.get(email), queries.createMember.run(data), transaction(() =\> { ... }). Services wrap error-prone operations in try-catch blocks, catch specific SQLite error codes, throw business logic errors with meaningful messages. Services never call db.prepare() directly or write SQL inline.

Query Organization: Statements grouped by domain within the exports object (members, events, registrations, media, audit logs, etc.). Comments separate sections for readability. Statements ordered logically: reads before writes, simple before complex. Complex joins include inline SQL comments explaining logic.

Error Handling Pattern: Services catch SqliteError, inspect error.code property, handle known error codes (SQLITE_CONSTRAINT_UNIQUE → meaningful business error, SQLITE_BUSY → retry with backoff, SQLITE_FULL → critical alert), propagate unknown errors to controller layer. Controllers log all database errors with safe context only: query name, operation, correlation ID, and redacted parameter summaries (never raw PII, secrets, tokens, emails, or payment details).

Transaction Pattern: Transaction helper executes BEGIN IMMEDIATE, runs provided function synchronously, commits on success or rolls back on error. Services wrap multi-step operations requiring atomicity: create registration + log audit entry, update member tier + log tier change + create payment record. Services never put async operations (await fetch, await sendEmail) inside transaction callback. All async operations occur after transaction commits.

Testing Strategy: Integration tests import db module and execute against test database (:memory: or temporary file). Setup creates schema, seeds test data. Teardown closes connection and deletes file. Unit tests that need to mock database use test doubles or module mocking (jest.mock, sinon). Each test resets database state for isolation.

Monitoring and Debugging: All database errors logged with error.code, query name, and parameters (sanitized). Slow query monitoring wraps statement execution with timing (log if \>500ms). SQLITE_BUSY errors tracked in metrics (alert if \>5% of operations). Query execution counts tracked per statement name for optimization analysis.

## 2.3 Soft Deletes

Decision:

User-facing "delete" operations follow one of three lifecycle patterns depending on the entity type:

1. **Grace-period deletion with restore** (members only): sets a deleted_at timestamp. The account is immediately inaccessible but can be restored by the member during the configurable grace period. Database views for members filter WHERE deleted_at IS NULL, making this transparent to queries. After the grace period, a background job purges PII while retaining the anonymized row for referential integrity.

2. **Status-based archival** (clubs only): sets status = 'archived'. No deleted_at column is used. Club records are never removed from the database.

3. **Hard delete** (events without results, news items, media, and all association/link rows): the record is immediately and permanently removed. Events with published results are explicitly excluded and preserved permanently.

Foreign keys use ON DELETE NO ACTION for entities under the grace-period deletion pattern (members) to prevent accidental hard deletes while the grace period is active. Hard-delete entities are structured as leaf nodes or are handled via explicit application-level cascade logic at deletion time.

Rationale:

- Grace-period deletion for members protects against accidental account deletion and supports member-initiated restore within the configured window.

- The grace period lets administrators reconcile audits and payments before PII is permanently purged.

- Historical record for members is preserved as an anonymized row even after PII purge, maintaining referential integrity for audit logs, event results, and payments.

- Hard delete is appropriate for entities with no restore story and no referential integrity concerns (events without results, news items, media). Association/link rows are always hard-deleted, with changes captured in the audit log. Operational logs and ledgers are append-only and not deletable.

Trade-offs:

- Database views handle grace-period deletion for members with deleted_at filtering, eliminating the need for explicit WHERE deleted_at IS NULL in every member query.

- Hard-deleting events and news items simplifies the cleanup job and eliminates grace-period configuration for those entities at the cost of no admin undo for those deletions (confirmation dialogs are the safeguard).

Requirements:

- The retention-cleanup job runs on the documented cadence and is part of the standard runtime, not an optional add-on. It permanently purges PII from soft-deleted member rows past the configured grace period, hard-deletes rows whose retention window has elapsed, and writes an audit-log entry per affected row. Loss of the job's last successful run past a configured threshold raises an alarm.

Impact:

- Controllers and services apply each entity's defined lifecycle action: grace-period deletion via deleted_at for members, status = 'archived' for clubs, and immediate hard delete for events (without results), news items, and media.

- A background job can enforce retention policies and/or permanently remove entities after the configured window according to business rules.

- SQLite UNIQUE treats NULLs as distinct; therefore UNIQUE(email, deleted_at) does not prevent multiple active rows. Enforce active uniqueness with partial unique indexes on canonical normalized values (e.g., lower(email) WHERE deleted_at IS NULL), and define reuse rules explicitly.

- Reuse rules must be explicit: email addresses remain reserved during the account grace period and may be reused only after personal data is purged. Standardized event/club hashtags are reserved permanently and are never reused. Enforce active uniqueness with partial unique indexes on canonical normalized values (e.g., lower(email) WHERE deleted_at IS NULL AND personal_data_purged_at IS NULL), and enforce permanent hashtag uniqueness via normalized unique indexes.

### Retention policy

Member personal data: retained for a configurable grace period (Administrator-configurable default 90 days, parameter key: member_cleanup_grace_days) after soft delete, then purged from primary storage. Purge sets credential and contact fields (email, phone, passwordHash) to NULL. For non-nullable identity/location columns retained for referential integrity, the application overwrites values with anonymized placeholders (not original data). Exception: members with HoF or BAP flags preserve `displayName` and `bio` after purge per User Stories deletion policy; credential/contact fields are still nulled and other required retained identity/location fields are anonymized as needed. The member row is retained as an anonymized record for referential integrity and audit history.

- Deceased members: memberStatus="deceased" disables login immediately; private contact information is permanently removed after a configurable grace period (parameter key: `deceased_cleanup_grace_days`; in case of error), while historical contributions and honor data (HoF, BAP) are preserved.

- Club records: Club records are never permanently deleted and do not use the deleted_at soft-delete pattern. Club archival is performed by setting status = 'archived'. The deleted_at column is not present on the clubs database table. A club persists whether or not it currently has co-leaders, and a successful leadership claim or a new current affiliation returns a club of any status to `'active'`.  

- Photos and video links: retained while member is active; when deleted by the member (or via account deletion), photo data is removed from primary storage immediately. Deleted items persist in backups until backup retention expiry (operational constraint).

- News items: hard-deleted immediately on admin action. No grace period or restore. Deletion is audit-logged.

- Events: events without published results are hard-deleted immediately by the organizer. Events with published results are preserved permanently and are never deleted. No grace period applies to events.

- Audit logs: retained 7 years; entries include authenticated actor identity (member id) and event metadata, and intentionally exclude IP address.

- Financial records: retained as required for reconciliation/compliance, but after deletion windows, personal identifiers are removed/anonymized where feasible while keeping transaction integrity.

- Member-to-historical_person link: `members.historical_person_id` is a nullable foreign key with ON DELETE NO ACTION; historical_person rows are never deleted. The link is retained during the grace period to support member-initiated restore. On PII purge, `historical_person_id` is set to NULL on the anonymized member row, and subsequent person-context pages render from the historical_person record only (URL reverts from `/members/{slug}` to `/history/{historical_person_id}`). See §2.4 (entity rules), USER_STORIES `M_View_Profile`, and `M_Delete_Account`.

## 2.4 Member, Legacy Member, and Historical Person Entity Types

Decision:

The platform represents people using three distinct entity types stored in three tables: `members` (authenticated accounts), `legacy_members` (imported old-site accounts from the mirror and future data dump), and `historical_persons` (archival identity records of past participants sourced from event data and club data). These entity types have different primary keys, different URL namespaces, and different privacy and capability rules. Three FK linkages (rule 3) express the identity overlaps between them; unlinked rows in `legacy_members` and `historical_persons` remain archival read-only records.

Rules:

1. Three entity types. The identity model uses three distinct tables, one per entity. A given real-world person may correspond to rows in any combination of the three, via the FK linkages in rule 3.

   - `members` = authenticated accounts on this platform. Identified by `members.id`; addressable by `members.slug`. Hold credentials, tier, profile fields, optional avatar, mailing-list subscriptions.

   - `legacy_members` = imported archival records of old footbag.org user accounts (from the mirror and the forthcoming legacy data dump). Identified by `legacy_members.legacy_member_id` (the old-site account id). Read-only after import; never deleted; hold no live credentials. Persist as the permanent audit record of a legacy account even after a current member claims it.

   - `historical_persons` = archival records of past participants sourced from event data and (future) mirror club-roster extraction. Identified by `historical_persons.person_id`. Read-only; never deleted; hold no credentials. Contact information, if present, is admin-surface only and never publicly rendered.

2. URL namespaces. Two general person URL namespaces exist:

   - Member profile URL: `/members/{slug}`.

   - Historical-person URL: `/history/{personId}`.

   Every general-purpose person link in any service MUST go through `personLink.personHref(memberSlug, historicalPersonId)`, which dispatches: `/members/{slug}` when a claimed member exists, `/history/{personId}` otherwise, or null. No service constructs person URLs directly.

   Sport-specific pages render person-related aggregates (event results, partnerships, records, etc.) as SECTIONS on the canonical person page (`/history/{personId}` or `/members/{slug}`), not under their own sport-scoped person namespaces. Sport-specific URL namespaces own sport CONTENT only: events, aggregated team/partnership lists, record tables, trick catalogs, sport landings, and informational pages. They do NOT include per-person deep-dive URLs; per-person data belongs on the canonical person page as sections, not under parallel sport-scoped person URLs.

3. Linkages. Three FK relationships express the identity overlaps between entity types. All three are nullable; `ON DELETE NO ACTION` throughout. Rows in `historical_persons` and `legacy_members` are never deleted.

   - `members.historical_person_id` → `historical_persons(person_id)`. Non-NULL = this member claims that historical identity. Partial UNIQUE index enforces at most one live member per historical person.

   - `members.legacy_member_id` → `legacy_members(legacy_member_id)`. Non-NULL = this member has claimed that legacy account. Partial UNIQUE index enforces at most one live member per legacy account.

   - `historical_persons.legacy_member_id` → `legacy_members(legacy_member_id)`. Non-NULL = the mirror/dump named this historical person with that legacy account id (archival provenance). Partial UNIQUE index enforces 1:1.

4. Claimed historical persons redirect to member profile. When `members.historical_person_id` is non-NULL for a given historical person, the canonical URL is the member's `/members/{slug}`. `GET /history/{personId}` for a claimed historical person redirects (301) to `/members/{slug}`.

5. Reversion on account deletion. When a member's PII is purged (after the grace period per §2.3 Soft Deletes), the application, in one transaction: (a) sets `members.historical_person_id = NULL` and `members.legacy_member_id = NULL` on the anonymized row; (b) clears the claim pointer on the corresponding `legacy_members` row by setting `claimed_by_member_id = NULL` and `claimed_at = NULL`, returning that legacy account to the claimable pool. Subsequent `personHref()` resolution reverts from `/members/{slug}` to `/history/{personId}`.

6. Historical persons confer no member capabilities. A row in `historical_persons`; whether claimed or unclaimed; does NOT confer authentication, inclusion in member search, contactability, profile ownership, mailing-list subscriptions, or any current-member privilege. See §3.9 and DATA_GOVERNANCE.md §3. A `historical_persons` row also carries an admin-settable `is_deceased` flag, independent of `members.is_deceased`, used only to suppress the direct historical-record claim CTA (a living member cannot self-claim a deceased person's identity); it drives no public memorial display.

7. Imported legacy accounts live in `legacy_members`, never in `members`. Legacy migration imports old footbag.org user-account rows into the `legacy_members` table (§4.14b of DATA_MODEL). `legacy_members` rows are permanent archival records; they are never deleted. They do not grant authentication and are not visible on current-member surfaces. When a current member completes the claim flow (§6.5 and the `IdentityAccessService` entry in SC) for a legacy account, the application sets `legacy_members.claimed_by_member_id` and `claimed_at`, copies merge-eligible fields to the claiming `members` row (fill-if-empty merge semantics; the live account always wins for login and auth fields), and (if the legacy account's `legacy_member_id` matches a `historical_persons.legacy_member_id`) also sets the claiming member's `historical_person_id`. The `legacy_members` row itself is not mutated at claim beyond the two claim-state columns.

Rationale:

- Prevents the conceptual slippage where "historical person" and "member" get conflated, which would leak member-only capabilities (contactability, search inclusion) onto archival records.

- Gives `personHref()` a single documented contract: general person URL dispatch. Every person link in any service obeys the same dispatcher.

- Aligns deletion-reversion behavior with the URL dispatch rule so a claimed-then-unclaimed member's links work correctly without ad-hoc per-service logic.

- Reuses the HP-vs-member pattern consistently: one person → one canonical URL → all data about them rendered as sections on that single page. Prevents per-sport duplication of person-centric data across parallel URL namespaces.

## 2.5 Immutable Audit Logs with Privacy-safe Fields

Decision:

Security and governance-sensitive actions (elections, payments, admin actions, account deletion, configuration changes, etc.) produce immutable, append-only audit log entries that include: actor’s member id, timestamps, action type, entity IDs, reason provided.

Rationale:

- Audit log database table (append-only, never edited) simplifies governance and investigations.

- Member IDs are necessary for administrative reconciliation and dispute resolution.  
  Audit logs intentionally exclude IP data; actor identity is recorded via authenticated account context (member id) rather than network identifiers.

Trade-offs:

- 7-year retention increases storage costs (acceptable for compliance).

- Immutability is enforced at the application-code boundary: no service method issues UPDATE or DELETE against `audit_entries`. Database-level tampering by an actor with direct SQLite write access (for example a Lightsail host compromise) is a residual risk bounded by the SSH access posture (§7.2) and backup retention (§9.4). Off-host, the audit log is preserved inside the encrypted database snapshot backups, which the cross-region DR bucket protects with S3 Object Lock (WORM).

Impact:

- All state-changing operations generate audit entries.

- Audit schema includes full actor context for investigations.

- Compliance procedures rely on audit log immutability.

- Audit log display surfaces must render the 'reason' field (and any free-form admin-authored text) with Handlebars default escaping. Raw HTML rendering (triple-stache, SafeString, or client-side innerHTML) of admin-authored audit content is forbidden.

- The audit log is read through an admin viewer that filters by actor, affected entity, member, date, action type, and category, with actor- and entity-scoped timelines and a self-action filter. Beyond routine debugging and fact-finding, this serves security review: threat-hunting over privileged actions, insider and anomaly detection (an admin acting on their own or a targeted member's record), and incident-response timeline reconstruction with CSV/JSON export.

- Reading or exporting the audit log is itself an audited action (the audit-of-audit), so access to the log is accountable.

- Integrity rests on the application-level append-only triggers and the WORM-protected off-host backups above; cryptographic per-row hash chaining, which would additionally detect direct-database tampering, is a compatible strengthening of this model.

## 2.6 Hashtags and Media

Decision:

Events and clubs must define unique, standardized hashtags. These are validated at creation to prevent collisions. Member-uploaded media tagged with a standard hashtag auto-links to corresponding event/club galleries on page load, leveraging this convention. Users may also invent new hashtags, and these may be discoverable by other members. Also, the \#tutorial hashtag will receive special attention for member-created educational media. The User Stories document provides the rest of the detail for these use cases.

Hashtag-driven coupling extends to freestyle tricks, sets, operators, families, and persons in addition to events and clubs. Trick slugs (e.g. `#ripwalk`) are stored as freeform tags (`tags.is_standard=0`); uniqueness is inherited from `freestyle_tricks.slug PRIMARY KEY` and the no-rename commitment makes the slug a stable canonical identity for life.

A freestyle concept's hashtag form is decided by the *role* it plays, not by its row type. A trick takes the bare token: its slug, its hashtag body (the text after `#`), and its detail-page URL segment are one identical lowercase underscore token (the trick *double leg over* is slug `double_leg_over`, hashtag `#double_leg_over`, page `/freestyle/tricks/double_leg_over`). A non-trick concept takes a role prefix over that same body: a set is `#set_{slug}`, an operator or modifier is `#operator_{slug}`, and a trick family is `#family_{slug}`. The bare-token namespace is reserved for trick-role media — a concept that is only a set or only an operator never takes a bare hashtag. A concept that is genuinely both a performed trick and a set, namely pixie and fairy, carries both forms: the bare `#pixie` for the trick and `#set_pixie` for the set. Membership in that dual-role set is a curator decision, never derived from a row's stored type. Because modifiers and operators are not tricks, their detail page is the operator page, and the trick-detail route redirects a modifier or operator concept there rather than rendering it as a trick.

Person hashtags reuse the member slug. Records have no separate hashtag namespace; record-attributed media is reachable through its parent trick's gallery. No foreign key exists from `media_items` to domain tables; domain coupling is purely tag-based. `tags.standard_type` remains scoped to events and clubs.

Alias hashtags for tricks canonicalize to the parent trick's slug at write time on every curator path (admin UI, seeder, migration script); `tags` and `media_tags` therefore carry canonical slugs only. Read-side surfaces that expose alias slugs (e.g. `/tags/{alias}`) 301-redirect to the canonical slug. `freestyle_trick_aliases` is the single source of truth for the alias-to-canonical mapping.

A trick hashtag and the trick detail page are separate read-side destinations. The plain-English trick name (e.g. *Double Leg Over*) is display text only and is never a link. Two clickable controls sit beside it, each rendering the canonical underscore token: the hashtag (`#double_leg_over`) opens the trick's media gallery when the trick has at least one media item and renders as a plain non-clickable token otherwise (a clickable hashtag is the signal that media exists), and a distinct "Trick Detail" link opens the detail page at `/freestyle/tricks/double_leg_over`. This keeps the gallery path and the detail path as two explicit controls that never collapse onto the name or onto one ambiguous control.

Rationale:

- Unique hashtags provide unambiguous linking between media and entities.

- Member self-tagging leverages community participation.

- Suggested hashtags at creation time guide correct tagging (it is possible to build an auto-fill feature using AJAX as an optional extra usability detail).

- A hashtag token ends at the first non-word character, so a hyphen would split `#double-leg-over` into `#double`; the underscore keeps a multi-word trick one searchable token. Members find media by typing the hashtag, so the slug, the stored media tag, and the hashtag must be the identical underscore token for that search to be uniform.

- A non-trick concept's role marker is a *prefix* (`#set_pixie`), never a suffix (`#pixie_set`). Under the underscore convention a suffix is shape-indistinguishable from a compound-trick token — `#pixie_set` reads the same as a hypothetical trick `#pixie_mirage` — so only a prefix, a fixed closed-vocabulary marker resolved before any slug match, keeps role tags from colliding with trick tags. This reuses the standardized-prefix pattern already used for `#event_*` and `#club_*`.

Trade-offs:

- Hashtag uniqueness validation enforced by database.

- Auto-linking query on every page load adds latency.

- Mis-tagged media won't appear in correct galleries (user education required).

- Underscore URL segments are not the SEO-standard word separator (search engines read a hyphen as a word break and an underscore as a joiner); accepted so the URL segment, the slug, and the searchable hashtag remain one identical token.

Impact:

- Event/club creation validates proposed hashtag uniqueness.

- Media upload accepts multiple freeform tags.

- Gallery page load scans media by hashtag to build display list.

- Popular hashtag views and the Browse page use aggregated hashtag statistics computed by background job.

- Events use `#event_{year}_{event_slug}`.

- Clubs use `#club_{location_slug}`.

- Freestyle non-trick concepts use role prefixes: sets `#set_{slug}`, operators and modifiers `#operator_{slug}`, families `#family_{slug}`; tricks use the bare `#{slug}`.

- Hashtag validation applies to all hashtags (standardized and freeform): maximum 100 characters per tag, must start with '#' character, and may contain letters, numbers, and underscores only after the leading '#'. Validation prevents excessively long tags, script injection, spaces/punctuation, and other disallowed special characters. Tag matching is case-insensitive but original capitalization is preserved for display quality.

## 2.7 Encryption at Rest

Decision:

S3 buckets that hold application data (database snapshots, member-uploaded media, curated media, error pages) use SSE-S3: server-side AES-256 encryption with S3-managed keys. The local SQLite database file on the Lightsail instance is stored unencrypted as an explicit deployment trade-off; mitigations include restricted instance access, least-privilege IAM, OS hardening, and encrypted S3 backups with defined retention.

Rationale:

- The platform's data is community membership data, not financial or regulated records, and card data never touches the platform because Stripe holds it; SSE-S3's AES-256 at-rest encryption meets the protection requirement for this data class.
- The payloads that require strong confidentiality are encrypted above the storage layer and do not depend on S3 encryption: ballots use application-level KMS envelope encryption (§3.7), passwords are argon2id hashes, and operator secrets live in SSM SecureString. S3 object encryption is defense-in-depth for the residual data, not the primary control for any secret.
- A customer-managed KMS key would add an independent decrypt-authorization gate, a per-decrypt CloudTrail trail, and an operator-controlled key-disable switch, but those gains are small in this deployment: the single runtime role needs both S3 read and key decrypt, so the gate does not constrain the primary named threat of a compromised runtime credential or container shell, and per-object audit granularity is diluted once the bucket-key feature needed to control KMS cost is enabled.
- SSE-KMS would add failure modes that work against volunteer-maintainable simplicity: a disabled or misconfigured key takes media rendering and database restore offline, and it interacts poorly with the cross-region replication the backup design relies on, where a key must exist in each region with decrypt and encrypt grants on the replication role and a misconfiguration silently breaks the disaster-recovery copy.

Requirements:

- Every S3 bucket holding application data sets a default-encryption rule that selects SSE-S3 (AES-256), so any object written by any client lands encrypted at rest with no application-side encryption code.
- Public access is blocked on every application-data bucket; object access is granted only to the runtime assumed role and approved administrator principals.
- Customer-managed KMS keys are reserved for the cases that need non-exportable key custody or application-level secrecy: session-JWT signing, ballot encryption (§3.7), and SSM SecureString parameters.

Trade-offs:

- Incident response and decrypt authorization on the S3 buckets rely on S3 access logging, CloudTrail S3 data events where enabled, and IAM plus bucket-policy scoping; the per-decrypt audit trail and operator key-disable containment that a customer-managed KMS key provides are forgone.
- Decrypt authorization is governed by S3 and IAM permissions alone, without a second key-policy gate independent of bucket access.

Impact:

- Terraform sets `apply_server_side_encryption_by_default` with `sse_algorithm = "AES256"` on each application-data bucket; new application-data buckets inherit the SSE-S3 default.
- Cross-region replication of media and snapshots carries no KMS key dependency, keeping the disaster-recovery and restore paths free of key-availability failure modes.
- Local SQLite remains unencrypted on the Lightsail volume; the property the platform relies on is "no plaintext leaves the host", satisfied by the SSE-S3 backups plus host-access controls.

## 2.8 System Member Account

Decision:

The platform maintains a single unauthenticatable system member account, distinguished by `members.is_system=1`, used as the owner of platform-published content. The system-member row is a regular `members` row in every other respect: same render path, same hashtag rules, same gallery rules, same moderation flow. There is no parallel "system content" subsystem.

Rationale:

The platform publishes content not attributable to any individual member, including landing-page demo loops, page illustrations and cartoon images, well-known event photos, freestyle trick reference videos, record clips, and similar curator items. The same ownership construct extends to future categories such as tutorials and historical content. There is no parallel curator subsystem; all curator-attributed media reuses the unified `media_items` family, distinguished from member content only by `uploader_member_id = system_member_id` and the auto-applied `#curated` tag. A regular member account with one distinguishing flag reuses every existing content pathway -- render, search, moderation, hashtag discovery, gallery linkage. A non-member ownership construct would require parallel implementations of all of these for marginal gain.

Single-row enforcement means there is one identity to reason about, not a class of system accounts. Schema-level singularity prevents proliferation of "special" accounts each with custom rules.

Unauthenticatable by data shape: zero credentials. No login flow can produce a session for the system account because no row matches an email-lookup query and there is no password to verify.

The system-member row is brought into existence by operational seeding, not by any web-UI action. The same operational mechanism pre-loads system-account-owned content for go-live. Admin web-UI interaction is required only for post-go-live interactive uploads (see `A_Upload_Curated_Media`). This separation matters: pre-go-live content can be seeded before any admin user exists, and staging reset/rebuild does not require an admin step.

Post-go-live, content the system account owns is written by admins acting on its behalf. Admins log in as themselves; the controller writes `uploader_member_id = system_member`. The admin-actor-of-record is not stored on the resulting `media_items` row, but the audit log records admin actor, timestamp, and affected entity for any subsequent investigation. This matches existing admin-action audit conventions (see `A_Moderate_Media`, `A_Override_Member_Data`).

Requirements:

- Exactly one row in `members` has `is_system=1`. Enforced by partial UNIQUE index on `members(is_system) WHERE is_system=1`.

- The default `display_name` is `Footbag Hacky`. The system-member row is created by operational seeding (`scripts/seed_fh_curator.py`); no admin web-UI action is required to instantiate the row.

- The system-member row has all credential fields NULL (`login_email`, `login_email_normalized`, `password_hash`, `password_changed_at`) and `personal_data_purged_at` NULL. Enforced by a third branch on the members credential CHECK.

- The system-member row is exempt from member-erasure flows; the account-deletion service skips `WHERE is_system=1`.

- The system-member row participates in the same public surfaces as any other member: authenticated member search, its member profile (`/members/{slug}`) and any linked historical-person page (`/history/{personId}`), avatar, and gallery/bookmark ownership on `/media`. No system-account-specific render rule exists.

- Code never references the system account by literal display_name. All lookups go through `is_system=1` or the resolved member id. Display name is mutable via `A_Override_Member_Data`.

Trade-offs:

- The members credential CHECK gains a third branch ("alive without credentials"). The alternative (sentinel email + unrecoverable password hash) leaves more bug surface and does not represent the design intent in the data shape.

- The admin-actor-of-record is not visible on individual `media_items` rows after upload. The audit log is the authoritative record.

- An admin rename of the system account's display_name may break inbound links to the old `/members/{slug}` URL if the slug regenerates. Volunteer-maintainability trade-off: admin reviews slug stability at rename time. This is a member-system property, not specific to the system account.

- The system account appears on the same public surfaces as any member rather than via a special-cased render path. This is intentional: volunteers and visitors do not need to learn a system-account-specific render rule.

Impact:

- New schema: `is_system` column + partial UNIQUE index.

- Members credential CHECK gains a third branch.

- The seeded mascot account (Footbag Hacky) carries `is_system=1` with NULL credentials.

- Account-erasure service includes a single guard skipping `is_system=1`.

- A new admin US (`A_Upload_Curated_Media`) describes the interactive admin act-as upload path.

- Bulk seeding of pre-loaded system-account content (operational tooling) is written against the same ownership construct.

## 2.9 Administrator Role Lifecycle

Decision:

The administrator role on `members.is_admin` is granted through two paths: the steady-state in-app path (`A_Manage_Admin_Role`) and an out-of-band bootstrap path used only at platform inception or after total admin loss. Both paths produce identical per-row DB write and audit shape; they differ in actor identity, source of the target identity, and the environment-specific mechanism that expresses operator intent for the bootstrap path.

Rationale:

- The steady-state path is the lifetime path: an admin selects a member, supplies a reason, the request is gated on Tier 2 / Tier 3 status per `A_Manage_Admin_Role`, and the system writes `is_admin=1` plus an `audit_entries` row with `actor_type='admin'`.

- The bootstrap path covers the chicken-and-egg case: no app UI can produce the initial admins because no admin can authorize them. The grant therefore crosses the role boundary in DEVOPS §3.2: a System Administrator with host or AWS-console access acts on behalf of the system to provision initial Application Administrators.

- Bootstrap expresses operator intent through environment-isolated mechanisms. Dev and staging use a workstation-supplied email allowlist (gitignored on the workstation; injected as `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` by the deploy pipeline) that auto-promotes matching registrations. Production uses a single-shot SSM-stored claim token consumed via an in-app endpoint by an already-registered member. The two mechanisms share no env vars and no code paths beyond the shared service primitive that writes the resulting `is_admin=1` plus Tier 2 grant.

- The audit log is the authoritative grant trail in both cases. Steady-state grants record `actor_type='admin'`; bootstrap grants record `actor_type='system'`. The action_type is mechanism-specific so audits can be partitioned per source: `admin.bootstrap_grant` for the production SSM-token path, and `admin.dev_register_allowlist_grant` for the dev/staging email-allowlist.

Requirements:

- Two grant paths exist: in-app `A_Manage_Admin_Role` (steady state) and out-of-band bootstrap (initial admins only). No third path.

- Both paths write, in one transaction, `is_admin=1` plus an `audit_entries` row plus the `admin-alerts` subscription. They differ on the admin↔Tier 2 prerequisite: bootstrap also writes a `member_tier_grants` row in the same transaction (tier data may not exist on day one), whereas steady-state requires the target to already hold Tier 2 or Tier 3 and therefore writes no tier grant. Bootstrap uses `actor_type='system'` for both the admin flag and the tier grant, with the mechanism-specific action_type described above; steady-state uses `actor_type='admin'`.

- The Tier 2 prerequisite from `A_Manage_Admin_Role` is satisfied as a side effect of every successful grant. Bootstrap does not check Tier 2 as a precondition (tier data may not exist on day one); it writes the Tier 2 row atomically alongside the admin flag. Steady-state checks the prerequisite at request time.

- Every successful grant subscribes the member to the `admin-alerts` mailing list in the same transaction, on both the bootstrap and steady-state paths, so urgent work-queue notifications and stale-item escalations reach every administrator. A steady-state revoke unsubscribes the member from `admin-alerts` and changes none of their other subscriptions.

- Dev and staging bootstrap is an email allowlist matched at registration time. Source: the workstation file `.local/initial-admins.txt` (gitignored), parsed by the deploy pipeline into the `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` env var written to `/srv/footbag/env` on the target host. The env-config layer fails fast at boot if the var is set on a production host, and the deploy pipeline refuses to write the value to a production host. The runtime mechanism lives in `src/dev-bootstrap/runtime.ts`.

- Production bootstrap is a single-shot SSM-stored claim token. Source: `/footbag/production/app/bootstrap/admin_token` as a SecureString parameter, generated and stored by a System Administrator during initial provisioning. A logged-in member submits the token at `/admin/bootstrap-claim`; the endpoint reads the SSM value via `SecretsAdapter`, performs constant-time comparison, writes the `is_admin=1` plus Tier 2 grant plus audit row atomically, then deletes the SSM parameter. The parameter's absence closes the bootstrap; a second claim attempt returns the same response shape regardless of token validity.

- Revocation is steady-state only via `A_Manage_Admin_Role`. There is no bootstrap revocation path.

- The bootstrap mechanism's input is operator-supplied at runtime and is never committed to the repository. Canonical docs, plans, code, and tests refer to the input by role only.

- Admin entitlement implies tier entitlement. Tier predicates (`hasTier1Benefits`, `isTier2Plus`, `isTier3`) short-circuit to `true` when `members.is_admin = 1`, regardless of whether a `member_tier_grants` row exists for that member. The Tier 2 / Tier 3 gate on the grant path is the source of truth for the invariant; the predicate short-circuit makes the invariant explicit at every downstream gate site (curator media operations, member-owned gallery writes, member upload) so an admin acting in their admin capacity is not 403'd by a missing tier-grant row.

Trade-offs:

- Total admin loss requires SysAdmin re-bootstrap rather than self-service recovery. Acceptable because total admin loss is a recovery scenario and the audit-row mitigation is identical to inception.

- Environment-isolated bootstrap mechanisms cost one additional code surface (SSM-token claim endpoint) compared to a single shared mechanism. Acceptable because the alternative is sharing a privileged env-var allowlist across dev/staging/production, where an operator typo or workstation-file leak could land an unintended admin on production.

Impact:

- `A_Manage_Admin_Role` (US §6.6) covers the steady-state grant flow and is enforced in the app.

- Dev/staging bootstrap mechanism is operator-facing; the workstation file and deploy-pipeline plumbing are documented in DEV_ONBOARDING.

- Production bootstrap mechanism is operator-facing; the SSM-token provisioning and claim flow are documented in DEVOPS_GUIDE.md (private GitHub repo).

- The bootstrap grant satisfies the "could be done also by a System Administrator (a developer role not a user role)" clause in US §6.

## 2.10 Member Name Model

Decision:

Registration collects two name fields: `real_name` (full legal name, required) and `display_name` (optional, defaulting to `real_name`). The display name must share a surname with `real_name`, compared after suffix stripping (Jr, Sr, II, III, IV). The display name and its derived slug are permanent post-registration. Imported legacy account rows (`legacy_members`) are exempt from the surname constraint.

Rationale:

- Claim matching and auto-link depend on a reliable surname signal on live accounts; an unconstrained display name would break the primary non-email anchor.
- The community expects real identities on member profiles, while a display name allows preferred forms (diminutives, alternate spellings) without severing the surname link between the two fields.
- Legacy data predates the model; an imported `real_name` is the best-available name from the export and may be a display name or a username. Retrofitting the constraint onto imports would fabricate data.
- A permanent slug keeps inbound links and person-link dispatch stable.

Requirements:

- `real_name` is required: two words minimum, no digits, capitalization normalized on save rather than policed.
- `display_name` is optional and defaults to `real_name`; the shared-surname constraint applies at registration and on every profile edit.
- The slug derives from `display_name` and never changes after registration.
- `legacy_members` rows are exempt; the import preserves names as delivered.
- Member-declared former surnames (stored as declared anchors, always private to the member and admin) extend the surname-matching surface across all claim paths; the variants table covers first-name equivalences only, never surname changes.

Trade-offs:

- A member whose surname legally changed uses the declared-former-surname affordance rather than a divergent display name.
- Suffix-stripping surname extraction is heuristic; unusual compound surnames may need the admin help path during claims.
- Permanent slugs trade rename flexibility for link stability.

Impact:

- Registration and `M_Edit_Profile` enforce the constraint; the user stories own the acceptance criteria and copy.
- Auto-link and claim flows match on the current real-name surname plus declared former surnames.
- Imported rows carry a name-quality asymmetry that claim-candidate surfaces present as-is.

## 2.11 Competition History Fields

Decision:

`members` carries `first_competition_year` (nullable, member-editable, hidden when blank) and `show_competitive_results` (default on), a member-controlled toggle governing whether competitive results render on the member's public profile. The member always sees their own results regardless of the toggle.

Rationale:

- Members deserve agency over the profile presentation of their competitive history without erasing the historical record: the toggle hides the profile section, never the underlying published results.
- "Competing since {year}" gives profiles lightweight historical context; prefilling from a claimed historical person reduces friction while the member's own value always wins.
- An explicit caveat on the results section manages expectations about incomplete historical data.

Requirements:

- `first_competition_year`: nullable; prefilled at claim time from `historical_persons.first_year` via COALESCE (member value wins); editable via `M_Edit_Profile`; clearing it hides the "Competing since" line.
- `show_competitive_results`: default on; collected within the onboarding `personal_details` task; editable via `M_Edit_Profile`; own-profile view always shows results to the owner.
- The results section renders the caveat: "Published event results only. Historical records may be incomplete."
- The toggle governs the member-profile surface only; published results remain on event and history pages per the data-governance policy for the historical record.

Trade-offs:

- Because event pages keep the historical record public, member-facing copy must not promise removal, only profile de-emphasis.
- A self-asserted `first_competition_year` may disagree with the historical record; the profile displays the member's value.

Impact:

- Two columns on `members`; the onboarding `personal_details` task collects both; profile rendering branches on the toggle and on owner-view.

# 3. Security, Authentication, and Sessions

## 3.1 Password Hashing

Decision:

Member passwords are hashed using a modern slow algorithm (argon2id) with a per-user salt and safe cost factor. No server-side pepper is used.

Rationale:

- Slow hash with per-user salt is a well-understood protection against offline attacks.

- For this project's threat model and community scale, the incremental benefit of a pepper does not justify the extra operational complexity and risk (e.g., losing the pepper would invalidate all passwords).

- We already rely on other strong controls: IAM, HTTPS, limited blast radius.

Requirements:

- Submitted passwords are length-capped at 128 bytes before hashing so a multi-megabyte password body cannot drive argon2id into a denial-of-service path.
- argon2id parameters (memory, iterations, parallelism) are pinned in code constants and recorded in the stored hash via a version tag, so older hashes can be re-derived to current cost on next login without ambiguity.
- The hash-algorithm version (`password_hash_version`) is distinct from the session-invalidation counter (`password_version`, §3.2): the former changes only when the hashing parameters or algorithm change, the latter increments on every password reset or change. They are never conflated.

Trade-offs:

- If an attacker obtains the hashed passwords and has sufficient compute, they can attempt offline cracking. This risk is mitigated by strong hashing parameters and general AWS hardening.

- We do not get the extra defense-in-depth layer that a pepper can provide in some partial compromise scenarios.

Impact:

- Member data includes only salted hashes and metadata (e.g., hashVersion).

- Migration to stronger parameters or a different algorithm would be managed via versioning and rehash-on-login logic, not via introducing a pepper.

## 3.2 JWT sessions

Decision:

An authenticated session is represented by a JSON Web Token (JWT) issued at login and at completion of the email-verify, password-reset, and password-change flows. The token travels in the `footbag_session` cookie. Cookie attributes set at issue: `HttpOnly`, `SameSite=Lax`, `Domain=.footbag.org` (chosen to allow co-residency with `archive.footbag.org` per §6.4), `Max-Age=86400` (24 hours, expressed in seconds at the wire; the Express helper passes 86,400,000 ms). The `Secure` attribute is set when `req.secure` is true (which depends on the trust-proxy posture in §3.10) or when the `X-Forwarded-Proto` request header equals `https`. `Secure` is never derived from `NODE_ENV`. No per-session server-side state is maintained; the JWT's RS256 signature, produced by a non-exportable AWS KMS key in production (or a local PEM keypair in dev and test) per §3.5, authenticates the credential on every request.

The system does not support targeted revocation of one JWT while leaving other JWTs for the same member valid. The available revocation operations are:

1. Per-device cookie deletion at logout.
2. Global invalidation of every JWT issued before a password change, via increment of `members.password_version`. The authorization middleware compares `member.password_version` against the JWT's `passwordVersion` claim on every authenticated request; a mismatch rejects the token immediately. The password-change response also re-issues a fresh JWT to the originating browser so the member is not logged out on the device that performed the change.
3. KMS key rotation, which makes every JWT signed with the prior key fail verification once the prior key is disabled.

Three cookie surfaces:

| Cookie | Issuer (code path) | Integrity | Lifetime | Payload |
|---|---|---|---|---|
| `footbag_session` | `issueSessionCookie` in `src/lib/sessionCookie.ts` | RS256 signature; private key in AWS KMS (production) or a local PEM (dev and test), per §3.5 | 24 hours | JWT claims: `sub` (member id), `passwordVersion`, `role` hint, standard `iat`/`exp` (§3.4) |
| `footbag_flash` | `writeFlash` in `src/lib/flashCookie.ts` | HMAC produced by `cookie-parser` using `SESSION_SECRET` as the signing key | 60 seconds | Opaque string in the form `<kind>` or `<kind>:<payload>` (§5.2) |
| CloudFront signed cookie for `archive.footbag.org` | Main app at session issue and at session re-issue (per §6.4) | RSA signature verified by CloudFront against a trusted-signer key group | Equal to the session JWT lifetime, so a single re-issue cycle covers both | CloudFront access policy (resource, expiry) |

The three cookies use three different integrity mechanisms because each protects a different surface: 24 hours of authenticated capability on the main domain (high blast radius if forged, so the signing key is non-exportable HSM-backed RS256), a 60-second one-shot display notice on a single host (low stakes, so a per-host HMAC is sufficient), and edge access control for the archive subdomain (verified inside CloudFront with no origin round-trip, which rules out HMAC and requires public-key verification). The environment variable `SESSION_SECRET`, despite its name, does not sign the session JWT. It is the `cookie-parser` signing key used for any cookie set with the `signed: true` option; the flash cookie (§3.3) is its only consumer.

Rationale:

- No per-session server-side state. A separate session store (Redis, Memcached, or a per-session row in SQLite) would add a stateful component alongside the `members` table, each with its own HA, failover, and backup story. JWT-as-session removes the additional store entirely; the per-request DB read for `passwordVersion` and current-state authorization values is the only stateful work, and it touches the `members` row that is needed anyway.
- One DB read per authenticated request, not two. The JWT's `sub` claim is the member id, so the middleware loads the member row directly. A token-keyed session store would require a second lookup keyed by a random session id.
- Immediate global revocation without a distributed token blacklist. `passwordVersion` is a single integer in the member row; the comparison runs on the same DB read already performed for authorization.
- Role and tier claims, if present, are routing hints only. Authorization queries the current values from the DB row on every authenticated request, so a stale `role: admin` claim in a token issued before a demotion cannot grant admin capability after the demotion lands.

Requirements:

- `Secure` is set when `req.secure || req.headers['x-forwarded-proto'] === 'https'`. The first disjunct depends on the trust-proxy posture in §3.10; the second is the explicit fallback for proxied requests. The flag is never set from `NODE_ENV`. A non-TLS deployment cannot emit the cookie over plain HTTP, and a TLS deployment cannot emit it without the `Secure` attribute.
- Integrity for the session JWT comes from the JWT signature (§3.5). The cookie is not additionally HMAC-signed via `cookie-parser`. `SESSION_SECRET` is reserved for display-state cookies (§3.3); the session JWT does not consume it.

Trade-offs:

- A single JWT cannot be revoked in isolation while other JWTs for the same member remain valid. Revocation is coarse: per-device cookie deletion (logout), global via `passwordVersion` increment, or KMS key rotation.
- The JWT payload ships on every authenticated request, so the payload must stay minimal. A new claim is added only when the value is hot-path (e.g., `passwordVersion`) and cannot be cheaply re-read from the DB.

Impact:

Per-request validation flow (`src/middleware/auth.ts:authMiddleware`):

1. Initialise `req.isAuthenticated = false` and `req.user = null`.
2. Read the `footbag_session` cookie. Absent: return without setting `req.user`; the request proceeds as unauthenticated.
3. Verify the JWT signature against the cached public key from KMS (production) or the local PEM (dev and test). Verification failure: return without setting `req.user`.
4. Load the member row by `claims.sub`. Row missing: return without setting `req.user`.
5. Compare `member.password_version` with `claims.passwordVersion`. Mismatch: return without setting `req.user`.
6. Attach `req.user = { userId, slug, role (derived from member.is_admin), displayName }` and set `req.isAuthenticated = true`.

`req.user` carries identity only. Downstream code that needs current-state authorization values (tier, Active Player status, soft-delete flags) queries the DB on the same request; those values are not duplicated into `req.user`. Active Player status, tier, role, and any future per-member flag take effect on the next request after the underlying DB row changes; no JWT rollover is required.

Alternatives considered:

Server-side session store (Redis, Memcached, or a per-session DB table). Rejected: introduces a second stateful component alongside SQLite, each with its own HA, failover, and backup posture. The single-instance Lightsail topology has no second stateful component and gains an operational class of failures (replication lag, cache eviction, store-vs-DB consistency drift) by introducing one. Immediate global revocation is already covered by the `passwordVersion` mechanism, which does not require a session store.

Opaque session token with a DB lookup keyed by the token. Rejected: doubles the per-request DB read load (token-row lookup, then member-row lookup) with no security improvement over JWT-as-session. The JWT carries `sub` directly, so the token-keyed first lookup is unnecessary.

Long-lived "remember me" cookie alongside the short session JWT. Rejected: a second credential with its own integrity mechanism, its own re-issue path, and its own revocation story doubles the credential surface. A stolen long-lived credential extends the blast radius of every other compromise. Near-expiry JWT re-issue (§3.4) provides the same "stay logged in during active use" behaviour with one credential.

In-memory revocation list (token blacklist). Rejected: requires either a per-instance list that must be pruned on a schedule (memory leak otherwise) or a distributed store (the same central session store this section is designed to avoid). `passwordVersion` provides global revocation as a DB read already on the per-request path.

Custom session token format (non-JWT, e.g. branca, signed JSON). Rejected: would require an in-house verification implementation and an in-house rotation mechanism. JWT plus KMS gives signed-credential semantics with a public-key verification path that does not call KMS per request, and a documented rotation pattern via the `kid` header.

## 3.3 CSRF Protection via SameSite Cookies and Origin Pinning

Decision:

Cross-site request forgery is defended by three layers operating together: `SameSite=Lax` on every cookie the application issues, strict HTTP verb discipline (no state change over GET), and `Origin`-header pinning on every state-changing request enforced by `requireOriginPin` middleware in `src/middleware/requireOriginPin.ts`, mounted before `authMiddleware` so a cross-site POST is rejected at the perimeter before any session work runs. Synchronizer tokens are not used.

Cookie integrity for display-state cookies (the flash cookie defined in §5.2; any future preferences cookie) is provided by `cookie-parser`'s HMAC signed-cookie mechanism, keyed by the environment variable `SESSION_SECRET`. Cookie integrity is a distinct concern from CSRF: CSRF prevents an attacker from causing the victim's browser to submit the victim's cookies cross-site; HMAC integrity prevents the victim (or anyone with access to the cookie jar) from rewriting cookie contents the server will later read back.

Rationale (CSRF, three layers):

- `SameSite=Lax` blocks cross-site state-changing requests at the browser. A form, fetch, or XHR initiated from another origin does not carry the session cookie, so the request lands at the server unauthenticated. Browser support spans Chrome 80+, Firefox 69+, Safari 13+; every browser within the platform's supported baseline.
- HTTP verb discipline (GET handlers are side-effect-free; mutations use POST, PUT, PATCH, or DELETE) closes the cross-site image, link, and redirect vectors. A cross-site `<img src=footbag.org/dangerous>` cannot trigger a state change because GET handlers do not change state.
- `Origin`-header pinning closes the same-site subdomain surface that `SameSite=Lax` does not cover. The session cookie carries `Domain=.footbag.org` (§3.2) so the archive subdomain receives it. `SameSite=Lax` does not isolate same-site subdomain POSTs, so a static malicious form served from `archive.footbag.org`, or a future XSS in legacy archive content, could otherwise issue authenticated POSTs to `footbag.org`. The middleware rejects with 403 any state-changing request whose `Origin` header does not match the canonical `PUBLIC_BASE_URL` origin exactly. The `Origin` header is a forbidden-header-name in the CORS specification: no client-side script can override it via `fetch()` or `XMLHttpRequest`. Browsers send `Origin` on every cross-origin state-changing request and on same-origin state-changing requests as well.

Rationale (cookie integrity):

- A display-state cookie is read back by the server on the next request and its content drives a server-rendered branch (which banner to show, which kind of flash to surface, what payload to display). Without HMAC integrity, the cookie jar (which is writable by the user's browser, by other scripts on the cookie's domain in some configurations, or by anyone with brief physical access to the device) becomes an unsigned input that the server treats as if it had set. An attacker with cookie-jar access could inject a chosen banner, a chosen kind, or a payload that triggers an unintended branch.
- HMAC via `cookie-parser` is sufficient at this scale: per-host secret (`SESSION_SECRET`), single-domain cookie scope, and at most a 60-second forgery window before the cookie expires. KMS-signed JWT integrity (§3.5) is reserved for the session credential, whose forgery would grant 24 hours of authenticated capability and which justifies the KMS round-trip on every session-issue path. KMS round-trips on every banner emit would multiply per-request latency for no comparable security gain.
- The flash cookie's `HttpOnly` attribute plus `SameSite=Lax` scope plus HMAC integrity together make it (a) unreadable to script on any origin, (b) unsendable from any cross-site context, and (c) unwriteable to any value the server did not produce. The receiving GET handler can therefore trust the kind and payload without re-validating who the user is.

Requirements:

- Every cookie the application issues carries `SameSite=Lax`. There is no `SameSite=Strict` or `SameSite=None` cookie in the application's surface.
- GET handlers are strictly side-effect-free. Mutations use POST or another non-safe method; a state change over GET is a defect.
- Every state-changing browser request (POST, PUT, PATCH, DELETE) must carry an `Origin` header matching the canonical `PUBLIC_BASE_URL` origin exactly. A mismatched `Origin` is rejected with 403 by `requireOriginPin`. A missing `Origin` falls back to `Referer` validation against the same origin; a request missing both is rejected with 403. The fallback exists for legitimate user-agent configurations that strip `Origin` but not `Referer`.
- JSON-only routes (webhooks; explicitly-designated JSON-only progressive-enhancement endpoints) additionally enforce `Content-Type: application/json`. This blocks a cross-site HTML form that smuggles JSON via `enctype="text/plain"`, which would otherwise bypass the same-origin check that browsers apply to non-simple Content-Types.
- Server-to-server endpoints that legitimately omit `Origin` (intra-cluster `/ipc/*` shared-secret routes; future webhook routes with their own HMAC authentication) are explicitly exempt from the Origin check. Each exempt route documents its own authentication scheme; the exemption is per-route, not per-prefix.
- Display-state cookies are emitted only through helpers in `src/lib/*Cookie.ts` with `signed: true`. Helpers set the cookie attributes (`httpOnly`, `sameSite`, `secure`, `path`, `maxAge`); controllers and middleware do not hand-roll cookie options. Services do not write or read cookies; flash is an HTTP-layer concern.

Trade-offs:

- Verb discipline must be maintained at the source level: a GET handler that mutates state bypasses the entire defense. Integration tests (`tests/integration/csrf.test.ts`, `tests/integration/csrf.origin-pin.test.ts`) cover the surface; a regression that adds a mutating GET would surface there.
- A small fraction of legitimate user-agents strip both `Origin` and `Referer` (privacy plugins, `file://` pages, certain redirect chains) and cannot submit state-changing forms. Accepted given the protected surface (community site, not a public API).
- The defense does not protect against same-origin XSS on `footbag.org` itself. The Content Security Policy (§3.12), input sanitization (§3.14), and text-sanitization pipeline (§3.15) are the layers responsible for that surface.

Alternatives considered:

Synchronizer tokens (per-form hidden token tied to the session). Rejected: requires every state-changing form to embed a token via the view-model and every state-changing POST handler to validate it. The plumbing crosses the controller-service-template boundary that §1.10 keeps narrow, and adds a per-request DB or session-store lookup to validate the token. `SameSite=Lax` plus Origin pinning covers the same attack class without per-form ceremony and without the additional lookup.

Double-submit cookie pattern. Rejected: the pattern depends on the property that an attacker cannot set a cookie on the target origin. `SameSite=Lax` already guarantees that property at the browser level for every supported user-agent. Adding a second cookie and a server-side comparison adds plumbing for a guarantee already in place at the layer below.

Custom request-header check (e.g. `X-CSRF-Token` set by JavaScript). Rejected: requires JavaScript on every state-changing form, which conflicts with the JS-optional public surface (§4.2). The "no cross-site script can forge this header" property comes from Origin-header pinning without the JS dependency. The wizard, the contact form, and every other form continue to work with JavaScript disabled.

`SameSite=Lax` alone, with no Origin pinning. Rejected: `SameSite=Lax` does not isolate same-site subdomain POSTs. The session cookie is `Domain=.footbag.org` so the archive subdomain receives it (§6.4). A malicious form, future XSS in legacy archive content, or a compromised third-party widget on the archive subdomain would otherwise issue authenticated POSTs to `footbag.org`. Origin pinning closes that subdomain CSRF surface.

KMS signing for display-state cookies. Rejected for the flash cookie: every banner-emitting POST handler would pay a KMS round-trip to sign a 60-second-TTL cookie. The blast radius of a forged 60-second display notice is bounded (one banner on one browser); HMAC via a per-host secret is sufficient. KMS remains required for the session JWT, where the blast radius of forgery is 24 hours of authenticated capability.

Unsigned display-state cookies. Rejected: the receiving GET handler branches its rendered output on the kind and payload values read from the cookie. A user able to rewrite the cookie (via DevTools, a malicious browser extension, or any client-side tampering path) could inject a banner of their choice, a kind value the server did not produce, or a payload that takes an unintended branch in the handler. HMAC integrity rejects any cookie value the server did not produce, including any tampered re-encoded version of a previously valid cookie.

## 3.4 JWT Token Lifecycle and Configuration

Decision:

The session JWT (§3.2) has a 24-hour lifetime (`exp = iat + 86400` seconds). The signing key is an AWS KMS asymmetric RSA-2048 key in production and a local PEM keypair in dev and test (§3.5). The JOSE header carries `alg: RS256` and `kid` (the active signing-key identifier) so the verifier can resolve which key signed each token across rotation overlap windows. The payload carries `sub` (member id), `passwordVersion`, `role`, and the standard `iat` and `exp` claims. The platform does not issue refresh tokens; instead, the authorization middleware re-issues the session JWT in place when the existing token is within 6 hours of expiry, replacing the cookie with a freshly-signed 24-hour token on the same response that performed the check. A token allowed to expire without an intervening authenticated request is not renewed; the next request lands unauthenticated and the user must authenticate again. The session cookie's transport attributes are defined in §3.2 and not restated here.

Rationale (24-hour TTL):

- A 24-hour token is short enough that a stolen credential ages out within a day without operator action, and long enough that a member visiting on consecutive days does not see a login prompt on every visit. The community-site visit pattern (occasional, low session density) does not justify the operational cost of multi-day sessions or the larger blast radius of a stolen credential.
- The TTL must be short enough that the per-request `passwordVersion` lookup remains the primary revocation mechanism. Longer TTLs would let stale tokens accumulate and shift more revocation pressure onto `passwordVersion` resets and KMS key rotation.

Rationale (6-hour refresh trigger):

- Re-issuing on every authenticated request would multiply the KMS `Sign` load by the full authenticated-request volume. Re-issuing only inside the last 6-hour window of the 24-hour TTL caps that load at roughly one re-issue per active session.
- A 6-hour window is large enough that a member returning after a few hours stays logged in, and small enough that a member who stays inactive overnight sees a clean re-authentication on their next visit.
- The trigger is computed from the JWT's `exp` claim against current server time, not from any shared cache or per-instance state.

Rationale (no separate refresh credential):

- A refresh token is itself a credential. Adding one introduces a second integrity mechanism, a second cookie or storage location, a second rotation cadence, and a second revocation path. Each addition is an additional surface for bugs and a longer-lived credential whose theft extends every other compromise. The in-place re-issue achieves the same "active session stays active" outcome with one credential.

Trade-offs:

- A member who returns 24 hours and 1 minute after their last authenticated request is re-prompted. Acceptable for a community site; would not be acceptable for an application with long-running editorial workflows where forced logout discards in-progress work. The platform has no such workflow.
- KMS `Sign` cost scales with re-issue frequency. The 6-hour trigger keeps the cost bounded; tightening the window (e.g., refresh on every request) would defeat the cost-bounding rationale.

Impact:

JWT payload, emitted at sign time:

- `sub`: the member id, matching `members.id`.
- `passwordVersion`: the snapshot of `members.password_version` at sign time. Compared against the live DB value on every authenticated request; mismatch rejects the token (§3.2).
- `role`: `"admin"` if `members.is_admin` is set, otherwise `"member"`. Carried for audit-log readability and template hints. Authorization is read from the DB row on every request, not from this claim.
- `iat`, `exp`: standard JWT timestamps in seconds. `exp = iat + 86400`.

JWT header, emitted at sign time:

- `alg`: `RS256` (RSASSA-PKCS1-v1_5 over SHA-256).
- `kid`: the KMS key id in production; the local key fingerprint in dev and test. Drives public-key resolution at verify time.

Session refresh:

- Trigger: an authenticated request whose JWT satisfies `exp - now < 6 hours` is treated as a refresh candidate.
- Action: the middleware signs a new JWT carrying the current values of `passwordVersion` and `role` read from the same DB row that satisfied the per-request authorization check; sets the cookie via `issueSessionCookie` with a fresh 24-hour `Max-Age`; and proceeds with the request.
- Non-action: an authenticated request whose JWT satisfies `exp - now >= 6 hours` is not refreshed; the existing cookie is left in place.
- Failure mode: an expired token fails the per-request signature/passwordVersion verification (§3.2) before the refresh check runs. There is no "expired-but-refreshable" state; an expired token always lands unauthenticated.

Key rotation:

- The signing key carries a `kid` in every JWT header. The verifier resolves the public key by `kid` from a small in-process cache, populated at startup and on first miss from KMS `GetPublicKey`.
- During a rotation window, two keys are active simultaneously: the new key signs new tokens; the prior key remains in the verifier cache long enough for every token signed with it to expire naturally. After the 24-hour TTL has elapsed from the rotation moment, the prior key is disabled in KMS and removed from the verifier cache. Tokens signed with the prior key after that point fail verification and force re-authentication.
- The verifier never calls KMS `Sign` and never calls `Decrypt`. Only `GetPublicKey` on cache miss. Steady-state verification is in-process RS256 against the cached public key.

Password-change atomicity:

- A password change updates `members.password_hash` and increments `members.password_version` in a single SQLite transaction. The same transaction also writes the password-change audit row.
- After commit, the response re-issues the session JWT (carrying the new `passwordVersion`) to the originating browser. Every other JWT outstanding for that member now carries a stale `passwordVersion` claim and is rejected on its next authenticated request (§3.2).

Alternatives considered:

Longer TTL (7-day or 30-day session). Rejected: extends the blast radius of a stolen credential without a UX gain for the platform's visit pattern. A member visiting weekly already crosses a 7-day boundary; a 30-day TTL adds nothing for that member and lengthens the window during which a stolen cookie is valid.

Separate refresh tokens with a dedicated refresh endpoint. Rejected: a refresh credential is itself a credential, with its own format, cookie, rotation cadence, and revocation path. Each is an additional surface for bugs. A long-lived refresh credential is a longer-blast-radius theft target. In-place re-issue covers the same UX with one credential.

Refresh on every authenticated request. Rejected: multiplies the KMS `Sign` cost by every authenticated page view. The 6-hour trigger bounds the cost at roughly one re-issue per active session and preserves the UX without the per-request KMS load.

Authorization decisions read from JWT claims (no per-request DB read). Rejected: a JWT issued before a tier change, role change, or soft-delete would carry stale authorization values for up to 24 hours. Reading from the DB row on every authenticated request makes role changes, tier changes, and soft-deletes take effect on the next request without waiting for the JWT to roll over.

Stateless JWT with no `passwordVersion` claim. Rejected: a stolen JWT would remain valid for its full 24-hour TTL with no invalidation mechanism short of KMS key rotation (which logs every member out). `passwordVersion` is a per-member invalidation lever that does not require a token blacklist or a global key rotation.

No `kid` in the JWT header (single static signing key). Rejected: key rotation would require a flag day on which every active token is simultaneously invalidated, forcing a mass logout. `kid` is the JWT-standard mechanism for the overlap pattern in which two keys are valid during a rotation window.

## 3.5 JWT Signing with AWS KMS Asymmetric Keys

Decision:

The session JWT (§3.2, §3.4) is signed with `RS256` (RSASSA-PKCS1-v1_5 over SHA-256) using an AWS KMS customer-managed asymmetric RSA-2048 key. Every session-issue and re-issue path calls KMS `Sign` to produce the signature: login, email-verify completion, password-reset completion, password-change response, and the near-expiry refresh defined in §3.4. Verification uses the corresponding public key, fetched from KMS `GetPublicKey` and cached in process for the container's lifetime; a steady-state verification never calls KMS. The JOSE header carries `kid` so the verifier can resolve which key signed each token across rotation overlap windows. The `JwtSigningAdapter` interface (`src/adapters/jwtSigningAdapter.ts`) lets production wire to KMS and dev and test wire to a local PEM keypair; both implementations produce identically-shaped tokens.

Rationale:

- Private key material never leaves the KMS HSM. A container compromise that obtains the runtime AWS credentials can still call KMS `Sign` while those credentials remain valid, but cannot exfiltrate a reusable signing key. Once the runtime credentials are revoked or the KMS key is disabled, the attacker can no longer forge tokens. A symmetric secret shipped to the container (the HS256 alternative below) would survive credential revocation as long as the attacker retained the captured copy and would require key rotation, not credential revocation, to end the forge window.
- Verification is fast and runs entirely in process. The hot path (every authenticated request) does in-process RS256 verification against a cached public key; the KMS round-trip cost is paid only at startup and on key-rotation events. The verify-side cost profile is comparable to HMAC despite the asymmetric algorithm.
- The `kid` header lets the verifier hold multiple valid public keys simultaneously during a rotation overlap window, so a key rotation does not require a flag day and a global logout. This is the same property §3.4 relies on for non-disruptive rotation.

Requirements:

- The KMS key policy grants the runtime IAM role only the specific actions it needs: `kms:Sign`, `kms:GetPublicKey`, and `kms:DescribeKey`. The default `kms:*` allow-root statement is removed from the key policy; root administrative access remains available through account-level IAM, not through the key policy.
- The signing key has a documented rotation cadence. A CloudWatch alarm fires when a key passes its rotation deadline without a successor enabled, so a missed rotation cannot accrue silently.
- The adapter interface is invariant across implementations: `KmsJwtAdapter` (production) and `LocalJwtAdapter` (dev and test) produce JWTs with identical JOSE header shape and identical claim shape. An integration test asserts shape parity (`tests/integration/adapter-parity.test.ts`).
- Startup-time `GetPublicKey` failure fails the container fast (the process exits non-zero before serving requests). After startup, a `GetPublicKey` failure on a `kid` not yet in the cache is logged at error level and the affected verification returns "unauthenticated"; the process does not crash on a single missing-key event.

Trade-offs:

- A compromise of the runtime AWS credentials gives the attacker the ability to call KMS `Sign` for any payload (and therefore to forge a JWT against any member id) for as long as those credentials remain valid. The mitigation is that runtime credentials are short-lived via the assumed-role chain (§3.6), every KMS call is logged in CloudTrail for forensic reconstruction, and credential revocation immediately ends the forge window without requiring key rotation. The non-exportable property prevents the attacker from carrying the signing key off the host.
- KMS key deletion is irreversible and would force a mass re-authentication. AWS gates key deletion behind a 7-to-30-day pending-deletion window, and the rotation-deadline alarm doubles as a "key still exists" canary. An accidentally-deleted key forces every active session to re-authenticate; this is a known cost of the non-exportable property.
- KMS `Sign` is billed per signing operation. The 6-hour refresh window (§3.4) bounds the cost at roughly one re-issue per active session. Very high session turnover would increase KMS spend, but the cost is predictable and easy to model from authenticated-request volume.

Impact:

Adapter contract (`src/adapters/jwtSigningAdapter.ts`):

- `signJwt(claims, header)` returns a serialized JWT. Production: KMS `Sign` with `SigningAlgorithm: RSASSA_PKCS1_V1_5_SHA_256`. Dev and test: in-process RSA signature against the local PEM keypair.
- `verifyJwt(token)` returns the verified claims or `null`. Production: RS256 verification against the cached public key resolved by the token's `kid`. Dev and test: the same RS256 verification against the local public key.
- `getKid()` returns the active signing key's identifier; embedded in every emitted JWT header.

Sign-side call sites (controllers and middleware that issue or re-issue a session JWT):

- `authController.postLogin` (login).
- `authController.getVerify` (email-verify completion).
- `authController.postPasswordReset` (password-reset completion).
- `memberController.postPasswordEdit` (re-issue with the new `passwordVersion`).
- `authMiddleware` (re-issue inside the 6-hour refresh window per §3.4).

Verify-side call sites:

- `authMiddleware` on every authenticated request, against the cached public key.

Startup behaviour:

- At startup the verifier calls `GetPublicKey` for the active `kid` and populates the in-process cache. The container refuses traffic until the cache is populated. Production: the call uses the runtime assumed-role credentials. Dev and test: the local PEM is read from disk at the path named by `JWT_LOCAL_KEYPAIR_PATH`.

Alternatives considered:

HS256 with a symmetric shared secret (e.g. `JWT_SECRET`). Rejected: a symmetric secret shipped to the container is exfiltrated by any container compromise and remains usable to forge tokens indefinitely, even after the compromised container is replaced and its credentials revoked. The forge window for HS256 is bounded by secret-rotation time (operator-driven), not by credential-revocation time (immediate). KMS asymmetric makes the forge window equal to the credential-revocation window.

Local-only RSA keypair on disk in production. Rejected: a host snapshot, backup tarball, or filesystem read by a compromised process recovers the private key. The keypair has no rotation primitive comparable to KMS key disable. The `LocalJwtAdapter` is used in dev and test only, where the threat model is "developer's laptop" and the convenience of file-backed signing outweighs the lower assurance.

Per-request KMS `Verify` (no cached public key). Rejected: every authenticated page view would pay a KMS round-trip plus the network latency to the KMS regional endpoint. Caching the public key in process pays the KMS round-trip once per startup and once per rotation, not once per request.

Envelope encryption (encrypting the JWT payload, not just signing it). Rejected: the JWT payload carries non-sensitive claims (member id, role hint, tier hint, `passwordVersion`, timestamps) and must be readable by the verifier in process. Encryption would require KMS `Decrypt` on every authenticated request, defeating the per-request-KMS-free property and adding nothing the signature does not already provide.

Ephemeral signing keys (a new keypair per process, public key registered with a discovery endpoint). Rejected: would require an in-house service-discovery mechanism for public keys keyed by `kid`, adding a new operational surface. KMS already serves as that discovery mechanism (`GetPublicKey` returns the public key for the given `kid`) without an additional service.

ECDSA (e.g. P-256 with ES256) instead of RSA-2048. Rejected: RSA-2048 with RS256 is the most widely-tooled JWT signing algorithm and is fully supported by AWS KMS. ECDSA would offer smaller signatures at comparable security but at the cost of a less widely-tested verifier path and a less standard JWT shape. No operational driver to prefer the smaller signature.

In-house JWT signing (not via the `JwtSigningAdapter`). Rejected: production-versus-dev parity (per §5.3) requires a single interface with two implementations. Inlining the KMS calls into controllers would duplicate JWT shape logic and would prevent the local-PEM dev path that keeps dev and test running without AWS credentials.

## 3.6 Secrets Management via AWS Parameter Store

Decision:

Sensitive credentials (e.g., Stripe API keys, Stripe webhook secret, administrative bootstrap tokens) are stored in AWS SSM Parameter Store as SecureString parameters and retrieved at container startup via SecretsAdapter. Cryptographic operations that must not allow key exfiltration use AWS KMS (JWT signing and ballot encryption). No secrets are stored in source code, Dockerfiles, committed environment files, or version control.

In production, the workload reads Parameter Store by using the runtime assumed role. The host-level source credential/config material used to assume that role is root-owned and is not the authoritative runtime principal.

Rationale:

- Lightsail has no EC2 instance profile. Parameter Store reads require activating an AWS runtime credential path (long-lived IAM-user keys in `/root/.aws/credentials` (root-owned, 0600) used as a source profile to assume the runtime role, or SSM Hybrid Activation); on EC2 an instance profile handles this automatically. The host env file `/srv/footbag/env` carries only the runtime profile name (`AWS_PROFILE`) and other non-secret config, never the access keys themselves. The Lightsail credential-path cost is accepted for secrets where rotation-without-redeploy or multi-consumer access justifies it.
- Encryption at rest via AWS-managed KMS keys (transparent to application).
- IAM access control with a least-privilege runtime assumed role.
- Parameter versioning enables rollback and controlled rotation.
- Simple API (GetParameter) with values cached in memory after retrieval.
- AWS-native service (no additional infrastructure to maintain).

Threat Model Clarification: Parameter Store does not protect against an attacker who gains shell access inside the production container while usable runtime AWS credentials are available to that container. An attacker in the container can call SSM GetParameter for any SecureString values allowed to the runtime assumed role. For secrets that must remain non-exportable even under container compromise, the system uses KMS/HSM-backed keys (non-exportable asymmetric signing keys) and IAM separation (normal web runtime cannot decrypt ballots).

Mitigations against the in-container threat:

- IAM least privilege: the runtime assumed role holds `ssm:GetParameter` (read-only) on `${ssm_prefix}/*`; no `ssm:PutParameter`, `ssm:DeleteParameter`, or cross-environment scope. A compromised runtime can read but cannot tamper with stored values, and cannot reach another environment's namespace.
- IAM separation by capability: the ballot tally path runs under a distinct role with `kms:Decrypt` on the ballot CMK; the normal web runtime role does not. A compromised web runtime cannot decrypt cast ballots even with full SSM access.
- KMS at rest: every SecureString parameter is KMS-encrypted at rest under the environment's CMK. The runtime needs `kms:Decrypt` on that CMK to use the parameter; revoking the role's KMS access is sufficient to instantly invalidate stored-secret reads platform-wide.
- CloudTrail audit: SSM `GetParameter` calls on `${ssm_prefix}/secrets/*` are recorded in CloudTrail. Unusual access patterns (volume spikes, off-hours reads, non-runtime principals) are alarmable per the monitoring policy.
- Rotation as the recovery primitive: each operator-supplied SSM secret has a documented rotation runbook in DEVOPS_GUIDE.md (private GitHub repo) that stamps a new version and bounces the runtime to invalidate the in-process cache. Post-incident, the operator rotates the secret at the third party (Stripe Console, Google Cloud Console, etc.); the previously-leaked value stops working at the third party regardless of who still holds it.
- Process-memory exposure window: the live SecretsAdapter caches resolved values for the life of the process. A container restart drops the cache. Rotation runbooks include a restart or redeploy step so the new value is in effect within minutes.
- Operator-CLI hygiene: `aws ssm put-parameter` calls use the `--value file://` pattern so the literal secret never lands in shell history, process listings, or terminal scrollback.

Implementation: Parameter paths are organized by environment (`/footbag/production/`, `/footbag/staging/`, `/footbag/development/`).

In development, the secret-source split mirrors production. Env-var secrets (`SESSION_SECRET`, host runtime config) load from a gitignored `.env` file at the repo root via `dotenv`; a committed `.env.example` template enumerates expected keys with placeholder values (the literal substring `changeme` is reserved for placeholder text and is rejected by production startup guards on `SESSION_SECRET`). Parameter-Store-class secrets (Stripe keys, Safe Browsing API key, admin bootstrap tokens) load through `SecretsAdapter` in local mode, which reads a gitignored `.local/secrets.json` co-located with other operator-local files. Per-host operational secrets like `SESSION_SECRET` live in `/srv/footbag/env` on the production host (root:root 0600).

Secrets are fetched once at container startup via SecretsAdapter (SSM GetParameter in production, local JSON file in development). SecretsAdapter is a Node module; only Node consumers (web, worker, image worker, tests) read through it. Non-Node consumers (nginx config rendering, CloudFront origin-request injection) read SSM-stored values via a deploy-time env-file mirror written by the deploy remote-half rather than at runtime via the adapter. `X_ORIGIN_VERIFY_SECRET` is the canonical example of the mirror path: CloudFront reads it via the Terraform `data.aws_ssm_parameter` lookup at apply time, nginx reads it from `/srv/footbag/env` via the docker entrypoint shim at container startup, and no Node code path consumes it.

Parameter Store contains:

- Stripe API keys (test/live by environment).
- Stripe webhook secret (HMAC verification).
- Email delivery configuration (if any), admin bootstrap tokens, and other exportable credentials and configuration that must not be committed to source control.

Per-host application secrets that are environment-unique and rotation-on-restart-acceptable may live directly in the host env file `/srv/footbag/env` (root:root 0600) rather than in Parameter Store. `SESSION_SECRET` is the canonical example: it is generated fresh per environment, never reused across staging and production, and rotated by editing the host env file and restarting the service. The application and the deploy script both reject any value containing the literal placeholder substring `changeme` or shorter than 32 characters. Rotation runbook: DEVOPS_GUIDE.md (private GitHub repo), "SESSION_SECRET rotation runbook".

KMS is used for:

- JWT signing (`kms:Sign`, `kms:GetPublicKey`) – no JWT signing secret is stored in Parameter Store.
- Ballot envelope encryption (`kms:GenerateDataKey`, `kms:Decrypt` in tally role only) – no ballot master key is stored in Parameter Store.

Requirements:

- Operator commands that pass secret values on the CLI (e.g. `aws ssm put-parameter --type SecureString`) use a shell-history-safe pattern: `--value file://path-to-tempfile` or `--cli-input-json file://...`, not a literal `--value <secret>` argument that lands in `~/.bash_history` and process listings.
- `INTERNAL_EVENT_SECRET` is required in every environment that accepts image-worker callbacks (or any other internal-origin webhook), not only when storage mode is S3. The shared-secret gate is a property of the callback channel, not of the storage backend.

Trade-offs:

- Manual rotation vs automatic (acceptable for a small number of secrets).
- AWS lock-in for secrets (acceptable given AWS infrastructure commitment).
- Runtime secret access now depends on explicit host bootstrap and runtime credential wiring on Lightsail.
- A compromised runtime container can exfiltrate any SecureString value the runtime role can read, for as long as the temporary credentials remain valid. This is the residual risk that drives the KMS-for-cryptographic-keys and IAM-separation-for-ballots designs above; for third-party API keys (Stripe, Safe Browsing, GitHub OAuth, etc.) the residual risk is accepted because the keys must traverse to the third party as cleartext at API-call time anyway. Mitigation is rotation-after-incident, not stronger-encryption-at-rest.

Impact:

- SecretsAdapter abstracts Parameter Store in production and local JSON file in development.
- Cryptographic signing/encryption paths depend on KMS-backed adapters (`JwtSigningAdapter` for sessions today; `BallotEncryptionAdapter` for envelope encryption when ballots land), not Parameter Store.
- CloudTrail/CloudWatch monitoring should watch for unusual Parameter Store access patterns and KMS error rates.
- Parameter Store secrets rotate through new parameter version + controlled container restart / redeploy.
- KMS keys rotate through an explicit key-rotation procedure (update kid/public key cache; deploy archive verifier update if applicable).


## 3.7 Ballot Encryption with AWS KMS

Decision:

Ballots are submitted as plaintext over HTTPS and then encrypted on the server before persistence. For each ballot, the server requests a fresh data key from AWS KMS (GenerateDataKey) under a dedicated KMS CMK. The plaintext data key is used immediately to encrypt the ballot payload using AES-256-GCM and is not persisted. The encrypted data key (CiphertextBlob) is stored alongside the ballot ciphertext.

Ballots at rest consist only of: ciphertext, nonce (IV), authentication tag, encrypted data key, KMS key ID, and minimal metadata (election ID, member ID reference, timestamps). No plaintext ballot contents are persisted.

Decryption is performed only during controlled tally operations, using a separate privileged role that has kms:Decrypt permission. The normal web application runtime assumed role does not have `kms:Decrypt` and therefore cannot decrypt stored ballots, even if the container is compromised. Every ballot decryption is audit logged per the audit logging decisions.

Rationale:

- Envelope encryption removes the need to store an exportable symmetric ballot key in Parameter Store.

- KMS key material is non-exportable and protected by AWS-managed HSMs.

- IAM separation limits blast radius: the public web runtime can encrypt ballots but cannot decrypt them.

- AES-256-GCM provides confidentiality and integrity with a well-reviewed, standard construction.

Trade-offs:

- Requires KMS availability for ballot creation (GenerateDataKey) and for tally operations (Decrypt).

- Adds operational complexity: separate IAM roles and a controlled execution path for tallying.

- Per-ballot encrypted data keys slightly increase stored ballot size and code complexity.

Impact:

- Ballot schema adds encryptedDataKey and kmsKeyId fields.

- VotingService encrypts ballots using `BallotEncryptionAdapter.generateDataKey` (KMS-backed in production; locally-keyed in dev/test) + AES-256-GCM; no ballot key retrieved from Parameter Store.

- Tally operations run under a privileged admin/tally role with kms:Decrypt permission and are exposed only through explicit admin flows.

- AuditLogService records every decrypt operation (who/when/why) without logging plaintext.

- Ballot non-anonymity is by design: `ballots.voter_member_id` is stored in plaintext alongside the encrypted ballot, so the participation fact (who voted) is intentionally not anonymous, while the ballot content stays confidential under AES-256-GCM.

Receipt Token Handling: Each accepted ballot generates a cryptographic receipt token that allows the voter to later confirm their ballot was included in the tally. The receipt mechanism follows the hash-before-storage pattern.

- The server generates a cryptographically random UUID v4 receipt token using crypto.randomUUID().

- The raw token is emailed to the member's verified address immediately after the ballot is accepted.

- The server stores SHA-256(token) in ballots.receipt_token_hash alongside the encrypted ballot. The raw token is never written to the database.

- receipt_token_hash_version supports future algorithm migration without re-issuing tokens.

Verification (M_Verify_Vote_And_View_Results): the member submits their raw token via the verification page; the server computes SHA-256(submitted) and queries WHERE vote_id = ? AND receipt_token_hash = ?. A row match confirms participation without revealing vote content. No rate-limiting is required because the token has 122 bits of entropy and is not linked to any member-enumerable identifier.

The receipt token is distinct from ballot *content*. "No plaintext ballot contents are persisted" (above) refers to vote selections; receipt tokens are participation metadata, not selections, and are handled separately under this hashing scheme.

Export: because the raw token is never persisted, the GDPR data export (M_Download_Data) cannot include it. The export includes vote participation metadata (vote ID, title, submission timestamp) with a note that receipt verification requires the original email.

## 3.8 Account Security Tokens

Decision:

Email verification tokens, password reset tokens, personal data export download-link tokens, and legacy account claim tokens are cryptographically random, single-use tokens, not JWTs. Tokens are generated with crypto.randomBytes(32) providing 256 bits of cryptographic randomness, encoded for URLs, and hashed before storage using SHA-256 so that the database never stores a usable raw token. This prevents account takeover if the database is compromised.

Semantics:

- Email verification token TTL: 24 hours.

- Password reset token TTL: one hour.

- Legacy account claim token TTL: 24 hours (configurable via `account_claim_expiry_hours`). The claim token carries a dual binding: `member_id` (the requesting authenticated account) and `target_legacy_member_id` (the `legacy_members` row being claimed). A claim token may only be consumed while authenticated as the same `member_id` that initiated the request; consuming while authenticated as a different account is rejected. `target_legacy_member_id` uses `ON DELETE NO ACTION`; `legacy_members` rows are never deleted in normal flow (they are marked claimed, not removed, per the three-table design).

- Tokens are single-use: on successful consumption, the token record is marked consumed (timestamp) and cannot be reused.

- Multiple outstanding tokens are allowed, but consumption invalidates only the consumed token; rate limiting prevents spam.

- Rate limiting: Password reset requests limited to five per email per hour, applied regardless of whether email exists in system to prevent enumeration attacks. Claim initiation and resend are rate-limited per requesting account, per target imported row, and per session/IP to prevent abuse of legacy mailboxes and limit side-channel enumeration.

- Rate limiting is in-process only; state is not persisted and resets on restart (acceptable for single-instance deployment).

Storage format: Store token_hash, member_id, token_type (email_verify, password_reset, data_export, account_claim), target_legacy_member_id (nullable; account_claim only), created_at, expires_at, used_at (nullable). Index on token_hash (unique) and on expires_at for cleanup.

Validation: A presented token is hashed and compared to stored hashes; validation requires used_at IS NULL and now \< expires_at. If hashes match and token is not expired or consumed, verification succeeds. Otherwise, verification fails with a generic error message that does not reveal whether the token was invalid, expired, or already used.

Cleanup: A background cleanup job runs daily to delete expired or consumed token rows (tokens older than 7 days).

Requirements:

- URL-path redaction in request logs covers every token-bearing route (email-verify, password-reset, data-export, account-claim, and any future token-in-path additions). The redactor is a single helper module, and any new token-in-path route registers its pattern with the helper so logs cannot leak a usable token via path emission.

Impact: Token generation/validation logic is centralized in the `identityAccessService` helper to avoid copy/paste drift across flows (verification, reset, onboarding).

## 3.9 Security, Privacy, and Historical Record Governance

Decision:

Privacy is part of the platform's security model. Current member data, discoverability, contactability, exports, rosters, participant lists, and imported historical identities must be governed by explicit visibility rules.

The platform preserves and publicly exposes official footbag history, including public event results, year archives, permanent honors such as Hall of Fame and Big Add Posse, and other explicitly approved historical-record surfaces such as world records.

Public historical discoverability does not authorize a public current-member directory, public current-member search, public current-member profiles, or public contact discovery.

Imported historical people and result-linked identities may appear publicly only as historical-record surfaces. They do not thereby become activated members, profile owners, searchable current members, or publicly contactable accounts.

Any public or member-visible data surface must follow privacy-by-design and data-minimization rules. Contact fields, roster visibility, participant visibility, exports, and discoverability must be scoped to the minimum audience required for the product use case.

Visibility taxonomy; the platform uses five Sensitivities:

1. **Public official historical record**; official event results, year archives, HoF/BAP honors, world records, minimal historical-person pages needed to make public results intelligible.
2. **Authenticated current-member lookup**; logged-in-only search for current members; anti-enumeration; non-directory; minimal result fields.
3. **Role-scoped operational surfaces**; organizer participant management, club-leader rosters, workflow exports; scoped to role.
4. **Internal/admin only**; full member history, remediation/audit workflows, broad exports, identity resolution.
5. **Archived member-only legacy**; immutable old archive; authenticated only; no search; no public indexing.

Implementation note; derived statistics and incomplete historical data:

Official result facts, honor rolls, and approved record tables are primary historical sources. Derived statistics are secondary editorial outputs and must not be treated as canonical merely because data fields exist in storage. The platform must not publish misleading or false-precision historical statistics from incomplete datasets. Public or member-visible stats are justified only when they are useful and interesting for historians of footbag or clearly valuable to the community's official historical record, and either (a) the underlying source scope is sufficiently complete for the claim being made, or (b) the UI presents clear caveats about scope, missing data, and interpretation limits. Where those conditions are not met, the platform must prefer raw official results, honors, and record listings over aggregate summaries.

Two distinct risks apply to incomplete historical statistics. **Statistical accuracy risk:** misleading or uncaveated aggregates make false claims about real people's competitive records. **Privacy pressure risk:** misleading aggregates create pressure to over-link person-level identities to fill data holes, driving the system toward overexposure of person-level data. Both risks share the same policy response (caveat clearly or suppress) but are separate failure modes.

No auth-bypass toggles: environment variables must not gate route-level authorization behavior. Auth is either fully stubbed (with the stub designed to mirror the real path) or real. Boolean env toggles that change what content is served are not allowed.

Legacy migration security rules:

- Legacy passwords are never imported, stored, or used.
- `legacy_email` is migration metadata, not a login credential. When a member's claim rests on a declared old email — asserting they controlled an address a legacy account carried — that email confirms the claim only after the member proves control of it through a mailbox-control round-trip (recording the `mailbox_control_via_link_click` evidence tier); a claim resting on a name or surname anchor does not require it.
- Auto-link sends no notification emails. The wizard's confirmation card (post-stage, at first sign-in) is the only post-link member-facing surface. Effects (tier upgrade, attribution, badges) apply only after the member explicitly confirms.
- Member-confirmation of a wizard card whose evidence is a name or surname anchor is sufficient proof for a claim to take effect; a card whose evidence is a declared old email additionally requires the mailbox-control round-trip. The audit row carries an evidence-strength tag (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`, `admin_vetted_evidence`); the tag is surfaced to an admin reviewing a disputed claim.
- Member-declared identity anchors (former surnames, declared old emails) are always private: visible only to the member themselves and to admin. They participate in claim matching but never appear on public surfaces, member search, or any cross-member listing.
- Production has no admin email-skip; admins requiring manual recovery use the member-initiated admin help request flow (`A_Review_Member_Link_Help_Requests`) with full audit trail and access controls. A name-anchored legacy claim takes effect on wizard-card confirmation without any email round-trip (a claim resting on a declared old email requires the round-trip, per `M_Claim_Legacy_Account`), so a stub `legacy_members` row with no `legacy_email` remains claimable through the historical-person card-confirm path. The dev/staging-only `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` allowlist is the peer mechanism for the bootstrap path described in §2.9: when a registrant's email matches, the unified handler writes `is_admin=1` plus the Tier 2 grant plus the audit rows atomically, so the admin↔Tier 2 invariant holds by construction. The var carries a boot-time fail-fast guard and refuses to start in production (it is permitted in development and staging); the runtime mechanism lives in `src/dev-bootstrap/runtime.ts`.
- Imported `legacy_members` rows cannot log in, are not searchable, and do not receive any member communications.
- **Surname matching across claim paths.** Both the wizard-confirmed candidate flow and the direct historical-record claim path match against the member's current real-name surname OR any declared former surname (see member-declared anchors above). A member whose legal name changed between their legacy identity and current account declares the former surname in the legacy-claim task (reached from their profile) or at signup; the claim path then resolves normally. Surname mismatches that the platform cannot resolve through declared anchors route to the member-initiated admin help request.
- **Cookie domain widening (`Domain=.footbag.org`).** The session cookie is widened to the apex so the `archive.footbag.org` subdomain receives it. That archive is the platform's own static mirror served over HTTPS by its dedicated CloudFront distribution (§6.4); no other `.footbag.org` host receives the cookie, so there is no cleartext-leak exposure on a third-party subdomain. The CSRF Origin-pin middleware (§3.3) is the cross-subdomain defense against a malicious form on the archive subdomain.
- **Historical-person claim races are resolved by partial UNIQUE index + service-layer error mapping.** Concurrent claims to the same `historical_persons` row both pass the in-controller "already claimed" check; the partial UNIQUE index `ux_members_historical_person_id` catches the loser at insert. The service wraps the SQLite `SQLITE_CONSTRAINT_UNIQUE` exception in `ConflictError` so the controller renders the same user-readable "already claimed by another member" 422 it renders on the synchronous check path. Raw SQL errors must not leak to the response.

Rationale:

The platform handles real people's competitive history, identity, and contact information. Privacy violations in this domain carry reputational and potentially legal consequences. Treating privacy as part of the security model ensures that visibility rules are enforced at architecture boundaries rather than applied inconsistently across features.

Public historical records are legitimate and required: the footbag community's history belongs to the community. But historical discoverability is categorically different from current-member discoverability. The platform must maintain that distinction explicitly in both code and docs.

For normative policy detail, implementation rules, and reference tables, see `docs/DATA_GOVERNANCE.md`.

Requirements:

- Historical-pipeline outputs that feed the database carry no member email addresses. Email addresses arrive only via member self-claim. The pipeline's intermediate artifacts and committed CSVs are scrubbed of email columns before they enter the working tree. If a pipeline output reaches the working tree containing email PII, the leak is purged from history (filter-repo, force-push, GitHub Support cache invalidation) before any public exposure.
- A working GDPR Article 17 erasure path exists pre-launch covering the primary database, any read replicas, backup snapshots (via the erasure log re-application from §1.2), and any search or derived-stat indices. Erasure that fails on any of those surfaces is a launch-blocker.
- Anonymization tooling for production-data sharing exists and is documented. Production data is not shared with developers, support contractors, or external auditors without first running the anonymization tool against the snapshot. Sharing a raw production export is not a permitted operator path.

## 3.10 Trust-proxy strategy

Decision:

Express's `trust proxy` setting is environment-variable driven via `TRUST_PROXY` in `/srv/footbag/env`. Each host sets the exact integer hop count of the proxy chain between the client and Express, so `req.ip` resolves to the true client address, which per-IP rate limiting keys on. Under the clean DNS cutover the chain is CloudFront edge then nginx, so both production and staging run 2; there is no legacy front-door hop. When `TRUST_PROXY` is unset, production falls back to the named-range string `'loopback, linklocal, uniquelocal'`; the boolean `true` form is rejected.

Rationale:

- `X-Forwarded-For` is multi-entry: each hop appends its peer's address, so nginx appends CloudFront's public edge IP. A named-range walk (loopback, link-local, RFC1918) trusts nginx's docker-bridge entry and stops at that first public address, so `req.ip` resolves to the edge IP and every visitor behind one edge shares a rate-limit bucket. Only an exact hop count walks past the operated proxies and lands on the true client entry.
- The fallback degrades fail-closed: a missing or non-integer value yields coarse per-edge rate-limit buckets, never a spoofable trust walk and never a boot refusal. Boot-level enforcement would buy precision at the price of an operational trap on a hand-maintained host file.
- The boolean `true` form trusts every peer, which would honor a spoofed `X-Forwarded-For` from any direct caller if origin enforcement ever fails open.

Requirements:

- Hosts set the integer in `/srv/footbag/env`; `docker-compose.prod.yml` passes it through with the named-range string as the fallback default. The dev compose defaults to 1 (nginx only).
- `scripts/verify-staging-env.sh` warns (advisory, non-fatal) when the value is missing or non-integer.
- The count changes only when the proxy chain changes. Under the clean DNS cutover the chain is CloudFront then nginx at go-live and at every later milestone, so the count stays 2; any future chain change carries a deploy-checklist line updating the integer.
- Trust-proxy tests exercise the compiled trust function with crafted multi-entry XFF chains, pinning: correct count resolves the real client; named ranges resolve the edge address (the coarse-bucket fallback); a count larger than the chain hands `req.ip` control to the viewer (why the count drops when a hop retires).

Trade-offs:

- A count larger than the real chain lets a client prepend forged XFF entries and choose its `req.ip`; a count smaller resolves to an intermediate hop. The advisory check and the deploy-checklist line exist because the integer tracks topology by hand.
- An unset value silently coarsens per-IP rate limiting to per-edge buckets rather than failing loudly; the advisory check is the detection surface.

Impact:

- Auth and rate-limit middleware key on `req.ip`; trust-proxy correctness directly bounds the brute-force surface.
- Login rate limiting partitions on `req.ip`; under the named-range fallback all traffic behind one CloudFront edge shares a bucket, which is why hosts set the exact count.

## 3.11 Origin-verify shared-secret gate

Decision:

CloudFront injects an `X-Origin-Verify` header on every origin request. The value is a 64-character lowercase hex shared secret stored in SSM (`/footbag/{env}/secrets/origin_verify_secret`, `SecureString`, KMS-encrypted) and generated by the `random_id.origin_verify_secret` Terraform resource. nginx returns 444 (silent close) on any direct-to-origin request whose header is missing or wrong. The host's `/srv/footbag/env` mirror of the secret is rewritten by the deploy remote-half on every deploy from the canonical SSM value.

Rationale:

- The Lightsail static IP and origin DNS hostname are publicly resolvable; CloudFront is not the only network path to nginx. Without an authentication signal at the origin, an attacker who reaches port 80 can bypass CloudFront's security and reach Express directly.
- A shared secret in a private header is operationally simpler than mTLS or signed-request schemes for a single-CDN single-origin topology. CloudFront natively supports `custom_header` injection; nginx natively supports `if ($http_*)` matching.
- Terraform-managed value (`random_id.hex` referenced directly, no `lifecycle.ignore_changes`) closes the bootstrap-placeholder window where a hand-typed `"TODO-..."` placeholder would otherwise be publicly committed and live in CloudFront until the operator manually rotates.

Requirements:

- Secret format is exactly `^[0-9a-f]{64}$`. The nginx render shim (`docker/nginx/40-render-nginx-conf.sh`) shape-validates before substituting; mismatch fails container startup before the gate is rendered.
- Rotation is `terraform apply -replace=random_id.origin_verify_secret` followed by a deploy. Manual `aws ssm put-parameter --overwrite` is not the canonical path because Terraform reverts it on next apply.
- The deploy remote-half re-fetches SSM on every deploy and atomically rewrites the env-file line so a Terraform-driven rotation propagates without an operator step.

Trade-offs:

- A leaked secret bypasses the gate until rotated. Mitigation: the secret is one of three perimeter layers; the Lightsail port-80 CloudFront-prefix-list firewall and the trust-proxy named-range trust set are the others. Belt-and-suspenders, not single-point-of-failure.
- A 30-to-90-second window exists during rotation where CloudFront sends the new secret and nginx still expects the old (every CloudFront request returns 444). Acceptable for an infrequent per-environment rotation; the rotation runbook (DEVOPS_GUIDE.md (private GitHub repo), "Origin-verify shared-secret rotation runbook") sequences the two commands adjacent.

Impact:

- nginx is the enforcement point; Express is unaware of `X-Origin-Verify`.
- DEVOPS_GUIDE.md (private GitHub repo) holds the rotation runbook ("Origin-verify shared-secret rotation runbook").
- The secret never appears as a literal string in committed code or docs.

## 3.12 Security header layering

Decision:

Helmet middleware in Express (`src/app.ts`) is the single source of every security response header (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, Origin-Agent-Cluster, X-Powered-By removal, and CSP). nginx and CloudFront add no security headers; nginx-config templates do not introduce `add_header` lines.

Rationale:

- Single source of truth: headers live next to the code that knows whether the response is HTML, JSON, or an asset, and whether the user is authenticated.
- Per-response variation (e.g. `Cache-Control: private, no-store` for authenticated responses) is naturally expressed as middleware, not as CDN/proxy config.
- nginx and CloudFront layers stay focused on routing, caching, and origin authentication, not on response content shape.

Requirements:

- Integration tests assert the helmet header set on a representative public route and a health route (`tests/integration/security-headers.test.ts`).
- HSTS preload is conditional on the custom domain landing; with the CloudFront default URL as the public host, preload is off because the `*.cloudfront.net` domain is not eligible for the HSTS preload list.
- Authenticated responses are served without `Content-Encoding: gzip` or `br`. Compression of bodies that mix attacker-controlled and secret content is the BREACH side channel; the authenticated middleware path disables compression rather than relying on per-route discipline.

Trade-offs:

- Multiple application services would each need to import the same helmet config; mitigated by keeping the config in a single module.
- CDN-cached static assets bypass Express and do not carry Express-set headers; static-asset cache behavior must be reviewed when CDN config changes.

Impact:

- Adding a new security header is a code change in `src/app.ts`, not a CDN or nginx config change.
- Reviewing nginx-template changes includes a check that no `add_header` directive has been introduced.

## 3.13 Host header pinning at nginx

Decision:

nginx pins the upstream `Host` header to a configured canonical value via `proxy_set_header Host ${PUBLIC_HOST}` in both location blocks (`/health/` and `/`). `PUBLIC_HOST` is rendered by `docker/nginx/40-render-nginx-conf.sh` from `PUBLIC_BASE_URL`. Express therefore always sees the canonical hostname on `req.hostname`, regardless of which domain the viewer used.

Rationale:

- The threat is Host-header injection: a viewer-supplied `Host` flowing into code that builds absolute URLs from `req.hostname` (canonical case: password-reset email links). Pinning at nginx normalizes the value at the perimeter so downstream code is structurally safe, not enforcement-dependent.
- A CloudFront distribution legitimately serves traffic on multiple hostnames (custom CNAME, the default `*.cloudfront.net` domain, future aliases). An allowlist that enumerates accepted hosts is fragile across topology changes; pinning is invariant.
- nginx already speaks HTTP host conventions and owns the upstream proxy contract. Pushing the policy down to Express duplicates a perimeter concern.

Requirements:

- nginx container receives `PUBLIC_BASE_URL` via compose env (`docker/docker-compose.prod.yml` fail-fast `:?`; `docker/docker-compose.yml` defaults to `http://localhost`).
- `40-render-nginx-conf.sh` derives `PUBLIC_HOST` from `PUBLIC_BASE_URL` (strips scheme, port, path), validates the result as `[a-z0-9.-]+`, and substitutes via sed into both `proxy_set_header Host` directives.
- `PUBLIC_BASE_URL` is the same canonical-host source the app reads via `config.publicBaseUrl`, so nginx and Express agree by construction.
- The production `server` block lists the canonical hostnames in `server_name` explicitly. The catch-all `_` virtualhost is not used in production; an unrecognized `Host` header reaches the default-deny path rather than the application.

Trade-offs:

- Policy lives in nginx config, not unit-testable TypeScript. Rendered output is verifiable via the shim's dry-run path.
- Multi-domain support (e.g. www. + apex on the same origin) requires per-server-block nginx routing rather than a single `PUBLIC_HOST`. Not needed today; defer.

Impact:

- `req.hostname` is always the canonical value. Password-reset, email-verify, and canonical-redirect URL builders can use it directly without external Host-header validation.
- Viewer-supplied `Host` (via the CDN default domain or any alias mapped to this distribution) is normalized at the perimeter, not rejected.

## 3.14 Input Validation Strategy

Decision:

All incoming request data is validated at the controller boundary before reaching services. A schema-validation library (Zod or equivalent) defines the input contract for each route: required fields, type correctness, allowed value ranges, string lengths, format patterns. Validation failures return HTTP 422 with field-level error details (JSON for API clients, HTML form re-render with inline messages for browser submissions). Excessively long inputs are capped at 10x the normal maximum for the field and rejected before reaching the schema validator, to prevent DoS by oversized payload.

Representative validation contracts:

- Registration: `{email: string (email format), password: string (min 8 chars, max 128 chars), displayName: string (max 50 chars)}`.
- Event creation: `{title: string (max 200 chars), startDate: ISO8601, city: string, country: string, disciplines: array of strings}`.
- Media caption: `{caption: string (max 500 chars), tags: array of strings (max 20 tags, each max 50 chars)}`.

Failure response shape:

- HTTP 422 Unprocessable Entity.
- JSON: `{error: {code: "VALIDATION_ERROR", fields: {displayName: "Display name exceeds maximum length"}}}`.
- HTML form re-render with inline error messages for no-JS flows.

Prohibited input patterns rejected at the boundary:

- HTML tags in text fields (stripped during sanitization per §3.15).
- Control characters except newlines and tabs in multi-line fields.
- Excessively long inputs (hard limit 10x the normal maximum to prevent DoS).

Rationale:

- The controller boundary is the trust boundary. Catching malformed input before it reaches services keeps business logic free of defensive validation noise.
- Schema-first contracts prevent inconsistent ad-hoc validation drift across routes.
- 422 communicates semantic-level rejection (the request was syntactically valid but failed the contract); error monitoring can therefore distinguish protocol bugs from input bugs.

Requirements:

- Every controller route validates body, query parameters, and route parameters against a schema before invoking the service layer.
- Schemas live alongside the route handler so the contract and the consumer stay in sync.
- HTML form re-renders preserve the user's submitted values on validation failure so a single typo does not erase a long form.
- The post-login redirect-path validator (`isSafePath` and equivalents) rejects any path containing a backslash character in addition to its existing scheme and prefix rules, closing the Windows-style path-confusion class that pure forward-slash checks miss.
- Every `sharp(...)` constructor passes `limitInputPixels` bounded to a documented maximum (default 4096 x 4096) so a maliciously dimensioned image cannot allocate a multi-gigabyte pixel buffer before downstream validation runs.
- nginx `client_max_body_size` is set to match the application-layer upload limits, so the perimeter never accepts a body larger than the application is willing to process.

Trade-offs:

- Schema definitions add boilerplate for simple GET routes with no body.
- Service-layer redundant checks may still exist as defense-in-depth for invariants the schema cannot express (cross-field consistency, DB-state-dependent validity).

Impact:

- Services can assume well-shaped input.
- Error response shape is centralized: a new field-level error appears the same way across every route.
- Test surface: every controller has both happy-path and validation-failure tests.

## 3.15 Text Sanitization Pipeline

Decision:

User-generated text is sanitized at write time at the service boundary. The pipeline applies to all human-authored text fields: member bio, display name, profile contact info, event title and description, club name and description, media captions, election candidate statements, comments, reasons, and notes. Sanitization runs at write time only; reading sanitized text does not re-run the pipeline. Template-engine output encoding is the second layer of defense for any text that leaks through.

Sanitization steps (in order):

1. UTF-8 validation: reject input with invalid UTF-8 byte sequences.
2. Unicode normalization: apply NFC (Canonical Composition) to prevent homograph attacks and to keep equality comparisons stable.
3. HTML stripping: remove all HTML tags and entities (no `<tag>` patterns retained).
4. Control character filtering: remove characters U+0000 to U+001F and U+007F to U+009F, except newlines (`\n`) and tabs (`\t`) where the field is multi-line.
5. Length enforcement: truncate or reject based on the field-specific maximum from the route's validation contract (§3.14).
6. Whitespace normalization: collapse consecutive whitespace and newline runs to a single instance.

Output encoding:

- All user text is HTML-encoded by the template engine at render time. Handlebars escapes by default.
- No "unescaped" placeholders for user content. Triple-mustache or `SafeString` is reserved for trusted admin-controlled content (release notes, official announcements).
- The two-layer defense (sanitize at write, escape at read) means a missed escape in one template does not leak stored XSS, and a missed sanitize at one route does not leak via templates.

International content preservation:

- All Unicode scripts supported (Latin, Cyrillic, Arabic, CJK, emoji, and the rest).
- No ASCII-only restrictions on any user text field.
- Right-to-left text supported (Arabic, Hebrew).
- Combining diacritical marks preserved.

Rationale:

- Stored XSS is the primary risk: an attacker who can inject `<script>` into a stored field exploits every reader. Stripping at write time eliminates the vector at the source.
- NFC normalization at write time keeps DB equality comparisons stable across input methods (precomposed vs decomposed Unicode).
- Internationalization is not optional. The platform's audience is global and any ASCII restriction would exclude legitimate users.

Requirements:

- A single sanitization helper module exports the pipeline functions. Controllers and services call the helpers, not ad-hoc string operations.
- Template engine configuration enforces escape-by-default. An integration test asserts that a known XSS payload appears HTML-encoded in rendered output.
- Sanitization-pipeline unit tests cover each step's edge cases (invalid UTF-8, decomposed Unicode, embedded HTML, control characters, oversized inputs, RTL, combining diacriticals).
- Templates render hrefs through escape-by-default `{{href}}`. Triple-mustache `{{{href}}}` is reserved for trusted admin-controlled content and is not used for anything derived from user input or external URLs.
- `marked` output is server-side sanitized (DOMPurify-equivalent allowlist) before reaching the template. Rendered markdown is treated as untrusted regardless of the source field, so a future field that opts into markdown does not bypass the sanitizer.
- JSON data islands serialized into HTML escape `</` to `<\/` so a script-close substring inside payload data cannot terminate the surrounding `<script>` block. The escaping helper is centralized; ad-hoc `JSON.stringify` calls inside templates are not used for data-island emission.

Trade-offs:

- HTML stripping rejects legitimate angle brackets in technical writing (code snippets, math notation). Multi-line fields that need such content require an explicit code-block markup convention or per-field opt-in.
- NFC normalization changes byte-level identity of input. Round-tripping the user's exact bytes is not guaranteed; the canonical form is.
- Whitespace collapsing flattens deliberate formatting (ASCII art, double-newline paragraph separators). Multi-line fields treat newline runs as paragraph separators where appropriate.

Impact:

- Stored values are safe to render without per-template escaping vigilance.
- Search and equality comparisons benefit from NFC normalization (one canonical form per logical string).
- Adding a new user-text field requires invoking the sanitization helper at the service boundary and confirming the template renders the value via escape-by-default placeholders.

## 3.16 Display Name Homograph Protection

Decision:

Display names are restricted to prevent impersonation and spoofing via visually similar characters from different scripts. The validator runs at registration, profile edit, and any subsequent rename.

Restrictions enforced:

1. Single-script requirement: characters primarily from one Unicode script (all Latin, all Cyrillic, all CJK, etc.). Allowed mixing: primary script plus the Common and Inherited script categories (spaces, digits, basic punctuation). Forbidden mixing: Latin and Cyrillic, Latin and Greek, and other cross-script combinations.
2. Reserved name protection: reject names matching reserved words case-insensitively. The reserved set includes role-claim words ("admin", "administrator", "system", "support", "moderator", "staff") and platform-claim words ("IFPA", "footbag", "official"). Common substitutions are checked (`adm1n`, `supp0rt`, `m0derator`).
3. Confusable character detection: compare the candidate against existing member display names using the Unicode confusables mapping (TR39). Reject if the normalized form is confusably similar to an existing member.
4. Invisible character prohibition: reject names containing zero-width characters (U+200B, U+200C, U+200D), bidirectional formatting (U+202A through U+202E, U+2066 through U+2069), and the byte-order mark (U+FEFF).
5. Length: minimum 2 characters, maximum 50 characters, measured after normalization.

Validation flow (in order):

1. Normalize input to NFC.
2. Reject if matched against the reserved-names list (with substitution variants).
3. Detect the primary Unicode script of the normalized form.
4. Verify the single-script requirement holds.
5. Scan for forbidden invisible characters.
6. Compare against existing member display names for confusability.
7. Accept if all checks pass; otherwise reject with a specific error explaining which check failed.

Rationale:

- Display names are identity claims. Spoofing must be rejected at the registration boundary because once a confusable name is admitted, every subsequent interaction risks misattribution.
- Cross-script homograph attacks (e.g. Latin "John" vs Greek-omicron "Jοhn") enable phishing within the platform that no rate limit or per-user filter can catch.
- Reserved-name protection prevents users from claiming role authority through their display name.
- Invisible character bans close a class of attacks where two visually identical names are stored as distinct strings.

Requirements:

- The display-name validator is a single helper module invoked by every code path that creates or renames a member.
- The reserved-names list and the substitution-variant generator live alongside the validator.
- The confusables mapping uses the standard Unicode TR39 dataset, refreshed when the project upgrades its Unicode data dependency.
- Rejection messages name the specific check that failed (so a user with a Cyrillic name knows it is the cross-script rule, not a typo).

Trade-offs:

- Some legitimate names with mixed scripts (transliterated forms, hybrid given-name plus surname) are rejected. Affected users use a single-script form.
- The confusability comparison is O(N) over existing display names. Mitigation: indexed normalized form on the members table; the comparison runs against the indexed column.
- Maintaining the reserved-names list and the substitution-variant generator is ongoing work as new role words appear in the product.

Impact:

- Display name space is the platform's primary identity surface. Rules are stricter than other text fields.
- Affects authentication-time messages, admin tooling, member search, and audit log presentation (the rendered display name is the user's identity in every UI).
- A rename flow inherits the same validator unchanged.

## 3.17 External URL Validation

Decision:

User-supplied external URLs are validated through one shared validation pipeline. The validation contract applies to all external URL fields: member profile external links (maximum three per profile), club URL, event URL, gallery URL, and per-media external URL (media_items.external_url). Interactive ingestion (member, admin, and curator form writes) runs the pipeline at the service boundary at submit time. Seeded and curated-sidecar ingestion does not pass through a form: the club seed built from the legacy mirror and the curator gallery sidecars run the same pipeline at data-prep / authoring time, and the resulting verdict is committed beside the data and stamped onto the row at load. Application startup and deploys therefore make no external-URL network callout. YouTube and Vimeo curator-content URLs use the oEmbed availability check from §6.8 instead and are not subject to the generic reachability policy below.

Scheme allowlist:

- Only `http://` and `https://` accepted.
- Rejected: `javascript:`, `data:`, `file:`, `ftp:`, custom schemes.

Domain validation:

- Reject private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
- Reject loopback addresses: 127.0.0.0/8.
- Reject the unspecified address range: 0.0.0.0/8 (a literal 0.0.0.0 connects to the local host, reaching loopback services).
- Reject link-local addresses: 169.254.0.0/16.
- Resolution runs at submit time. The check is a snapshot, not an ongoing guarantee against later DNS changes.

Reachability check (optional, configurable):

- HTTP HEAD request with 10-second timeout.
- Follow up to 5 redirects. The IP-block check above is re-applied at each redirect hop; a redirect that resolves to a private, loopback, or link-local IP rejects the URL even if the original host did not.
- Accept 2xx status codes.
- Warn on 3xx, 4xx, or 5xx but allow (the URL may be temporarily unavailable).
- Validation results cached for 24 hours keyed by URL hash.

Safe Browsing lookup:

- Each candidate URL is checked against a Safe Browsing dataset before acceptance.
- A positive match is rejected with a generic "URL is not allowed" message; the matched threat category is logged for operator review.

Public render gate:

- An external URL renders publicly only once its row carries a validation timestamp and no quarantine reason (`validated_at` set, `quarantine_reason` null). A row that is not yet verified, or that failed verification, is hidden from public render; the stored value is retained so the admin edit surface (and, for clubs, the listed contact or leader) can review and correct it. Interactive writes stamp the timestamp on accept, so an accepted URL renders immediately.

Error responses:

- "URL could not be reached. Please verify the link." for HEAD failures when the reachability check is enabled.
- "This URL appears to use a disallowed protocol." for scheme rejections.
- "This URL is not allowed." for private-IP, loopback, link-local, or Safe Browsing rejections.
- A retry option is presented in the UI alongside the error.

Display attributes:

- All external links rendered with `target="_blank" rel="nofollow noopener noreferrer"`.
- A small external-link icon indicates click-out, suppressed only where the URL itself is the visible anchor text.
- The full URL is shown via the `title` attribute when JavaScript is enabled.

Rationale:

- Scheme allowlist prevents `javascript:` and `data:` injection in href attributes that would otherwise execute in the viewer's browser.
- Private-IP and loopback rejection prevents trivial SSRF via cloud metadata endpoints (169.254.169.254) and internal services.
- Re-applying the IP block at each redirect hop closes the DNS-rebinding and redirect-to-private-IP attack class that a one-shot resolution misses.
- The reachability check catches dead links at submit time so users do not save mistakes that lead to 404s for every reader. The optional flag exists because some deployments prefer no outbound HTTP at all.
- Safe Browsing prevents the platform from becoming a phishing or malware redistribution vector.
- `rel="noopener noreferrer"` prevents tabnabbing (the linked page's access to `window.opener`) and Referer leakage. `nofollow` declines to pass SEO authority to user-submitted links.

Requirements:

- A single URL-validator helper module exports the validation pipeline. Controllers call the helper, not ad-hoc URL inspection. Data-prep tooling that verifies seeded or curated-sidecar URLs invokes the same helper (never a reimplementation), so the scheme, SSRF, Safe Browsing, and reachability rules have one source of truth.
- The validator distinguishes platform URLs (YouTube, Vimeo) from generic external URLs and routes platform URLs to the §6.8 oEmbed check.
- The redirect-follow guard is implemented as a re-resolution at each hop, not a one-time check on the original host.
- A template helper renders external links with the safe attribute set. Direct `<a href="{{url}}">` markup that bypasses the helper is rejected at code review.
- Safe Browsing integration uses the deterministic dev stub in non-production environments and the live API in production; the adapter contract follows §5.3.

Trade-offs:

- Some legitimate URLs are rejected: intranet wikis, corporate VPN-reachable services, and IPv6 link-local addresses that have a legitimate use case for some operators.
- Without a reachability check, dead links at submit time enter the system and users see broken links at click-through. The configurable flag lets a deployment choose this trade-off explicitly.
- Safe Browsing has a non-zero false-positive rate; an operator-review override path exists out of scope for this section.
- The 24-hour cache means a URL that becomes valid (or becomes invalid) takes up to 24 hours to reflect in the validation result.

Impact:

- Adding a new external-URL field requires invoking the validator helper at the service boundary and rendering output via the safe-attributes template helper.
- §6.8 (oEmbed for YouTube and Vimeo) and §3.17 (for all other external URLs) are the two complementary external-URL contracts.

# 4. Front-End / UI Technology

## 4.1 Server-rendered HTML with Handlebars Templates

Decision:

All primary pages are rendered on the server using Handlebars templates and strongly-typed view models surfaced through TypeScript controllers and shaped by the service layer.

Home-page exception note:
The Home page may use richer editorial composition and limited client-side media behavior (for example image/video treatments, inline embeds, or motion treatments) within the same Express + Handlebars + vanilla TypeScript stack. This does not authorize a separate SPA architecture, a separate Home-only framework, or a separate chrome/navigation system.

Rationale:

- Handlebars is logic-light and easy for non-expert volunteers to understand.

- Server rendering works on all devices and fits the CloudFront caching model.

- Simplicity-first design calls for a standard, non-exotic stack.

- Handlebars templates with vanilla TypeScript for interactivity provides optimal balance of simplicity, maintainability, and sufficiently meets all requirements for the use cases.

- Service-shaped page models keep templates cleaner and make page contracts easy to express as typed view models.

Alternatives Considered:

- Lit Web Components (islands architecture): Rejected due to build tooling complexity (bundlers, TypeScript compilation), web component learning curve for volunteers, and risk of scope creep toward SPA patterns.

- Enhance Framework: Rejected due to framework lock-in concerns, smaller contributor pool, and learning curve. Philosophy alignment appealing but does not justify long-term commitment for platform where most pages are simple content and forms.

- React/Vue/Angular (SPA frameworks): Rejected due to complexity overhead (heavy build tooling, state management, client routing). If the goal were SSR with hydration, frameworks like Next.js/Remix are designed for that, but they still require JavaScript and introduce significant framework surface area. The project achieves SSR with Express + Handlebars and uses minimal client TypeScript for interactivity.

Trade-offs:

- We do not get highly dynamic page state by default. We do not need this.

Impact:

- Each screen in the UI Requirements document maps to a template + view model pair, plus an Express controller.

- Any proposal to introduce React/Vue/Angular or a SPA architecture is a major change requiring a new decision.

## 4.2 JavaScript Required for Interactivity

Decision:

JavaScript provides client-side usability enhancements (autocomplete, media previews, dynamic filters, some validation checks, and limited page-specific interactive media behavior) on top of server-rendered HTML. Core pages and form submissions function without JavaScript, as server-side validation is authoritative and all forms submit via native browser POST regardless. JavaScript acts as a client-side validation gate to improve UX by catching errors before submission, not as the submission mechanism. The one functional exception is Stripe's hosted checkout page, which requires JavaScript as a third-party dependency outside this platform's control.

For the Home page, richer media/interactivity may be added within this same progressive-enhancement model. It must not become a separate client-side application architecture.

Rationale:

- Simpler development: Single interaction path eliminates dual server-only vs client-enhanced implementations.

- Volunteer contributors maintain one implementation per feature, reducing complexity and long-term maintenance burden.

- SSR provides fast first paint and CloudFront caching; JavaScript provides validation gate before submission.

- Standard web pattern (POST/redirect/render) is familiar, debuggable, and works with browser back button.

- JavaScript is the validation gate, not the submission mechanism.

Trade-offs:

- Users who explicitly disable JavaScript lose client-side validation and usability enhancements but can still submit forms and navigate the site (server-side validation remains authoritative). Stripe checkout requires JavaScript and is unavailable without it.

- Page reloads visible on form submission (no optimistic UI updates).

- Cannot provide "modern SPA feel" with instant transitions.

- Legacy archive (archive.footbag.org) remains static HTML-only.

Implementation:

- Forms use traditional HTML form elements with action and method attributes.

- JavaScript validation runs on submit event; prevents submission if validation fails.

- On successful validation, browser performs native POST submission.

- Controllers handle POST, validate server-side, and either redirect (success) or re-render form with errors (validation failure).

- The \<noscript\> tag displays: "This site requires JavaScript for interactive features. Please enable JavaScript in your browser settings."

- Forms work like this. User fills form. User clicks submit. JavaScript validates (required fields, format checks, etc.). If invalid: highlight errors, prevent submission. If valid: allow native browser POST. Server validates again (authoritative). Server returns redirect (success) or re-rendered form (errors). This is simple, maintainable, and aligns with volunteer contributor skill expectations.

Browser Support:

Chrome/Edge 90+, Firefox 88+, Safari 14+, iOS Safari 14+, Chrome Android 90+. JavaScript must be enabled. This baseline provides 95%+ market coverage.

Alternative Considered:

Progressive Enhancement rejected because: Doubles development effort and testing surface. Many modern sites require JavaScript; handling the exceptional case is not worth the ongoing complexity for this project.

## 4.3 Explicit UI Restrictions

Decision:

The UI intentionally avoids certain flashy or high-complexity design and interaction patterns, in order to keep the system simple, accessible, and volunteer-friendly. Specifically, the following are out of scope given the technology constraints: No SPA frameworks (React, Vue, Angular, etc.) or client-side routers. No infinite scroll that lacks a straightforward paginated fallback. No parallax scrolling effects or scroll-based animation frameworks. No auto-playing background videos or audio on core pages. No UI flows that rely solely on hover, drag-and-drop, or complex gestures without keyboard/desktop-friendly alternatives. No heavily customized JS-only form controls that break standard keyboard/screen-reader behavior. No dependence on heavyweight front-end build tools beyond what is required to bundle TypeScript and CSS.

Rationale:

- UI Requirements emphasize accessibility, responsiveness, and keyboard operability.

- Project goals explicitly state No exotic frameworks.

- Avoiding these patterns keeps code and tech stack as simple as possible.

Trade-offs:

- The site will feel more like a classic, modern website than a slick web "app."

- Designers must work within a more constrained visual and interaction vocabulary, emphasizing clarity and content over spectacle.

Impact:

- Documentation for contributors explicitly states these constraints so that front-end work remains consistent with the overall philosophy.

## 4.4 Accessible, Responsive HTML-first Design

Decision:

Pages are built with semantic HTML and responsive layouts that work across devices. All interactive elements must be reachable and operable via keyboard. When JavaScript drives interactions, templates and client code must preserve accessibility via ARIA labels, focus management, and keyboard navigation support.

Rationale:

- Accessibility is a core requirement. Modern screen readers and assistive technology operate within JavaScript-enabled browsers; users with JavaScript disabled (including a subset of users requiring assistive technology) cannot access the interactive site.

- Responsive design supports global access from a wide variety of devices.

Trade-offs:

- Some visually complex layouts or hover-only interactions are constrained or require alternative representations.

- Implementing proper ARIA semantics and keyboard ordering requires discipline.

Impact:

- Templates must use appropriate elements (headings, labels, buttons, lists) and avoid div-only structures for interactive controls.

- CSS must handle responsive breakpoints without relying on JavaScript for layout.

## 4.5 Front-end TypeScript for Interactivity

Decision:

Client-side TypeScript handles user interactions: validation before form submission, dynamic form behavior, client-side previews, and autocomplete. Pages are server-rendered; TypeScript attaches event handlers and manages client behavior on top of server-rendered HTML. Forms submit via traditional browser POST with full-page reloads.

Rationale:

TypeScript provides type safety and improved developer experience for client code while keeping dependencies minimal. Standard POST/redirect/render pattern is simple, debuggable, and familiar to volunteer contributors. Compilation to JavaScript ensures broad browser compatibility. Browser back button works correctly (no client-side routing state to manage).

Trade-offs:

- No framework-provided state management or optimistic updates.

- Compilation adds build step, but provides compile-time error checking and consistent bundling.

- Full-page reloads visible on submission (network latency visible to user).

- Cannot provide optimistic UI updates or instant client-side transitions.

Implementation:

- Forms use standard HTML form elements with action="/path" method="POST".

- TypeScript attaches event listeners to validate on submit event.

- If validation fails: prevent default submission, highlight errors, user corrects and resubmits.

- If validation passes: allow native browser submission (no event.preventDefault(), no fetch()).

- Server receives POST request, performs authoritative validation, returns redirect or re-rendered form.

Impact:

- Build pipeline compiles TypeScript into JavaScript bundles referenced by hashed filenames.

- Forms submit via standard POST; JavaScript validates before allowing submission.

- Server responses remain source of truth for persisted state.

- Controllers return HTML pages (not JSON) for standard navigation flows.

- Testing validates POST/redirect/render flows with full request/response cycles.

## 4.6 One Type System with Body-font Notation

Decision:

Every public page, including all freestyle surfaces, uses one type system. Body text, inline notation, formulas, and difficulty values render in the body font (`--font-body`); notation is distinguished by semibold weight and the secondary accent color, not a separate typeface. Hashtags and tags render in the body font inside a low-tint rounded chip. The monospace token (`--font-mono`) is reserved for content whose meaning depends on fixed-width alignment: tabular value columns and verbatim ASCII reproductions.

Rationale:

- A single type system keeps the site visually coherent as new sections are added; a per-section typeface fragments the page into parallel design languages.

- Notation reads as emphasized prose, not code. Weight and color carry the distinction at lower visual cost than a second typeface, and the treatment survives a font-loading failure.

- Monospace earns its place only where column alignment or character-exact reproduction is the meaning.

Requirements:

- Every `font-family` declaration in the stylesheet references `--font-body` or `--font-mono`; no rule names a typeface directly.

- No section introduces its own typeface, serif accent, or alternative sans stack.

Trade-offs:

- Notation cannot adopt a distinct monospace look where a designer might expect one; the semibold-plus-accent treatment is the deliberate substitute.

Impact:

- Freestyle notation, formulas, and tags inherit the shared tokens and primitives rather than a freestyle-specific font stack.

## 4.7 Canonical Responsive Breakpoints

Decision:

Media queries use only three canonical breakpoints: 480px (phone), 768px (mid-width), and 1024px (tablet, for surfaces with a genuine three-tier layout). No other breakpoint values appear in the stylesheet.

Rationale:

- A fixed breakpoint set keeps responsive behavior coherent across every surface; ad-hoc breakpoints fragment the reflow story so the same viewport width behaves differently from page to page.

- Three tiers cover the device classes the audience uses without over-specifying.

Requirements:

- Every `@media` width is 480px, 768px, or 1024px.

- The 1024px tier is used only where a surface has a real three-tier layout, not as a default.

Trade-offs:

- A layout that would benefit from a bespoke breakpoint must instead restructure to fit the canonical set.

Impact:

- New responsive rules slot into the existing breakpoint blocks rather than introducing new widths.

## 4.8 Stylesheet Convention Gates

Decision:

A CI gate (`scripts/ci/assert_conventions.sh`) statically enforces the visual-token disciplines at merge time: colors come from `:root` design tokens (no raw hex in rule bodies), border-radius uses `--radius*` tokens (no raw px), and media queries use only the canonical breakpoints. The same script enforces the template restrictions (no inline style or script, no nested forms).

Rationale:

- These disciplines are easy to state and easy to violate by habit; a mechanical gate catches drift that visual review misses, because an off-palette hex or a stray breakpoint renders fine while quietly fragmenting the system.

- Enforcement at merge time keeps the token set authoritative without relying on every contributor remembering the rule.

Requirements:

- A new color enters as a named `:root` token before use; a new corner radius enters as a `--radius*` token.

- A new breakpoint is not introduced; layouts fit the canonical set.

Trade-offs:

- The gate rejects expedient one-off values, forcing the token-first step even for a single use.

Impact:

- Stylesheet changes that introduce raw hex, raw-px radius, or non-canonical breakpoints fail CI and must be expressed through the token system.

## 4.9 One Public Rendering Standard

Decision:

The public site has a single reusable rendering standard that every public page consumes: the page contract (`PageViewModel<TContent>` in `src/types/page.ts`), a small set of reusable primitives (site frame, hero, content section, cards, result sections, year navigation, metadata rows, empty state, notice), and a shared CSS vocabulary. A page composes from these; it does not define its own structure or chrome. Home is the one composition-page exception (§4.1).

Rationale:

- A single standard keeps the site coherent as sections are added; per-section structure fragments the product into parallel design languages and multiplies maintenance.
- Reuse is enforceable through shared code (thin controllers, service-shaped page view-models, one layout, shared partials, shared CSS tokens, logic-light templates), not convention alone.
- Volunteer contributors extend an established vocabulary rather than inventing one per page.

Requirements:

- Every public page except Home renders from `PageViewModel<TContent>`.
- A new public page joins the standard only if it can be expressed through the existing primitives and CSS vocabulary; a genuinely new reusable primitive is added to the standard first, then reused.
- No section introduces its own chrome system or a parallel design language; section-specific vocabulary inherits the shared tokens and primitives.
- Look-and-feel consistency is a forward requirement: it constrains every new surface, not only the current page set.

Trade-offs:

- A page that wants bespoke structure must instead extend the shared standard, which is slower than a one-off but keeps the system coherent.

Impact:

- The cross-cutting view standard lives in the path-scoped `.claude/rules/view-layer.md`; each page's rendering contract, audience, and sensitive-page invariants live in the owning service's file-header JSDoc; the visual disciplines are mechanically enforced by `scripts/ci/assert_conventions.sh` (§4.8).

## 4.10 Search-engine and Crawler Readiness

Decision:

Public pages are discoverable by both search engines and AI agents; everything else is kept out of search indexes. The public site is built for crawlability: server-rendered HTML, a production `robots.txt`, an XML sitemap, an `llms.txt` site map for AI agents, and a unique title, meta description, canonical URL, and social-preview tags on every public page. `robots.txt` names no private paths; private content is kept out of indexes by noindex directives, not by listing paths. Authenticated surfaces and the member-only legacy archive are kept out of search indexes. Search Console ownership is verified by a DNS TXT record. Meeting this standard is a go-live gate.

Rationale:

- Server-rendered HTML (§4.1) returns complete markup on the first response, so every crawler, including those that do not execute JavaScript, sees full content with no render step.
- Public discoverability serves the community mission; private member data and governance surfaces must never reach a search index.
- DNS-TXT verification survives redeploys and template edits and covers every subdomain under one property.
- `robots.txt` names no private paths: a `Disallow` line is publicly readable and would advertise the paths it hides, and `Disallow` does not stop indexing of a linked URL while a noindex directive does. Private content is therefore excluded by noindex, not by `robots.txt`.
- All crawlers are allowed, including AI retrieval and AI training crawlers, because the mission is to spread footbag history. `llms.txt` gives AI agents a concise site map at low cost; search-engine indexing is unaffected by it.

Requirements:

- `robots.txt` is served in production, permits page resources (CSS, JavaScript, images), names the sitemap, and names no private paths. A non-production environment serves a `robots.txt` that disallows all crawling.
- The shared layout emits a unique `<title>`, a `<meta name="description">`, a `<link rel="canonical">`, and Open Graph and Twitter Card tags for every public page, all sourced from the page view-model; the canonical and `og:url` are omitted on error and not-found responses.
- An XML sitemap lists public pages only; member profiles and the member-only legacy archive are never listed.
- Authenticated routes and the legacy archive carry a noindex directive; non-production environments return `X-Robots-Tag: noindex` for the whole site.
- All crawlers are allowed, including AI retrieval and training crawlers; `robots.txt` carries no per-crawler restrictions. An `llms.txt` site map is served for AI agents. Structured data (Organization, Event) is added only when there is a demonstrated need.

Trade-offs:

- Distinguishing public from private on one robots and sitemap surface costs an explicit per-route noindex on authenticated pages rather than a blanket allow.
- Deferring structured data forgoes some rich-result eligibility in exchange for not maintaining markup with little payoff at the current scale.
- Allowing AI training crawlers means footbag content may be used in model training without attribution; this is accepted in exchange for maximum discoverability for a non-profit archive.

Impact:

- A new public page is indexable by default and sets noindex only when it exposes private data.
- The shared layout and the page view-model carry the description and canonical fields.
- A go-live gate verifies the production `robots.txt`, the sitemap, the per-page tags, the staging noindex, and the archive's exclusion from indexing.

## 4.11 Static-Asset Fingerprinting

Decision:

Site CSS and JavaScript are referenced through a content-hash fingerprint helper that emits a version-token URL (`/css/style.css?v=<hash>`), the same URL-versioning pattern media uses (`?v={media_id}`); templates never hardcode a `/css/*` or `/js/*` URL. A content change yields a new token, so each deploy self-busts the CDN with no cache invalidation.

Rationale:

- One URL-versioning mechanism across the site: media and static assets both carry `?v=`, served with a CloudFront cache policy whose cache key includes the query string, so each version is a distinct edge entry.
- Pairing a versioned URL with `Cache-Control: public, max-age=31536000, immutable` lets browsers and the edge cache the asset indefinitely while a new release is fetched fresh under its new token.
- HTML is uncached at the edge, so it always references the current versions.

Requirements:

- Templates reference site CSS/JS only through the `asset` helper (`{{{asset 'css/style.css'}}}`); a hardcoded `/css/*` or `/js/*` URL is a conformance failure.
- The version token is the content hash of the served file, computed at process start; a request carrying `?v` is served immutable.
- The `/css/*` and `/js/*` CloudFront behaviors use a dedicated query-string cache policy (parallel to the media one), so `?v=` is part of the cache key rather than dropped.

Trade-offs:

- A query-string cache policy is required on the static-asset behaviors; CloudFront's default static policy excludes query strings from the cache key, so `?v=` without it would be ignored.
- Fingerprinting is applied to CSS/JS; images and fonts referenced from CSS keep ordinary caching.

Impact:

- A normal deploy ships changed CSS/JS and the edge serves it immediately under a new `?v=` token, with no manual invalidation.
- A new asset reference uses the helper; the conformance test fails a build that hardcodes an asset URL.

# 5. Back-End Services and Patterns

## 5.1 Node.js with TypeScript

Decision:

All application logic (controllers, services, adapters) is implemented in Node.js with TypeScript.

Rationale:

- Widely known stack with abundant documentation.

- TypeScript improves readability and code development (compile-time debugging).

Trade-offs:

- Requires a compilation step and some TS familiarity for contributors.

- Runtime is single-threaded per process; concurrency model relies on the event loop.

Impact:

- Repository includes TS configuration and build steps for both server and client.

- Adapters and services expose typed interfaces used by controllers and tests.

## 5.2 Express-based HTTP Controllers

Decision:

Express is the HTTP framework for routing, middleware, and request handling. Controllers are thin wrappers that delegate business logic to service-layer modules and rendering to Handlebars view templates.

Controllers own HTTP-layer concerns only: request body and query parsing, response-type selection (render, redirect, JSON), redirect dispatch, template invocation, and mapping service-layer outcomes to HTTP responses. Controllers do not own business rules, service-boundary decisions, page-model composition beyond trivial glue, or ad-hoc route-domain interpretation. Auth gating and tier enforcement live in middleware (see Authorization Middleware Pattern below), not in controllers; controllers on protected routes see only authenticated, tier-validated requests.

Rationale:

- Express is mainstream, well-documented, and already present in the Node + TypeScript stack. Introducing a second routing framework would create parallel routing concepts for no comparable gain.
- Routing, headers, and status codes are HTTP-layer concerns; service-layer code never touches `req` or `res`. The separation lets the service layer stay testable without an HTTP fixture.
- Thin controllers keep the service contracts and the page view contracts stable: a controller change does not ripple into either unless the underlying service contract or view contract changes.

Trade-offs:

- Express does not provide a DI container, validation framework, or built-in error-mapping pipeline; each is wired explicitly. The wiring lives in `src/middleware/*` and `src/lib/controllerErrors.ts`, both small.
- Thin-controller discipline must be maintained at review time. A controller that grows business logic produces a slow shift away from the property. Code review (and service-contract/JSDoc drift checks per §1.10) is the enforcement mechanism.

Impact:

- Routes are declared in `src/routes/*.ts` and map (method, path) to a controller function.
- Middleware composes at app-init time in `src/app.ts` in the following order: body parsing → cookie-parser → CSRF Origin pin (§3.3) → auth middleware (§3.2) → no-store on authenticated responses → controller.
- Controllers stay small and read top-to-bottom; complex page composition belongs in service-layer page-model builders, not in controllers.

Authorization Middleware Pattern:

Authorization runs as a chain of middleware functions after `authMiddleware` (§3.2) populates `req.user`. The chain on a protected route is:

1. `requireAuth` (`src/middleware/auth.ts`) checks `req.isAuthenticated`. If false on an HTML route, the middleware returns a 302 redirect to `/login?returnTo=<originalUrl>` so the browser user sees a login form rather than an opaque status code. A JSON API route returns 401 from the same gate.
2. Tier middleware (e.g. `requireTier1Benefits`) checks `req.user`'s tier value, which the auth middleware sourced from the DB row on the current request. Insufficient tier returns 403 with a rendered tier-upsell page on an HTML route, or a JSON error on an API route.
3. Admin middleware (e.g. `requireAdmin`) checks `req.user.role`, derived from `members.is_admin`. Non-admin returns 403.

Defense in depth: every state-changing service method re-asserts the same authorization predicate against the DB row. A request that bypassed the middleware (a test-seam misuse, a future middleware regression) is still rejected at the service layer with the same outcome.

The `/login?returnTo=...` redirect from `requireAuth` is the one site that emits 302 by design. It is exempted from the explicit-303 rule below because it is a framework-level auth gate rather than a per-route response, and because the redirect applies uniformly to every method (GET, POST, PUT, PATCH, DELETE); the post-login flow returns the user to the originally-requested URL via the `returnTo` parameter, validated through `isSafePath`.

HTTP Response Convention:

State-changing POST handlers follow Post-Redirect-Get: on success, the handler issues an explicit `303 See Other` to the GET URL that owns the resulting state. Inline validation failures re-render the same form at 422 with submitted values preserved. Rate-limit responses re-render at 429 with a `Retry-After` header. Resource-not-found and anti-enumeration responses use 404. Authenticated-but-not-permitted responses use 403. Parser-level failures (malformed token, JSON-API field validation) use 400. Permanent URL canonicalization uses 301. The framework's implicit 302 default does not reach the wire: every redirect site sets its status explicitly, and the only 302 emitted anywhere is the auth-gate redirect described above.

| Code | Use |
|------|-----|
| 303 | POST → GET state-changing success. Always explicit. |
| 422 | Inline form-validation re-render with submitted values preserved. |
| 429 | Rate-limit re-render with `Retry-After`. |
| 404 | Resource not found; anti-enumeration. |
| 403 | Authenticated but not permitted. |
| 400 | Parser-level errors (malformed token, JSON-API field validation). |
| 301 | Permanent canonical URL change. |
| 302 | Framework-level auth-gate redirect to `/login?returnTo=...` only. No other site emits 302. |

Services own action-result composition: each state-changing service method returns a discriminated-union result whose discriminant the controller switches on to map to a response code from the table above. Controllers do not branch on business outcomes; they map service-result discriminants to HTTP responses.

Transient post-submit state (one-shot banners, prominent cards, drift notices) is carried in the signed `footbag_flash` cookie (§3.3) consumed by the next matching-target GET, not in query parameters. The `FLASH_KIND` enumeration lives in `src/lib/flashCookie.ts`; each transient-notice surface adds a new kind to the enum rather than constructing an ad-hoc payload. The receiving GET reads the flash via `readFlash`, surfaces the banner through a view-model field, and calls `clearFlash` so the notice is consumed exactly once; the 60-second TTL is a backstop for the rare case where the receiving GET never lands (the user navigates away after the POST).

Controller contract (pedantic):

What controllers MAY do:

- Parse `req.body`, `req.query`, `req.params`, and middleware-populated fields (`req.user`, `req.isAuthenticated`).
- Validate input at the trust boundary via a schema validator (Zod or equivalent). Inline ad-hoc validation belongs in a schema or in a service-layer validator, not in controller bodies.
- Select response type (`res.render`, `res.redirect`, `res.status`, `res.json`, `res.send`) and set status codes.
- Set or clear cookies through the helpers in `src/lib/*Cookie.ts` (`issueSessionCookie`, `clearSessionCookie`, `writeFlash`, `clearFlash`). Controllers never call `res.cookie` or `res.clearCookie` directly.
- Switch on a service result's `kind` discriminant to map to a fixed HTTP response per the HTTP Response Convention table above. The switch is mechanical: one arm per kind, no nested business conditionals.
- Construct URLs for the response (hrefs in view-model fields, redirect targets, `formAction` paths). Route layout is HTTP-layer knowledge; services do not know the URL space.
- Log database or service errors with safe context (query name, operation, correlation id; never raw PII).

What controllers MUST NOT do:

- Access `db`, `queries`, `db.prepare`, or `transaction` directly. Every database read or write is a service method call.
- Import adapter getters from `src/adapters/`. Adapters are wired by the service layer (see §1.9). The only accepted exception is a documented lazy-resolution wrapper for an adapter whose getter throws at module-load time.
- Compose page-models beyond trivial glue. Trivial glue is: assigning HTTP-only fields (hrefs, `dashboardHref`, `formAction`, `cancelHref`) onto a service result, shallow-spreading a service result into a `PageViewModel<TContent>`, and selecting between N render variants on a single discriminant. Anything else (iterating service rows through a per-row transform, deriving a label from a domain code, merging two service results, filtering tags or fields based on a domain rule) is page-model composition and belongs in the service or in a service-owned page-model builder.
- Mutate a service-returned view model based on auth state. When a page varies by viewer role, the controller passes viewer context into the service and the service returns the shaped response.
- Branch on domain fields of a service result. Controllers branch only on the `kind` discriminant. If a controller needs to choose between two render paths based on a non-`kind` field, the service is missing a discriminant.
- Duplicate middleware concerns. Auth-gating, tier-gating, CSRF, and origin-pin checks live in `src/middleware/` and are wired in the route definition. Controllers see only requests that passed those gates.
- Embed business-policy constants (tier durations, lockout windows, year cutoffs, taxonomy enums). These belong in the service that owns the policy.

Service action-result shape:

State-changing service methods return a discriminated union. The canonical arms and their HTTP mappings are:

| `kind`              | HTTP response | Payload (required)                                                                                 |
|---------------------|---------------|----------------------------------------------------------------------------------------------------|
| `advance`           | 303 to next   | `nextUrl: string` (next-task or success URL)                                                       |
| `retry_same`        | 303 to same   | optional `flash` payload (typed `FLASH_KIND`)                                                      |
| `validation_error`  | 422 re-render | `message: string`, typed-per-method `formState` carrying every field the template needs to re-render |
| `rate_limited`      | 429 re-render | `retryAfterSeconds: number`                                                                        |
| `conflict`          | 422 or 409    | `message: string`, optional typed `formState`                                                      |
| `not_found`         | 404           | (empty, or `reason: string` for log-only diagnostics)                                              |
| `forbidden`         | 403           | (empty, or `reason: string` for log-only diagnostics)                                              |

`validation_error.formState` is typed per method, never `unknown`. The controller renders the error response without a second service call; the service is the single source of the form-state payload.

A service method that surfaces only a subset of these arms declares its return type as a narrower union (e.g. `advance | validation_error` for a non-rate-limited mutation). Controllers exhaustively switch via a TypeScript `switch (result.kind)` with the compiler verifying every arm is handled.

Rationale for explicit 303:

`HTTP 302 Found` is specified loosely enough that several user agents replay the original POST method when the user hits back or refresh, which produces duplicate writes. `303 See Other`, defined in RFC 9110 §15.4.4, forces the follow-up request to use GET regardless of the original method. Setting `303` explicitly at every redirect site keeps the wire-level behaviour under codebase control rather than depending on the framework's implicit default and on whichever user agents happen to interpret `302` correctly.

Rationale for signed flash cookies over query-string notices:

A post-submit notice attached to the redirect URL (`?saved=create`, `?submitted=1`) survives in the URL bar after the redirect. The URL is then bookmarkable, shareable, indexable by crawlers, and copyable from browser history. Any of those paths produces a URL that displays the banner to viewers who never performed the action; confusing at best, a privacy leak of the originating account's activity at worst. Query-string flags also pollute CDN cache keys (each variant is a distinct cache entry), leak into the `Referer` header on outbound links, and persist in server access logs.

The signed flash cookie sidesteps all of that. It is HMAC-signed with `SESSION_SECRET` (a forged value fails the HMAC check, §3.3), scoped `HttpOnly` and `SameSite=Lax` (unreadable to scripts and unsendable cross-site), and expires after 60 seconds. No shared link, cache key, log line, or `Referer` header carries the notice.

Rationale for bounded redirect targets:

A redirect URL chosen from user-controlled input (a form field, a URL fragment, the `Referer` header) is an open-redirect primitive. An attacker hands the victim a link that begins on the trusted `footbag.org` domain and silently lands the victim on an attacker-controlled page; the victim's trust in the originating domain transfers across the redirect into a phishing or credential-harvesting flow. To prevent this, every redirect target the application emits is either a fixed server-owned path (for example, `/admin/curator/media` after a curator action) or a path the controller has explicitly validated through `isSafePath` (relative same-site path; rejects schemes, `//` prefix, backslashes). The two surfaces that consume external input pass through `isSafePath` before redirecting: the auth-gate `/login?returnTo=...` and the post-logout `Referer` branch. No other controller constructs a redirect target from unvalidated input.

Alternatives considered:

Framework-default 302 for POST-success redirects. Rejected: 302's loose method semantics let some user agents replay the original POST on back or refresh, producing duplicate writes. 303 forces GET semantics on the follow-up at the spec level and removes the class of bug entirely. Mixing implicit 302 with explicit 303 across the codebase would also leave the wire-level behaviour dependent on which controllers got migrated and which did not.

Query-string transient notices (`?saved=create`, `?submitted=1`, `?resolved=<id>`). Rejected: a shared, bookmarked, crawled, or copy-pasted URL renders the banner for viewers who never performed the action. Query-string flags also pollute CDN cache keys, leak into the `Referer` header on outbound links, and persist in server access logs. The signed flash cookie carries the same notice with none of those leaks.

URL-fragment notice (`#saved=create`). Rejected: the fragment never reaches the server, so the server-rendered template cannot consume it; client-side rendering would be required, which conflicts with the JS-optional public surface (§4.2). The fragment is also unsigned, so any link could fabricate a banner.

Server-side flash queue (a session-bound DB table or in-memory map keyed by session id). Rejected: introduces per-session server-side state, defeating the JWT-as-session model (§3.2) which keeps no per-session table. The signed cookie carries the same one-shot semantics with no server state.

Unbounded `?returnTo` parameter (no `isSafePath` validation). Rejected: any attacker-chosen URL becomes a one-click redirect from a `footbag.org` page, which is a phishing primitive. `isSafePath` is the gate.

Mixed 302/303 (some redirects 302, some 303). Rejected: a reader cannot determine the wire behaviour without reading every controller, and a future regression that adds a new redirect would inherit Express's 302 default by accident. Setting 303 at every state-changing POST-success site and reserving 302 for the one framework-level auth-gate keeps the wire transparent and the default-failure mode loud.

Controllers emit raw service errors as HTTP responses. Rejected: would leak service-layer error class names, stack traces, or unbounded message strings into the response body. The discriminated-union result returned by each state-changing service method is the boundary that controllers map to a fixed table of HTTP responses; the service-layer error vocabulary stays inside the service layer.

Client-side toast (JavaScript) instead of a server-issued flash cookie. Rejected: conflicts with the JS-optional public surface (§4.2). A user with JavaScript disabled would not see the post-submit confirmation. The server-rendered banner driven by the flash cookie works without JavaScript.

Single status code for all error classes (e.g. 400 for every client error). Rejected: collapses signals an operator and a browser both consume. 422 vs. 400 distinguishes "your form is invalid; here it is with errors marked" from "your request shape is malformed"; 429 vs. 403 distinguishes "you are doing this too often, retry later" from "you may never do this"; 404 vs. 403 is the anti-enumeration choice for resources you must not learn the existence of. Collapsing any of these would either expose information (return 403 for a resource that should anti-enumerate) or degrade UX (return 400 when 422 would re-render with the user's input preserved).

## 5.3 Dedicated Adapters for External Services

Decision:

All communication with AWS services (S3, SES, SNS, Parameter Store, CloudFront), Stripe, and other external systems is encapsulated in dedicated adapter modules. Services never call SDKs directly.

Rationale:

- Centralizes error handling, retries, logging, and configuration.

- Makes it possible to stub or mock external services in dev and tests.

Trade-offs:

- Additional indirection and boilerplate when compared to calling SDKs directly.

- Adapter boundaries must be maintained consistently over time.

Impact:

- There is a clear "adapter" layer in the codebase; any new external integration must add an adapter.

- Service-level tests can mock adapters; integration tests validate adapter + SDK behavior end-to-end.

- The adapter set covers: JWT signing (§3.5), secrets resolution (§3.6), ballot encryption (§3.7), email send (§5.4), media storage, image processing (§6.8), video transcoding, payments (§6.1), Safe Browsing URL screening, CAPTCHA verification, and outbound HTTP reachability. Each adapter defines one interface; dev and test use an in-process stub, a local backend, or an injected double, while staging and production use the live AWS or third-party backend (image processing and video transcoding instead call the in-cluster worker in every environment). Three backends differ by intent: SES email send and CAPTCHA verification stay stubbed on staging and go live in production only (§5.6); outbound HTTP reachability has a disabled backend for deployments that opt out of all outbound probes from the validation path.

- Adapters fail fast at boot when a required environment variable is absent, so a misconfigured deployment cannot start in a half-wired state. Adapter contract parity is verified per §5.7.

## 5.4 Outbox Pattern for Emails

Decision:

The platform sends all transactional and bulk email via AWS SES using an Outbox pattern.

Rationale:

- Outbox pattern decouples user-facing flows from SES latency and transient failures.

- A small set of explicit MailingList and MailingListSubscription entities provides a clear, query-friendly model while staying lightweight and simple.

- Security-critical and governance-critical flows such as account verification, password reset, and election communications rely on reliable email delivery with retries and auditability, which the Outbox pattern provides.

- Member-controlled subscription preferences, stored via MailingListSubscription and projected into Member.subscriptions, provide transparency and control.

- SES bounce and complaint handling keeps email lists clean automatically by updating MailingListSubscription records.

- Simple metrics and alarms provide operational visibility without heavy analytics infrastructure.

Trade-offs:

- Requires running a separate worker process and monitoring its health.

- Email delivery is not instantaneous; there can be a delay due to polling and retries.

- No advanced email marketing features like A/B testing, detailed open/click tracking, or sophisticated segmentation.

- Mailing list counts are computed by aggregating MailingListSubscription records rather than stored denormalized in MailingList; this keeps the model simple but requires scan-based aggregation for some admin views.

Impact:

- Subscription email is modeled with lightweight MailingList and MailingListSubscription entities: MailingList defines each subscription category (for example, newsletter, board-announcements), and MailingListSubscription records each member’s status (subscribed, unsubscribed, bounced, complained) for a list.

- Member.subscriptions is a simple projection of a member’s current MailingListSubscription slugs, used mainly by the profile UI.

- Bounce and complaint notifications update MailingListSubscription records (and, indirectly, Member.subscriptions), and simple metrics and alarms are maintained for delivery health.

- We intentionally avoid marketing automation and analytics tooling.

- Every outbound email is sent through one email service that resolves a registered template, renders it, and stamps the template's `template_key` onto the outbox row, so each message records its email type and every email uses a registered template.

- Email templates are logic-less plain text stored in the database (`email_templates`), one template per distinct message: a template carries `{token}` merge fields but no conditional syntax, and an email type whose wording genuinely branches (a payment receipt's succeeded and failed forms, a join and a leave notice) is registered as separate variant template keys, with code selecting the key and computing every merge value. Administrators edit a template's wording, enabled flag, and PII classification through the admin template editor, one audit entry per save; the editor is edit-only, because a template's existence, merge fields, and send site are code. Disabling a template suppresses that email type without deleting its content. Template content follows the Curator Content Source of Truth model: committed JSON sidecars under `/curated/email_templates/` seed `email_templates` before go-live, and the persistent production database is the sole source after.

- Admin work-queue notifications are routed by urgency rather than broadcast per event: urgent task types email the admin-alerts list immediately; routine task types are read on the work-queue dashboard and a periodic per-administrator digest of open items, with a claimed item leaving the other administrators' digests and a stale unclaimed item escalating once to the full list. This keeps the alert channel meaningful for a small volunteer team instead of training administrators to ignore it.

- Each registered template carries a PII classification (`public` / `internal` / `confidential` / `restricted`) that bounds how much of a sent message an admin may view: public and internal bodies may be shown, a confidential body only behind a justification-logged reveal, and a restricted (token-bearing) body never, because its `body_text` holds a live reset or magic-link token until the post-send scrub. The classification is a property of the template, not the individual message.

- Controllers only enqueue outbox entries; they never call SES directly.

- Services enqueue emails by creating outbox entities with recipient, subject, body, status. The background worker scans for pending entries on a system-wide configurable interval (default: every 30 seconds; configuration key `outbox_poll_interval_seconds`). After successful send via SES, it updates entry status. After failure, it increments retryCount and updates status. Maximum retries are controlled by the system-wide configuration value outbox_max_retry_attempts (not a per-row outbox override field); when retryCount reaches the configured limit, the worker moves the entry to dead_letter for admin review.

- Member profiles include subscription preferences derived from MailingList and MailingListSubscription: the UI renders checkboxes from MailingList records that are flagged as member-manageable (for example, newsletter, board-announcements, event-notifications, technical-updates), and changes are applied by updating MailingListSubscription and keeping Member.subscriptions in sync.

- SES webhooks update MailingListSubscription records (status, bounce/complaint fields) and any global member email status as needed, and the projection in Member.subscriptions is updated accordingly so future sends skip problematic addresses. SES bounce and complaint notifications arrive via SNS; the webhook endpoint verifies the SNS message signature against the AWS-published signing certificate before processing, and rejects any message that fails signature verification. This parallels the Stripe webhook signature verification in §6.1.

- Bounce state transitions: hard bounces (SES permanent-failure type) auto-flag the `MailingListSubscription` as `bounced` and block further sends to that list for that member. Soft bounces (SES transient-failure type) do not auto-flag on a single event; the worker tracks a sliding bounce count per address and flags as `bounced` only after a configurable threshold (USER_STORIES key `soft_bounce_threshold`). Complaints auto-flag immediately and block all lists for that member pending admin review.

- Bounce and complaint webhook idempotency: inbound SNS messages carry a `messageId`; the webhook handler tracks processed `messageId` values in a `ses_events` table with `messageId` as primary key. Duplicate arrivals return 200 immediately without reprocessing. Parallel to the `stripe_events` idempotency in §6.1.

- Alerting: bounce rate exceeding `bounce_rate_alarm_threshold` (USER_STORIES) and complaint rate exceeding `complaint_rate_alarm_threshold` (USER_STORIES) emit CloudWatch alarms per §8.2.

- Member soft-delete behavior for subscriptions and outbox: during the grace period, `MailingListSubscription` state (including `subscribed`, `unsubscribed`, `bounced`, and `complained` flags) is frozen and preserved. The soft-deleted member cannot change subscriptions because the account is inaccessible. New outbox entries are not enqueued for a soft-deleted member; queued entries addressed to them at the time of soft-delete are moved to `dead_letter` with reason `recipient_soft_deleted`. Missed sends during the grace period are not replayed.

- On member-initiated restore within the grace period: subscription states resume exactly as they were at soft-delete time. Intent is preserved; no re-opt-in is required. Outbox enqueuing reactivates immediately. Bounce and complaint flags persist across soft-delete and restore because they are facts about the email address, not about member intent.

- On PII purge (grace period expiry or explicit purge): `MailingListSubscription` rows are hard-deleted along with other member PII. Restore is no longer possible after this point.

- Admin dashboard shows basic email metrics: sent count, bounce rate, complaint rate, overall delivery health.

- Operational dashboards track pending, sent, and failed outbox entries and expose a “pause sending” emergency toggle.

- Email records are inserted into the outbox table within the same transaction as the business operation that triggers the email. This guarantees that if the transaction commits, the email is queued; if the transaction rolls back, neither the event nor the email record exists.

- Outbox body scrub (APP-019): security-sensitive emails (account verification, password reset, data-export download links, voting receipt tokens) carry single-use tokens in the body text. After successful send, the worker MUST set `outbox_emails.body_text = NULL` so the raw token does not persist in the live DB or in DB backups beyond the moment of delivery. The schema column is nullable specifically to support this scrub. Subject lines never contain tokens by design, so they are preserved.

- Link policy (anti-phishing): notification emails carry no clickable links. They name the action and give precise log-in-and-navigate instructions, so members are never trained to click links arriving in mail. A link appears only in an email-verification flow, where the link itself is the proof of mailbox control (account verification, password reset, data-export download, and claim or mailbox-link tokens). Relationship and nudge emails such as co-leader invitations and the admin contact-members prompt route the recipient to the standing on-site affordance by instruction, never by embedded link.

## 5.5 Canonical Email Addresses

Decision:

The platform uses a small, enumerated set of `@footbag.org` addresses with distinct, non-overlapping purposes. All platform code, documentation, and terraform configuration references these canonical addresses. New email addresses are added to this list before they are introduced into the codebase.

Outbound send is handled by AWS SES (see §5.4). Inbound receive for all role addresses is handled by Google Workspace, which delivers or forwards each address per its configured mailbox or alias. SES is not used for inbound ingestion.

| Address | Purpose | Direction | Used by |
|---|---|---|---|
| `admin@footbag.org` | Legal, administrative, privacy, copyright, and trademark contact for members and the public | Receives | `/legal` page (Privacy, Terms, Copyright sections); operator of record contact |
| `announce@footbag.org` | IFPA community announce list. A Tier 2+ member composes via the web form (not by emailing the address) and the platform distributes via SES; replies and direct mail to the address are received on Google and monitored or forwarded to IFPA admins. The platform never ingests inbound mail for this address | Sends (platform) + Receives (Google) | `CommunicationService.sendAnnounceEmail` (`M_Send_Announce_Email`) |
| `brat@footbag.org` | Legacy footbag.org webmaster (operator of record for the pre-migration site); must remain deliverable through and after cutover for migration coordination and any ongoing legacy-recovery correspondence | Receives | Carried over from the legacy site; in-use contact for the current webmaster |
| `directors@footbag.org` | IFPA Board of Directors contact for governance, board inquiries, and director correspondence | Receives | Carried over from the legacy site; in-use public contact for the Board |
| `noreply@footbag.org` | Transactional sender (account verification, password reset, receipts, system notifications); never monitored, never a reply target | Sends | `CommunicationService.processSendQueue` via SES |
| `ops-alert@footbag.org` | Operational alarm recipient (system health, backup failures, worker errors, SES bounce/complaint thresholds) | Receives | Terraform alarms (CloudWatch), `OperationsPlatformService` alarm flows |
| `sanctioning@footbag.org` | Event sanctioning contact for organizers applying for IFPA-sanctioned events and related correspondence | Receives | Carried over from the legacy site; in-use public contact for event sanctioning |

Rationale:

- A single canonical list prevents drift between code, docs, and terraform. A future maintainer or handover to IFPA can find every address in one place.
- Splitting receiving addresses by purpose (admin, announce, ops-alert) allows selective filtering, forwarding, and escalation without comingling legal inquiries with ops alerts or community mail.
- A dedicated `noreply@` sender preserves the convention that transactional messages are not a reply channel. Members who need to respond are directed to the appropriate purpose-specific address.
- Privacy and legal requests (GDPR export, CCPA deletion, copyright inquiries, trademark questions) are consolidated under `admin@footbag.org`; the `/legal` page surfaces this address in all three sections.

Requirements:

- Outbound email uses an SES domain identity (not a single verified address) with DKIM signing enabled, an SPF record published for the sending domain, and a DMARC policy of at least `quarantine` aligned with the sending identity. Bounce and complaint handling consume SES feedback notifications.
- The application's IAM grant to SES is scoped to the verified sending identity (`ses:SendEmail`, `ses:SendRawEmail` on the configured From-address ARN) and the specific actions the application uses, not `ses:*` on `*`. The Configuration Set used for sending is named explicitly in the policy.

Trade-offs:

- Alias and mailbox configuration is managed in Google Workspace (one rule per receive address rather than one catch-all). Where a role address needs collaborative shared-inbox workflows, Google Workspace provides a hosted mailbox without changing the canonical list.
- Requires discipline in code review to avoid introducing new addresses without updating this list.

Impact:

- `admin@footbag.org` is named in the `/legal` page Privacy, Terms, and Copyright sections as the legal/administrative contact.
- `announce@footbag.org` is documented in `docs/USER_STORIES.md` (`M_Send_Announce_Email`, Tier 2 benefits).
- Google Workspace is configured with one mailbox or forwarding rule per receive address (`admin@`, `announce@` inbound, `brat@`, `directors@`, `ops-alert@`, `sanctioning@`). `brat@`, `directors@`, and `sanctioning@` are in-use contacts carried over from the legacy site and must be live on Google before legacy delivery is withdrawn so no mail is lost.
- Any additional address (e.g., `privacy@`, `legal@`, `support@`, `info@`) must be justified against this list and added here before it is introduced. The default is to route new purposes to `admin@footbag.org` unless volume or scope warrants a split.
- Handover to IFPA: ownership of these addresses transfers as part of the operational handover; the addresses themselves and their purposes do not change.

## 5.6 Dev and Staging Email Preview

Decision:

Email-gated member-login pages render an in-page preview card of the
captured mail, driven by the email adapter (SES_ADAPTER=stub in dev
and staging; live in production only, where no card exists). The card
shows the captured messages for the flow the visitor is completing,
with subject, body, and the actionable link, so registration
verification, password reset, verify-resend, legacy-claim
confirmation, and mailbox-control confirmation each complete on the
page itself, with no navigation to the outbox viewer. GET /dev/outbox
remains the catch-all for captured notifications that have no host
page (tier changes, vouches, receipts). The shared service
(simulatedEmailService.getEmailPreview()) and Handlebars partial
(simulated-email-card) produce the card on every one of these pages.

| sesAdapter | Card | Purpose |
|---|---|---|
| stub | In-page preview on every email-gated login page | Captured messages for the flow being completed, with subject, body, and extracted action link. Newest first. Empty state when no messages have been sent. |
| live | (no card) | Production. Pages render the standard 'check your email' copy with no preview affordance. |

Rationale:

- Paid testers and maintainers exercise email-gated flows
  (registration verification, password reset, verify-resend, legacy
  claim, mailbox control) on both dev and staging. An in-page card at
  the exact page where the flow says "check your email" lets the
  tester click the captured link immediately, without inbox delivery
  and without navigating away from the flow.
- AWS SES sandbox restricts delivery to pre-verified recipient
  addresses. Engaging paid testers under sandbox requires per-tester
  AWS-console verification before they can receive mail, which scales
  poorly and risks bounces against the production domain's sender
  reputation.
- The §5.4 outbox_emails.body_text scrub stays immediate and mandatory
  in all environments. Dev and staging previews read from the in-
  memory StubSesAdapter buffer, not from outbox_emails, preserving
  the body-scrub contract via the in-memory adapter pattern.
- Stub on staging keeps deliverability testing out of the application
  path. Real-email deliverability is reserved for single-purpose
  tools (mail-tester.com, GlockApps, Litmus) against a canonical
  sending address, and for controlled production-dogfooding rollouts.
- Production is the only environment with live SES delivery. The
  first real send happens in production with a controlled rollout,
  not during paid-tester walkthrough on staging.

Requirements:

- The card renders on every email-gated member-login page whenever
  sesAdapter === 'stub' (dev and staging); production runs live and
  has no card. Anti-enumeration response identity is a production
  property, verified with the stub card's adapter gate off.
- The card is scoped to the flow the visitor is completing (the
  existing session/flow scoping mechanism, for example the
  flash-carried address on registration), showing that flow's
  captured messages with subject, body, and actionable link.
- GET /dev/outbox remains the catch-all viewer for captured
  notifications that have no host page; it merges the web process's
  captured buffer with the worker's.
- Dev and staging previews read from the StubSesAdapter in-memory
  buffer, not from outbox_emails. This preserves the §5.4 body-text
  scrub contract: the scrub operates on the DB row, while adapter
  memory is scrub-exempt and holds the original content for the
  lifetime of the process.
- Production boot refuses SES_ADAPTER=stub. Non-production boot
  refuses SES_ADAPTER=live.

Trade-offs:

- Real-email deliverability is not exercised on staging. Acceptable:
  deliverability testing is a separate, single-purpose activity using
  dedicated tools against a canonical sending address; bouncing test
  emails against the production domain risks sender reputation.
- Two SES adapters today (stub and live). Adding a third adapter
  value for SMTP-capture sinks (e.g., a Mailtrap-style adapter) is
  the future upgrade path if staging requires real-SMTP-shape
  rehearsal without inbox pollution. Production stays on live.
- An in-app preview card rather than an external mail catcher
  (MailHog, Mailpit, Mailtrap) keeps local setup zero-dependency. The
  SMTP-capture adapter expansion is the way to add an external test
  inbox if it becomes valuable.

Impact:

- Staging Docker compose and scripts/verify-staging-env.sh set
  SES_ADAPTER=stub; non-stub on staging fails boot.
- Production sets SES_ADAPTER=live; non-live on production fails boot.
- The in-page preview card on email-gated landing pages serves as
  the captured-email surface for dev and staging.
- Future link-bearing email categories (Stripe payment receipts,
  event registration confirmations, donation acknowledgements)
  inherit the card on dev and staging at zero plumbing cost.

## 5.7 Adapter contract parity for security-sensitive paths

Decision:

Stub and live adapters honor contract parity for security-sensitive
code paths. Stub adapters that synthesize signed payloads (Stripe
webhooks, JWT, any HMAC-signed inbound event) sign their synthetic
payloads with a deterministic literal constant, and the same
verifier that production runs against the live secret validates them
against the stub constant. Stub signing literals are permanent test
infrastructure and live co-located with the stub adapter that uses
them (e.g. STUB_WEBHOOK_SECRET in src/adapters/paymentAdapter.ts),
never in the dev-bootstrap subtree, and are never
shared with any production secret value. They ship in the production
image but are refused at boot, not excluded from it.

Rationale:

- Stub adapters that bypass signature verification leave the
  verification code path dark in every test. Refactors, middleware-
  order changes, and library upgrades that silently break verification
  fail loudly in production on the first real webhook delivery, not
  in tests.
- Signature handling is the most expensive class of webhook bug to
  debug in production: it produces silent rejections, intermittent
  failures depending on event order, and signature errors that
  surface as 400 responses to the external sender (Stripe retries
  indefinitely until the error class is fixed).
- Using a deterministic stub literal that the same verifier validates
  means the verification middleware is exercised by every integration
  test and every manual stub click-through. Bypass branches are
  eliminated by construction.
- Stub signing literals follow the §1.14 single-source containment
  pattern. Unlike the dev-bootstrap and testkit subtrees, which are
  excluded from the production image at build time, the signed-stub
  parity infrastructure ships in the production image; its production
  containment is a boot-time refusal of stub-prefixed secrets.
- Contract parity scopes narrowly to security-sensitive paths
  (signing, verification, authn). Other adapter contract surfaces
  (request shape, response shape, error mapping) follow the standard
  mock-or-stub pattern at the integration-test layer.

Requirements:

- Stub adapters that synthesize signed payloads sign with a
  deterministic literal constant matching the verifier's expected
  scheme (e.g., HMAC-SHA256 with t=<ts>,v1=<hex> for Stripe webhooks).
- The same verifier code path runs in stub and live modes; the
  adapter selection determines which secret is used, not whether
  verification runs.
- Stub signing secret literals live co-located with their stub
  adapter under single-source containment, regression-tested for
  non-leakage.
- Stub secrets are deterministic for in-test reproducibility but
  production-equivalent in cryptographic shape (length, encoding,
  algorithm compatibility).
- A tamper-and-reject integration test for each signed-payload type
  asserts the verifier rejects a payload with a mutated signature.

Trade-offs:

- Stub adapter implementations carry signing logic that production
  live adapters do not need (live adapters receive pre-signed
  payloads from the external service). Acceptable: the signing logic
  is small and isolated to the stub adapter.
- Stub signing literals are permanent and therefore not part of the
  cutover-audit surface; the prod-refusal guard, not the cutover
  audit, is what keeps them out of production use.

Impact:

- New stub adapters (current: payment; future webhook-receiving
  integrations such as Stripe Connect, Slack, GitHub) implement
  signing as part of the stub contract, not as a test-only
  afterthought.
- The signature-verification middleware is exercised by every
  relevant integration test, surfacing regressions in test runs
  rather than in production.
- Test patterns receive the stub-signed header rather than placeholder
  strings on signed-payload inputs.

# 6. External Services and Integrations

## 6.1 Stripe Payments

Decision:

Stripe handles all credit card processing with separate Live/Test API keys per environment. IFPA acts as intermediary: platform collects event registration payments, holds funds, distributes to organizers post-event. No Stripe Connect automated payouts.

Rationale:

- Offloads PCI compliance to Stripe (no card data touches our systems).

- Test mode in dev/staging enables safe payment testing.

- Manual distribution provides IFPA oversight and reconciliation capability.

- This integration is required in order to process membership dues, event registrations, and donations.

The platform uses two distinct Stripe payment models:

- One-time payments (membership dues, event registrations, one-time donations): Implemented via Stripe Checkout in payment mode. State transitions are keyed by payment_intent_id. The enforced state machine is: pending → succeeded on payment_intent.succeeded; pending → failed on payment_intent.payment_failed; succeeded → refunded on charge.refunded.

- Recurring annual donations: Implemented via Stripe Subscriptions. The platform creates or reuses a Stripe Customer object for each member (stripeCustomerId stored on the member record) and creates a yearly Stripe Subscription via Stripe Checkout in subscription mode. The platform does not manage the billing schedule or retries. Stripe owns the annual renewal cycle, dunning configuration, and retry logic. Local state transitions are driven entirely by incoming webhooks: active on customer.subscription.created; a new payment record created on invoice.payment_succeeded; local status set to past_due on invoice.payment_failed; local status set to canceled on customer.subscription.deleted. The Stripe Billing dunning schedule (number of retries, intervals) is configured by a System Administrator in the Stripe Dashboard and is not replicated in application configuration.

Payment recurrence is derived from Stripe subscription linkage, not duplicated on individual payment rows. payments identifies recurring-donation charges via recurring_subscription_id and joins to the subscription tables for current subscription lifecycle state. The schema intentionally does not duplicate subscription recurrence fields (for example recurrence type/active/start state) on each payment row to avoid drift between payment records and subscription state.  

- Stripe webhook idempotency is enforced by tracking processed event IDs in a stripe_events table with event_id as primary key. When webhooks arrive, the handler first checks if the event_id already exists. If found, the handler returns 200 immediately without reprocessing, preventing duplicate tier upgrades, duplicate payment records, and duplicate refund processing. For one-time payments: in one DB transaction, claim the event_id in stripe_events (INSERT OR IGNORE) and load/update the local payment by payment_intent_id under a monotonic state machine; a claim finding the id already present is a no-op duplicate. The claim shares the mutation's transaction, so a processing failure rolls it back and Stripe's redelivery re-runs cleanly. A signature failure returns 400 with no state; a recoverable processing failure returns 400 so Stripe retries; processed, duplicate, and unhandled-type events return 200. Record last_stripe_event_created to ignore older events. For subscription events: insert into stripe_events first; on conflict return 200. In one DB transaction, load/update the local donation subscription record by stripeSubscriptionId and process the event type. Mark each event processed with attempts and last_error.

Trade-offs:

- Manual payout process creates administrative overhead.

- No direct organizer-to-participant payment flow.

- Future Stripe Connect integration will require architectural changes.

Impact:

- Payment adapter wraps Stripe SDK with environment-aware configuration.

- Webhook handler validates signatures and processes payment events.

- Payment reconciliation runs as a scheduled nightly job that compares platform records against Stripe and records mismatches; distribution is handled outside the automated system.

## 6.2 CloudFront CDN

Decision:

A single CloudFront distribution fronts the main site with different cache behaviors; the legacy archive at archive.footbag.org is served by a separate CloudFront distribution (§6.4). All HTML responses from the Lightsail origin (public, mixed-state, and authenticated) use the AWS managed `CachingDisabled` cache policy (TTL 0/0/0): server-rendered HTML in this app frequently shapes content by viewer state (auth, role, tier, ownership), and per-route classification of cacheability would be brittle as the route surface grows; routing all HTML to the origin keeps cache decisions out of CloudFront and lets the Express middleware at `src/app.ts` enforce `Cache-Control: private, no-store` on every authenticated response without coordination with edge config. Static assets (CSS, JS, images, fonts) are served from the Lightsail origin and edge-cached under a custom cache policy that includes the `?v=` content-hash token in the cache key, for long-lived caching of immutable versioned URLs (see §6.7). Health probes use `CachingDisabled`. The separate archive distribution uses a 1-year TTL on its S3 archive-bucket origin with members-only (signed-cookie) access (§6.4). Cache behaviors targeting S3 origins must omit `origin_request_policy_id` (or use only a policy that excludes `Host`).

Rationale:

- Reduces origin load by serving static assets and user-uploaded media from edge locations.

- Static assets use content-hash filenames enabling long-lived caching.

- Archive is immutable so extremely long cache is safe.

- For OAC-fronted S3 origins, omitting `origin_request_policy_id` is required because S3 uses the `Host` header for virtual-host bucket routing and OAC overrides only `Authorization`. Forwarding the viewer's `Host` (the CloudFront edge domain) to S3 makes S3 unable to identify the bucket and return generic `NotFound` before bucket policy evaluation.

Requirements:

- Every CloudFront distribution pins viewer minimum TLS protocol to `TLSv1.2_2021` (or higher). The protocol version is set in Terraform; CloudFront viewer settings are not modified via the AWS Console.
- Edge abuse prevention follows §8.3: AWS Shield Standard for volumetric DDoS, Turnstile at the form boundary, in-process rate limiting, and a CloudWatch origin-spike alarm. A WAFv2 web ACL with the AWS managed common rule set and a rate-based rule is a deferred lever, attached if observed abuse later warrants it.
- CloudFront access logs and S3 server access logs (for OAC-fronted buckets) are enabled and shipped to a dedicated log bucket whose lifecycle matches the retention windows in §1.2.

Trade-offs:

- Cache invalidation required for emergency content changes.

- CloudFront costs proportional to traffic (acceptable at community scale).

Impact:

- Origin server sees fraction of actual traffic.

- Global latency improved significantly.

- Cache invalidation procedures must be documented in DEVOPS_GUIDE.md (private GitHub repo).

## 6.3 CloudFront Error Pages

Decision:

CloudFront is configured to serve custom error pages for server failures (5xx status codes). For GET/HEAD requests, when the Lightsail origin returns 500, 502, 503, or 504 errors (or is unreachable), CloudFront automatically displays a branded maintenance page stored in S3, informing users that the site is temporarily unavailable. State-changing requests (POST/PUT/DELETE) may instead fail with connection errors/timeouts and will not reliably receive the maintenance page.

Rationale:

Simplicity: Custom error pages provide graceful degradation during outages without a large maintenance burden. We assume a single-instance origin and accept occasional downtime as a trade-off for reduced complexity; availability is achieved through automated backups, rapid recovery procedures, and monitoring rather than redundant compute infrastructure.

Clear failure modes: With custom error pages, the system has two states: working or maintenance mode. Browsing requests (GET/HEAD) see either the live application or a clear maintenance message, while state-changing requests may fail with connection errors/timeouts during outages. This is easier to understand, monitor, and troubleshoot than hybrid read-only failover states.

Cost efficiency: Custom error pages cost \$0.10 per month (S3 storage for error page).

Trade-offs:

No content access during outages: Users cannot browse events, clubs, or media galleries when the Lightsail instance is down. They see only the maintenance page. For a community site where outages are rare and brief, this is an acceptable trade-off for significantly simpler operations.

No partial degradation: Unlike a static mirror approach, there's no "read-only" mode where some functionality remains available. The site is either fully operational or completely in maintenance mode.

Outage visibility: Browsing users (GET/HEAD) immediately see the maintenance page during failures, whereas a static mirror might allow continued browsing. However, this visibility is also a benefit for transparency about system status.

Impact:

Terraform Configuration: CloudFront distribution configured with error page responses:

- 500 Internal Server Error → maintenance.html (10 second cache TTL)

- 502 Bad Gateway → maintenance.html (10 second cache TTL)

- 503 Service Unavailable → maintenance.html (10 second cache TTL)

- 504 Gateway Timeout → maintenance.html (10 second cache TTL)

Short cache TTL ensures error pages don't persist after recovery.

S3 Bucket for Error Page: dedicated S3 bucket (footbag-error-pages) contains:

- maintenance.html - Branded maintenance page with Footbag.org styling

- error.css - Minimal styling

- logo.png - Footbag logo

CloudFront exit from maintenance is automatic. When Lightsail instance returns to health and responds with 2xx or 3xx status codes, CloudFront immediately resumes serving live content. No manual intervention required. Error page cache TTL of 10 seconds ensures stale error pages clear quickly after recovery. Restoring the origin may require admin intervention (restart/rollback/restore).

Alternative considered:

A static, read-only mirror of key site content (e.g., events, clubs, media galleries) hosted in S3 and configured as a secondary CloudFront origin (Origin Group failover) was evaluated as a way to preserve limited browsing during Lightsail outages. This approach was not selected.

## 6.4 Legacy Archive (old footbag.org)

Decision:

The legacy footbag.org site is preserved as a static HTML mirror in a dedicated S3 bucket served via CloudFront at archive.footbag.org. Access is restricted to authenticated members of the main platform. Legacy URLs redirect to archive equivalents via 301. Edge authentication uses CloudFront signed cookies via a trusted-signer key group; the main app issues the signed cookie at session creation and on every session refresh.

Rationale:

- Preserves community history permanently without maintaining the original database stack or PHP runtime.

- A separate S3 bucket isolates archive content from active platform (security boundary, billing boundary).

- Members-only access protects old member contact information preserved in the archive HTML.

- 301 redirects from legacy URL patterns preserve link integrity and search-engine equity.

- Archive HTML uses mp4 video and jpg images, and contains no JavaScript, so the mirror is fully static.

- CloudFront signed cookies enforce the auth check natively at the edge. CloudFront verifies the cookie's RSA signature against the public key in the trusted-signer key group resource; no edge code path, no Lambda@Edge, no public-key bundling.

- Cookie domain is `.footbag.org` so a single session covers both the apex (or www) and the archive subdomain without a separate login.

Requirements:

- A CloudFront key group resource (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) holds the public half of the signing keypair. The private half is stored in AWS Secrets Manager (or SSM SecureString), scoped to the main app's runtime IAM role.

- The archive CloudFront cache behavior names the key group in `trusted_key_groups` so all requests under that behavior require a valid signed cookie.

- The main app sets the signed cookie at every login and at every JWT refresh, in the same middleware that re-issues the session JWT. Cookie expiry equals the JWT TTL (24h default per §3.4) so archive access and main-site access share the same staleness boundary.

- The S3 archive bucket is private behind Origin Access Control. The bucket policy permits only the archive CloudFront distribution to read.

- The archive CloudFront distribution uses 1-year edge TTL on its content (immutable archive per §6.2) and a custom 403 error response that redirects to `https://footbag.org/login?return=archive.footbag.org` when the signed cookie is missing or invalid.

- DNS for archive.footbag.org is a Route 53 record pointing at the archive distribution.

- Key rotation follows the multi-key pattern: add the new public key to the key group, the app starts signing with the new private key, the old public key stays in the group during a grace period equal to the cookie TTL, then the old key is removed.

Trade-offs:

- No search capability across the archive (acceptable for static preservation).

- The archive is a one-time capture and is not refreshed.

- Authentication required means the public cannot browse archive history; intentional given the private member data in the archive HTML.

- CloudFront signed cookies cannot query the platform database, so archive access does not perform the JWT `passwordVersion` lookup the main app does on every authenticated request. A member who changes their password, or is administratively banned, retains archive access until their signed cookie expires (up to 24h). Accepted given the read-only static nature of archive content.

Impact:

- Archive infrastructure is fully expressed in Terraform: archive S3 bucket, OAC, archive CloudFront distribution, key group, Route 53 record. No Lambda code path.

- The main app's login and JWT-refresh middleware sets the signed cookie alongside the session JWT. Both cookies use `Domain=.footbag.org` (host-only scope is not sufficient for the subdomain to receive them).

- Trusted-signer private key rotation procedure is documented in DEVOPS_GUIDE.md (private GitHub repo).

- The CSRF Origin-pin middleware (§3.3) rejects same-site subdomain forgery attempts because Origin verification is independent of cookie scope.

## 6.5 Legacy Data Migration

Decision:

The platform absorbs legacy data from two sources before or at production go-live:

**Historical pipeline.** Persons, events, results, honors (Hall of Fame, BAP), clubs, club affiliations, and club leadership. Person truth comes from human-curated CSV files. Club data comes from mirror extraction scripts integrated into the same pipeline. The pipeline also creates historical person records for ~1,600 club-only members who never competed in events. A historical person may exist without a claimed modern account; historical data is published regardless. Bootstrap-eligible clubs are created at go-live with leaders in `club_bootstrap_leaders`. Leaders can manage the club once they register. If a leader has not registered, the first affiliated member who registers can accept leadership during onboarding (tier-exempt, no admin confirmation).

**Legacy member import.** All legacy registered member accounts are imported as rows in the `legacy_members` table. These rows hold the legacy-account identity and import-era profile snapshot as a permanent archival record; they cannot log in (there is no credential material in `legacy_members` at all) and do not appear in any current-member surface. The source is a one-time export from the legacy site webmaster, used first as a test load for validation, then as the final production import after write freeze. Legacy passwords are never imported or used.

The two sources share the same identity key (`legacy_member_id`) and converge via FK: `historical_persons.legacy_member_id` and `legacy_members.legacy_member_id` point at the same namespace, and a modern `members` row links into both at claim time via `members.legacy_member_id` and `members.historical_person_id`.

**Self-serve claim flow (umbrella).** The member's experience of claiming pre-existing identity (an old website account, a competition record, or both) is a single act composed of several mechanisms: card confirmations (auto-link candidates surfaced by the wizard, cross-source candidate prompts, registration-time conflict prompts), declared-anchor entry (optional former surnames and optional declared old emails, both member-and-admin private), a mailbox-control round-trip via a confirmation link to a declared old email (required before a declared old email can confirm a claim), and a direct historical-record claim affordance on the historical detail page. The wizard's claim task is the sole entry surface for a legacy claim; the profile and historical-record pages route the member into that task rather than providing a separate claim path. Auto-link sends no notification emails. Card-at-login is the only post-link member-facing surface; effects (tier upgrade, attribution, badges) apply only after the member explicitly confirms a card. Every confirmed claim transaction carries an evidence-strength tag on its audit row (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`, or `admin_vetted_evidence`). A legacy account carries up to three email addresses (a primary plus two secondaries); a member's verified login email and declared old emails match against all of them, and cross-account email collisions are resolved a priori during legacy-data validation rather than at match time. The umbrella story and case-by-case mechanics live in the `M_Claim_Legacy_Account` user story.

**Tier handling.** At claim, a member receives one membership-tier grant for the standing their legacy account held, written as a single `member_tier_grants` ledger row (`reason_code = 'legacy.claim_tier_grant'`) under the IFPA-approved blanket policy that maps each legacy standing (board, honors, paid history) to its 2026 equivalent, annual to lifetime. The per-standing mapping is the success criteria of `M_Claim_Legacy_Account`; a record showing only honors is granted on that basis as one outcome of that mapping, not a separate mode. Unclaimed `legacy_members` rows have no ledger row. No tier cache columns exist on `members`; membership-tier reads go through `MembershipTieringService.getTierStatus(memberId)`; Active Player reads go through `ActivePlayerService.getStatus(memberId)`.

**Operational sequencing.** The legacy site enters write freeze; the final export is imported; schema changes are applied to production; clubs are bootstrapped; DNS switches to the new platform. Rollback lever before DNS switch: abort and retry. Rollback lever after DNS switch: manual DNS reversion to the legacy site. No automated rollback is provided after the DNS switch.

**Auto-link cutover surface.** At cutover, the batch auto-link pass stages candidate matches (writes a staged-candidate row per matched live member) without mutating live tables. No notification emails are sent. The wizard surfaces staged candidates to each member at next sign-in via the universal claim task; the member confirms or declines per the umbrella claim flow. Honors-bearing direct historical-record claims (HoF, BAP) carry the honor forward on the member's own confirmed claim, gated by the identity-link matching rule (a surname match plus the declared email and date-of-birth anchors). Trustworthiness rests on that match, on a-priori validation of the imported honor flags against the authoritative public rosters before go-live, and on the admin dispute-revert path for any wrong claim. Members who cannot resolve their identity through the platform's self-serve surfaces use the member-initiated admin help request affordance (`A_Review_Member_Link_Help_Requests`); admin reviews, communicates as needed, and approves or rejects.

**Club leader bootstrap classification.** The wizard's bootstrap leadership confirmation classifies each `(member, club)` candidate via combination gates over five structural signals (`listed_contact`, `affiliation`, `hosting`, `roster`, `mirror_text`). Three modifier signals (`tier_signal`, `recent_activity`, `geographic_alignment`) display alongside structural signals in member-facing and admin surfaces but do not change classification. On user confirmation or correction, the bootstrap row promotes to a live `club_leaders` row regardless of classification strength and regardless of registrant tier; the classification (strong, weak, none) is recorded in audit metadata for post-cutover analytics. Decline transitions the bootstrap row to `'rejected'`. Claim eligibility is independent of club status; a successful claim returns an inactive or archived club to `'active'`, audit-logged as a revival. Rules are encoded in service code, not stored as data; revisions follow observed false-positive data.

**Legacy-data cleanup.** Club-roster reads show confirmed members and unconfirmed `'pending'` legacy affiliations in one member-visible list on the club detail page; a `'pending'` row carries a per-entry unconfirmed label and is never asserted as current. The club detail page applies the same labeled-display approach to leadership: clubs outside the bootstrap-eligible cohort carry no `club_bootstrap_leaders` rows, so their mirror-inferred `leader` / `co-leader` / `contact` affiliations surface there as provisional leaders, labeled and never contact-exposed, deduplicated by person id against any bootstrap rows and cleared once a real member claims leadership; the legacy dump and mirror are the only leadership data for those clubs. Cleanup of that residue is admin-driven, not a background process: when an admin opens the `A_Periodic_Club_Cleanup` queue, the `crowdsource_club_viability`, `leaderless_active_club`, and `stale_provisional_leader` predicates are evaluated on demand and surface one-click recommendations; unconfirmed residue is retired by an explicit per-club de-list (`legacy_person_club_affiliations` 'pending' to 'former_only'), also cascaded when a club is demoted or archived. A `'pending'` row also drains when its member confirms or declines it in the onboarding wizard. Duplicate club candidates are merged before cutover by a curator-confirmed directive in the pipeline (the kept candidate absorbs the duplicate's roster and affiliations, recording source keys), not by automatic clustering or a platform-side process. Rationale: the migration-window `pending` backlog is made honest by labeling rather than hidden or auto-resolved; bounded admin effort comes from one-click per-club actions guided by an advisory age signal, not an unattended worker; and the handful of true duplicate clubs are reconciled by a deterministic curator merge that unions rosters rather than dropping data. Admin remains the sole decision authority for every judgment case (mistaken linkage, junk override, force-keep requests). Club content is edited directly by co-leaders with no review queue; activity signals are collected only in the onboarding wizard, counted one vote per member, and the cleanup queue names negative voters to the admin while authorship never renders publicly.

Rationale:

- Separating the historical pipeline from the legacy member import allows historical content and clubs to proceed independently, reducing go-live risk.
- The imported-row model preserves legacy identity without granting premature access. Mailbox verification is the minimal proof step that is both secure and feasible given the data available.
- Club bootstrap ensures clubs are present on day one. Leaders can manage clubs once they register.
- Ledger-only tier handling eliminates the cache-sync complexity that existed in earlier designs and makes imported-row tier state auditable from day one.
- Stage-and-confirm auto-link with no notification emails balances throughput and trust: nothing applies silently, so a wrong candidate match never produces an unnoticed wrong link; the member's wizard confirmation is the gate. Honors-bearing direct claims do not need a separate admin pre-screen gate because the identity-link matching rules already gate them (a surname match plus the declared email and date-of-birth anchors), backed by member self-confirmation, the registration-time name-collision prompt, a-priori validation of the honor flags against the public rosters, and the member-initiated dispute-revert path; a suspected fraudulent claim is raised to the admins and reverted. Members who cannot resolve their identity self-serve use the admin help-request path; admin involvement is reactive, not gating.
- Combination gates for bootstrap classification were preferred over a weighted score because audit transparency matters more for migration-time identity work than tunability. An admin reviewing a weak-classified case reads which signal combinations fired, not an opaque scalar; a wrong gate is debugged by inspecting the rule, not by retuning a weight.

Requirements:

- Bulk loaders default to dry-run. An explicit `--apply` flag is required to write, and every apply emits an audit CSV (rows changed, before/after values for non-trivial mutations) plus a rollback SQL script before the transaction commits. A loader cannot mutate the database without producing both artifacts.
- Synthetic preview or demo seed fixtures (e.g. the Footbag-Hacky preview profile) are gated behind an environment flag (e.g. `FOOTBAG_SEED_PREVIEW_FIXTURE=1`). Production loaders do not include them by default and the flag is not set in the production environment.
- Loaders enforce foreign-key checks (`PRAGMA foreign_keys = ON`); a loader cannot disable FK enforcement to land data. A row that violates a foreign key is a loader bug to fix, not a constraint to bypass.

Trade-offs:

- Members must take an active step to claim their legacy identity (cannot be auto-matched without mailbox verification).
- Members without access to their legacy email address must contact an admin for manual recovery.
- Club bootstrap depends on mirror-derived data quality; clubs with ambiguous or low-confidence leader data require admin review.
- No automated rollback after DNS switch; rollback requires manual DNS reversion and coordination.
- Stage-and-confirm with no notification emails means a member who never signs in to the new platform never has effects applied. Pre-existing identity stays unclaimed for never-signed-in members; passive members get nothing automatically. The trade-off favors correctness (no silent grants) over coverage (some legitimate members go unconfirmed).
- Adjusting bootstrap gate rules requires a code revision rather than a data update.

## 6.5a Sealed Legacy Email Archive

Decision:

The legacy IFPA group-message archive (the `ifpa_group_messages` corpus and any equivalent legacy private mail or list data) is sealed and retained privately. It is never imported into the platform, never processed, and never exposed publicly. Privately cast committee votes within it are permanently non-publishable. It is IFPA governance data: any future disposition (preserve a subset as historical record, redact, publish any portion, or destroy it) is an IFPA governance decision under IFPA's records-retention policy, not an operator or maintainer decision.

The seal is enforced technically, not by policy alone. The archive is held as an encrypted container; its decryption key is held in an IFPA-governed, access-controlled secret store. The encrypted container and the key vault are kept in an IFPA-governed cloud store restricted to the IFPA board and platform admins. The credential that opens the key vault is held separately from that store, under IFPA governance, with an IFPA-named backup holder, so access to the store alone cannot unseal the archive and loss of a single credential does not destroy it. The legacy-site webmaster is operational custodian of the encrypted container and the authoritative source for facts about its contents; he is not its decision authority.

Rationale:

- The corpus intermixes private and public discussion and privately cast votes, and is heavy with spam and moderation residue. Importing or exposing it carries irreversible privacy risk with no v1 product need.
- IFPA owns these records, so the authority to release, redact, or destroy them belongs to IFPA governance, not to whoever operationally holds the files.
- A technical seal (encryption plus separated key custody) makes private-by-default enforceable rather than aspirational; separating the key from the store prevents single-boundary exposure, and a backup key-holder prevents accidental permanent destruction.

Requirements:

- The encrypted container, the key vault, and the opening credential are never committed to the repository, placed in issues, logs, tests, or AI prompts. Concrete custody details (store, folder, vault entry, access list) live only in operator notes, not in any tracked doc.
- Unsealing requires explicit IFPA governance authorization; the access list and key-holder list are maintained under IFPA governance and revised on board or admin turnover.

Trade-offs:

- The dataset persists in private storage and must be kept access-controlled for as long as IFPA retains it; the cost of preserving optionality is ongoing custody, not a one-time action.
- Nothing from the corpus is available to the platform or to members unless and until IFPA governance decides to release a classified subset.

## 6.6 AWS Service Integration

Decision:

All AWS services (S3, SES, Parameter Store, KMS, CloudWatch) are accessed through dedicated adapter modules. No direct AWS SDK calls from business logic.

Rationale:

- Enables environment-specific configuration (dev, staging, prod buckets differ).

- Facilitates testing via adapter mocking.

- Centralizes error handling, retries, and logging for external calls.

- Maintains clean separation of concerns between business logic and infrastructure.

Trade-offs:

- Additional abstraction layer adds code volume.

- Adapters require maintenance when AWS SDKs change.

Impact:

- Services layer never imports AWS SDKs directly.

- Test strategy can mock adapters without AWS dependencies.

- Configuration changes isolated to adapter initialization.

## 6.7 Static Assets and CDN Strategy

Decision:

Static assets (CSS, JS, images, fonts) are served from the Lightsail origin under stable filenames and cache-busted by a content-hash version token in the query string (`/css/style.css?v=<hash>`). The token is computed at runtime from each file's bytes; no build step or bundler generates hashed filenames. CloudFront edge-caches every static-asset path under a cache policy that includes the version token in the cache key, so a changed file is a distinct edge entry and a deploy self-cache-busts with no manual invalidation.

Rationale:

- A content-hash token makes each asset URL immutable (the token changes when the bytes change), giving the same cache-correctness as hashed filenames without a build pipeline.

- Runtime fingerprinting keeps the build to `tsc` only, matching the project's simplicity and volunteer-maintainability goals.

- Serving from the Lightsail origin avoids a second static-asset origin (S3 sync, bucket policy, origin access control); with immutable assets edge-cached at a 1-year ceiling the origin is reached at most once per edge location per asset, so a dedicated S3 static origin would add operational complexity for no meaningful gain.

- Overwriting files in place on deploy means old versions never accumulate, so no asset-cleanup job is needed.

Trade-offs:

- The version token must be present on every asset reference. References the app emits in templates get it via the `asset` helper; references embedded inside CSS (`url(...)` for fonts and background images) are fingerprinted when the CSS is served, so coverage is uniform.

- A query-string token cache-busts at CloudFront only when the cache policy includes the query string in the cache key; every static-asset cache behavior therefore uses that policy. The managed `CachingOptimized` policy, which strips query strings, is not used for these paths.

- Deployment is atomic: templates, CSS, and the assets they reference deploy together in one Docker image, so references and bytes always match.

Impact:

- No build-time asset step; the `asset` helper computes and appends `?v=<hash>` at render time, memoized per process.

- CSS is served through a fingerprinting pass that rewrites embedded `url(...)` references to carry the same `?v=<hash>` token, so fonts and CSS-referenced images are versioned uniformly.

- CloudFront serves assets from the edge with near-zero origin requests; each distinct `?v=` token is its own immutable edge entry.

- JavaScript is delivered as per-page or per-feature script files (no bundler); a page is either fully interactive (its scripts load) or clearly non-interactive with a \<noscript\> message, never partially wired.

Cache control header strategy:

- Static assets carrying a `?v=` token (CSS, JavaScript, images, fonts): Cache-Control: public, max-age=31536000, immutable.

- API endpoints, authenticated HTML, and any personalized/user-specific content: Cache-Control: private, no-store, set by Express middleware on every authenticated response. CloudFront's default cache behavior uses the AWS managed `CachingDisabled` cache policy for all HTML routes (public, mixed-state, and authenticated alike): the app frequently varies HTML by viewer state across many routes, and rather than per-route classification, all HTML is routed to origin so the middleware is the single mechanism for HTML cache control. Static assets (which never vary by viewer) continue to be edge-cached aggressively per the static-asset bullet above. Member-uploaded photos and system-account-owned media (`/media-store/*`) are edge-cached via a CloudFront cache policy that includes the query string in the cache key, supporting URL-versioned cache-bust (e.g. `?v={media_id}`).

- Public unauthenticated routes that render a single-use token in HTML (the password-reset form is the canonical example: it embeds the reset token in a hidden form field and in the form `action` URL) MUST also send `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`. Without this, a shared HTTP proxy or browser back-button cache could capture an unconsumed token. The app middleware that sets `private, no-store` for authenticated responses does not apply here because the route is anonymous; controllers must set the headers explicitly on both the GET render and any 422 re-render that includes the token.

- Edge-cached content (static assets and media) is content-versioned by its `?v=` token, so a changed asset is a new URL and never needs invalidation; HTML is not edge-cached, so it has nothing to invalidate. Manual CloudFront purge remains a System Administrator / DevOps escape hatch for emergencies, not an Application Administrator control.

## 6.8 Image Processing

Decision:

Images are processed synchronously on upload to eliminate malware and generate two variants: Thumbnail (300×300 pixels) and Display (800px width), both stored as JPEG at 85% quality in S3. Original files are discarded after processing.

Rationale:

Re-encoding through the Sharp library destroys malware by converting images to raw pixels and back, discarding everything except visual content. This eliminates the need for antivirus scanning (ClamAV container, 500MB RAM, ongoing updates, performance overhead). Processing is synchronous, users wait 2-5 seconds for completion and receive immediate success or failure feedback, simplifying implementation by avoiding background workers and notification systems.

Multiple size variants optimize bandwidth and page load times. JPEG output at 85% quality balances visual quality with file size, achieving approximately 85% storage reduction per photo. Metadata stripping removes all EXIF data (GPS, camera info) and ICC profiles for privacy and security.

Security Pipeline:

- Format restriction: JPEG and PNG only (GIF excluded due to Sharp animation limitations)

- Magic byte verification: File headers must match declared type

- Size limits: 5MB (avatar) / 25MB (photo) file size, 4096×4096 pixels

- Re-encoding: Sharp converts to raw pixels and back, destroying malware

- Metadata stripping: All EXIF and ICC profiles removed

- Variant generation: 300×300px thumbnail, 800px width display (or smaller if original is smaller)

Trade-offs Accepted:

- Users wait 2-5 seconds during synchronous processing (acceptable for immediate feedback)

- Quality loss from 85% JPEG compression (acceptable for web display)

- No animated GIF support (use video embedding instead)

- No video file uploads from members (YouTube/Vimeo embedding reduces complexity and cost). System-account video bytes are accepted via the curator path with full ffmpeg transcode for malware sanitization; see Curator Media Processing below.

- Members cannot download original high-resolution photos (only processed variants available)

Benefits:

- Zero antivirus maintenance burden

- Standardized image quality across platform

- Simpler deployment (no separate antivirus container)

- 85% storage reduction per photo

- Immediate user feedback on upload success/failure

Impact:

Upload controller validates format and size limits. Image processing occurs server-side via Sharp library.

Malformed image protection: Attackers can upload crafted images with corrupted headers that cause image processing libraries to allocate excessive memory or enter infinite loops. Protection measures for synchronous image processing:

Pre-processing validation: Reject uploads exceeding the per-type byte cap (5MB avatar, 25MB photo) before processing begins. Validate magic bytes to ensure only JPEG and PNG formats are accepted, preventing processing of disguised executables. Reject images smaller than 200×200 pixels or with an aspect ratio more extreme than 4:1, with a clear validation error.

Processing resource limits: Set processing timeout of 30 seconds per image via sharp's timeout option. Any processing exceeding this duration throws an exception, preventing infinite loops. Configure sharp library with limitInputPixels(16777216) preventing processing of images larger than 4096×4096 pixels (enforces the documented size policy limit).

Concurrency control: Limit concurrent image processing via a semaphore sized per host (one on the small staging instance, two in production). If the semaphore is full, the worker returns 503 with a Retry-After signal so the caller retries shortly. This prevents resource exhaustion when multiple users upload simultaneously during high-traffic events.

Error handling: Processing failures return clear user-facing errors ('Image processing failed, please try a different image') without exposing implementation details or library error messages that could aid attackers.

Both processed variants are stored in S3 and edge-cached under the single immutable `/media-store/*` cache policy, versioned by the `?v={media_id}` token (§6.7). Error responses: 400 for validation errors, 500 for processing errors, 504 for S3 timeout.

Curator Media Processing:

Curator-uploaded photos go through the standard Sharp pipeline (the same re-encoding, metadata stripping, and variant generation applied to all uploaded photos). The Sharp-based malware mitigation (pixel-roundtrip re-encoding) applies uniformly regardless of uploader.

Curator-uploaded video (uploaded by the system member account, see §2.8) goes through an ffmpeg full-transcode pipeline that provides the equivalent malware-mitigation property: re-encoding the streams through ffmpeg, with explicit stream selection and metadata stripping, destroys container-, codec-, and metadata-level malware by rebuilding the bytes from the essential signal. Pipeline:

- Input format whitelist: mp4, webm, mov (operator/admin-provided; literal at slice).

- Magic byte verification: file headers must match declared type.

- Size limit: configurable upper bound on input size (literal at slice; nominal target on the order of tens of MB for typical curator content), enforced before any processing.

- ffmpeg full transcode with explicit malware-stripping options:
    - `-map 0:v -map 0:a?`: select only video and audio streams (drops subtitle, data, and attachment streams that can carry payloads).
    - `-map_metadata -1`: drop all input metadata.
    - `-map_chapters -1`: drop chapter markers.
    - `-c:v libx264 -c:a aac`: re-encode video and audio streams (no `-c copy` shortcuts; re-encoding destroys codec-level malware).
    - `-pix_fmt yuv420p`: web-safe pixel format.
    - `-movflags +faststart`: streaming-friendly output.
    - Encoder-quality knobs (CRF, preset, audio bitrate, frame rate) literal at slice; nominal targets parallel the existing mirror program's first-attempt settings (`legacy_data/create_mirror_footbag_org.py`).

  Operator/admin delivers any reasonable input; platform produces a standardized output with stream selection, metadata, chapters, and codec-level malware all stripped.

- Output: single MP4 rendition (no automatic resolution variants; variant generation for bandwidth-tiered playback is deferred). WebM variant deferred unless browser parity demands it.

- Poster image: a companion image goes through the standard Sharp pipeline to produce thumbnail and display variants. Stored alongside the transcoded video.

Insertion paths: the operator-run curator-content seeding script (acknowledged in §1.5; details in DEVOPS_GUIDE.md (private GitHub repo)) and the interactive admin act-as upload path (`A_Upload_Curated_Media`). Member upload controllers reject `video_platform='s3'` to enforce this restriction at the controller boundary.

The same malware-stripping pipeline (Sharp for photos, ffmpeg with the options above for video) is applied uniformly to media sourced from any upstream origin: interactive member upload, interactive admin curator upload, operator-run curator seed, and legacy archive ingestion via the mirror program. Implementation consolidates the settings so a single update tightens every source path equivalently.

Asynchronous orchestration for interactive admin video upload:

The interactive admin upload path (`A_Upload_Curated_Media`) wraps the ffmpeg pipeline above in a media-job lifecycle so the user-visible HTTP request stays short. Source bytes flow browser to S3 directly via presigned PUT URLs, bypassing nginx and CloudFront for the body; transcode runs in the worker container after the fact and reports state changes back to the admin's browser via Server-Sent Events. The operator-run curator seeder retains the synchronous orchestration described above, since it has no proxy-chain timeout window and runs on a host with adequate memory.

Three browser-side calls form the user-facing flow:

- POST /admin/curator/upload/sign. Web validates the admin's claimed video and poster sizes and content types, mints a media_jobs row in pending_upload state, and returns presigned PUT URLs (one per file, time-bounded).

- Direct PUT from browser to S3 for each file. Bytes never traverse nginx or CloudFront. The signed URL binds Content-Type so the browser cannot upload arbitrary types under the signed key.

- POST /admin/curator/upload/finalize. Web HEADs both source keys to confirm the bytes landed, transitions the row to pending_transcode, and HTTP-pushes the job id to the worker container. The browser is redirected to a status page.

The status page subscribes to SSE on /admin/curator/upload/jobs/<id>/events. The worker, on each state transition, HTTP-pushes a small payload to /ipc/job-events on the web container, which fans the event out over the SSE connection to any subscribed status pages. Heartbeats from the server keep nginx and CloudFront idle timers warm during long transcodes.

State machine for media_jobs:

- pending_upload: row created at /sign; expires_at set so abandoned uploads (browser closed before /finalize) reconcile to abandoned.

- pending_transcode: bytes confirmed in S3 by /finalize; job dispatched to worker.

- processing: worker has claimed the row via optimistic UPDATE; lease_expires_at set so a crashed worker's row can be reclaimed at next worker boot.

- succeeded: media_items row written and pending source keys deleted.

- failed: terminal after the configured max attempts; admin re-uploads to retry.

- abandoned: pending_upload row past its TTL.

There is no polling anywhere. The only sweep is a one-shot boot-time scan in the worker for orphaned processing rows whose lease has expired; those reset to pending_transcode for re-dispatch. All other transitions are HTTP push events.

Authentication seams: web-to-worker dispatch and worker-to-web event push share an INTERNAL_EVENT_SECRET; /ipc/* routes on web are dropped at the nginx perimeter so they are reachable only from the docker internal network. SSE is gated by the admin session cookie. Direct-S3 PUT is gated by the bucket CORS policy (allowed_origins limited to the canonical public origin) and the time-bounded signed URL.

S3 layout for pending uploads under the asynchronous flow:

- Pending source video at `s3://footbag-media/pending/<jobId>/source.{mp4|webm|mov}`.

- Pending source poster at `s3://footbag-media/pending/<jobId>/poster.{jpg|png}`.

- An S3 lifecycle rule expires anything under `pending/` after 24 hours as defense in depth against orphaned uploads.

- Final media keys after success follow the Path Structure section below; pending sources are deleted by the worker on success.

Trade-offs specific to curator video:

- ffmpeg dependency added to the image-processor container (~50MB; modest growth in the constrained Lightsail nano envelope). Same ffmpeg the historical mirror program already uses for archive ingestion; consolidation via shared utility is plausible at slice.

- Transcode time is typically 1-2 min per video. The operator seeder accepts this synchronously, since seeding has no HTTP-timeout window. The interactive admin path accepts the same transcode cost asynchronously via the orchestration above, so the user-visible HTTP request returns immediately and the admin watches progress on the status page.

- Asynchronous orchestration adds moving parts: a media_jobs table, a worker dispatch endpoint, a server-side event bus on web, and an SSE channel. Justified by the user-visible latency that the synchronous shape cannot avoid through nginx and CloudFront. The seeder retains the simpler synchronous shape because it does not face that constraint.

- Asynchronous browser flow requires JavaScript. The admin upload form surfaces this via a noscript banner; the photo and URL-reference paths on the same form remain JavaScript-optional.

- Small quality loss possible at the chosen output bitrate. Mitigated by selecting reasonable encoder settings.

- Single output rendition for the initial design (no automatic resolution variants). Future variant generation deferred.

Path Structure:

Member or system-account photo, gallery-attached: `s3://footbag-media/{member-id}/{gallery-name}/{media-id}-{variant}.jpg`

Detached photo (no gallery, e.g., avatar): `s3://footbag-media/{member-id}/detached/{media-id}-{variant}.jpg`

Curator video (always system-account-owned; gallery-attached or detached): bytes at `s3://footbag-media/{system-member-id}/{gallery-name-or-detached}/{media-id}-video.{mp4|webm}`; poster at `s3://footbag-media/{system-member-id}/{gallery-name-or-detached}/{media-id}-poster-{variant}.jpg`.

The `detached` path segment is a sentinel for `gallery_id IS NULL`; literal at slice. Path literals (segment names, file extensions) are confirmed at slice activation.

Named galleries are URL bookmarks, not buckets. A `member_galleries` row provides a stable URL slug, owner, name, and description; content membership is computed at request time by tag-AND match against the gallery's `member_gallery_tags` set (per `docs/DATA_MODEL.md` §4.17 and `docs/USER_STORIES.md` §V_View_Gallery). Curator URL-reference content (YouTube/Vimeo) is uploaded as detached and surfaces in named galleries purely via tag matching. The hub at `/media` links to named galleries through collection cards (FH-owned galleries via the curated collection cards, member-owned via the Member galleries card and its `/media/member-galleries` list page); per-bookmark URLs follow the `gallery_<descriptive_slug>` convention (parallel to `event_{year}_{slug}`). Storage URLs use a dedicated `/media-store/*` prefix, disjoint from the `/media` app section, so the CDN cache-behavior layer routes binary bytes to the S3 origin and the app section to the app origin without sharing a URL namespace.

External-platform reference videos (YouTube and Vimeo) are linked rather than embedded on the gallery list view: tile thumbnails are fetched directly from the platform CDN (`i.ytimg.com` for YouTube, derivable from the video id; `i.vimeocdn.com` for Vimeo, supplied per-asset because Vimeo thumbnails are not derivable). The CSP `img-src` allowlist permits both CDNs. Click-through opens the platform page in a new tab; embedded inline players remain reserved for the trick detail page (`/freestyle/tricks/{slug}`).

Availability of external-platform reference URLs is verified via the platform oEmbed endpoint (`https://www.youtube.com/oembed?url=...&format=json` for YouTube; `https://vimeo.com/api/oembed.json?url=...` for Vimeo) at every ingestion path (operator-run curator seed, admin act-as upload, one-shot migration scripts). Page-URL HEAD checks are insufficient because both platforms serve HTTP 200 for removed, private, or unavailable videos, and YouTube serves a generic placeholder for the derived `i.ytimg.com/vi/{video_id}/hqdefault.jpg` thumbnail of some removed videos. Sidecars whose oEmbed call fails are rejected at ingestion. Verification runs at ingest only; stale URLs that decay post-ingest surface as broken thumbnails and are corrected by removing or rehosting the affected sidecar.

Requirements:

- The image-worker container holds no AWS credentials. The web container generates short-lived presigned GET URLs (read source) and PUT URLs (write final variants) and passes them to the worker. The worker's only AWS-network exposure is via those signed URLs, so a worker compromise cannot enumerate or delete S3 objects outside the per-job key set.
- Presigned PUT URLs use the lowest TTL that still covers the upload window (single-digit minutes). The `/sign` controller does not issue long-lived URLs and does not pre-sign keys outside the active job.
- User-facing error messages from the transcode pipeline truncate ffmpeg stderr to a documented byte limit and never include filesystem paths or container-internal identifiers. Full stderr is written to the worker log, not surfaced to the browser.
- `markDeadLetter` writes a NULL `body_text` (or equivalent payload-stripped marker) when the failure cause is suspected payload toxicity, so the dead-letter table cannot itself become a malware-replay vector when an operator triages the queue.

## 6.9 Voting

This is not an external service integration, except to the extent that we rely on AWS. Voting is implemented entirely in-house. This section is grouped with external services for structural convenience only; no third-party voting service is used. AWS KMS (an external service) is used for ballot encryption.

Decision:

All Voting implemented in-house using server-side ballot encryption. Ballots submitted as plaintext over HTTPS and encrypted by application before storage. Platform provides complete election administration: ballot casting UI, vote encryption, secure tallying, and cryptographic verification.

Rationale:

Full platform control over critical democratic infrastructure ensures governance independence and long-term sovereignty. One-time development investment eliminates permanent vendor dependency and ongoing costs. Server-side encryption keeps keys secure (never exposed to browser). Bespoke implementation aligns with project philosophy: simplicity, transparency, member ownership.

Trade-offs:

- Security responsibility: Cryptographic implementation correctness becomes platform responsibility (mitigated by using well-reviewed libraries).

- KMS dependency: Ballot encryption uses KMS envelope encryption. The public web runtime can encrypt ballots but cannot decrypt them; decrypt permission exists only in controlled tally operations under a separate role.

Impact:

- VotingService implements lifecycle, server-side encryption/decryption, tallying, verification.

- Admin interface for management, tallying operations (explicit decrypt flows), results publication.

- Audit logging for all decryption operations and election administration actions.

- KMS CMK used for ballot envelope encryption per environment. Web runtime role has kms:GenerateDataKey but not kms:Decrypt. Tally operations run with a privileged role that has kms:Decrypt.

- Allow results totals stored as a single JSON blob per vote.

Ballot encryption key management: The system uses AWS KMS envelope encryption per ballot. For each ballot submission, the server requests a fresh data key from KMS (GenerateDataKey), encrypts the ballot using AES-256-GCM, and stores only the ciphertext plus the encrypted data key alongside it.

Decryption pattern: Tally operations retrieve each ballot’s encrypted data key and ciphertext, call KMS Decrypt (privileged role only) to recover the per-ballot data key, then decrypt the ciphertext. This keeps the web runtime unable to decrypt ballots, supports key rotation via KMS, and ensures each ballot remains independently decryptable only during controlled tally operations.

Ballot submission atomicity: Submission uses atomic validation within a write transaction. BEGIN IMMEDIATE acquires a write lock, then vote status and close_datetime are checked within the transaction before inserting the ballot. This ensures the vote cannot close between validation and insertion. Unique constraint on (vote_id, member_id) prevents duplicate ballot submissions under concurrent requests.

Tally authorization and audit: Only administrators (users holding the admin role) may decrypt ballots. The `can_tally_votes` permission is implied by the admin role and is not a separately managed flag. Tallying is permitted only when vote.status equals 'closed' AND current timestamp exceeds vote.close_datetime. Audit events record TALLY_VOTE_START and TALLY_VOTE_COMPLETE with admin_id, vote_id, and timestamps. Individual decrypted ballots are never logged; the system aggregates totals in memory and discards ballot contents immediately. These tally audit events are written to the append-only `audit_entries` table (the canonical audit log; immutability enforced in application code), and are preserved off-host inside the encrypted database snapshot backups that the cross-region DR bucket protects with S3 Object Lock (WORM).

These authorization and timing checks are enforced in application services. The database schema provides the required vote state, timestamps, and immutable audit-supporting structures but does not implement the voting workflow state machine.

Alternative Considered: Third-Party Vendor (ElectionBuddy): Evaluated to reduce development effort. Would provide hosted ballot casting, encryption, tallying, integrity verification. Rejected because: Development savings consumed by ongoing vendor costs, and also the ElectionBuddy integration would not be a small effort either. Vendor dependency for critical democratic infrastructure creates governance risk. Data sovereignty concerns. Architectural inconsistency (external API vs file-based simplicity). Server-side encryption approach keeps keys secure vs vendor-controlled encryption. One-time investment of time preferred over permanent vendor relationship.

## 6.10 Stripe webhook signing secret environment scope

Decision:

Stripe webhook signing secrets are environment-scoped: each
environment has its own STRIPE_WEBHOOK_SECRET env var sourced from
an environment-specific origin. Local development sources a rotating
secret from `stripe listen` CLI output; staging runs
PAYMENT_ADAPTER=stub and validates against the deterministic stub
literal (§5.7); production sources the Live-mode whsec_ from AWS SSM
Parameter Store. Webhook verification accepts only the active
environment's secret.

Rationale:

- Mixing Test-mode and Live-mode Stripe webhook secrets across
  environments is the most commonly debugged Stripe signature-error
  class. Environment-scope eliminates the failure mode at the
  configuration layer rather than at signature-verification runtime.
- Live secrets in non-production environments are a frequent source
  of accidental cross-environment leaks: a developer running staging
  locally with the production secret can sign events that production
  will accept. Environment-scope makes this impossible by
  construction.
- Source-per-environment (Stripe CLI for dev, stub literal for
  staging, SSM for prod) matches the §3.6 secrets-management
  pattern: every secret has exactly one canonical source per
  environment with no fallback or default that could mask a missing
  configuration.
- Reading the secret once at boot, with rotation requiring a
  restart, simplifies the in-process state machine: no thread-safe
  secret reload, no race between rotation and incoming webhook
  handling. The cost (app restart on rotation) is paid by operator
  action, not by application complexity.

Requirements:

- STRIPE_WEBHOOK_SECRET env var is read once at boot via
  src/config/env.ts.
- In local development, the secret value comes from
  `stripe listen --forward-to localhost:3000/payments/webhook`
  output (Stripe CLI prints a fresh whsec_ per invocation).
- In staging, the live secret value is unused at runtime; staging
  runs PAYMENT_ADAPTER=stub and validates against the adapter-
  co-located stub literal (STUB_WEBHOOK_SECRET) per §5.7.
- In production, the secret value comes from an environment-specific
  AWS SSM Parameter Store entry. Production boot refuses an empty or
  default value.
- Production boot refuses any secret value that matches the stub
  literal pattern. Stub and live secrets are never interchangeable.
- Rotation: an operator updates the SSM parameter and restarts the
  application. The application reads the new value at boot and
  discards in-flight events signed with the prior key (Stripe will
  retry).

Trade-offs:

- Rotation requires app restart. Acceptable: rotation is infrequent
  (incident-driven, not scheduled), restart is fast (under 30
  seconds per §1.8 container memory allocation), and the alternative
  (live secret reload with thread-safe state) adds complexity for
  negligible operational benefit.
- Local dev requires the Stripe CLI installed and running alongside
  the app. Acceptable: the CLI is a one-time install, the
  developer's workflow already involves multiple terminal panes for
  dev/test, and the CLI provides bonus features (event triggering,
  dashboard linkage).

Impact:

- src/config/env.ts declares STRIPE_WEBHOOK_SECRET as required when
  PAYMENT_ADAPTER=live and reads from a single env var.
- Production deployment populates STRIPE_WEBHOOK_SECRET from SSM at
  container start, alongside other §3.6 secrets.
- The dev recipe in docs/TESTING.md §16 instructs running
  `stripe listen --forward-to localhost:3000/payments/webhook`
  alongside `./run_dev.sh` and copying the printed whsec_ into the
  local environment.
- Cross-environment secret leakage (e.g., a dev environment
  accidentally using a production secret) becomes a boot-time
  configuration error rather than a silent acceptance of
  inappropriate webhook events.

## 6.11 DNS Cutover

Decision:

Go-live is a clean DNS switch executed by the operator on Route 53. Before go-live the `footbag.org` zone moves to Route 53 under IFPA-controlled access as advance preparation: the zone is mirrored from the webmaster's bind9 servers (fresh zone snapshot first, verified record-for-record), the webmaster makes the registrar name-server change, and his bind9 service retires once nothing resolves through it. At the switch `www.footbag.org` and the apex `footbag.org` become Route 53 ALIAS records to the production CloudFront distribution; `www` is the canonical host and the apex 301-redirects to `www` through the distribution. No separate apex redirector exists. The legacy site leaves the live path at the switch: no reverse proxy or front door on the legacy server, and no legacy TLS certificate. Recovery is fix-forward or a platform restore first, with any DNS change operator-made on the pre-lowered low-TTL zone; no legacy server remains running for rollback. The Route 53 apex/`www` alias records (`enable_apex_alias_records`) stay gated off through the zone move — Route 53 first serves the zone's existing records faithfully — and flip at T-0 as the switch itself; the SES domain-auth records (`ses_enable_domain_auth`) flip once the zone move completes, taking over from any hand-applied copies.

Rationale:

- Implements the Legacy Independence at Go-Live decision (§6.12): DNS is one of the functions that may not remain dependent on legacy infrastructure after go-live.
- A clean switch removes the legacy server from the live path entirely: no legacy TLS certificate to maintain, no critical-path dependency on legacy hardware, and CloudFront sees client IPs directly (the proxy chain stays CloudFront then nginx, two hops, with no third front-door hop at any milestone).
- Moving the zone to Route 53 before go-live removes the last infrastructure dependency on the legacy operator: the apex is served as a free ALIAS record (no CNAME-at-apex limitation, no Anycast fee, no redirector instance to run), the switch and any emergency DNS change are operator-executed rather than resting on one person's availability, and DNS sits under IFPA-controlled access from before go-live.
- The simplest recovery for a DNS-switch cutover is platform-side: fix-forward or a restore from the pre-flip snapshot; when a DNS change is needed, the low-TTL zone converges in minutes.
- Mail is decoupled from the web switch: MX routing is independent of A/AAAA changes, inbound moves to Google Workspace as its own earlier preparation step, and the web cutover never touches MX.
- Outbound authentication is flexible by design: the apex SPF authorizes every legitimate sender (SES, Google, the webmaster's own sending host while it still sends), starting softfail with DMARC in monitor-only mode and tightening only after the verified sender list and clean aggregate reports prove no legitimate mail would be quarantined.
- Historical content is served from the platform-controlled `archive.footbag.org` on its own CloudFront distribution and us-east-1 certificate (the Legacy Archive decision, §6.4), so no legacy subdomain is needed for it.

Requirements:

- The production distribution carries `footbag.org` and `www.footbag.org` as alternate domain names with a matching ACM certificate in us-east-1; the archive distribution carries `archive.footbag.org` with its own us-east-1 certificate.
- Records-actor by era: before the zone move the webmaster hand-applies maintainer-supplied records to his zone (the ACM validation CNAMEs, the SES DKIM CNAMEs, the custom MAIL FROM subdomain records, the SPF amendment, the DMARC record, and the Google MX when the mail step runs early); after the move Terraform owns the records and the operator applies them on Route 53.
- The zone move mirrors every existing record faithfully (fresh snapshot, `dig`-verified against the Route 53 name servers) before the registrar name-server change, and completes before any cutover step depends on it.
- Any CAA record on the zone must authorize Amazon's certificate authorities before certificate issuance is attempted.
- A pre-cutover smoke test proves the CloudFront path (via a test subdomain and `curl --resolve` against a current edge IP) and the apex 301 through the distribution before the switch; the switch is gated on the smoke re-running green on the day.
- Post-go-live legacy retention is limited to encrypted, non-public artifacts under IFPA-controlled access; a catastrophic-failure fallback is a read-only reconstruction from a tested encrypted artifact, never a standing legacy server.

Trade-offs:

- The zone move is one more coordinated preparation step with the registrar and the webmaster; mitigated by the zone-authority handoff checklist and a test-subdomain rehearsal.
- Apex URLs cost one redirect hop; `www` is the canonical host everywhere.
- A DNS change is not instantaneous for clients that cached the prior records; the low-TTL choreography bounds this to minutes.
- Hand-applied records on an externally operated zone are a manual failure mode only until the move; after it, records are Terraform-owned and the manual mode disappears.

Impact:

- `terraform/production/route53.tf` gains the hosted zone and the mirrored records; `enable_apex_alias_records` flips at T-0 as the switch itself; `ses_enable_domain_auth` flips at the zone move; no apex-redirector Terraform exists.
- The DNS cutover runbook in DEVOPS_GUIDE.md (private GitHub repo) scripts an operator-executed Route 53 change; the zone move follows that guide's "External DNS/mail upstream coordination runbook".
- `TRUST_PROXY` is 2 in staging and production from go-live, with no topology change at any later milestone.
- MIGRATION_PLAN sequences the zone move (§19 item 15), the cutover (§29.12), and the mail disposition (§29.12a) against this decision.

## 6.12 Legacy Independence at Go-Live

Decision:

The migration is one coordinated production go-live. No required website, email, mailing-list, DNS, data, media, registration, or application function remains dependent on legacy infrastructure after go-live. Preparation may run in advance — data rehearsals, Google Workspace provisioning and Google Group setup, archive capture, SES verification, the early inbound-mail (MX) move, the DNS zone move to Route 53, replacement-service testing — but advance preparation is not phased delivery: every required service activates together at go-live, and "keep it running on legacy" is not an allowed final disposition. Every legacy function is migrated, replaced, archived, or deliberately retired before shutdown. Post-go-live retention of legacy material is limited to encrypted, non-public recovery and reference artifacts under IFPA-controlled access.

Rationale:

- The platform is all-new and has no hard dependency on legacy technology; the cleanest design keeps it that way, concentrating complexity, risk, and coordination in one well-rehearsed event instead of an open-ended parallel operation.
- A phased production migration would keep legacy services live indefinitely, each a standing dependency on aging software, a single operator, and plain-HTTP hosts that could never safely share the platform's domain-wide login cookie.
- A single go-live gives every stakeholder one date, one requirement set, and one shutdown checklist; anything believed to need continued life is named, evidenced, and dispositioned before the switch rather than discovered after it.

Requirements:

- Every legacy function is inventoried and receives exactly one disposition before go-live: migrate, replace (Google Workspace, Google Groups, a platform feature, or another approved non-legacy service), archive read-only, or retire with notice; an unresolved active communication need blocks go-live.
- Requirements discovery works from current users and organizational participants (group owners, moderators, committee members, the people sending and receiving through each address, event organizers, the IFPA board), never from database flags or stale generated aliases alone.
- Content is preserved, not application engines: WordPress, MediaWiki, forum software, Majordomo, the legacy list server, legacy login, and legacy PHP do not remain live; selected content is copied into IFPA-controlled storage; anything not preserved gets an explicit accepted-loss decision.
- No legacy password, session, or login survives, and recovery never relies on a running legacy system: a catastrophic-failure fallback is a read-only reconstruction from a tested encrypted artifact.

Trade-offs:

- Go-live inherits more gates (discovery, replacements, archive custody) and therefore more up-front schedule risk; accepted in exchange for zero legacy tail.
- Rare post-go-live lookups read encrypted artifacts instead of a convenient live legacy system; accepted, since convenience is how indefinite dependencies start.

Impact:

- MIGRATION_PLAN carries this as its governing principle and gates go-live on it; the maintainers' private tracker tracks the workstreams that satisfy it (the webmaster's handover and shutdown, the secretary's discovery, the zone move, the shutdown checklist).
- The DNS Cutover decision (§6.11), the Legacy Archive decision (§6.4), the Sealed Legacy Email Archive decision (§6.5a), and the canonical email architecture (§5.5) implement it.

# 7. DevOps

## 7.1 Dev/Prod Parity

Decision:

Development, staging, and production use the same application architecture, the same major service boundaries, and the same containerized deployment shape where practical. Differences are limited to environment-specific configuration, infrastructure sizing, live-vs-stub adapter wiring, and the documented runtime credential mechanism, not to divergent business logic or route behavior.

Rationale:

- Developers should be able to reproduce production behavior locally or in staging with minimal surprises.
- Reduces "works in dev, fails in prod" issues caused by diverging stacks.
- Preserves the adapter model: the code should behave the same whether it is wired to local stubs or to production AWS services.

Trade-offs:

- Configuration complexity is managed through explicit environment-scoped settings, including environment name, bucket names, sender identities, CloudFront distribution identifiers, feature flags, and Parameter Store paths under the `/footbag/{env}/...` hierarchy.
- Production Lightsail runtime access to AWS differs from local development: local development may use stubs by default and may optionally use a local AWS profile for hybrid testing, while production uses the explicit runtime assumed-role model defined by the AWS Lightsail and Credentials decision.
- Resource usage in staging may be smaller than production while still preserving architectural parity.

Impact:

- A single set of application images is used across all environments; the images are built on the operator workstation and shipped to the host (§7.4), not built by CI.
- Environment selection is done via configuration and adapter wiring, not via conditional feature implementation or alternate business logic.
- Test plans should validate that staging uses the same routes, adapters, and behavioral expectations as production.
- JWT signing remains KMS-based in production; no `JWT_SECRET` production design is introduced by this decision.


## 7.2 AWS Lightsail and Credentials

Decision:

Production runs on AWS Lightsail, but operator shell access and workload AWS API access use two distinct mechanisms. For operator shell access, the Lightsail host uses hardened per-operator SSH, not Session Manager. SSH access exists only for documented operational tasks such as deployment, restore, patching, and incident diagnostics; it is not the general administration model for the system.

Routine host administration uses named non-root Linux operator accounts with `sudo`. Shared shell accounts are not allowed. Shared private SSH keys are not allowed. Each approved System Administrator gets a separate SSH key pair and a separately attributable host-access path. Password authentication must be disabled, direct root login must not be the normal operator path, and port 22 must be restricted to approved operator source IPs or CIDR ranges.

If the cloud image or Lightsail default login account is used during first bootstrap, that account is bootstrap-only and must not remain the long-term shared administration path once the named operator account model is established.

Operator SSH has two routine paths. The first is direct CLI SSH from the declared operator IP CIDR list, which may carry multiple narrow `/32` entries or wider CIDRs to cover an operator who roams between networks. The second is Lightsail Console browser SSH, opened by declaring the `lightsail-connect` source-IP alias permanently on port 22 in the firewall HCL. Browser SSH is a permanent operator path, not a recovery-only fallback, and provides stable shell access when the operator workstation IP changes faster than the CIDR allow-list can be updated. Both paths still require the host's authorized public key; browser SSH additionally requires AWS Console MFA on the operator IAM identity. Routine administration uses the CLI path; the browser path serves operators on VPN, mobile networks, or other transient routings.

The runtime role's trust policy may also list a non-host AWS principal (typically the operator's own IAM user) so the operator workstation can chain into the runtime role for read-only health probes such as the staging readiness smoke test. The chained AssumeRole derives short-lived credentials and inherits only the runtime role's narrowly scoped permissions. Where the runtime role's permissions are a strict subset of the operator's existing permissions, MFA on the chained AssumeRole is not load-bearing and may be omitted to permit unattended smoke runs; where the runtime role grants permissions the operator would not otherwise hold, MFA on the chain remains required.

For workload AWS API access, the deployed application does not rely on an implicit EC2-style instance role attached to the Lightsail host. Instead, production uses one or more explicit runtime IAM roles assumed through the AWS shared config/shared credentials chain. A root-owned host AWS config/credentials setup provides the source profile needed to assume the runtime role, and the deployed services use the assumed role as the runtime principal via standard AWS SDK / CLI credential resolution (`role_arn`, `source_profile`, `AWS_PROFILE`, or equivalent SDK configuration).

The authoritative production runtime principal is therefore the assumed runtime role, not the source profile, not the human operator identity, and not a host-attached instance role. Runtime permissions remain narrowly scoped to only the AWS APIs the application actually needs, such as S3, SES, Parameter Store, CloudWatch, and KMS, depending on the environment and service path.

Terraform's role as the authority for IAM, firewall, and related infrastructure is established in §9.6. The host-user creation and public-key installation path may begin as documented bootstrap work but must be reproducible, reviewable, and reflected in the runbooks.

Rationale:

- The platform intentionally uses Lightsail for cost and operational simplicity, but still needs a documented host shell-access path and controlled runtime use of AWS APIs.
- For this project’s scale, hardened per-operator SSH is proportionate and simpler than treating the Lightsail host as a non-EC2 managed node for Session Manager.
- Separating human operator access from workload runtime access keeps the design easier to reason about and audit.
- A documented AssumeRole-based runtime model preserves temporary credentials and least privilege without removing the existing AWS integrations from the design.
- Even if there is only one operator initially, the named-account / per-key model avoids future shared-access cleanup when additional System Administrators are onboarded.

Requirements:

- Deploy SSH uses a pinned `known_hosts` file with `StrictHostKeyChecking=yes`. First-use TOFU is not used for production deploys; an unrecognized host fingerprint fails the deploy and forces an out-of-band fingerprint check before the operator updates the pin.
- The production `app_runtime` IAM role's trust policy follows the same source-profile / external-id pattern documented for staging. There is no asymmetric privilege between the two environments; a difference in trust policy is a bug to reconcile, not a feature.
- systemd units run with hardening directives (`ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true`, and the equivalent file and network restrictions appropriate to the unit) and a documented start-rate limit so a crash loop cannot overwhelm the host.
- Operator scripts that read deployed env files use a dedicated key-reader (parses one key, prints one value) rather than `sudo cat <env-file> | grep`. Cached `sudo` credentials must not flow stdin into a generic command that could leak the file contents into outputs or logs.
- Scripts that edit env files in place (sed `-i.bak` and equivalents) delete the `.bak` artifact on exit via a shell trap, so a failed script run cannot leave a credential-bearing backup file on the host filesystem.

Trade-offs:

- SSH requires opening port 22 to approved operator source IPs and maintaining that allowlist deliberately.
- The project must document host-account and SSH-key lifecycle procedures clearly: how a public key is approved and installed, how ownership and key fingerprints are recorded, and how access is removed immediately during offboarding.
- Private keys remain in the custody of the individual operator and must never be committed to the repository, stored in Parameter Store, copied into application containers, or placed in shared team storage.
- If operator source IPs change often, firewall maintenance is more manual than a no-inbound-port model.
- If the host or a privileged container is compromised while runtime credentials remain usable, the attacker can still call the AWS APIs allowed to the assumed runtime role until those temporary credentials expire or are cut off. This is still a better posture than storing exportable private keys in the app, but it is not a magic isolation boundary.
- Least-privilege claims are strongest if the web and worker services use separate runtime roles. Sharing one runtime role across both is an acceptable minimal-fix simplification, but increases blast radius.

Impact:

- Session Manager, hybrid activation, managed-node, and SSM-agent baseline wording elsewhere in the document suite must be removed or replaced with the SSH-based operator access model.
- DEVOPS_GUIDE.md (private GitHub repo) and the onboarding documentation must define the canonical SSH operating rules: named non-root operator accounts, `sudo` usage, public-key installation flow, private-key custody rules, firewall source-IP restriction, host-access inventory, onboarding steps, offboarding steps, and break-glass expectations.
- Docker and deployment configuration must mount only the required AWS config/credentials material into the containers that need AWS access, read-only, and must select the intended runtime profile explicitly.
- Parameter Store, KMS, SES, S3, and CloudWatch decisions elsewhere in this document remain valid, but their wording must refer to the runtime assumed role and not confuse it with the host operator path.
- Terraform-managed infrastructure must include the IAM roles/policies, Lightsail firewall restrictions, and any documented bootstrap inputs required by the SSH access model; it no longer depends on Systems Manager managed-node registration or Session Manager logging as a baseline requirement.

Alternatives Considered:

- Session Manager on the Lightsail host through the non-EC2 managed-node / hybrid activation path: Rejected because it adds hybrid-registration complexity (activation ceremony, orphan managed-node registrations, outbound network dependency for credential refresh), SSM Agent CVE history requiring ongoing Agent updates, and IAM privilege-minimization pitfalls, without enough compensating value for the expected single-operator workflow. Cost of the Session Manager service itself is not the driver; Advanced Instances Tier charges apply only if Advanced Instances are enabled.
- EC2 instead of Lightsail to preserve a no-inbound-port Session Manager shell path: Rejected for this stage because it increases platform complexity and moves the project away from the intentionally proportionate Lightsail-first deployment posture.
- Shared SSH private key or shared shell account: Rejected because it weakens accountability, complicates offboarding, and conflicts with the project rule against shared privileged identities.

## 7.3 Docker

Decision:

Local development uses Docker and docker compose to start the stack (web app, worker, test stubs) with a single command.

The minimum required Docker artifact set is:
- `docker/web/Dockerfile`
- `docker/worker/Dockerfile`
- `docker/nginx/nginx.conf.template` (rendered to `/etc/nginx/nginx.conf` at container start by `docker/nginx/40-render-nginx-conf.sh`; rendering substitutes `${X_ORIGIN_VERIFY_SECRET}` after shape-validating it as 64 lowercase hex chars)
- root `docker-compose.yml` for local development
- root `docker-compose.prod.yml` for Lightsail deployment overrides
- a documented service wrapper (for example `ops/systemd/footbag.service`) for the production compose stack

The minimum required runtime containers are:
- `nginx`
- `web`
- `worker`
- `image`

The TypeScript build emits only JavaScript, so non-compiled runtime data files (Handlebars views, static assets, IFPA rules content) reach the runtime image only through an explicit COPY in the image Dockerfile. The §1.15 convention gate verifies every runtime read resolving under the repository root has a matching COPY, so a new data dependency cannot ship a runtime image that is missing its files.

Rationale:

- Rapid onboarding for volunteers; no need to install and configure multiple services manually.

- Local environment closely matches production container environment.

Environment differences limited to:

- STORAGE_BACKEND=filesystem (dev) vs s3 (prod).

- STRIPE_MODE=test (dev) vs live (prod).

- SES_MODE=stub (dev) vs live (prod).

- AWS credentials: local stubbed adapters in development, versus the documented runtime assumed-role model in production. 

- Feature flags: May differ for testing unreleased features.

All other configuration (application code, adapters, business logic) identical across environments.

Trade-offs:

- Requires Docker installed and some familiarity with container tooling.

- Local resource usage can be higher than a bare-metal setup.

Impact:

- Repository includes docker-compose configs for dev. docker compose --profile dev up launches a working system on http://localhost.

- Dev images use local file-system and stub services in place of AWS, but interfaces remain the same.

Health Checks and Restart Policies:

All containers configured with health checks (30-60s intervals, 3 retries) and restart policies. Web/worker/nginx use restart: unless-stopped for continuous availability. Image container uses restart: on-failure with max 5 attempts to prevent restart loops. CloudWatch monitors container health status and alerts on persistent failures.

## 7.4 GitHub

Decision:

CI runs the test and security checks using GitHub Actions, and the project code lives in an open-source GitHub repository. Images are not built or published by CI: they are built on the operator workstation and shipped to the Lightsail host via `docker save | docker load`. There is no image registry.

Rationale:

- Integrated with GitHub; no separate CI service required.

- The Lightsail host is too small to build images, so they are built on the operator workstation and shipped directly; an image registry would add IAM and operational complexity for no gain at this scale.

- GitHub is the standard place to store project code and track code changes.

Requirements:

- Every GitHub Actions workflow declares a top-level `permissions: { contents: read }` and elevates per-job only where required (e.g. `security-events: write` for the CodeQL job). Default-write tokens are not used.
- GitHub Actions are pinned by commit SHA (`actions/checkout@<sha>`), not by floating tag or major version. SHA bumps land via reviewed PRs; no action runs at a mutable reference.
- No automated dependency-update bot runs against the repo; dependency versions are reviewed and bumped manually.
- The `main` branch is protected with required reviews, required CI checks, and a force-push prohibition. Secret scanning and push protection are enabled at the repo level.
- Project MCP server entries (`.mcp.json`) pin server packages to a specific version, not `@latest`. A version bump is a reviewed PR, not a transparent upstream change.
- Security-critical npm dependencies (`argon2`, `helmet`, `marked`, `better-sqlite3`, `express`) are pinned exactly in `package.json` (no `^` or `~`). The lockfile is the canonical source for transitive versions.
- Test-only packages (e.g. `@playwright/test`) live under `devDependencies`, never `dependencies`. Production images do not install dev dependencies.
- Repo git hooks live under `.githooks/` and are activated by `git config core.hooksPath .githooks`. The pre-commit hook runs `gitleaks --staged` so a secret cannot be committed without the operator explicitly overriding the hook.

Trade-offs:

- None. GitHub is standard and works great.

- Some deployment steps (e.g., actual Lightsail rollout) remain scripted/manual.

Impact:

- Pushes and pull requests trigger CI pipelines that run the test and security checks.

- Deployment runbooks describe building images on the operator workstation and shipping them to the host via `docker save | docker load`.

## 7.5 Local Development

Decision:

Local development supports two modes: (1) default fast-iteration mode with Docker Compose using filesystem storage and local service stubs, (2) optional high-fidelity mode with real AWS services for integration testing. Environment variables control which backend implementation is used. All environmental differences hidden behind abstraction layer.

Rationale:

- Fast default workflow: Local stubs provide instant feedback (no network latency, no AWS API calls) without requiring AWS credentials for basic development.

- High-fidelity option: Real AWS services validate actual integration behavior, email rendering, payment flows, and secrets management before staging deployment.

- Flexible development: Contributors choose appropriate testing level based on what they're working on (frontend changes use stubs, payment integration uses real Stripe test mode).

AWS Credentials:

- Developers use AWS profiles configured via aws configure or ~/.aws/credentials.

- Credentials passed to containers via environment variables (AWS_PROFILE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY), never committed to code or baked into images.

KMS Development Environment:

JWT signing uses KMS asymmetric keys in production and ballot encryption uses KMS envelope encryption. Development supports: Default mode: local stubs (no AWS required). High-fidelity mode: local-kms (for zero-cost KMS API parity) or staging AWS KMS keys.

In development the `JwtSigningAdapter` selects its `LocalJwtAdapter` implementation, which uses a file-based RSA-2048 keypair generated on first startup at `database/dev-jwt-keypair.pem` (gitignored). In staging/production the same interface selects `KmsJwtAdapter`, which calls real KMS via the runtime assumed role. No `local-kms` Docker service is required because the adapter abstraction makes the dev impl self-contained; if a future ballot-encryption path needs API-level KMS parity in dev, a local-kms container (e.g., LocalStack) can be added behind `BallotEncryptionAdapter` at that time.

Required IAM permissions for dev profile:

- SES: SendEmail, SendRawEmail on verified test domain.

- Parameter Store: GetParameter on /footbag/development/\* path.

- KMS: Sign, GetPublicKey (JWT); GenerateDataKey, Decrypt (ballots, in dev only).

- S3: Limited to dev/test buckets only (no production access for devs).

- Stripe: Test mode API keys only (no live keys in dev environments).

Requirements:

- Project AI-agent hooks (under `.claude/hooks/`) deny `git -C <path> commit` and equivalent path-form invocations, not only the unprefixed form. An agent cannot bypass the commit prohibition by changing working directory or by passing `-C`.
- Project AI-agent hooks deny unbounded `UPDATE` and `DELETE` statements (no `WHERE` clause) against the dev database, with an explicit allowlist for migration scripts. Bulk mutation is operator-explicit, not agent-implicit.

Trade-offs:

- Developers need AWS credentials (dev/staging account access) for hybrid mode; onboarding includes AWS account setup.

- Must maintain both local stub implementations and real adapter implementations (doubles adapter test surface).

- Real AWS services incur small development costs (\$1-2/month per active developer for SES, Parameter Store access).

- Potential for dev/staging environment pollution if developers don't clean up test resources.

Impact:

- CI/CD strategy: CI pipeline uses local stubs for speed (test suite completes in \<2 minutes). Staging deployments use real AWS services for integration validation. Production never uses stubs.

- Stub implementations must match real AWS service behavior.

## 7.6 Health Endpoints

Decision:  
The application exposes HTTP health endpoints for use by AWS health checks and deployment automation:  
- GET /health/live = liveness check (process is running).  
- GET /health/ready = readiness check (safe to receive traffic).

Rationale:  
AWS best practice is to build health checks into every service to support safe deployments and automated recovery.

Constraints:
- `/health/live` is cheap and does not call external dependencies.
- `/health/ready` validates the two serve-traffic gates: SQLite connectivity and container memory pressure. A 503 from this endpoint (e.g. memory above the §9.5 threshold) leads CloudFront to serve the maintenance page on subsequent organic traffic.
- Health endpoints must not call Stripe, SES, KMS, S3, or any other external dependency. These are alarm-surfaced operational concerns, not readiness gates.
- Backup freshness and restore posture are surfaced via §9.4 alarms, not via readiness.

Impact:  
- Deployment runbooks and any load balancer, target health checks use these endpoints.  
- Alarms may trigger on sustained readiness failures.

## 7.7 Environment Naming Convention

Decision:

The platform uses one canonical environment name per environment (`development`, `staging`, `production`) and composes a project-prefixed form (`footbag-{env}`) only for identifiers that share a namespace with other projects or other operators. The unprefixed short form is the only name in code; the prefixed form is a Terraform composition (`local.prefix = "footbag-${var.environment}"`). The two forms are never interchangeable.

Rationale:

- AWS namespaces with cross-project collision (S3 bucket names globally, IAM users and roles account-wide, KMS aliases account-and-region-wide, Lightsail resource names account-wide) require a project prefix to prevent name collision when multiple projects share an AWS account or compete in a global namespace.

- SSH aliases live in the operator's workstation `~/.ssh/config`, which is shared across all projects the operator works on. Prefixing the alias prevents a `production` alias from another project shadowing this project's.

- Project-internal identifiers do not face the same collision pressure. `FOOTBAG_ENV` is read by an env var whose own name already starts with `FOOTBAG_`; SSM parameter paths are rooted at `/footbag/`; Terraform tag values live alongside an explicit `Project = "footbag"` tag. Adding `footbag-` to the value in those contexts is redundant noise.

- Composing the prefixed form from the unprefixed canonical name (rather than maintaining two separate constants) keeps the rule mechanical: there is one source of truth (`var.environment`), and the prefix appears wherever AWS or SSH requires it.

Requirements:

- The canonical environment values are `development`, `staging`, and `production`. No abbreviations (`dev`, `stage`, `prod`) appear as configuration values anywhere in code, schema, IaC, or operational scripts.

- `FOOTBAG_ENV` accepts only the canonical short forms; `src/config/env.ts` rejects anything else at boot, including the prefixed forms.

- `DEPLOY_TARGET` accepts only the prefixed forms `footbag-staging` and `footbag-production`. Entry-point scripts (`deploy_to_aws.sh`, `scripts/deploy-rebuild.sh`, `scripts/deploy-code.sh`) hard-refuse any other value before the SSH connection, including the unprefixed short forms and near-miss substrings (`footbag-prod`, `footbag-prd`, `footbag-live`).

- Terraform composes the prefix exactly once per module: `local.prefix = "footbag-${var.environment}"`. AWS resource names use `${local.prefix}` (or interpolate `var.environment` via `local.prefix`); they never hand-write `"footbag-production"` as a literal.

- SSM parameter paths use `${local.ssm_prefix}/...` where `local.ssm_prefix = "/footbag/${var.environment}"`. The path interpolates the unprefixed name; the project is already in the literal `/footbag/` segment.

- Tag values use `var.environment` (unprefixed). The `Project = "footbag"` tag carries the project identity separately.

- IAM user, role, and policy names; KMS aliases; S3 bucket names; Lightsail resource names; and CloudFormation/CloudWatch identifiers use `${local.prefix}-...` (prefixed).

- SSH aliases in `~/.ssh/config` are `footbag-staging` and `footbag-production` (prefixed); operator-facing documentation never references unprefixed alternatives.

Trade-offs:

- Two visible forms (short and prefixed) require a one-time rule to learn. The trade-off is acceptable because the rule is mechanical (prefix added in shared namespaces, omitted in project-scoped namespaces) and the alternatives are worse: unifying on the unprefixed short form causes S3 bucket name collisions globally and IAM collisions account-wide; unifying on the prefixed form produces redundant identifiers (`FOOTBAG_ENV=footbag-production`, `/footbag/footbag-production/...`, `footbag-footbag-production-runtime`).

- The composition rule depends on `var.environment` being the only canonical input. A module that introduces a second separate `environment` variable or a hard-coded `"footbag-production"` literal breaks the rule and must be refactored.

Impact:

- Adding a new environment (e.g., a pre-prod or QA environment) is a single Terraform input change plus an SSH alias addition; the prefix and SSM-path composition follow automatically.

- New AWS resources land with the correct prefix by default because they use `${local.prefix}`. Hand-written literal names are a review-time smell and must be changed to the composition.

- Operators who maintain SSH config across multiple projects can keep all alias names project-prefixed without conflict.

- Defense-in-depth allowlists at each deploy entry point catch operator typos (`footbag-prod`, `footbag-prd`) before any destructive action. The allowlist is the canonical enforcement mechanism for SSH alias and `DEPLOY_TARGET` shape.

# 8. Logging, Monitoring & Abuse Prevention

## 8.1 Structured Logging

Decision:

Application logs structured JSON to stdout/stderr, aggregated into CloudWatch Logs. All log entries include: timestamp, level, correlation ID (used fracing a single user request across multiple systems and log files), actor context (when available), message, and structured metadata.

Rationale:

- JSON enables programmatic parsing and querying in CloudWatch Insights.

- Correlation IDs trace requests across layers.

- stdout/stderr follows 12-factor app principles.

- CloudWatch provides managed aggregation without operating log infrastructure.

Trade-offs:

- JSON logs less human-readable than plain text for casual inspection.

- CloudWatch costs scale with log volume (mitigated by retention policies).

- No sophisticated log analysis tools (ELK stack).

Impact:

- All services use shared logger module with consistent structure.

- CloudWatch retention policies configured per log group.

- Troubleshooting relies on CloudWatch Insights queries.

- Logs MUST redact tokens, JWTs, cookies, Stripe secrets, webhook signatures, AWS access key IDs and secret access keys, the value of `SESSION_SECRET`, raw JWT cookie values, and any §3.8 single-use account-security token (email verify, password reset, data export, legacy claim) regardless of whether the token appears in URL path, query string, or request body; use allowlist logging; never log raw email or full message subjects. KMS key ARNs are not secrets but should not be logged at request scope.

Requirements:

- AWS CloudTrail is enabled in the project account with management events (and S3 data events for the audit-log bucket) delivered to a dedicated audit-log bucket, retained per the §1.2 log-archive retention window. The audit-log bucket is separate from the application logs bucket and has restricted write/delete permissions so a compromised runtime credential cannot tamper with the audit trail.

## 8.2 Monitoring and Alerting

Decision:

CloudWatch metrics and alarms monitor key system health indicators: application errors (5xx rates, exceptions), Lightsail instance health (CPU, memory, disk), S3 operation failures, SES bounce rates, backup job failures or missed runs, Stripe webhook processing failures. SNS topics deliver alarms to administrator email/SMS, including alarms for KMS error rates/latency (auth signing, ballot encryption) and alerts for unusual Parameter Store access patterns.

Rationale:

- CloudWatch native integration with AWS services requires no additional infrastructure.

- Threshold-based alarms catch operational issues before user impact.

- SNS provides reliable notification delivery.

Trade-offs:

- No sophisticated APM (Application Performance Monitoring).

- Manual investigation required after alarm fires.

- CloudWatch limited compared to commercial monitoring platforms.

Impact:

- Alarm configuration documented in infrastructure-as-code.

- On-call procedures reference specific alarms and runbook responses.

- Metrics inform capacity planning decisions.

## 8.3 Rate Limiting and Abuse Prevention

Decision:

In-process rate limiting via an in-memory bucket service (not a route middleware; see §1.9): state-changing actions are bucketed per action and request-derived key (per-member, per-IP, per-target), with bucket sizes and windows from system config. App-side rate limiting state (including IP-based counters for login/reset) is kept in memory only and is not persisted to the database or logs. Cloudflare Turnstile CAPTCHA gates login, register, password-reset, claim-lookup, and verify-email-resend form submissions; the server verifies the Turnstile response token before any DB read. Turnstile runs in Managed mode (Cloudflare-recommended default), which completes without user interaction for low-risk sessions and escalates to a checkbox challenge for higher-risk sessions. AWS Shield Standard, automatic on the CloudFront distribution, covers volumetric L3/L4 DDoS at no additional cost. A CloudWatch origin-spike alarm pages the operator when sustained per-minute origin request volume exceeds the configured threshold. No edge-layer application abuse rule engine. No managed WAF or AI-based bot detection beyond Turnstile's risk scoring.

Rationale:

- In-process limiting protects origin from overload.

- Per-IP and per-user limits cover different attack vectors.

- Shield Standard handles volumetric DDoS at the CDN edge for free.

- Turnstile is the compensating control for distributed app-layer abuse that stays under per-IP limits. It operates at the form boundary on the credential and identity-discovery endpoints attackers target, regardless of how request load is spread across IPs. Chosen over hCaptcha for unlimited free volume, no user-data resale, and Cloudflare-managed risk scoring.

- Managed mode chosen over Invisible mode because Managed renders a visible spinner that gives users a recovery affordance (a checkbox challenge to click) when risk scoring escalates, while Invisible mode has no failure UI for users blocked by privacy tools or accessibility software.

- The CloudWatch origin-spike alarm is the detective backstop for general traffic floods that bypass form-based gates, such as unauthenticated GET storms. Application controls block; the alarm escalates anything that gets through.

- A managed WAF is unnecessary here: Shield Standard, Turnstile, in-process rate limiting, and the structural app controls (parameterized queries, CSP, Helmet, origin-pin CSRF, anti-enumeration) already cover the threat model, and managed-rule false positives on legitimate long-form text would add recurring tuning burden for no real gap. WAFv2 stays a fast, low-cost lever to attach if observed abuse later warrants it.

Requirements:

- Authenticated member-search endpoints enforce a search-specific rate limit (per-IP and per-member quotas) stricter than the baseline anonymous/authenticated limits, defending against scraping the member directory at the legitimate-traffic threshold without exceeding it.
- Every member-search query writes an immutable, privacy-safe audit log entry (actor member id, query hash, result count, timestamp; no IP, no raw query string). Abusive search patterns are detectable post-hoc and a privacy-impacting search surface remains accountable.

Trade-offs:

- Legitimate users behind shared IPs may hit anonymous limits.

- Sophisticated attackers can bypass simple rate limiting.

- Distributed app-layer abuse on non-form routes cannot be blocked above the application; the origin-spike alarm escalates rather than auto-blocks.

- Turnstile depends on a third-party service. Fail-mode is fail-open with an alarm: if the siteverify endpoint is unreachable, the form submission proceeds without the CAPTCHA check, preserving user access during a Cloudflare outage. An env override flips to fail-closed during an active attack.

- Turnstile may escalate to an interactive checkbox for users on privacy-hardened browsers, Tor, or accessibility software, adding friction for a small fraction of legitimate users.

- Manual admin intervention required for coordinated abuse; admin response is account-level (member suspension), not network-layer blocking.

Impact:

- Rate limiting configuration tunable via Parameter Store.

- CloudWatch tracks rate limit hits for capacity planning.

- Upload operation caps (application-level, per member) are admin-tunable via `system_config_current`; the normative default values live in USER_STORIES.md §6.7 / DATA_MODEL.md §4.23 (`photo_upload_rate_limit_per_hour`, `video_submission_rate_limit_per_hour`).

- In-process counters of operations per member are memory-only.

- Turnstile site key rendered server-side into the five protected forms; secret key held in Parameter Store (read at boot, never logged); siteverify called server-side from the route handler before any DB read.

- CloudWatch origin-spike alarm fires to the existing operator SNS topic per §28.2 baseline.

## 8.4 Content Moderation Policy

Decision:

Member-flagging system for inappropriate content with admin review queue. No automated content moderation. All moderation actions logged immutably.

Rationale:

- Community-scale content volume manageable via manual review.

- Member flagging leverages community self-regulation.

- Transparent moderation maintains trust (all actions logged with reason).

- AI moderation complexity and cost unjustified.

Trade-offs:

- Inappropriate content may remain visible until flagged and reviewed.

- Admin workload scales with content volume.

- No proactive detection of problematic content.

Impact:

- Admin interface provides flag queue with context for review decisions.

- Moderation actions recorded in audit logs.

- Future AI moderation could augment, not replace, this system.

# 9. Performance, Cost and Scalability

## 9.1 Performance Target Architecture

Decision:

All query operations target less than 1 second response time (an optimistic goal not a promise).

Rationale:

- 1-second threshold provides acceptable UX for community site.

- Server-Side Rendering: HTML rendered on the server and delivered immediately. CloudFront CDN caches rendered HTML at edge locations.

- Lightweight JavaScript: Vanilla TypeScript bundles are intentionally small. Fast parse and execution time avoids heavy framework overhead.

- SQLite has low latency compared to database server alternatives.

- Important: JavaScript downloads, parses, and executes on all devices. Performance gains come from lightweight JavaScript (fast parse), not from maintaining a no-JavaScript path.

Trade-offs:

- Performance degrades linearly with data growth.

- Complex queries (multi-attribute searches) may approach or exceed 1-second target.

- No text search capability beyond simple substring matching for member names.

Impact:

- Query implementations must be profiled against 1-second budget.

- User expectations set for "adequate" not "instant" performance.

## 9.2 Cost Constraints

Decision:

Target operational cost: \$50-100/month. Single Lightsail instance (\$40/month), S3 storage/transfer, CloudFront, SES. No high-availability cluster, no managed database, no sophisticated monitoring tools.

Rationale:

- Cost ceiling sustainable on volunteer-run organization budget.

- Single-instance simplicity dramatically reduces infrastructure costs.

- AWS managed services (S3, SES) eliminate operational overhead.

- Community scale doesn't require enterprise infrastructure.

Trade-offs:

- Single point of failure (instance outage equals site down).

- Manual intervention required for scaling beyond single instance.

- Limited monitoring compared to commercial APM solutions.

- Performance ceiling constrained by vertical scaling limits.

Impact:

- Infrastructure decisions evaluated against cost impact.

- Monitoring tracks actual spend vs budget.

- Future growth may require architectural changes if costs exceed ceiling.

- Must configure an AWS CloudWatch alarm for cost threshhold.

## 9.3 Scalability

Decision:

Vertical scaling only (up to 8GB RAM on Lightsail). No horizontal auto-scaling, no multi-instance architecture.

Rationale:

- Community traffic patterns (hundreds of active users) fit single-instance capacity.

- Vertical scaling simpler operationally than horizontal (no load balancer, session management, distributed state).

- File-based storage on S3 separates data from compute (instance replaceable).

Trade-offs:

- Hard capacity ceiling (8GB instance max on Lightsail).

- Downtime required for vertical scaling (instance recreation).

- No automatic response to traffic spikes.

- Future horizontal scaling requires architectural changes (load balancer, session management, stateless design already supports this).

Impact:

- Capacity planning based on single-instance limits.

- Traffic growth monitored against vertical scaling headroom.

- Migration to multi-instance architecture documented as future decision point.

## 9.4 Backup and Recovery

Decision:

Two backup operations provide data protection with minimal cost. This approach balances cost (estimated \$3/month total) with comprehensive protection.

Continuous Database Backup (every 5 minutes):

Purpose: Fast recovery from common issues (corruption, bugs, accidental deletion).

Process: Background worker executes: (1) PRAGMA wal_checkpoint(TRUNCATE) commits WAL to main database file, (2) SQLite backup API (better-sqlite3 .backup() ) creates consistent snapshot, (3) Upload to primary S3 bucket with retry (3 attempts, exponential backoff), (4) Update health timestamp.  

Cost: estimated \$1/month for S3 storage with a default 30-day primary snapshot version-history window (versioning lifecycle setting; configurable).

Recovery: RPO 5 to 10 minutes, restore any snapshot within the configured primary snapshot version-history window (default: 30 days).

Cross-Region Disaster Recovery Sync (nightly):

Purpose: Protection against catastrophic regional failures.

Process: Nightly job syncs primary S3 bucket to cross-region backup bucket with S3 Object Lock (WORM) and lifecycle rules.

Cost: Marginal (replication + storage in backup region).

Recovery: RPO 24 hours for cross-region disaster recovery sync; frequent snapshot backups provide RPO 5–10 minutes for primary-region recovery.

S3 bucket configuration: Versioning enabled on the primary backup bucket (default 30-day version-history window for database snapshot point-in-time recovery). The cross-region backup bucket uses Object Lock (WORM - Write Once Read Many) and lifecycle rules for retained backup objects. Cross-region protection is provided via the nightly disaster recovery sync job.

Container shutdown (SIGTERM): On shutdown signal, the application performs graceful shutdown to prevent data loss: (1) Stop accepting new requests. (2) Wait for in-flight transactions to complete (30-second timeout). (3) Execute PRAGMA wal_checkpoint(TRUNCATE) to commit final transactions. (4) Close database connection cleanly. (5) Perform final S3 backup upload. (6) Exit. This ensures no data loss during planned restarts or deployments.

Backup failure handling: Retry with exponential backoff (3 attempts: 1s, 2s, 4s delays). Alert CRITICAL after 3 consecutive failures. Health endpoint exposes last successful backup timestamp. CloudWatch alarm if backup age exceeds 15 minutes. This ensures operators are immediately aware of backup issues.

Recovery procedure: Download latest S3 backup version, run PRAGMA integrity_check to validate database integrity, replace local database file, restart application containers, verify health endpoints return OK. Target RTO (Recovery Time Objective): ~5 minutes from failure detection to service restoration.

Automated daily verification: A daily job verifies backup integrity by comparing primary and backup S3 buckets: compares object counts and total size (allowing 1% variance for in-flight operations), randomly samples 10 objects and verifies MD5 checksums match between primary and backup, checks S3 replication lag metrics. If discrepancies exceed thresholds, alerts CRITICAL priority.

Quarterly restoration drills: Download backup, verify integrity, restore to test environment, run smoke tests, document results and update procedures. These drills validate that recovery procedures work correctly and identify gaps in runbooks.

Rationale: Five minute backup interval provides acceptable RPO (Recovery Point Objective), which is acceptable for community site operations. SQLite backup API guarantees consistency by handling WAL files correctly during snapshot creation. Single file upload is simple and reliable compared to multi-file or incremental approaches. S3 versioning provides point-in-time recovery capability. Graceful shutdown with final WAL checkpoint prevents data loss during deployments and restarts.

The selected approach using S3 Intelligent-Tiering costs approximately $1/month, providing acceptable RPO (5-10 minutes) and a configurable point-in-time recovery window (default: 30 days) at minimal cost appropriate for a volunteer-maintained platform.

Daily automated verification provides continuous confidence that backups are actually working without waiting for a disaster to discover issues. Quarterly restoration drills validate end-to-end recovery procedures and uncover gaps in runbooks before they matter. This balanced approach provides assurance without excessive operational burden.

Trade-offs:

- Data loss of up to 5 minutes if instance fails between backups.

- Costs are mitigated by S3 versioning lifecycle rules that transition old backups to cheaper storage tiers automatically.

- RTO of 5 minutes requires manual intervention (download, verify, restore, restart). There is no automated failover to a standby instance. This trade-off favors operational simplicity over automatic recovery, which is appropriate for volunteer-maintained community platform.

- Manual recovery procedures introduce human error risk. This is mitigated through comprehensive runbooks, quarterly drills, and automated verification that catches backup issues before recovery is needed.

Impact:

A host-side systemd timer runs the backup script every five minutes. CloudWatch monitors backup success rate, backup age. Alerts trigger on backup failures (3 consecutive) or stale backups (\>15 minutes old). Health endpoint exposes last successful backup timestamp for external monitoring.

DEVOPS_GUIDE.md (private GitHub repo) documents step-by-step recovery procedures with validation checklists. Quarterly drills validate recovery process works as documented and identify needed updates to procedures.

Integration tests validate S3 upload contract (retry logic, error handling, health timestamp updates). Daily verification job provides ongoing assurance that backups are complete and consistent.

Backup retention windows support data deletion policy. The normative defaults for backup retention are defined in User Stories 6.7: `primary_snapshot_version_days` (default: 30 days) governs the primary bucket version-history window; `cross_region_backup_retention_days` (default: 90 days) governs the Object Lock retention on the cross-region disaster-recovery bucket. The normative default for audit log retention is adefined in (`audit_retention_days`, default 7 years / 2555 days).

WAL checkpoint failure handling: If a long-running transaction holds locks, the WAL checkpoint cannot complete. The backup worker attempts wal_checkpoint(TRUNCATE) with busy_timeout=10000 (10 seconds). If checkpoint fails, the worker logs a warning, skips that backup cycle, and retries in the next five-minute interval. After three consecutive checkpoint failures, an administrator alert is sent indicating potential database contention issues. Backups only proceed after successful WAL checkpoint to ensure consistency. The health check endpoint reports time_since_last_successful_backup enabling monitoring systems to detect extended backup failures.

Alternative considered: The AWS free tier does not provide viable continuous database backup at required RPO. Free tier S3 includes 5GB storage and 20,000 GET requests monthly, insufficient for 5-minute backup uploads (8,640 uploads monthly) and a default 30-day primary snapshot version-history window (requires approximately 50GB storage at scale). Trade-off analysis: Free tier would require 60+ minute backup intervals (unacceptable RPO) or complex custom backup rotation logic (operational complexity). Paid minimal-cost solution ($1/month) is appropriate given budget constraints and simplicity goals.

Photo Backup (S3 replication):

Photos are backed up separately from database due to data volume. Amazon S3 cross-region replication handles photo backup automatically and continuously. The primary media bucket (`<env>-media`, us-east-1) replicates all photo objects to a dedicated DR bucket (`<env>-media-dr`, us-west-2) using S3 One Zone-IA storage class for cost savings on DR storage. Replication is continuous; per-object propagation typically completes within minutes. S3 Replication Time Control (RTC) is not enabled, so there is no formal RPO SLA. No backup job or cron process is required; S3's native cross-region replication feature handles this automatically. Photo backup is completely decoupled from database backup cycle. The DR bucket preserves the primary's S3 key structure exactly (replication preserves keys), so a recovery scenario can restore objects without remapping. Object Lock is intentionally not applied to the photo DR bucket: photo deletion must propagate to the DR side to honor member-account-erasure (§1.5 "When member deletes account: member's photos automatically hard-deleted"). Operator-recovery headroom is provided by S3 Versioning plus 30-day `NoncurrentVersionExpiration` on both buckets.

Recovery procedure: Promote the DR bucket to primary by updating the CloudFront `/media/*` origin and the `MEDIA_STORAGE_S3_BUCKET` env var, or restore objects from the DR bucket to a new primary bucket (replication-preserved keys make either path mechanical).

## 9.5 Failure Modes

Decision:

The platform uses two operational states:

- Normal (all features available).

- Maintenance (CloudFront error page displayed).

Rationale:

Binary operational states (working vs. down) are simpler to understand, monitor, troubleshoot, and communicate than hybrid degraded states. For a volunteer-maintained platform, complex degradation handling is not justified; we prefer clear maintenance mode plus fast restore procedures.

Trade-offs:

Complete outages vs. partial degradation: Users cannot access site during origin failures. Complete maintenance mode is simpler and clearer than attempting read-only access, and reduces operational and testing complexity.

Impact:

Simplified monitoring (binary availability states), simplified troubleshooting (clear recovery procedures), simplified codebase (no degraded-mode state management), reduced testing surface.

Container memory limits: Docker memory limits are explicitly set for each container preventing unbounded memory consumption. Configuration: web container mem_limit: 512m; worker container mem_limit: 384m. These are deployment configuration values for container resource management, not Administrator-configurable application parameters.

Health check integration: The /health/ready endpoint returns 503 when memory usage exceeds 90 percent. During this condition, the origin responds with 503 and CloudFront serves the configured maintenance/error experience; alerts fire so operators can intervene or restart containers. (CloudFront does not perform active health checks.)

Monitoring and alerts: Alert if memory usage remains above 80 percent for five consecutive minutes indicating sustained pressure requiring investigation. Container restart policy configured for automatic recovery with maximum three restart attempts preventing restart loops from persistent issues.

## 9.6 Infrastructure as Code

Decision:

All steady-state AWS infrastructure is defined in Terraform configuration files version-controlled in the repository under `/terraform`. A one-time manual bootstrap is allowed only to provision the AWS account baseline, the operator IAM identity that subsequently runs Terraform, and the Terraform remote-state S3 bucket; all steady-state IAM (source-profile users, runtime roles, policies, instance profiles) is defined in Terraform. After that handoff, manual console changes are prohibited except for emergency incident response, and any emergency change must be reconciled back into Terraform before the next `terraform plan` or `apply`. Terraform remote state is held in an S3 bucket with S3 native locking (`use_lockfile = true`, Terraform >= 1.11); DynamoDB locking and Terraform Cloud are excluded.

Rationale:

- Reproducible environments: Dev, staging, production created identically from code (eliminates "works in staging but not production" issues).
- Infrastructure changes reviewed via pull requests with visual diff of planned changes (terraform plan output).
- Disaster recovery through code: complete AWS-side rebuild possible from Terraform state. Host-side state recovers separately.
- Eliminates tribal knowledge; infrastructure documented as executable code with comments explaining rationale.
- Supports long-term volunteer maintainability (new admins can understand infrastructure by reading .tf files).
- Enables infrastructure testing in isolated environments before production deployment.

Infrastructure Managed by Terraform:

- Lightsail instance configuration (size, region, OS, firewall rules, static IP allocation).
- S3 buckets with complete configuration (including backup bucket for SQLite snapshots with versioning and Object Lock enabled).
- CloudFront distributions.
- IAM roles and policies, including the runtime assumed role model and any distinct privileged roles.
- Lightsail firewall rules and any approved infrastructure-side inputs needed for the documented SSH operator-access posture.
- Parameter Store structure.
- KMS keys and key policies.
- CloudWatch resources, including log groups and alerting resources used by operations and application/platform monitoring.
- Route53 DNS records.
- SES email identities (sender, plus future bounce and complaint webhook configuration).
- Budget alerts and SNS topics.

Host-State Boundary:

Terraform manages AWS API resources. Host-side filesystem and systemd state on the Lightsail VM (installed packages, agent config files, daemon lifecycle) are managed by idempotent shell scripts under `scripts/` and by documented procedures in `docs/DEV_ONBOARDING.md`. Terraform `remote-exec` and `local-exec` provisioners are excluded as a canonical pattern.

Constraints driving the split:

- Lightsail provides no `user_data` mechanism, so the EC2 cloud-init bootstrap pattern is unavailable.
- SSM Hybrid Activation is deferred. Documented CVE history (CVE-2022-29527 sudoers privilege escalation, March 2025 path-traversal RCE-to-root, CVE-2025-21613 go-git dependency); the SSM Agent vends credentials at `/root/.aws/credentials`, widening the host's attack surface; the 30-minute credential refresh has no cached fallback under network disruption. Re-evaluate when a second SSM-driven need amortizes the activation cost.
- Terraform provisioners couple state to SSH reachability, fail opaquely on partial success, and resist safe re-running. HashiCorp recommends them as last resort.

Canonical pattern: idempotent scripts in `scripts/` are reviewable, version-controlled, and re-runnable; host-state changes share the same git history as the AWS-side declarations. Examples include `scripts/install-cwagent-staging.sh` for the CloudWatch Agent and `scripts/deploy-code.sh` for application code.

Secrets Management:

Terraform creates Parameter Store parameters (paths and metadata) but does not store secret values in version control. Secret values (Stripe API keys, Stripe webhook secrets, and other non-KMS credentials) are set manually via AWS CLI or secure deployment pipeline after Terraform creates parameter structure. Terraform references secrets via parameter names; actual values never appear in `.tf` files or state files. JWT signing keys and ballot encryption keys use AWS KMS (non-exportable key material) and are provisioned via Terraform KMS resources; they are never stored in Parameter Store.

Requirements:

- Terraform backend configuration uses `-backend-config` placeholders for environment-specific identifiers (state bucket suffix, lock table name). Literals do not appear in checked-in `terraform/<env>/backend.tf`; each environment supplies its values at `terraform init` time so the same `backend.tf` file works for any future environment.
- Deploy scripts read environment-specific identifiers (CloudFront distribution ID, S3 bucket names, KMS key IDs) from environment variables or `terraform output`, not from hardcoded constants in script source. A new environment does not require editing a script literal.
- Terraform shared/global state (the `terraform/shared/` workspace) lives outside the repo working tree (separate clone, separate workspace, or external mount). The state files cannot be accidentally committed to the application repo by a `git add -A`.
- `terraform/staging/providers.tf` and `terraform/production/providers.tf` declare the same `required_version` and the same provider version constraints. A required-version bump is a coordinated PR that touches both files in the same commit.

Trade-offs:

- Initial setup cost: must define all infrastructure as code.
- Learning curve: Contributors must understand basic Terraform syntax and workflow.
- State file management requires multi-operator coordination on the shared S3 backend. Native locking serializes concurrent applies; operators still coordinate before invasive changes.
- Requires discipline: Manual console changes create drift requiring reconciliation. Manual AWS console changes are prohibited except for emergency troubleshooting. Any permanent changes must be made via Terraform.
- AWS provider major version is pinned. Provider major upgrades require explicit review of the migration guide and a coordinated apply across all workspaces, not a casual `terraform init -upgrade`.
- Two control surfaces: AWS-side resources land via `terraform apply`, host-side state via on-host script execution. Operators run scripts on each host after the corresponding apply for a full bootstrap. Script-side failures are not visible in `terraform apply` output.

Impact:

- Terraform must remain the authority for IAM roles, policies, Parameter Store structure (per §3.6), KMS resources, CloudWatch resources, Lightsail instance configuration, Lightsail firewall rules, and any infrastructure-side inputs required by the SSH operator-access posture and the runtime-credential model in §7.2.
- Deployment/bootstrap documentation must clearly separate one-time bootstrap actions from steady-state Terraform-managed infrastructure.
- Workspace layout: `terraform/shared/` for one-time bootstrap (state bucket, account baseline); `terraform/staging/` and `terraform/production/` for per-environment resources, each with its own remote state.
- Drift reconciliation procedure (`terraform import` flow, plan-clean verification, PR review) lives in DEVOPS_GUIDE.md (private GitHub repo), "Emergency console changes". The design rule above is enforced by the requirement that `terraform plan` returns "No changes" before any further apply.
- Any agent or daemon needing host-level access (e.g. CloudWatch Agent reading host CPU/memory/disk) is bootstrapped through an idempotent script under `scripts/`, not through Terraform provisioners or AWS Console clicks.


## 9.7 High Availability and Recovery

Decision:

The platform uses a single-instance architecture with CloudFront custom error pages for graceful degradation during failures. High availability is achieved through rapid recovery procedures, automated monitoring, and backups rather than redundant compute infrastructure.

Rationale:

- Volunteer-run community platform does not justify operational complexity of multi-instance architecture.

- Additional cost (financial and volunteer time) of redundant infrastructure outweighs benefit of avoiding approximately 52 minutes of downtime per year.

- Design prioritizes rapid recovery over failure prevention through comprehensive monitoring, automated alerting, and documented recovery procedures.

- Transparent failure modes: users see either fully functional site or clear maintenance page, no ambiguous partial failure states.

Trade-offs:

- No automatic horizontal scaling or multi-instance redundancy.

- Site unavailable during Lightsail failures (approximately 52 minutes per year expected).

- POST/PUT/DELETE requests receive connection errors during outages (CloudFront limitation).

- Recovery requires manual admin intervention for most scenarios.

Impact:

- CloudWatch Monitoring: Key metrics tracked: OriginAvailability, Origin5xxErrorRate, ApplicationErrorRate, CPUUtilization, S3OperationFailures, StripeAPIErrors.

- Critical alarms: Origin availability / 5xx rate \>5% for 2 minutes, CPU \>80% for 10 minutes.

- Complete recovery procedures documented in DEVOPS_GUIDE.md (private GitHub repo) with diagnostic commands, rollback procedures, and validation checklists.

- Use AWS tools and DEVOPS_GUIDE.md (private GitHub repo) to get infrastructure details and perform operational actions. Admin user dashboard remains application-level only: active alarms summary, system health, recent application-visible errors, and origin availability indicators. No AWS console links or infrastructure quick actions are exposed in the Application Administrator UI.

## 9.8 Monitoring and Alerting

Decision:

The platform implements three-layer monitoring covering infrastructure health, application behavior, and business operations. CloudWatch provides the monitoring substrate with custom metrics published by application code. Alerts route through CloudWatch Alarms to SNS topics with email and SMS notification. Two alert severities (warning, critical) have different response time expectations and escalation paths. CloudWatch is the primary monitoring system; optional external error tracking/APM tooling may be adopted if it is budget-appropriate and reduces operational risk.

Rationale:

Proactive monitoring detects issues before user impact and enables data-driven capacity planning. Three-layer structure provides visibility at appropriate abstraction levels for different audiences (operations team vs administrators). CloudWatch native integration minimizes operational overhead compared to external monitoring services.

Layer 1 - Infrastructure Metrics (CloudWatch Default): Lightsail instance: CPU utilization, memory utilization, network traffic, status checks. Container-level: per-container memory, per-container CPU, restart counts. S3: 4xx/5xx error rates, request rates. These detect resource exhaustion and infrastructure failures.

Layer 2 - Application Metrics (Custom CloudWatch Metrics): Request rates and error rates (4xx, 5xx) broken down by route. Response latency (P50, P95, P99) per route. Authentication: login success/failure rates, JWT verification failures. Background jobs: last successful run timestamp per job type, job execution duration. These detect application bugs and performance degradation. Database: query latency (P50, P95, P99 per repository method), slow queries (\>500ms), transaction rate and duration, SQLITE_BUSY frequency, WAL file size, checkpoint latency, database file size and growth rate.

Layer 3 - Business Metrics (Custom CloudWatch Metrics): Member registrations (started, completed, completion rate). Photo uploads (count, success rate, error breakdown). Payment transactions (attempts, successes, failure rate, daily revenue). Email delivery (enqueued, sent, bounces, complaints). Event registrations. These detect business process issues and usage anomalies.

Alert Severities: Warning-level: Email to operations team, 1-hour response expectation, indicates

degraded but functional state. Examples: CPU \>80% for 10 minutes, P95 latency \>2 seconds for 5 minutes, background job missed 1 execution.

Critical-level: Email and SMS to on-call, 15-minute response expectation, indicates service disruption or imminent failure. Examples: CPU \>90% for 5 minutes, 5xx rate \>5% for 1 minute, any background job missed 3+ consecutive executions, container restart loop (3+ restarts in 10 minutes). Database: backup age \>15 minutes, 3 consecutive backup failures, WAL file \>1GB (checkpoint issues), SQLITE_BUSY rate \>5% of operations, checkpoint latency \>5 seconds, database file approaching disk capacity (80%/90% thresholds).

Dashboards:

Operations Dashboard: Infrastructure and application metrics, alert status, recent errors, container health. Updated every 30 seconds. Technical team only. Administrator Dashboard: Business metrics, member activity, payment summary, email delivery, moderation queue. Updated every 5 minutes.

Alert Configuration Principle:

Alerts are tuned to minimize false positives while catching real issues. Warning alerts use 5-10 minute windows to avoid flapping on transient spikes. Critical alerts use shorter windows (1-5 minutes) for rapid response. Thresholds are reviewed quarterly based on operational experience and adjusted as usage patterns evolve.

**END OF Design Decisions DOCUMENT**
