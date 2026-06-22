# Footbag Website Modernization Project -- DevOps Guide

This file is the operator manual for the deployed platform. It assumes the solution architecture, functional requirements, and service boundaries are already defined elsewhere and intentionally does not repeat that material. It focuses on what a System Administrator must provision, secure, deploy, monitor, back up, restore, and maintain.

## Table of Contents

- [1. Operating Baseline](#1-operating-baseline)
  - [1.1 Environment model](#11-environment-model)
  - [1.2 Runtime shape](#12-runtime-shape)
  - [1.3 Container roles](#13-container-roles)
  - [1.4 State placement](#14-state-placement)
  - [1.5 Operating posture](#15-operating-posture)
- [2. System Administrator Runbook Catalog](#2-system-administrator-runbook-catalog)
- [3. AWS Operations, IAM, and Zero-Trust Access Control](#3-aws-operations-iam-and-zero-trust-access-control)
  - [3.1 Access-control principles](#31-access-control-principles)
  - [3.2 Role and boundary matrix](#32-role-and-boundary-matrix)
  - [3.3 Human AWS access rules](#33-human-aws-access-rules)
  - [3.4 Workload IAM model](#34-workload-iam-model)
  - [3.5 Operator shell access](#35-operator-shell-access)
  - [3.6 S3 bucket policy rules](#36-s3-bucket-policy-rules)
  - [3.7 CloudTrail and auditability](#37-cloudtrail-and-auditability)
  - [3.8 Break-glass access](#38-break-glass-access)
- [4. Runtime Topology and AWS Resource Layout](#4-runtime-topology-and-aws-resource-layout)
  - [4.1 Edge and request flow](#41-edge-and-request-flow)
  - [4.2 Networking and TLS](#42-networking-and-tls)
  - [4.3 S3 layout expectations](#43-s3-layout-expectations)
  - [4.4 Container sizing and restart behavior](#44-container-sizing-and-restart-behavior)
  - [4.5 SES operations](#45-ses-operations)
- [5. Configuration, Secrets, and Key Management](#5-configuration-secrets-and-key-management)
  - [5.1 Configuration boundary](#51-configuration-boundary)
  - [5.2 Parameter Store namespace](#52-parameter-store-namespace)
  - [5.3 What goes in Parameter Store vs KMS](#53-what-goes-in-parameter-store-vs-kms)
  - [5.4 Secret-handling rules](#54-secret-handling-rules)
  - [5.5 Stripe key and webhook-secret rotation runbook](#55-stripe-key-and-webhook-secret-rotation-runbook)
  - [5.6 JWT and ballot-key controls](#56-jwt-and-ballot-key-controls)
  - [5.7 Source-profile access-key rotation](#57-source-profile-access-key-rotation)
  - [5.8 SESSION_SECRET rotation runbook](#58-session_secret-rotation-runbook)
  - [5.9 Origin-verify shared-secret rotation runbook](#59-origin-verify-shared-secret-rotation-runbook)
  - [5.10 Safe Browsing API key rotation runbook](#510-safe-browsing-api-key-rotation-runbook)
  - [5.11 SES feedback loop activation](#511-ses-feedback-loop-activation)
  - [5.12 Production first-admin bootstrap](#512-production-first-admin-bootstrap)
  - [5.13 Host env verification](#513-host-env-verification)
- [6. Terraform and Infrastructure Change Control](#6-terraform-and-infrastructure-change-control)
  - [6.1 Terraform authority](#61-terraform-authority)
  - [6.1.1 Manual bootstrap boundary](#611-manual-bootstrap-boundary)
  - [6.2 State management](#62-state-management)
  - [6.3 Standard workflow](#63-standard-workflow)
  - [6.4 Environment separation](#64-environment-separation)
  - [6.5 Emergency console changes](#65-emergency-console-changes)
  - [6.6 What not to do](#66-what-not-to-do)
- [7. CI/CD, Release Promotion, and Deployment Workflow](#7-cicd-release-promotion-and-deployment-workflow)
  - [7.0 Deployment model](#70-deployment-model)
  - [7.1 CI responsibilities](#71-ci-responsibilities)
  - [7.2 Promotion policy](#72-promotion-policy)
  - [7.3 Standard deployment runbook](#73-standard-deployment-runbook)
  - [7.4 Rollback runbook](#74-rollback-runbook)
  - [7.5 Restart runbook](#75-restart-runbook)
- [8. Health Endpoints, Maintenance Mode, and Readiness](#8-health-endpoints-maintenance-mode-and-readiness)
  - [8.1 `/health/live`](#81-healthlive)
  - [8.2 `/health/ready`](#82-healthready)
  - [8.3 Maintenance mode](#83-maintenance-mode)
  - [8.4 Planned maintenance](#84-planned-maintenance)
  - [8.5 Unplanned outage handling](#85-unplanned-outage-handling)
- [9. SQLite, Schema Migration, and Data Operations](#9-sqlite-schema-migration-and-data-operations)
  - [9.1 SQLite operating model](#91-sqlite-operating-model)
  - [9.2 Migration rules](#92-migration-rules)
  - [9.3 Migration runbook](#93-migration-runbook)
  - [9.4 Data-access rules for operators](#94-data-access-rules-for-operators)
  - [9.5 Contention and performance alarms](#95-contention-and-performance-alarms)
- [10. Backup, Restore, and Disaster Recovery](#10-backup-restore-and-disaster-recovery)
  - [10.1 Recovery objectives by scenario](#101-recovery-objectives-by-scenario)
  - [10.2 Continuous database backup](#102-continuous-database-backup)
  - [10.3 Nightly cross-region DR sync](#103-nightly-cross-region-dr-sync)
  - [10.4 Media backup](#104-media-backup)
  - [10.5 Snapshot restore runbook](#105-snapshot-restore-runbook)
  - [10.6 Cross-region disaster restore runbook](#106-cross-region-disaster-restore-runbook)
  - [10.7 Backup validation and restore drills](#107-backup-validation-and-restore-drills)
  - [10.8 What to verify after any restore](#108-what-to-verify-after-any-restore)
- [11. Background Jobs and Scheduler Operations](#11-background-jobs-and-scheduler-operations)
  - [11.1 Ownership model](#111-ownership-model)
  - [11.2 Job catalog](#112-job-catalog)
  - [11.3 Scheduler rules](#113-scheduler-rules)
  - [11.4 Job failure response](#114-job-failure-response)
  - [11.5 Job-run logging](#115-job-run-logging)
- [12. Monitoring, Logging, Alerting, and Cost Control](#12-monitoring-logging-alerting-and-cost-control)
  - [12.1 CloudWatch-first model](#121-cloudwatch-first-model)
  - [12.2 Logging rules](#122-logging-rules)
  - [12.3 Alarm model](#123-alarm-model)
  - [12.4 Suggested operational thresholds](#124-suggested-operational-thresholds)
  - [12.5 Dashboards and notifications](#125-dashboards-and-notifications)
  - [12.6 Cost control](#126-cost-control)
  - [12.7 Cost-alarm threshold tuning runbook](#127-cost-alarm-threshold-tuning-runbook)
- [13. Routine Security and Platform Operations](#13-routine-security-and-platform-operations)
  - [13.1 Monthly routine tasks](#131-monthly-routine-tasks)
  - [13.2 Quarterly routine tasks](#132-quarterly-routine-tasks)
  - [13.3 Patch management](#133-patch-management)
  - [13.4 Parameter Store hygiene](#134-parameter-store-hygiene)
  - [13.5 SES and deliverability maintenance](#135-ses-and-deliverability-maintenance)
  - [13.6 Access reviews and volunteer turnover](#136-access-reviews-and-volunteer-turnover)
  - [13.7 Resource tuning](#137-resource-tuning)
  - [13.8 Operator-workstation staging readiness smoke test](#138-operator-workstation-staging-readiness-smoke-test)
  - [13.9 On-call rotation and escalation policy](#139-on-call-rotation-and-escalation-policy)
- [14. Staging Refresh and Anonymization](#14-staging-refresh-and-anonymization)
  - [14.1 Goal](#141-goal)
  - [14.2 Required workflow](#142-required-workflow)
  - [14.3 Required anonymization checks](#143-required-anonymization-checks)
  - [14.4 What not to do](#144-what-not-to-do)
- [15. Incident Response and Troubleshooting](#15-incident-response-and-troubleshooting)
  - [15.1 Standard incident flow](#151-standard-incident-flow)
  - [15.2 First checks by symptom](#152-first-checks-by-symptom)
  - [15.3 Readiness-failure troubleshooting](#153-readiness-failure-troubleshooting)
  - [15.4 Secret/config troubleshooting](#154-secretconfig-troubleshooting)
  - [15.5 SSH access troubleshooting](#155-ssh-access-troubleshooting)
  - [15.6 Standard log-collection commands](#156-standard-log-collection-commands)
  - [15.7 Stripe webhook health and incident response](#157-stripe-webhook-health-and-incident-response)
  - [15.8 Incident postmortem template](#158-incident-postmortem-template)
- [16. Operator Checklists](#16-operator-checklists)
  - [16.1 Production deployment checklist](#161-production-deployment-checklist)
  - [16.2 Secret rotation checklist](#162-secret-rotation-checklist)
  - [16.3 Snapshot restore checklist](#163-snapshot-restore-checklist)
  - [16.4 Access review checklist](#164-access-review-checklist)
  - [16.5 Backup-drill checklist](#165-backup-drill-checklist)
  - [16.6 Cutover preflight checklist](#166-cutover-preflight-checklist)
  - [16.7 DNS cutover sequence runbook](#167-dns-cutover-sequence-runbook)
  - [16.8 External DNS/mail upstream coordination runbook](#168-external-dnsmail-upstream-coordination-runbook)
  - [16.9 Environment bring-up sequence](#169-environment-bring-up-sequence)
- [17. Test-data Operations](#17-test-data-operations)
  - [17.1 Scope and isolation model](#171-scope-and-isolation-model)
  - [17.2 Staging admin seed](#172-staging-admin-seed)
  - [17.3 Transport and argv-leak hardening](#173-transport-and-argv-leak-hardening)
  - [17.4 Adding a new dev-shortcut mechanism](#174-adding-a-new-dev-shortcut-mechanism)
  - [17.5 Guardrails](#175-guardrails)
  - [17.6 Password-leak protections](#176-password-leak-protections)
  - [17.7 Removal](#177-removal)
  - [17.8 Production first-admin bootstrap](#178-production-first-admin-bootstrap)
---

## 1. Operating Baseline

### 1.1 Environment model

| Environment | Purpose | Compute model | Data policy | Operator expectation |
|---|---|---|---|---|
| Development | local feature work and debugging | local Docker Compose | synthetic or safe fixture data by default | no production credentials; use local stubs unless integration testing is required |
| Staging | production-like validation, migration rehearsal, restore rehearsal | single-instance AWS environment matching production shape as closely as practical | anonymized production-derived data only | used for deployment rehearsal, rollback rehearsal, secret rotation rehearsal, and restore validation |
| Production | live footbag.org service | single AWS Lightsail instance behind CloudFront | real user data | conservative change control, MFA-backed access, full auditability |

### 1.2 Runtime shape

Production and staging use the same logical shape:

- one AWS Lightsail instance as the application origin
- CloudFront distribution(s) in front of the origin and media surfaces as required
- one SQLite database file on the instance for primary relational state
- S3 for media, backup snapshots, maintenance-page assets, and disaster-recovery storage
- CloudWatch for logs, metrics, alarms, and dashboards
- Parameter Store and KMS for secrets and cryptographic keys
- SES for email delivery
- Route 53 for DNS
- hardened per-operator SSH for exceptional operator shell access

Single-instance, no rolling deploys: the compose stack on each environment is a single Lightsail node. Deploys bring the stack down (`compose down`) and back up (`compose up`); there is no canary, no blue/green, no parallel instance. Backward-incompatible env-var or trust-chain changes therefore land cleanly without an in-flight version mismatch; but the property is load-bearing: any future move to a multi-instance topology must re-evaluate trust-proxy parsing, env-var migration ordering, and secret-rotation atomicity.

### 1.3 Container roles

| Container | Role | Durable state | Operational notes |
|---|---|---|---|
| `nginx` | reverse proxy to app containers; origin-facing web entrypoint | none | small memory footprint; restart is low-risk |
| `web` | Node.js web application | none | serves HTTP requests; participates in `/health/live` and `/health/ready` |
| `worker` | background jobs, outbox processing, cleanup jobs | none | operationally critical; job failures often begin here |
| `image` | isolated image processing | none | restart independently if image processing fails; does not hold primary state |

### 1.4 State placement

| State type | Canonical location | Notes |
|---|---|---|
| relational application data | SQLite file on Lightsail instance | primary live database |
| media objects | S3 | photo originals discarded after processing; stored variants are authoritative |
| backup snapshots | S3 primary backup bucket | versioned snapshot history |
| cross-region DR copies | S3 DR bucket | Object Lock retention for disaster recovery |
| runtime admin-configurable settings | `system_config_current` view | read directly by jobs and services at runtime |
| secrets | Parameter Store `SecureString` or KMS | never in code, image layers, or committed files |
| JWT signing keys | KMS asymmetric key | non-exportable key material |
| ballot encryption master keys | KMS | runtime assumed role may generate data keys; tally role may decrypt |

### 1.5 Operating posture

This guide assumes a conservative operating posture:

- simple, explicit, reproducible changes
- Terraform authority for infrastructure
- documented runbooks for every privileged task
- CloudWatch-first monitoring
- fast restore over complex failover
- no shared credentials
- no standing production access beyond what is operationally required

---

## 2. System Administrator Runbook Catalog

The previous DevOps draft had a useful set of System Administrator stories. Those ideas belong in this guide as concrete runbooks, not as prose examples. The table below is the operational catalog for those responsibilities.

| Runbook ID | Runbook | Covered in this guide |
|---|---|---|
| `SA_Infra_As_Code_Terraform` | manage AWS infrastructure through Terraform with code review and remote state locking | §6 |
| `SA_IAM_Policies_And_CloudTrail_Auditability` | define least-privilege IAM, bucket policies, audit logging, and access review | §3, §13 |
| `SA_SSH_Operator_Access` | manage named operator SSH access, firewall restrictions, and host-access lifecycle | §3.5 |
| `SA_Manage_Secrets_In_Parameter_Store` | create, scope, rotate, and audit secrets under `/footbag/{env}/...` | §5 |
| `SA_Rotate_Stripe_Keys` | dual-key rotation for Stripe API keys and webhook secrets | §5.5 |
| `SA_Deployment_Operations_And_Release_Runbooks` | deploy, verify, rollback, restart, and recover | §7, §15 |
| `SA_Maintenance_Mode_And_CloudFront_Maintenance_Page` | use CloudFront custom error responses and S3 maintenance assets | §8 |
| `SA_Backups_Verification_And_Restore_Drills` | validate backups and rehearse restores | §10 |
| `SA_Regional_Outage_Restore` | restore service from cross-region DR copies | §10.6 |
| `SA_Monitoring_Alerting_And_Incident_Response` | CloudWatch dashboards, alarms, SNS, and incident response | §12, §15 |
| `SA_Container_Resource_Allocation_Tuning` | tune container memory and restart policy based on observed data | §4.4, §12.4, §13.7 |
| `SA_Configure_Budgets_And_SNS_Alerting` | configure budgets, notifications, and cost alarms | §12.5 |
| `SA_Configure_Email_Delivery_Infrastructure` | SES domain verification, SPF, DKIM, DMARC, bounce handling | §4.5, §13.5 |
| `SA_Configure_Job_Schedules` | define and maintain the scheduler for system jobs | §11 |
| `SA_Bootstrap_New_Environment` | provision a new environment from scratch: root account hardening, IAM operator user, Terraform state bucket, environment apply, Lightsail host setup, Docker, first deployment, and CloudFront verification | DEV_ONBOARDING.md Path D |

---

## 3. AWS Operations, IAM, and Zero-Trust Access Control

### 3.1 Access-control principles

The AWS side of this project must be operated as a zero-trust environment:

- every human and workload identity is authenticated explicitly
- every permission is environment-scoped and least-privilege
- production access is narrower than development and staging access
- all privileged actions are auditable
- no role in the web app implies AWS access
- application-level administration and AWS/system administration remain separate
- production access requires MFA and must be temporary whenever practical
- shell access uses hardened per-operator SSH with restricted source IPs, not shared shell credentials

### 3.2 Role and boundary matrix

| Role | Where it exists | May do | Must not do |
|---|---|---|---|
| Application Administrator | inside the web app | moderate content, manage work queues, view app health, acknowledge alarms, adjust application runtime settings exposed by the app | change AWS resources, rotate secrets in AWS, modify IAM, view CloudTrail, run Terraform |
| System Administrator | AWS + repository + CI/CD | provision and change infrastructure, deploy code, rotate secrets, manage IAM, manage CloudWatch, restore backups, respond to incidents | use AWS access as a substitute for ordinary app administration; make undocumented console changes |
| Host System Administrator shell account | Lightsail host | connect by SSH for deployment, restore, patching, and diagnostics using a named non-root account with `sudo` and an individually assigned key | act as a shared account, use a shared private key, or stand in for the application runtime principal |
| Application runtime assumed role | selected through AWS shared config/shared credentials and service-specific profile selection | access only the AWS APIs the running application needs | perform broad account administration or stand in for human operator access |
| Voting tally role | restricted privileged role | decrypt ballot envelope keys during controlled tally operations only | run normal web traffic; broad infrastructure management |
| CI/CD deploy role | GitHub Actions or equivalent deployment identity | build, publish, and deploy the approved release path | read unrelated secrets or perform manual troubleshooting tasks |

### 3.3 Human AWS access rules

#### Non-negotiable rules

- No shared AWS usernames or shared shell accounts.
- Production access requires MFA.
- Production access must be justified by an approved change, deployment, incident, drill, or access review.
- Use temporary credentials or role assumption whenever the chosen AWS account model allows it.
- Separate non-production access from production access.
- Access to Parameter Store, KMS, S3, SES, CloudWatch, and Terraform state must be granted separately by role and environment.
- A person who can administer the application in the browser is **not** automatically a System Administrator.
- Direct inspection of member data through shell or SQLite tools is exceptional and must be tied to a documented incident, migration, or recovery need.

#### Minimum access review cadence

| Review | Cadence | Owner |
|---|---|---|
| IAM user/role membership review | quarterly | System Administrator lead |
| production-access and host SSH access review | quarterly and after volunteer offboarding | System Administrator lead |
| Parameter Store access review | quarterly | System Administrator lead |
| KMS key policy review | annually and after major role changes | System Administrator lead |
| CloudTrail review for privileged activity | monthly | System Administrator lead |
| break-glass / emergency access review | after every use | incident lead |

#### Operator console sign-in

AWS Console sign-in for any IAM operator user requires three credential elements:

1. AWS account ID.
2. IAM user name.
3. Password and a time-based one-time-password (TOTP) MFA code.

The account ID, password, and TOTP seed for each operator's IAM user are held in the project's operator credential vault (see `docs/DEV_ONBOARDING.md` §4.5), managed in KeePassXC. The vault stores the TOTP seed alongside the password, so the same tool that autofills the password also generates each MFA code.

- Vault access is restricted to current project maintainers. Volunteer turnover requires explicit vault handoff through a private, unarchived channel. Never share the vault file or its master key over email, chat, any repository, or any archived medium.
- Root sign-in is reserved for account recovery and billing. Do not use root for routine operations. See `docs/DEV_ONBOARDING.md` §4.5 for root MFA setup.
- Operator IAM users are per-human. Do not share an operator user's credentials or MFA device across contributors.
- Revoke operator access per §13.6: remove the IAM user's MFA device, deactivate and delete its access keys, and remove the vault entry. Confirm no other shared resource grants retained access.

After sign-in, confirm the Console region selector (top-right) is `US East (N. Virginia) us-east-1` before making resource changes. Project resources live in `us-east-1`; wrong-region edits produce silent drift or `NotFoundException` at runtime.

### 3.4 Workload IAM model

The workload AWS principal must be a narrow and explicit runtime assumed role. Do not describe it as an EC2-style role attached to the Lightsail host. Operator SSH access to the host is a separate mechanism and must not be confused with the runtime principal.

Lightsail does not support EC2 instance profiles. The runtime AWS principal is a source-profile IAM user plus an AssumeRole chain to `app-runtime`: the source-profile access keys live at `/root/.aws/credentials` on the host (root-owned, 0600) and the app runs under `AWS_PROFILE=<env>-runtime` which resolves via `sts:AssumeRole`. Do not add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or any AWS credential to `/srv/footbag/env`. Do not mount the human operator CLI credentials into containers.

| AWS service | Runtime access | Notes |
|---|---|---|
| S3 media bucket | read/write only as required for media operations | no wildcard access to unrelated buckets |
| S3 primary backup bucket | write snapshots, read when validating readiness or restore support requires it | versioning is expected |
| S3 DR bucket | write only for the sync path or restore validation path if required | avoid broad delete rights |
| SES | send only from verified domain identities used by the app | no broad SES administration |
| Parameter Store | read-only under `/footbag/{env}/...` | runtime reads only |
| CloudWatch Logs / Metrics | write metrics and logs for the application | no broad CloudWatch account administration from runtime |
| KMS JWT key | `Sign` and `GetPublicKey` only as needed by auth runtime | private key remains non-exportable |
| KMS ballot key | runtime assumed role may request data keys for ballot encryption; decrypt is reserved to tally role | keep decrypt out of the normal runtime assumed role |

### 3.5 Operator shell access

Hardened per-operator SSH is the standard host shell-access path on Lightsail.

Host shell access is exceptional. It exists for deployment, restore, patching, diagnostic verification, and incident response. It is not the normal path for application administration or AWS control-plane work.

#### Required operating rules

- Use named non-root Linux operator accounts with `sudo`.
- Do not use shared shell accounts.
- Do not use shared private SSH keys.
- Use key-based authentication only; disable password authentication.
- Do not use direct root login as the normal operator path.
- Restrict inbound SSH ports 22 and 2222 to approved operator IPv4 and IPv6 source ranges (Terraform-managed via `operator_cidrs` in `lightsail.tf`); never leave SSH open to the world. Port 2222 is the reliable operator port; some ISPs block outbound port 22 to AWS EC2 IP ranges. Both ports are restricted to `operator_cidrs`; only port 80 (for CloudFront origin traffic) is open to the world.
- Keep a host-access inventory that records, at minimum, the operator name, host account, public-key fingerprint, environments allowed, approval date, and removal date when offboarded.
- Distribute only public keys for host access. Private keys remain under the custody of the individual operator and must not be stored in the repository, Parameter Store, application containers, or shared team storage.
- Onboard a System Administrator by creating or enabling the named host account, installing the approved public key, verifying SSH login, verifying `sudo`, and recording the inventory entry.
- Offboard a System Administrator by removing the public key or disabling the host account immediately, verifying loss of access, and reviewing `authorized_keys` / `sudoers` for stale access.
- Every shell session must have a clear reason: deployment, incident, restore, patching, diagnostic verification, or drill.
- Lightsail Console browser SSH is a permanent supplement to CLI SSH, declared in HCL via the `lightsail-connect` source-IP alias on port 22. It provides stable shell access when the operator workstation IP changes faster than `operator_cidrs` can be updated (mobile networks, VPN, transient ISP DHCP). The browser path requires AWS Console MFA on the operator identity plus the host's authorized public key; it does not bypass per-operator account isolation, key custody rules, or sudo discipline. Use the CLI path for routine administration; switch to the browser path when the CLI path is unavailable from the current network.
- Standard connection pattern: `ssh -i ~/.ssh/<keyfile> -p 2222 <operator-user>@<static-ip>`. Use port 22 only if your network does not block it.

#### Operator checklist

1. Confirm you are in the correct AWS account and environment.
2. Confirm MFA-backed AWS credentials are active if the task also requires AWS-side changes.
3. Confirm the change, deployment, incident, or drill reference.
4. Confirm your current source IP is still within the approved SSH allowlist.
5. Connect using your named operator account and your own private key.
6. Capture commands or notes in the incident/change log.
7. Exit the session and verify any required follow-up notes or access changes were recorded.

### Rationale
This makes the host-access protocol explicit enough to be usable and auditable.

### 3.6 S3 bucket policy rules

Bucket policies must explicitly deny access outside the approved principals.

Required policy stance:

- media buckets: runtime assumed role + explicitly approved System Administrator principals only
- primary backup bucket: runtime assumed role writes snapshots; System Administrators read for restore and validation
- DR bucket: tightly restricted write and restore access; Object Lock enabled according to retention policy
- maintenance-page bucket/prefix: public-read only for the specific maintenance asset path behind CloudFront, or origin-restricted according to the chosen CloudFront pattern
- no anonymous write access anywhere

### 3.7 CloudTrail and auditability

All privileged AWS activity must be traceable.

Required controls:

- CloudTrail enabled for the account and retained according to policy
- review privileged production actions monthly
- investigate unusual Parameter Store, KMS, IAM, and S3 access
- ensure Terraform changes and console changes can be correlated to named humans
- document why any emergency manual action occurred and how it was reconciled back into code

### 3.8 Break-glass access

Break-glass means a privileged action outside the normal deployment or change path, typically during an outage or security incident.

Break-glass rules:

- use only for live incidents, blocked restores, or security containment
- require MFA-backed access
- record the reason before or immediately after action
- prefer temporary changes
- reconcile infrastructure drift back into Terraform immediately after stabilization
- review the action in the incident retrospective

---

## 4. Runtime Topology and AWS Resource Layout

### 4.1 Edge and request flow

1. Viewer traffic terminates at CloudFront.
2. CloudFront serves cached static assets and forwards dynamic requests to the Lightsail origin.
3. If the origin returns configured 5xx responses or is unreachable, CloudFront serves the maintenance page.
4. The origin runs nginx, which proxies to the Node.js web application.
5. The worker container executes background jobs and operational tasks.
6. Media is served from S3/CloudFront according to the configured media path.

Important limitation: browsing traffic gets the maintenance page during origin failure, but state-changing requests may still fail as connection errors or timeouts rather than receiving the branded page.

### 4.2 Networking and TLS

- viewer TLS terminates at CloudFront
- Route 53 points public DNS at the CloudFront distribution when a real domain is attached
- custom domains and certificates must be managed as infrastructure
- origin exposure should be minimized; direct origin access is not the user-facing path
- standing edge protection is AWS Shield Standard, with Turnstile and in-process rate limiting at the application; a WAFv2 web ACL is a deferred lever, attached only if observed abuse warrants it

#### 4.2.1 ACM certificate for footbag.org runbook

CloudFront-attached certificates must live in the `us-east-1` region regardless of where the rest of the platform runs. The cert covers both the apex (`footbag.org`) and `www.footbag.org` so a single distribution handles both names. Retained `*.footbag.org` subdomains (for example `lists.` and the legacy `ifpa.` mail host) are not covered by this cert and keep their own DNS and TLS on the legacy host; do not add them to the SAN list. Issuance is operator-initiated; DNS validation takes 5-30 minutes on average and can take several hours, so request well ahead of any cutover.

Preconditions:

- Route 53 hosted zone for `footbag.org` is reachable from the operator's AWS profile, or the webmaster is on standby to publish the DNS validation records on the upstream zone.
- The production CloudFront distribution exists and its terraform state is in sync. (If not, run `terraform plan` first; a missing distribution is its own remediation track.)

Operator steps:

1. Request the certificate via Terraform in `terraform/production/`, not the console. The resource declares `provider = aws.us_east_1` and both `domain_name = "footbag.org"` + `subject_alternative_names = ["www.footbag.org"]`. `validation_method = "DNS"`.
2. `terraform apply`. ACM emits two `DomainValidationOption` records (apex + www); capture them from the plan output.
3. Publish the DNS validation records. If `footbag.org`'s Route 53 zone is owned by the same account, declare the `aws_route53_record` validation records alongside the cert in the same module and re-apply. If the zone is upstream-owned, hand the records to the webmaster (see §16.8, external DNS/mail upstream coordination) and wait for confirmation that they are live.
4. Poll cert status: `aws acm describe-certificate --region us-east-1 --certificate-arn <arn> --query 'Certificate.Status'`. Expected progression: `PENDING_VALIDATION` → `ISSUED`. If status sticks at `PENDING_VALIDATION` past one hour, re-verify the DNS validation records resolve (`dig _<token>.footbag.org CNAME`).
5. Attach to the production CloudFront distribution. Update the `viewer_certificate` block on the distribution resource to reference the issued cert arn and set `ssl_support_method = "sni-only"`, `minimum_protocol_version = "TLSv1.2_2021"`. `terraform apply`.
6. Post-attachment verification:
   - `curl -vIk https://footbag.org/health/live` returns HTTP 200 and the TLS handshake reports the new cert's subject + SAN.
   - `openssl s_client -connect www.footbag.org:443 -servername www.footbag.org </dev/null 2>/dev/null | openssl x509 -noout -subject -dates` shows both names and a `notAfter` consistent with ACM's 13-month validity.
   - CloudFront's `Status` reports `Deployed` (the in-flight `InProgress` state lasts 5-15 minutes after `terraform apply`).

Rollback: re-apply the prior `viewer_certificate` block (the default CloudFront cert, or the previous cert arn) and `terraform apply`. The cert resource itself can stay; an unattached cert is benign and saves the next-attempt issuance round-trip.

Dry-run note: ACM does not provide a sandbox. Dry-run testing is limited to applying the same Terraform module against the staging zone (`terraform/staging/`) and verifying issuance + DNS validation + a staging CloudFront distribution attachment before production.

### 4.3 S3 layout expectations

At minimum, the AWS layout needs the following logical storage surfaces:

| Storage surface | Purpose |
|---|---|
| media bucket | processed photo objects and related media assets (primary region) |
| media DR bucket | continuous cross-region replica of the media bucket (separate region) |
| primary snapshot bucket | 5-minute SQLite snapshots with version history |
| snapshot DR bucket | nightly replicated SQLite snapshots with Object Lock retention (separate region) |
| maintenance asset bucket or prefix | static maintenance page assets served by CloudFront |
| static asset storage | versioned application assets if separated from the instance |

### 4.4 Container sizing and restart behavior

Container memory limits are deployment settings, not app-admin runtime settings.

Operational rules:

- keep explicit memory limits in Compose or the chosen runtime config
- alert on sustained high memory before OOM
- automatic restart should recover transient failures
- repeated restarts indicate a real fault and require investigation
- any sizing change must be tested in staging and committed to version control

Minimum operator expectations:

- review per-container memory monthly
- investigate warning alarms before they become OOM restarts
- document before/after values and reason for any memory change
- keep enough host headroom for the OS and burst traffic

### 4.5 SES operations

System Administrators own SES account-level and DNS-level setup:

- verify sending domain
- publish SPF, DKIM, and DMARC records
- move SES out of sandbox before live production mail
- configure bounce and complaint notifications into the application webhook path
- monitor sender reputation and bounce/complaint rates
- coordinate DNS, SES, and app configuration changes together

Inbound `@footbag.org` mail is handled by Google Managed Services, not SES or any AWS resource; SES is outbound-only and the platform configures no SES receiving rules. The `footbag.org` SPF record must authorize both AWS SES (the outbound sender) and Google (the inbound provider), and the DMARC policy must align across both; the SES DKIM CNAMEs and Google's required records coexist in the zone. `@ifpa.footbag.org` is a separate mail domain on llic.net (MIGRATION_PLAN §29.12a) and is not touched by SES or by the `footbag.org` MX move.

#### SES sandbox behavior

New AWS accounts start in SES sandbox mode. In sandbox, **both the sender identity and every recipient address must be explicitly verified in SES before `SendEmail` will succeed.** An unverified recipient returns `MessageRejected: Email address is not verified` from SES; the outbox row transitions to `failed` with that message in `last_error` and retries up to `outbox_max_retry_attempts` before dead-lettering. Sandbox is per-region; check the SES console in the app's primary region. Request production access only once the sending domain is verified end-to-end and bounce/complaint handling is wired.

For staging-mode testing without enumerating every tester, AWS provides `success@simulator.amazonses.com` as an always-verified destination that accepts any send from any verified sender.

#### SES production-access ticket procedure

AWS support tickets to move SES out of sandbox have a typical 24-48h response window; file before the production sending need.

Operator steps:

1. Confirm preconditions: sending domain is verified end-to-end on the target account; SPF, DKIM, DMARC records published; bounce/complaint SNS topic created and subscribed; outbound notification batch volume estimated.
2. File via the AWS Support Center: open a "Service limit increase" ticket → service: SES → type: "Sending limits" → request "Move out of sandbox / production access." Include the estimated daily send volume, the use case (transactional notification batch for migration cutover + ongoing account-management mail), and a description of bounce/complaint handling.
3. AWS may request a sample of email content. Provide the verification, password-reset, and notification-batch templates.
4. Track the ticket; expect a response in 24-48h. Approval moves the account out of sandbox in the SES console (verify under "Account dashboard → Sending statistics → Sandbox: No").
5. After approval, confirm the production env file sets `SES_ADAPTER=live` and restart the app. Production is the only environment with live SES delivery; dev and staging run `SES_ADAPTER=stub` and surface captured mail via the in-page simulated-email card (DD §5.6).
6. Smoke-test end-to-end: trigger a verification email to an unverified address (one that would have been rejected in sandbox); confirm delivery.

Record the ticket ID and approval timestamp in the operations log.

#### Outbound email pipeline (stages, observable state)

Transactional mail flows through four stages. Each stage fails differently; diagnose by locating the stuck stage.

| Stage | Actor | Observable |
|---|---|---|
| 1. Enqueue | `web` container (`CommunicationService.enqueueEmail`) | new row in `outbox_emails` with `status='pending'` |
| 2. Poll | `worker` container (polls every `outbox_poll_interval_seconds`) | row flips to `status='sending'` with `claimed_at` timestamp |
| 3. Send | `worker` container (`LiveSesAdapter.sendEmail` → AWS SES) | on success: `status='sent'`; on failure: `status='failed'` or `dead_letter` with `last_error` populated |
| 4. Deliver | AWS SES → recipient mailbox | outside the app; observable in SES CloudWatch metrics and recipient inbox |

Diagnosis for "no email arrived":

- **No outbox row at all** → enqueue never ran. Either the triggering request (registration, password-reset, password-change) never reached the app, was rejected by validation, or hit an anti-enumeration silent branch (e.g., password-reset for an unknown email deliberately no-ops to prevent account enumeration).
- **Row stuck at `pending`** → worker not draining. Check the `worker` container is running (`docker ps`), check worker logs for startup errors, check the admin `email_outbox_paused` config flag, check the worker's AWS credential chain via `aws sts get-caller-identity` on the host.
- **Row at `failed` / `dead_letter`** → `last_error` column names the SES rejection (unverified recipient, IAM missing `ses:SendEmail`, suppression-list hit, rate limit). Read the column; do not guess.
- **Row at `sent`** → SES accepted the send. Check recipient spam folder and SES account suppression list (a prior hard bounce to that address silently suppresses future sends).

Do not mock the DB to reproduce these states locally; the outbox schema constraints are load-bearing and must be exercised against a real SQLite file.

---

## 5. Configuration, Secrets, and Key Management

### 5.1 Configuration boundary

There are three distinct configuration classes.

| Class | Canonical location | Changed by | Examples |
|---|---|---|---|
| infrastructure configuration | Terraform + deployment files | System Administrator | instance size, bucket names, firewall rules, CloudFront settings, job scheduler configuration |
| secrets and cryptographic material references | Parameter Store and KMS | System Administrator | Stripe keys, webhook secrets, bootstrap secrets, KMS key references |
| application runtime policy/config | `system_config_current` | Application Administrator through app workflows, with audit logging | reminder offsets, retention windows, pricing, pause flags, some job-related windows |

Never blur these boundaries.

- Do **not** place app-admin runtime policy in Terraform.
- Do **not** place deploy-time infrastructure settings in `system_config_current`.
- Do **not** put secrets in `system_config_current`.
- Do **not** query the raw `system_config` table for runtime use; jobs and services read `system_config_current`.

### 5.2 Parameter Store namespace

All Parameter Store paths must follow:

```text
/footbag/{env}/...
```

Examples:

```text
/footbag/production/secrets/stripe_secret_key
/footbag/production/app/bootstrap/admin_token
/footbag/staging/secrets/stripe_secret_key
/footbag/development/test/ses_sender
```

Rules:

- no `/fw/...` paths
- no cross-environment reads
- name paths by purpose, not by person
- use tags and descriptions
- never print parameter values to logs or terminal output

### 5.3 What goes in Parameter Store vs KMS

| Item | Store in | Reason |
|---|---|---|
| Stripe API keys | Parameter Store `SecureString` | secret value needed by app |
| Stripe webhook secrets | Parameter Store `SecureString` | secret value needed by app |
| administrative bootstrap secrets | Parameter Store `SecureString` | secret value needed by app/tooling |
| JWT signing key | KMS asymmetric key | non-exportable signing key material |
| ballot master key capability | KMS | envelope-encryption flow; keep decryption tightly scoped |
| ordinary runtime policy values | `system_config_current` | not secrets; admin-managed runtime config |

Use customer-managed KMS keys for sensitive `SecureString` parameters and for application cryptographic operations.

### 5.4 Secret-handling rules

- secrets are never committed to Git
- secrets are never baked into Docker images
- secrets are never stored in plaintext `.env` files outside explicitly local-only development stubs
- runtime loads secrets from Parameter Store or KMS-backed abstractions
- Terraform creates parameter structure, not secret values
- production secrets are rotated with a documented runbook and verification step
- after any secret rotation, restart or redeploy the containers that cache the value at startup
- the host stores the source AWS shared config/credential material for role assumption in a root-owned path
- only the containers that need AWS access receive the specific config/credential material they need, mounted read-only
- each AWS-enabled service must select its intended runtime assumed role explicitly, for example with `AWS_PROFILE`
- `SESSION_SECRET` is generated by the `random_id.session_secret` Terraform resource (`terraform/{env}/ssm.tf`), stored in SSM as a `SecureString` under `/footbag/{env}/secrets/session_secret`, and mirrored into the host's `/srv/footbag/env` (root:root 0600) by the deploy remote-half on every deploy. The application and the deploy script both reject any value containing the substring `changeme` or shorter than 32 characters. The staging and production resources are independent, so the value is never shared across environments. Rotation is Terraform-driven (§5.8).
- `X_ORIGIN_VERIFY_SECRET` is generated by the `random_id.origin_verify_secret` Terraform resource (`terraform/{env}/ssm.tf`), stored in SSM as a `SecureString` under `/footbag/{env}/secrets/origin_verify_secret`, and mirrored into the host's `/srv/footbag/env` by the deploy remote-half on every deploy. It is the shared secret CloudFront injects as `X-Origin-Verify` and nginx enforces (444 on mismatch). Rotation is Terraform-driven (§5.9), not via `aws ssm put-parameter --overwrite`.

### 5.5 Stripe key and webhook-secret rotation runbook

This is the direct operationalization of the older `SA_Rotate_Stripe_Keys` story.

#### First-time activation (turning live payments on)

The application-side switch is `PAYMENT_ADAPTER` in `/srv/footbag/env`; everything else is credential provisioning. Production refuses to boot with `PAYMENT_ADAPTER=stub`, so on the production host these steps are boot prerequisites, not optional hardening. Staging normally runs `PAYMENT_ADAPTER=stub` (the programmable in-memory Stripe mirror); staging may be pointed at real Stripe by running the same steps with test-mode credentials.

`scripts/activate-payments.sh --target <staging|production> --profile <profile>` walks this sequence end to end: the SSM key write (step 1), the host env rewrite with a masked confirmation diff (step 3), and the PAYMENTS-BOOT gate. Step 2 (the Stripe Dashboard webhook endpoint) is inherently manual; the script pauses for it and prompts for the resulting signing secret. The numbered steps below remain the canonical procedure the script implements.

1. **Secret API key (SSM).** `terraform apply` creates the SecureString shell `/footbag/{env}/secrets/stripe_secret_key` with a `TODO-` placeholder. Supply the real key (live-mode `sk_live_...` for production; test-mode `sk_test_...` for staging):

   ```
   aws ssm put-parameter \
     --name "/footbag/production/secrets/stripe_secret_key" \
     --value file:///tmp/stripe-key --type SecureString \
     --key-id alias/footbag-production --overwrite
   ```

   (`file://` hygiene keeps the key out of shell history; delete the temp file after.) The live adapter resolves the key lazily on the first payment operation and rejects the `TODO-` placeholder loudly, so a deploy that skips this step fails the first checkout, never silently.

2. **Webhook endpoint (Stripe Dashboard).** Create a webhook endpoint pointing at `https://footbag.org/payments/webhook` (the environment's `PUBLIC_BASE_URL` + `/payments/webhook`), subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `checkout.session.expired`. Other event types are acknowledged and ignored; the recurring-donation slice adds its subscription and invoice events when it ships. Copy the endpoint's signing secret (`whsec_...`).

3. **Host env (`/srv/footbag/env`).** Set `PAYMENT_ADAPTER=live` and `STRIPE_WEBHOOK_SECRET=whsec_...`. The boot guard rejects a `whsec_stub`-prefixed webhook secret in production, and live mode refuses to boot without a webhook secret at all. `SECRETS_ADAPTER=live` must already be set so the SSM key lookup works.

4. **Deploy / restart** via `./deploy_to_aws.sh`. Boot-time config validation enforces the env pair; the SSM key is validated on first checkout.

5. **Verify** per Required verification below: one real checkout (smallest tier), webhook signature validation observed in logs, payment row `succeeded` plus the tier grant present, then refund the test transaction from the Stripe Dashboard and confirm the refund webhook transitions the row to `refunded` while the tier grant is preserved.

#### When to run

- scheduled credential rotation
- suspected key exposure
- Stripe-side security requirement
- migration to a new Stripe configuration

#### Procedure

1. Generate the new key or webhook secret in Stripe.
2. Add the new value to the correct `/footbag/{env}/...` Parameter Store path according to the dual-key or staged-cutover design used by the application.
3. Validate in staging first.
4. Deploy the application change or restart path that picks up the new secret.
5. Run payment smoke tests and webhook verification.
6. Observe production for the grace period.
7. Remove the old secret only after successful verification.

#### Required verification

- successful API calls with the new key
- successful webhook signature validation
- no spike in payment or webhook failures
- incident/change record updated with actor and timestamp

### 5.6 JWT and ballot-key controls

- JWT signing uses KMS asymmetric signing; the application may call `Sign`, but the private key must remain non-exportable.
- Token verification should use cached public key material and must not call KMS on every request.
- Ballot encryption uses envelope encryption.
- The normal runtime role may request data keys for encryption but must not hold broad decrypt permission.
- Tally operations use a separate privileged role with tightly scoped decrypt permission.
- Key policy changes are infrastructure changes and require code review.

#### JWT signing-key rotation procedure

The 24h-overlap rotation pattern exercises both KMS signing keys simultaneously so no users are forced to re-authenticate.

1. Provision a new KMS asymmetric signing key in staging (Terraform `aws_kms_key.jwt_signing_v2` or equivalent). Wait for it to be `Enabled`.
2. Export the public key from the new KMS key via `kms:GetPublicKey`; verify the algorithm and modulus match the existing key's parameters.
3. Update the app config to add the new key's ARN and `kid` to the verification keyset (so JWTs signed by either key verify cleanly during the overlap window).
4. Deploy the app to staging; confirm via curl that login still issues a JWT signed by the original key and the app accepts it for an authenticated route.
5. Flip the active signer config to the new key. Restart the web container.
6. Confirm via curl that login issues a JWT with the new `kid` header, and that an existing session cookie (signed by the old key) still verifies for the duration of its TTL.
7. Wait 24h to let any in-flight tokens signed by the old key expire naturally.
8. Disable the old key in KMS (`kms:DisableKey`). Confirm that any synthetic JWT signed by the old key now fails verification.
9. After a stability window, schedule the old key for deletion via `kms:ScheduleKeyDeletion` (minimum 7-day window per AWS policy).
10. Record drill output (cutover audit log entry): start time, end time, observations, any deviations.

The procedure runs identically against any environment's KMS keys; production rotation reuses the same steps with production resource ARNs.

### 5.7 Source-profile access-key rotation

Access keys issued for the `footbag-staging-source-profile` IAM user (provisioned per DEV_ONBOARDING Path H, §8.7) are the long-lived AWS credentials on the staging host. The runtime role (`footbag-staging-app-runtime`) is assumed via `sts:AssumeRole` using these keys and is not itself rotated. CIS Benchmark calls for rotation at least every 90 days; AWS IAM guidance prefers short-lived credentials overall and flags unused keys via last-accessed information.

Procedure (modeled on §5.5):

**Never delete and recreate** the `footbag-staging-source-profile` IAM user to rotate credentials. AWS resolves the runtime role's trust policy to the source-profile user's internal unique ID at save time, not the ARN text; a recreated user with the same name produces a trust that looks correct in JSON but silently refuses `AssumeRole` until the trust policy is re-edited. Rotation is always "issue a second key under the existing user" (see DEV_ONBOARDING §8.9 step 4c for the principal-ARN pitfall).

1. Create a second access key for `footbag-staging-source-profile` while the first is still active.
2. Update the key values in `/root/.aws/credentials` on the staging host under the stanza `[footbag-staging-source-profile]` (no `profile ` prefix in the credentials file; the role profile in `/root/.aws/config` is the one that takes `[profile footbag-staging-runtime]`). Swapping either stanza-prefix silently returns the source-user identity from `get-caller-identity` instead of the assumed role; see DEV_ONBOARDING §8.10 step 5a "Stanza-prefix footgun" for the full rule. Root-owned, 0600. `/srv/footbag/env` is not touched; it holds only `AWS_PROFILE` and other non-secret runtime config.
3. Restart `footbag.service` on the host so the app re-runs the assumed-role chain with the new keys.
4. Validate `aws sts get-caller-identity --profile footbag-staging-runtime` still returns the assumed-role ARN, then validate the new keys exercise both KMS Sign (login → JWT issue) and SES Send (password-forgot → outbox row transitions to `sent`) paths.
5. Deactivate the old key; observe for a grace window; delete once stable.

Production rotation procedure parallels this; documented in Path I once production keys are provisioned.

### 5.8 SESSION_SECRET rotation runbook

`SESSION_SECRET` is generated by the `random_id.session_secret` Terraform resource and lives canonically in SSM (`terraform/{env}/ssm.tf`); the host's `/srv/footbag/env` (root:root 0600) is a deploy-time mirror written on every deploy. It is never committed to Git and never present in any Docker image. The application and the deploy script both reject any value containing the substring `changeme` or shorter than 32 characters (defense against accidental `.env.example` carry-over). Rotation is Terraform-driven; a manual host-side edit would be reverted on the next deploy.

#### When to run

- scheduled rotation (recommended at least annually for a per-host secret)
- suspected exposure (host snapshot leaked, credential file inadvertently shared, operator handover)
- after any security incident touching the host
- as part of staging-restore drills

#### Procedure

1. Regenerate the secret via Terraform (the SSM parameter updates in place):
   ```bash
   cd terraform/{env} && terraform apply -replace=random_id.session_secret
   ```
2. Confirm the new value satisfies the guards: contains no `#` (systemd EnvironmentFile parsing), no `changeme`, length ≥ 32. The deploy script enforces all three.
3. Redeploy so the deploy remote-half fetches the new value from SSM into `/srv/footbag/env` and restarts the service:
   ```bash
   ./deploy_to_aws.sh {env}
   ```
4. Expect: every active session is immediately invalidated. All currently-signed-in users will be redirected to login on their next request.
5. Smoke-test login with a known account and confirm a fresh `footbag_session` cookie issues.
6. Record the rotation timestamp in your operator notes.

#### Required verification

- service comes back cleanly (no startup error in `journalctl -u footbag`)
- login flow works end-to-end against a known account
- no new error spike in `/health/ready` or in the access log

### 5.9 Origin-verify shared-secret rotation runbook

`X_ORIGIN_VERIFY_SECRET` is the shared secret CloudFront injects on every origin request and nginx compares against to reject direct-to-origin probes (§5.2 Parameter Store namespace / `terraform/{env}/cloudfront.tf` / `docker/nginx/nginx.conf.template`). It is generated by the `random_id.origin_verify_secret` Terraform resource and lives canonically in SSM; the host's `/srv/footbag/env` is a deploy-time mirror. Rotation is Terraform-driven; manual `aws ssm put-parameter --overwrite` would be reverted on the next apply.

#### When to run

- scheduled rotation (annually is sufficient; per-environment, no third-party dependency)
- suspected exposure (workstation snapshot leaked, audit incident, SSM history review)
- after any change to the workstation-to-host transport posture

#### Procedure

1. From the workstation, regenerate the secret in Terraform:
   ```bash
   cd terraform/{env}      # staging or production
   terraform apply -replace=random_id.origin_verify_secret
   ```
   The CloudFront `data` source for the parameter re-reads on the same apply, so the origin `custom_header` value updates atomically.

2. Run a deploy. The remote-half fetches the new SSM value, validates the 64-hex shape, and atomically rewrites the `X_ORIGIN_VERIFY_SECRET=` line in `/srv/footbag/env`:
   ```bash
   bash deploy_to_aws.sh -k
   ```

3. There is a brief 30-to-90-second window between step 1 and step 2 where CloudFront sends the new secret and nginx still expects the old one (every CloudFront request returns 444). Run them adjacent to minimize.

#### Required verification

- `aws ssm get-parameter --with-decryption --name /footbag/{env}/secrets/origin_verify_secret --query Parameter.Value --output text` returns a 64-character lowercase hex string (not `TODO-...`).
- A request through CloudFront returns 200 (`/health/ready`).
- A request directly to the Lightsail static IP fails with TCP RST or `curl exit 52` (the Lightsail firewall blocks non-CloudFront source IPs at the network layer per `terraform/{env}/lightsail.tf`).

### 5.10 Safe Browsing API key rotation runbook

Bootstrap lives in DEV_ONBOARDING §4.10. This section covers recurring rotation.

#### When to run

- scheduled credential rotation
- suspected key exposure (key value appeared in logs, was committed by accident, or was shared with an off-platform party)
- migration to a new Google Cloud project
- quota tier change

#### Procedure

1. Sign in at `console.cloud.google.com`. Regenerate the API key (or revoke and create new).
2. Copy the new value to a temp file:
   ```
   printf %s '<paste-key>' > /tmp/sb-key && chmod 600 /tmp/sb-key
   ```
3. Overwrite the SSM SecureString:
   ```
   AWS_PROFILE=footbag-<env>-runtime aws ssm put-parameter \
     --name /footbag/<env>/secrets/safe_browsing_api_key \
     --value "file:///tmp/sb-key" \
     --type SecureString \
     --key-id alias/footbag-<env> \
     --overwrite
   ```
4. Remove the temp file:
   ```
   shred -u /tmp/sb-key
   ```
5. Restart the runtime to invalidate the in-process cache:
   ```
   sudo systemctl restart footbag.service
   ```

#### Required verification

- `npm run test:smoke` passes 3/3 from the operator workstation.
- Submit a known-malware URL through any external-link form on the target host; validation rejects with the user-facing "This URL is not allowed."
- Application logs show the matched threat category for one operator-review entry.

#### Failure modes and recovery

- `aws ssm put-parameter` returns `AccessDenied`: operator profile is not assuming `*-runtime` correctly, or the runtime role lacks `ssm:PutParameter`. Verify `/root/.aws/credentials` source profile + workstation `~/.aws/config` runtime profile per §3.4.
- Smoke reports `bootstrap placeholder ("TODO-...")`: step 3 was skipped or pointed at the wrong env. Rerun with the correct profile and parameter path.
- Validator returns "URL could not be reached" instead of Safe Browsing rejection: the reachability check (preceding gate) is failing first; not a Safe Browsing wiring issue.
- Quota errors (HTTP 429): rate limit exceeded. Check daily lookup volume in GCP Console; back off and retry. If sustained, application traffic exceeds the free tier; reduce or upgrade the GCP billing tier.

### 5.11 SES feedback loop activation

Bounce and complaint notifications flow SES → SNS → the app's public webhook, which marks the matching member's `email_status` so transactional sends skip dead or complaining addresses.

1. Run `scripts/activate-ses-feedback.sh --target <t>`. It generates the dedicated `SES_FEEDBACK_WEBHOOK_KEY`, installs it into `/srv/footbag/env` on the host (refusing to clobber a live key without `--rotate`), and prints the exact `ses_feedback_webhook_url` value once. The key is its own secret, never `INTERNAL_EVENT_SECRET`: the query string lands in access logs, and a leak there must not extend to the worker IPC endpoints. The runtime requires the key only when `SES_ADAPTER=live`, so this runs at live-email activation, not before. Set the printed value as the Terraform variable (it is `sensitive`; keep it out of committed tfvars files) and apply.
2. SNS posts a subscription-confirmation message. The app never auto-fetches the SubscribeURL (that would fetch an attacker-suppliable URL); it records it in an `email.sns_subscription_pending` audit row. Read the URL from that row and confirm it once:
   `sqlite3 database/footbag.db "SELECT metadata_json FROM audit_entries WHERE action_type = 'email.sns_subscription_pending' ORDER BY created_at DESC LIMIT 1;"`
   then open the `subscribe_url` value (curl or browser).
3. Validate end-to-end with a reputation-safe synthetic bounce: `scripts/verify-prod-email.sh --profile <prod-profile> --confirm-production --bounce-probe`, then check for the `email.bounce_recorded` audit row the probe's output describes.

### 5.12 Production first-admin bootstrap

The production platform launches with zero admins; the single-shot bootstrap token creates the first one.

1. Provision the token (a System Administrator action, never committed anywhere):
   `aws ssm put-parameter --name /footbag/production/app/bootstrap/admin_token --type SecureString --value "<operator-generated token>" --profile <prod-profile>`
2. Hand the token to the intended first admin out-of-band. They register a normal account, sign in, and submit the token at `/admin/bootstrap-claim`. On a match the platform writes `is_admin=1` plus the Tier 2 invariant grant plus the `grant_admin_bootstrap` audit row atomically, then deletes the parameter.
3. Verify closure: `aws ssm get-parameter --name /footbag/production/app/bootstrap/admin_token` must return ParameterNotFound. If the grant succeeded but deletion failed, an `admin.bootstrap_token_delete_failed` operational error is raised; delete the parameter by hand.

### 5.13 Host env verification

`/srv/footbag/env` on each Lightsail host is operator-managed plain text (root:root 0600) and is not reconciled by Terraform automatically. `scripts/verify-staging-env.sh` reads the host env file over ssh and compares it against the terraform-output contract (KMS JWT key ARN, SES sender identity, media bucket name) plus the production-hardening invariants enforced by `src/config/env.ts` (NODE_ENV cross-invariant, SESSION_SECRET length and non-placeholder shape, internal-event secret non-default, image worker URL non-localhost, dev-shortcut posture per target).

#### When to run

- before any deploy to staging or production
- after any change to `/srv/footbag/env` on a deployed host
- after `terraform apply` changes a value the host env references (KMS key rotation, SES identity change, media bucket rename)
- after the dev-only scaffolding (persona harness / dev-bootstrap) changes shape (a new `FOOTBAG_DEV_*` env var is added)

#### Procedure

1. From the operator workstation, run against the target host:
   ```
   ./scripts/verify-staging-env.sh --target staging
   ./scripts/verify-staging-env.sh --target production
   ```
   The ssh alias defaults to `footbag-<target>` (overridable with `--ssh-alias <name>`). The script uses `ssh -t` + interactive sudo to read `/srv/footbag/env` (which is root-owned 0600); you will be prompted for your sudo password on the local terminal once per invocation. The password is typed directly into sudo's noecho prompt; the script does not capture, echo, or log it.
2. Read the report. Each invariant is reported as `PASS`, `FAIL`, or `WARN`.
3. Fix any `FAIL` lines before deploying. `WARN` lines are advisory.
4. Re-run until the script exits 0 with the "All critical invariants passed" summary line.

#### Required verification

- The script exits 0 with the summary `All critical invariants passed`.
- Any `WARN` entries are reviewed and either intentional or remediated in the host env file. `TRUST_PROXY` warns unless it is the exact integer hop count (staging 2; production 3 while the legacy front door proxies the apex; drops by one at the DNS-handover milestone when that hop retires); a missing value degrades to coarse per-edge rate limiting rather than blocking boot.

#### Failure modes and recovery

- `failed to stage /srv/footbag/env on <alias>`: the ssh alias is missing from `~/.ssh/config`, the sudo password was entered incorrectly or canceled, `/srv/footbag/env` does not exist (host bootstrap incomplete), or the operator user lacks general sudo access on the host. See §3.5 for operator shell access.
- `required terraform outputs are empty`: `terraform apply` has not run for the target environment, or the operator is not in the project root. Run `terraform -chdir=terraform/<target> output` to confirm.
- `JWT KMS key ARN matches terraform: FAIL`: the host env file references a different KMS key than the latest terraform state. Either terraform has been re-applied with a new key (update `/srv/footbag/env` to match) or the env file was hand-edited (compare against §5.6).
- `SESSION_SECRET contains 'changeme'` or `is N chars (need >= 32)`: the host env file still carries the bootstrap placeholder. Generate with `openssl rand -hex 32` per §5.4 / §5.8 and overwrite the value on the host.
- `INTERNAL_EVENT_SECRET is the dev-default literal`: the operator copied a dev `.env` to the host. Generate a fresh value with `openssl rand -hex 32` and update `/srv/footbag/env`.
- `IMAGE_PROCESSOR_URL references localhost`: the host env still carries the dev fallback. Set to the docker-compose service name (e.g. `http://image-worker:4000`).
- `FOOTBAG_DEV_ADMIN_GRANT_TIER2`, `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`, or a similar dev-bootstrap var present on a production host env: remove the line. The env-config boot guard refuses to start the container with these set on production, so the deploy would also fail at container boot; the script catches the misconfiguration earlier.
- `BACKUP_S3_BUCKET unset` (WARN): the app boots without it, but `footbag-backup.timer` cannot upload snapshots. Set it to the environment's db-snapshots bucket name (terraform output) before installing the timer per §10.

#### Synthetic mode

`tests/integration/verify-staging-env.script.test.ts` exercises the script's check logic against synthetic env files via the `--env-file <path>` flag plus the `TF_JWT_KMS_KEY_ARN` / `TF_SES_SENDER` / `TF_MEDIA_BUCKET` env vars. Operators never set these flags directly; the synthetic mode exists so the script's invariant matrix is regression-tested in CI without a live staging host.

---

## 6. Terraform and Infrastructure Change Control

### 6.1 Terraform authority

Terraform is the source of truth for AWS infrastructure.

Infrastructure under Terraform control includes at minimum:

- Lightsail instance
- static IP and firewall rules
- S3 buckets and lifecycle/versioning/Object Lock settings
- CloudFront distributions and custom error responses
- IAM roles and policies
- Parameter Store structure
- KMS resources and aliases
- CloudWatch log groups, metrics, alarms, dashboards
- Route 53 records
- SNS topics and subscriptions
- budgets and budget alarms

### 6.1.1 Manual bootstrap boundary
A blank AWS account still requires one temporary manual bootstrap identity.

 That identity is allowed only to:
  1. harden the root account and establish billing alerts,
  2. create the remote Terraform state backend required by the current Terraform setup,
  3. apply the account-baseline Terraform root,
  4. create Terraform-managed IAM roles and policies,
  5. hand off routine administration to Terraform-managed roles.

Use clearly separated Terraform state backends for dev, staging, and production.

### 6.2 State management

- use remote state with locking
- keep environment state separated
- protect access to state because it is sensitive operational metadata
- never bypass locking for routine operations
- treat state changes as production-impacting changes
- Terraform >= 1.11 is required; `use_lockfile = true` (S3 native locking) requires this version floor; do not use DynamoDB locking
- AWS provider is pinned to `~> 5.0` in `providers.tf`; do not upgrade to v6 without reviewing the migration guide (v6 released June 2025, breaking changes)
- `terraform.tfvars` is excluded from git via `*.tfvars` in `.gitignore`; never commit it; it contains real IP addresses and account IDs; `*.tfvars.example` files are tracked and safe to commit
- `use_lockfile = true` requires `s3:PutObject` and `s3:DeleteObject` on `<bucket>/<key>*.tflock`; ensure the operator IAM policy includes these or `terraform apply` will fail with `AccessDenied` at lock acquisition

### 6.3 Standard workflow

Use this order for initial bootstrap and steady-state applies:

1. `terraform fmt -recursive`
2. `terraform validate`
3. `terraform plan -out=tfplan`
4. review the plan in PR
5. `terraform apply tfplan`
6. capture outputs required by deployment (static IP, bucket names, CloudFront domain, certificate ARN, and any documented firewall or allowlist inputs required for operator SSH access)
7. verify the applied AWS state and dashboards

For the initial blank-account bootstrap, apply in this sequence:
1. account baseline
2. Terraform-managed human/IAM access
3. Route 53 zone (if hosted in the same account)
4. ACM public certificate in `us-east-1`
5. S3 foundation buckets
6. Lightsail origin, Systems Manager hybrid-activation prerequisites/service role, and application runtime assumed role(s)
7. CloudWatch observability resources
8. CloudFront distribution
9. public DNS records

Steps 3, 4, and 9 apply only when a real domain is attached to the distribution; they are skipped when the CloudFront default `*.cloudfront.net` URL is in use. The `terraform/shared/` module must be applied first to create the state bucket before applying `terraform/staging/` or `terraform/production/`. See `DEV_ONBOARDING.md` §4.6 for the full bootstrap sequence.

### 6.4 Environment separation

Use clearly separated Terraform workspaces, stacks, or state backends for dev, staging, and production.

Rules:

- never apply a staging plan to production
- keep variable files or workspace variables explicit
- environment-specific names, tags, bucket paths, and alarms must be deterministic
- do not allow a single command to mutate multiple environments implicitly

Milestone-gated variables (default off; flip at the DNS-handover milestone, when the zone moves to Route 53 and the legacy front-door proxy retires):

- `enable_apex_alias_records`: creates the apex/www ALIAS records to CloudFront. Before handover the webmaster's proxy fronts the apex and these records would not resolve.
- `ses_enable_domain_auth`: provisions the SES domain identity, DKIM, and SPF/DMARC records in Route 53. Requires a zone Route 53 actually serves.
- The same milestone drops production `TRUST_PROXY` from 3 to 2 (the proxy hop retires).

### 6.5 Emergency console changes

Console changes are allowed only for emergency troubleshooting or containment.

If a console change happens:

1. stabilize the incident
2. record exactly what changed
3. update Terraform to match reality
4. run plan and confirm the drift is reconciled
5. close the incident only after parity is restored

### 6.6 What not to do

- do not treat the console as the primary config surface
- do not leave unexplained drift in place
- do not edit prod and promise to “clean it up later”
- do not store secret values in Terraform state intentionally

### 6.7 Pre-deploy drift check

Before a deploy that depends on infrastructure state, run `terraform -chdir=terraform/<env> plan -refresh-only` and inspect for "Objects have changed outside of Terraform". Reconcile any drift via `terraform import` before any apply that would otherwise recreate an existing resource. CI runs only `fmt -check` and `validate`, not `plan` against backend state, so drift detection is operator-side.

---

## 7. CI/CD, Release Promotion, and Deployment Workflow

### 7.0 Deployment model

Deployment is operator-driven: the maintainer builds locally and ships via the `./deploy_to_aws.sh` entry point, which orchestrates the build, the SSH image transfer (`docker save | ssh | docker load`), and the compose restart on the host. The standard runbook in §7.3 documents the operator path.

The platform's longer-term design intent is an automated CI/CD deploy pipeline that satisfies §7.1 CI responsibilities, publishes a versioned artifact, and promotes to staging and production through §7.2. The script-based path remains as the operator fallback for emergencies and isolated-environment deploys; the artifact format and validation gates are the same on both paths.

### 7.1 CI responsibilities

CI must at minimum:

- lint and type-check the codebase
- run the test suite
- run the convention gate (`scripts/ci/assert_conventions.sh`)
- build the deployable artifacts or container images
- publish versioned artifacts for approved branches/tags
- fail fast on migration or config-shape problems that can be detected automatically

#### Convention gate and pre-push verification

The convention gate `scripts/ci/assert_conventions.sh` (with its delegated `scripts/ci/check_*.sh` checkers) statically enforces the mechanically-checkable layer rules and data invariants catalogued in DD §1.15 at merge, and runs locally. A failure prints the offending `file:line` and the canonical site to fix.

Run the convention gate alone for fast local feedback; run the full suite before every push:

```bash
bash scripts/ci/assert_conventions.sh   # quick: convention gate only
./run_all_tests.sh                       # full pre-push suite (includes the gate)
```

`./run_all_tests.sh` is the authoritative pre-push suite: it runs the convention gate plus build, lint, dependency audit, secret scan, and the unit, integration, and e2e tests. Push only after it passes.

To add a rule: add the check to `scripts/ci/assert_conventions.sh`, or to a delegated `scripts/ci/check_*.sh` wired into it, paired with the layer rule or design decision it enforces. The check fails closed with an offending `file:line`, and scopes out false positives with explicit exclusions. Rules that need judgment, or that range over a growing set, are carried by the bug-hunt review, not the gate.

### 7.2 Promotion policy

| Target | Promotion rule |
|---|---|
| Development | fast iteration; developers may deploy frequently |
| Staging | only from reviewed branches; used for migration rehearsal, restore rehearsal, smoke tests, and secret-rotation rehearsal |
| Production | promote only a version already validated in staging unless incident response requires emergency hotfix flow |

### 7.3 Standard deployment runbook

The deploy is operator-driven from the maintainer workstation. CI lints, type-checks, and runs the test suite; the deploy itself is one local script invocation against the target origin. The deploy trigger remains a local manual step by design: GitHub-hosted runners use dynamic IPs, while the Lightsail firewall remains locked to explicit operator CIDRs.

#### Preconditions

- green CI
- reviewed code and infrastructure diffs
- if schema changed: migration plan reviewed and §9.3 followed for live data
- if secrets changed: rotation verification plan ready
- staging validation complete
- rollback path identified

#### Workflow

1. Make the change locally.
2. Run the local quality gate.
3. Push a branch and open a PR.
4. Let CI run.
5. Let branch protection block merge until checks pass.
6. Merge.
7. Run exactly one deploy command from your local machine against the target origin.
8. Verify the origin.
9. If CloudFront is enabled, verify CloudFront too.

#### Pre-deploy: check the env file

The host env file `/srv/footbag/env` is the runtime source of truth. The deploy remote-half reconciles the deploy-managed keys at every deploy: `FOOTBAG_ENV` (the deploy target), the SSM-sourced secrets (`X_ORIGIN_VERIFY_SECRET` and `SESSION_SECRET`), the adapter-mode defaults, and the container-sizing values from `docker/env/<env>.env`. Operator-managed secrets (such as the Stripe keys) are left untouched by the deploy. Review the operator-managed keys before any deploy that introduces a new required environment variable or changes runtime behavior.

At minimum, the host env file must define:

- `NODE_ENV`
- `LOG_LEVEL`
- `FOOTBAG_DB_PATH`
- `FOOTBAG_DB_DIR`
- `PUBLIC_BASE_URL`
- `SESSION_SECRET`

Container memory limits and encoder tuning are env-driven so the same `docker-compose.prod.yml` overlay sizes correctly for the host bundle. These values are version-controlled, not hand-set: the deploy seeds them into `/srv/footbag/env` from the committed `docker/env/<environment>.env` (the source of truth), keyed on `FOOTBAG_ENV`, validated against a sizing-key allowlist, and `verify-staging-env.sh` asserts the host matches the committed file. Per-environment values:

| Variable | Staging (`docker/env/staging.env`, nano_3_0 512M host) | Production (`docker/env/production.env`, medium_3_0 4GB host) |
|---|---|---|
| `NGINX_MEMORY_LIMIT` | `64M` | `128M` |
| `WEB_MEMORY_LIMIT` | `192M` | `512M` |
| `WORKER_MEMORY_LIMIT` | `96M` | `384M` |
| `IMAGE_MEMORY_LIMIT` | `256M` | `896M` |
| `IMAGE_MAX_CONCURRENT` | `1` | `2` |
| `VIDEO_X264_PRESET` | `veryfast` | unset (canonical medium) |
| `VIDEO_X264_THREADS` | `1` | unset (auto) |
| `VIDEO_X264_RC_LOOKAHEAD` | `10` | unset (canonical 40) |

The defaults in `docker-compose.prod.yml` are staging-sized; production hosts override via `/srv/footbag/env`. Leave the variables unset on staging unless the host bundle is upgraded.

`docker/docker-compose.prod.yml` bind-mounts `${FOOTBAG_DB_DIR}` into `/app/db`, and `footbag.service` starts Docker Compose with `--env-file /srv/footbag/env`. If the env file is wrong, the deploy can succeed mechanically but still fail at runtime.

Warning: do not use `#` in env-file values. systemd `EnvironmentFile` parsing treats `#` as an inline comment delimiter.

#### Pre-deploy: local quality gate

Always run:

```bash
npm test
```

Optionally run Docker parity when the change touches runtime shape, static assets, containerization, or environment handling.

#### Deploy options

**Option A; routine code-only deploy (the default)**

Use this when the host DB should remain untouched. A bare deploy (no flags) is code-only; `-k` is the explicit equivalent.

```bash
bash deploy_to_aws.sh
```

This path preserves `/srv/footbag/env` and the live DB. If `database/schema.sql` differs from the schema of the DB deployed on the host, the deploy detects the drift (read-only over SSH) and prompts to rebuild instead, since a code-only deploy does not reapply schema; on confirmation it re-runs as `--from-csv`.

**Option B; destructive schema/dev deploy**

Use this when the change requires rebuilding and replacing the host DB from scratch and the target's data is disposable (staging only).

```bash
bash deploy_to_aws.sh --from-csv
```

This path preserves `/srv/footbag/env` but intentionally destroys and replaces the live host DB. `--from-csv` rebuilds from the committed canonical CSVs (no mirror access). Pass `--soup-to-nuts` instead to rebuild from the legacy mirror and turn on the full seed set (curated media, personas, dev-admins; opt out per axis with `--no-media` / `--no-personas` / `--no-dev-admins`); that path regenerates committed canonical_input, name_variants, and seed files as a side effect, so the working tree may show diffs after the run.

For schema changes against a target with non-disposable data (production), follow the migration runbook in §9.3 instead of Option B.

Do not document manual `scp` + `ssh sudo cp` DB-replacement procedures. Those manual destructive flows are superseded by `scripts/deploy-rebuild.sh`.

#### Operational invariants enforced by the deploy

The script-based deploy path enforces these; manual deploys must check them.

- root-owned host AWS shared config/shared credentials source material is in place for runtime role assumption
- only the intended containers receive the required AWS config/credential mounts, read-only
- each AWS-enabled service selects the intended runtime profile explicitly
- effective caller identity for the AWS-enabled service path is verified before declaring deployment success
- `/srv/footbag/env` is owned `root:root` with mode 0600
- image-digest equality is verified after `docker load`; an ID mismatch aborts the deploy
- `X_ORIGIN_VERIFY_SECRET` is fetched from SSM and `FOOTBAG_ENV` is reconciled into `/srv/footbag/env` before the compose restart (§5.9)
- environment-conditional adapter selectors are reconciled before the compose restart: `SES_ADAPTER` is forced to `stub` on staging and development hosts so non-production never sends real mail (production is operator-set to `live` and validated, not overwritten), and `PAYMENT_ADAPTER` is seeded to `stub` where absent on non-production hosts
- the host SQLite file exists and its parent directory is mounted into the compose stack at `/app/db`, with the DB visible inside the container at `/app/db/footbag.db`

#### Post-deploy verification

Always verify the origin first.

```bash
BASE_URL=http://<origin> bash scripts/smoke-local.sh
```

Also verify manually in the browser when the change affects routing, rendering, or static assets.

If CloudFront is enabled, also verify CloudFront after the origin is confirmed healthy:

```bash
BASE_URL=https://<cloudfront-domain> bash scripts/smoke-local.sh
```

Why origin-first still matters: if the origin fails, CloudFront only obscures the root cause.

Confirm the worker container has logged its job/backup loop activity for the deploy window, then end the change window. End the change window only after post-deploy verification is clean.

### 7.4 Rollback runbook

Rollback is required when:

- readiness does not recover
- critical user flows fail
- alarms spike immediately after deploy
- secret rotation validation fails
- migration-related behavior is unsafe to continue

#### Procedure

1. Stop further rollout activity.
2. Check out the last known-good commit and re-run the code-only deploy:

```bash
git checkout <known-good-ref>
bash deploy_to_aws.sh -k
```

The database is not touched by `scripts/deploy-code.sh`.

3. Verify `/health/live` and `/health/ready` on the origin.
4. Re-run smoke tests against the origin and (if enabled) CloudFront via `scripts/smoke-local.sh`.
5. Document the rollback trigger and next action.

If the failure is schema-related, use the migration rollback rules in §9 before serving traffic again.

### 7.5 Restart runbook

Use targeted restarts for:

- stale cached secret/config values loaded at startup
- worker stuck state
- isolated image processor failure
- nginx reload after safe config change

Do **not** use restarts as a substitute for root-cause analysis when alarms or crash loops continue.

### 7.6 Cutover rollback

Cutover rollback decisions follow a hard time boundary.

**Within T+4 hours of the DNS swap:** rollback is the operator's call. Procedure:

1. Enable maintenance mode per §8.3 HTTP 503 layer.
2. Restore the pre-cutover snapshot per §10.5 Snapshot restore.
3. Disable maintenance mode.
4. Run smoke tests against the origin per §13.8.
5. Document the rollback trigger and the remediation plan.

The pre-cutover snapshot is taken as State 4 step 9 (after the batch auto-link and validation, before the DNS switch). The snapshot includes the auto-link results, so the restore does not need to re-run the batch.

**After T+4 hours:** rollback discards accumulated new user activity (registrations, claim confirmations, content edits). The decision requires governance sign-off. Procedure:

1. Convene the maintainer, the IFPA primary contact, and any active operators.
2. Quantify the in-window writes (count registrations, claim audit rows, content edits) before deciding.
3. If proceeding: run the within-T+4h procedure above. If not: document why fix-forward is preferred over rollback.

The T+4-hour boundary is a default; the maintainer may adjust the window based on observed traffic volume after cutover.

---

## 8. Health Endpoints, Maintenance Mode, and Readiness

### 8.1 `/health/live`

Purpose: cheap process liveness check.

Rules:

- return success only when the process is running
- do **not** call external dependencies
- do **not** call Stripe or SES
- keep the handler cheap and stable
- use this to distinguish dead process from dependency failure

### 8.2 `/health/ready`

Purpose: safe-to-serve-traffic readiness signal.

Readiness validates two serve-traffic gates:

- SQLite connectivity
- container memory pressure (returns 503 above the §9.5 threshold, which triggers the CloudFront maintenance page on subsequent organic traffic)

Readiness must **not**:

- call Stripe
- call SES
- call KMS
- call S3 or any other external dependency
- check backup freshness (alarm-surfaced per §10, not a readiness signal)
- perform expensive dependency fan-out
- hide partial failure by always returning success

Operational rule: if readiness fails persistently, treat the origin as not safe to receive traffic and recover or roll back.

### 8.3 Maintenance mode

Maintenance mode operates in two layers.

**HTTP 503 layer (planned maintenance and cutover):** an in-app maintenance mode that returns 503 with a small response body for user-facing routes while internal routes (`/health/live`, `/health/ready`, and internal-only batch endpoints) keep serving, so the cutover auto-link batch, schema migrations that touch live tables, and any task needing SQLite access continue while user traffic is paused.

**CloudFront fallback layer (unplanned origin loss):** CloudFront custom error responses for origin 500/502/503/504 or origin unreachability serve the maintenance page asset stored in S3. Short error cache TTL so recovery becomes visible quickly. This layer handles outages where the origin is unreachable or returning 5xx without an explicit maintenance-mode signal.

For planned maintenance the HTTP 503 layer returns a graceful response immediately and lets internal work continue; the CloudFront layer is the safety net for unplanned origin failure.

### 8.4 Planned maintenance

Use a maintenance window for:

- schema migrations with required downtime
- container/resource changes that require restart
- restore drills in staging
- security changes with expected brief service interruption

During planned maintenance:

1. ensure maintenance page path and CloudFront error behavior are correct
2. communicate maintenance window internally
3. stop or drain traffic as needed
4. run the change
5. verify origin health
6. confirm CloudFront returns to live content

### 8.5 Unplanned outage handling

If CloudFront is serving the maintenance page:

- verify whether the origin is actually down or merely not-ready
- check recent deploys, restarts, memory alarms, backup alarms, and database contention
- recover the origin first; CloudFront will return to live content automatically once healthy responses resume

---

## 9. SQLite, Schema Migration, and Data Operations

### 9.1 SQLite operating model

SQLite is the live primary database.

Operational implications:

- migrations require discipline and usually a short maintenance window
- WAL mode is part of the backup/recovery design
- the DB file on the instance is an intentional simplicity trade-off
- instance access and backup access must therefore be tightly controlled
- volunteers need basic SQL literacy for diagnostics and migrations

### 9.2 Migration rules

- use sequential, reviewed migration files
- prefer backward-compatible changes when feasible
- rehearse in staging using production-like anonymized data
- take or verify a current backup before migration
- run migrations during a maintenance window when required
- verify post-migration readiness before reopening traffic

### 9.3 Migration runbook

1. Confirm current snapshot is healthy and recent.
2. Put the site into the planned maintenance state.
3. Stop or drain write traffic.
4. Apply migrations in order.
5. Run integrity and smoke checks.
6. Restart services if required.
7. Verify `/health/live` and `/health/ready`.
8. Remove maintenance state.
9. Monitor logs and alarms for at least one stability window.

### 9.4 Data-access rules for operators

- use sqlite tools only when the app, runbook, or restore workflow requires it
- do not make ad hoc data edits in production unless a documented emergency fix is approved
- prefer audited application workflows for normal administrative changes
- if a direct DB fix is unavoidable, record the exact SQL and reconcile any permanent rule change into code or migration files

### 9.5 Contention and performance alarms

Investigate immediately when you see:

- backup age beyond threshold
- repeated `SQLITE_BUSY`
- slow query log growth
- WAL file growth beyond threshold
- long checkpoint latency
- disk usage approaching capacity

Common first checks:

- recent deploy or migration
- long-running write transaction
- worker backup failure
- abnormal import or cleanup workload
- host disk pressure

---

## 10. Backup, Restore, and Disaster Recovery

### 10.1 Recovery objectives by scenario

| Scenario | Target RPO | Target RTO | Notes |
|---|---|---|---|
| common database restore from recent snapshot | 5–10 minutes | ~5 minutes | primary operational recovery path |
| full service restore after application or host failure in-region | recent snapshot window | operator-paced; typically short if infra is intact | CloudFront serves maintenance page while recovering |
| cross-region regional disaster restore | up to last cross-region sync for DB; media replication target is tighter | 2–4 hours | requires manual rebuild and cutover |

### 10.2 Continuous database backup

Required behavior:

- run every `continuous_backup_interval_minutes` minutes (default 5)
- checkpoint WAL before snapshot
- use SQLite backup API for a consistent snapshot
- upload to the primary snapshot bucket
- retry on transient upload failure
- update backup success/failure metadata for logs and job history
- raise an alarm after repeated failure
- wait for in-flight backup completion on controlled shutdown when that shutdown hook exists

Operator wiring: the producer is `scripts/backup-db.sh`, scheduled by the systemd pair `ops/systemd/footbag-backup.service` + `footbag-backup.timer` (5-minute cadence). Install from the operator workstation with `scripts/install-backup-timer.sh --target <staging|production>`, which stages both units onto the host, installs them into `/etc/systemd/system/`, enables the timer, and runs the service once so a missing prerequisite fails loudly at install time. The script requires `BACKUP_S3_BUCKET` in `/srv/footbag/env` and emits the `BackupAgeMinutes` CloudWatch heartbeat; once the metric flows, flip the Terraform variable `enable_backup_alarm` to arm the staleness alarm (`treat_missing_data = breaching`, so arming it before the metric exists pages immediately).

### 10.3 Nightly cross-region DR sync

A separate nightly sync protects against regional failure.

Required behavior:

- copy relevant primary backup state to the DR bucket
- verify integrity of the copied content
- enforce DR retention through Object Lock in GOVERNANCE mode with a 30-day retention period, overridable only by a tightly scoped role holding `s3:BypassGovernanceRetention` so a lawful erasure request can be honored on backup objects that contain personal data
- log run metadata and failures
- raise alarms on failure

### 10.4 Media backup

Required stance:

- the media bucket has versioning enabled and a 30-day `NoncurrentVersionExpiration` lifecycle. Avatar keys are stable per member, so replacement uploads overwrite-in-place; the lifecycle rule prevents indefinite accumulation of noncurrent bytes. Cache invalidation is URL-versioned via the `?v={media_id}` query string.
- continuous S3 cross-region replication runs from the primary media bucket to a dedicated media DR bucket (ONEZONE_IA storage class). Delete markers replicate so account-erasure deletions propagate.
- Object Lock is intentionally not applied to the media DR bucket: photo deletion must propagate to the DR side to honor member-account-erasure. Operator-recovery headroom comes from versioning plus the 30-day noncurrent expiration on both buckets.
- verify replication health after any Terraform apply touching the photo path (use `aws s3api get-bucket-replication` and a marker round-trip into the DR bucket).
- treat media restore as a storage operation, not a SQLite restore operation.
- the recovery procedure: promote the DR bucket to primary by updating the CloudFront `/media/*` origin and the `MEDIA_STORAGE_S3_BUCKET` env var together in the same operator step (both must change atomically; if CloudFront points at the new bucket but the env var still names the old one, the app writes to a bucket CloudFront no longer serves; if the env var is updated first, the app writes to S3 keys that CloudFront does not yet serve). Alternatively, restore objects from the DR bucket to a new primary bucket. When updating the origin, confirm the `/media/*` cache behavior retains no origin request policy.
- when a photo key does not exist, S3 returns 403 AccessDenied (not 404) because the bucket policy grants only `s3:GetObject` to CloudFront, not `s3:ListBucket`. This is intentional: without ListBucket, S3 cannot confirm whether the key is absent or forbidden, so it returns 403 for both cases, preventing enumeration of bucket contents. A 403 on a `/media/*` URL is therefore not necessarily a permissions regression; first confirm the key exists in S3 before investigating IAM.

#### Photo storage pipeline operations

The avatar/photo pipeline runs on a four-container topology (nginx + web + worker + image), with photo bytes stored in S3 and served by CloudFront with OAC. Per-environment configuration lives in `/srv/footbag/env`, not Parameter Store (these are non-secret deploy-time values per §5.3). The `image` container runs Sharp (avatar/photo) and ffmpeg (curator video transcode) internally on the docker network and is reachable only from web.

##### Required `/srv/footbag/env` variables

- `MEDIA_STORAGE_ADAPTER=s3` (production/staging) or `local` (operator parity check only)
- `MEDIA_STORAGE_S3_BUCKET=<terraform output media_bucket_name>`
- `IMAGE_PROCESSOR_URL=http://image:4000`
- `IMAGE_MAX_CONCURRENT=2` (default; tune under observed load)
- `IMAGE_VIDEO_MAX_CONCURRENT=1` (default; raise only when host memory headroom permits a second concurrent ffmpeg)

##### Replication verification (after any TF apply touching s3.tf)

1. `aws s3api get-bucket-replication --bucket <media>` -- expect `Status: Enabled`, destination `<dr_bucket_arn>`.
2. Put a marker: `aws s3api put-object --bucket <media> --key replication-test/$(date +%s).txt --body /etc/hostname`.
3. Wait 5 minutes.
4. `aws s3api head-object --bucket <dr> --key <marker_key>` -- expect 200 with `ReplicationStatus: REPLICA`.
5. Delete the marker from both buckets.

##### OAC bucket-policy verification

`aws s3api get-bucket-policy --bucket <media>` -- the `Principal` should be `cloudfront.amazonaws.com` and the `Condition.StringEquals."aws:SourceArn"` should match the CloudFront distribution ARN. Any other principal is a misconfiguration.

Also confirm no origin request policy is attached to the `/media/*` cache behavior: `aws cloudfront get-distribution-config --id <dist-id>` and inspect the `/media/*` ordered cache behavior's `OriginRequestPolicyId` field, which must be empty or absent. A `Managed-AllViewer` policy (or any policy that forwards `Host`) re-introduces the virtual-host routing bug that causes S3 to return `<Code>NotFound</Code>` before evaluating the bucket policy.

##### Smoke trigger

After every `terraform apply` that touches `s3.tf`, `iam.tf`, or `cloudfront.tf` for the media path, run `npm run test:smoke` from a workstation. The `tests/smoke/media-storage.smoke.test.ts` cases must be green before declaring the change successful.

##### Cutover sequence (one-time, when transitioning a fresh environment from local-fs to S3)

1. Verify the photo-pipeline S3 infrastructure is in place: bucket versioning enabled, replication active, app_runtime has `app_s3_media` policy.
2. `terraform plan` for cloudfront.tf + s3.tf bucket policy. Review.
3. `terraform apply`. CloudFront propagation takes ~5-15 minutes; monitor via `aws cloudfront get-distribution --id <id>`.
4. SSH to host. Edit `/srv/footbag/env` (root-owned, 0600). Add the four lines listed above.
5. `systemctl restart footbag.service`. Wait for `docker compose ps` to show all four containers healthy.
6. `npm run test:smoke` from a workstation. Must be green.
7. Manual verification: log in as the preview-user; upload a JPEG avatar; refresh the profile-edit page; confirm display works and the URL has a `?v=` UUID; confirm `aws s3 ls s3://<media>/avatars/{member_id}/` shows two keys.

##### Rollback

If the cutover fails after step 4:

- Revert `/srv/footbag/env`: remove the four lines added in step 4.
- `systemctl restart footbag.service`.
- `terraform apply` a revert of `cloudfront.tf` to restore the prior `/media/*` cache behavior topology (whatever was in place before `/media/*` was migrated to S3 origin via OAC). Required because CloudFront still serves media from S3 until the TF revert lands; with the env reverted but CloudFront still on S3, displays will 404.

A clean rollback requires both an env revert AND a CloudFront TF revert.

#### Curator media seeding

System-account-owned content (FH avatar, landing-page demo loops, future illustrations and historical content) is seeded operationally rather than uploaded interactively. The seed script (`scripts/seed_fh_curator.py`) reads source assets from `curated/`, transcodes videos through ffmpeg with the canonical malware-stripping options (DD §6.8), processes photos through PIL, writes the processed outputs to a local filesystem directory, and INSERTs the corresponding `media_items` + `media_tags` rows owned by the system member. Auto-applies the `#curated` tag on every row.

The curator media cycle has two parts on `bash deploy_to_aws.sh`. The seed step (sidecars in `/curated/` -> `media_items` rows) runs unconditionally on every deploy that ships a DB to staging; the orchestrator invokes `scripts/seed_fh_curator.py` against the local DB before the rsync push. Set `CURATOR_SEED=no` to skip it (rare; used when sidecars are known broken). The S3 media cycle builds the curated media fresh from `curated/` into an ephemeral `.curated-build/` directory (the dev `s3-adapter-local/` store is never shipped) and `aws s3 sync`s it to the bucket. It is opt-in via `-m` / `--sync-media` (default off): curated `media_items` rows ship with `footbag.db` on every deploy regardless, and existing S3 bytes persist across deploys, so `-m` is only needed when the curated binaries in `curated/` actually changed. With `-m`, the sync uses `--delete` (a clean wipe of stale objects) by default when a DB rebuild is happening (avatar S3 keys remap on a fresh DB seed) and is additive (`--size-only`) with `-W` / `--no-s3-wipe`. URL-reference content (YouTube/Vimeo) needs no S3 bytes and is up to date after any DB-bearing deploy (the curator rows ship with footbag.db).

Run order in dev: included automatically in `bash scripts/reset-local-db.sh` (the seed step is gated on `CURATOR_SEED`, which defaults to yes when `reset-local-db.sh` is invoked outside the deploy orchestrator).

Run order in staging:

1. `bash deploy_to_aws.sh --from-csv` (rebuild + sidecar seed, no S3 media sync; prompts before each destructive step). A bare `bash deploy_to_aws.sh` is code-only and ships no DB, so it does not re-run the sidecar seed. `bash deploy_to_aws.sh --from-csv -y` accepts the default-yes answers without prompting (CI). Add `-m` / `--sync-media` to also build `.curated-build/` and push it to S3.
2. When `-m` is set, the remote-half `aws s3 sync`s `RELEASE_DIR/.curated-build/` to the bucket: with `--delete` (removing stale objects) when wipe=Y, or additively (`--size-only`) when `-W`/wipe=N.
3. CloudFront serves the seeded URLs at `/media-store/{key}` via OAC.

`media_id` is derived from a SHA of the id_seed plus source bytes, so updating a source asset (e.g., swapping the FH avatar) produces a new render URL on the next seed run; browser cache busts naturally without manual invalidation.

For ad-hoc lifecycle work that does not require a deploy (e.g., fixing a caption or tag on already-published content), use the admin UI at `/admin/curator/media` (see USER_STORIES `A_Upload_Curated_Media`, which covers the full curator lifecycle: upload, edit, delete, and category creation). Edit/delete via the admin UI mutate the live DB + S3 directly without a deploy cycle.

**After go-live**, the production DB is persistent and is the source of truth for curator media. The curator seeder (`scripts/seed_fh_curator.py`) is **not** run against the production DB: its reconcile and orphan-cleanup model deletes rows that have no `/curated/` sidecar, which post-go-live includes admin- and member-created content. Curator lifecycle (upload, edit, delete, gallery management) is admin-UI -> DB directly, per USER_STORIES `A_Upload_Curated_Media` and `A_Manage_Curated_Gallery`. Data-preserving deploys against the persistent DB use the migration deploy path (`scripts/deploy-migrate.sh`), not the destructive rebuild path; curator content is recovered through the standard DB backup and restore path (§10), the same as all other persistent data. `/curated/` remains the dev and pre-go-live authoring and seed source.

### 10.5 Snapshot restore runbook

Use this for corruption, bad deploy with data damage, or accidental destructive bug.

1. Put the site in maintenance mode.
2. Identify the restore point.
3. Download or mount the selected snapshot.
4. Run `PRAGMA integrity_check`.
5. Replace the live DB file with the validated snapshot.
6. Restart affected containers.
7. Verify `/health/live` and `/health/ready`.
8. Run targeted smoke checks.
9. Remove maintenance mode and monitor.

### 10.6 Cross-region disaster restore runbook

Use this only when the primary region or primary storage path is unavailable for extended recovery.

1. Provision replacement infrastructure in the recovery region or approved alternate target.
2. Restore application code and container configuration.
3. Restore the SQLite snapshot from the DR bucket.
4. Reconnect or re-point media storage according to the DR design.
5. Update Route 53 and CloudFront origin configuration.
6. Verify end-to-end application function.
7. Communicate status and monitor carefully.

### 10.7 Backup validation and restore drills

Backups do not count as working until restore is proven.

Minimum drill expectations:

| Drill | Cadence | Required output |
|---|---|---|
| recent snapshot restore in staging | quarterly | restore time, issues found, verification checklist |
| cross-region DR rehearsal | at least annually or after major infra change | cutover notes, missing dependencies, revised timing estimate |
| backup-content validation | weekly automated check plus human review of failures | evidence that expected files and object paths exist |

### 10.8 What to verify after any restore

- application starts cleanly
- health endpoints pass
- critical read paths work
- admin dashboard shows expected backup/job state
- logs and alarms are normalizing
- no environment-crossing secrets or endpoints were introduced accidentally

---

## 11. Background Jobs and Scheduler Operations

### 11.1 Ownership model

`OperationsPlatformService` owns job orchestration, job-run logging, cleanup jobs, readiness composition, and alarm raise/ack integration for the in-app periodic jobs. Job logic belongs in application code; schedule ownership belongs to the infrastructure/operator layer. Database backup is the deliberate exception: it runs as a host-side systemd one-shot (`scripts/backup-db.sh`) so it keeps producing snapshots independent of application health, and therefore is not an `OperationsPlatformService` job and does not write a `system_job_runs` row.

### 11.2 Job catalog

| Job | Cadence | Purpose | Operator concern |
|---|---|---|---|
| `SYS_Send_Email` | every `outbox_poll_interval_seconds` | send queued mail from `outbox_emails` via `LiveSesAdapter` | dead-letter growth, bounce/complaint alarms, worker container crash-loop on missing shared-config env vars (see §15.4) |
| `SYS_Check_Active_Player_Expiry` | daily | expire or remind Active Player status (Tier 0 only) | missed runs or unusual reminder spikes |
| `SYS_Open_Vote` | at least hourly | open scheduled votes | failed openings, admin-alerts flow |
| `SYS_Close_Vote` | at least hourly | close scheduled votes | failed closures, tally readiness |
| `SYS_Reconcile_Payments_Nightly` | nightly | reconciliation and digest generation | payment mismatches, digest failures |
| `SYS_Cleanup_Soft_Deleted_Records` | daily | PII purge and retention cleanup | retention correctness and audit trail |
| `SYS_Cleanup_Expired_Tokens` | daily | remove expired tokens | table growth, auth cleanup health |
| `SYS_Rebuild_Hashtag_Stats` | daily | rebuild tag stats | stale discovery stats |
| `SYS_Continuous_Database_Backup` | every 5 minutes by default | create SQLite snapshots | backup age and failure alarms |
| `SYS_Nightly_Backup_Sync` | nightly | sync to cross-region DR bucket | DR freshness and validation |
| `SYS_Cleanup_Static_Asset_Versions` | daily off-peak | remove obsolete versioned assets | rollback window preservation vs storage growth |
| webhook processors | event-driven | Stripe / SES durable inbound processing | idempotency failures, signature failures |

### 11.3 Scheduler rules

- schedules are infrastructure-managed, not app-admin managed
- schedule changes must be code-reviewed
- schedule definitions live with infrastructure configuration
- in-app job execution status is visible in the app health view, but schedule changes are not exposed in the app; the host-side database backup surfaces instead via its `BackupAgeMinutes` CloudWatch metric and `db-backup-stale` alarm
- missed job executions must alert before user-visible damage accumulates

### 11.4 Job failure response

For any failed job:

1. confirm whether it is a one-off or repeated failure
2. inspect CloudWatch logs and recent deploys
3. confirm required secrets/config are present
4. confirm dependent AWS services are reachable and authorized
5. rerun safely only if the job is idempotent or the runbook explicitly permits rerun
6. document operator action and outcome

### 11.5 Job-run logging

Every in-app job run records, in `system_job_runs`:

- job name
- start and end time
- success/failure state
- error summary if failed
- operator correlation where manually rerun
- key metrics such as processed counts when relevant

The host-side database backup is the exception: it surfaces via the `BackupAgeMinutes` CloudWatch metric and the `db-backup-stale` alarm (a dead timer, a failing upload, and a wedged host all breach it) rather than a `system_job_runs` row.

### 11.6 Curator video transcode job inspection

The asynchronous interactive admin video upload (DD §6.8 "Asynchronous orchestration") records each upload in the `media_jobs` table with a state machine: `pending_upload` → `pending_transcode` → `processing` → `succeeded` | `failed` | `abandoned`. The dispatch handler runs in the worker container's HTTP server alongside the email-outbox loop; ffmpeg runs in the existing image container.

Inspection queries:

```sql
-- Recent jobs across all admins
SELECT id, state, retry_count, last_error, created_at, updated_at
FROM media_jobs
ORDER BY created_at DESC
LIMIT 20;

-- Stuck-looking jobs (processing past their dispatch lease, or terminal failures)
SELECT id, state, admin_member_id, last_error, last_attempted_at, lease_expires_at
FROM media_jobs
WHERE state IN ('processing','failed')
ORDER BY updated_at DESC;
```

Failure response:

- A `processing` row whose `lease_expires_at` is in the past indicates the worker crashed mid-transcode. The worker's one-shot boot-time recovery sweep resets such rows to `pending_transcode` for re-dispatch; restart the worker container to trigger the sweep.
- A `failed` row is terminal. The admin re-uploads to retry; there is no in-place retry from the operator side.
- Pending S3 source bytes live under `pending/<jobId>/`. The worker deletes them on success; an S3 lifecycle rule on the `pending/` prefix expires anything left after 24 hours, so orphaned uploads do not require manual cleanup.

---

## 12. Monitoring, Logging, Alerting, and Cost Control

### 12.1 CloudWatch-first model

CloudWatch is the default monitoring substrate.

Use CloudWatch for:

- structured application logs
- infrastructure metrics
- custom application metrics
- job success/failure and duration metrics
- dashboards
- alarms
- host and platform logs that the runbooks explicitly choose to forward for operational visibility
- notification fan-out via SNS where configured

Optional external tools may be added only when they solve a concrete problem that CloudWatch does not solve well enough, and only if they do not materially increase volunteer burden, privacy risk, or cost.

### 12.2 Logging rules

Application logs must be structured and safe.

Required rules:

- structured JSON logs
- correlation IDs
- actor context where appropriate
- never log raw secrets, JWTs, reset tokens, webhook secrets, cookies, or full sensitive payloads
- log enough metadata to diagnose without exposing unnecessary personal data
- use CloudWatch Insights as the default search/query surface
- every log surface has bounded growth via rotation, age cap, or external retention; unbounded local logs are not allowed
- new on-host log producers ship a `/etc/logrotate.d/<name>` config (installed by the producer's bootstrap script in `scripts/`); new CloudWatch log groups set `retention_in_days` in Terraform; container logs use Docker's `json-file` driver size/file caps in `docker/docker-compose.prod.yml`

### 12.3 Alarm model

#### Core infrastructure alarms

- origin 5xx / origin availability problems
- instance CPU and memory pressure
- container restart loops
- disk pressure
- S3 operation failures
- unusual Parameter Store access patterns
- KMS error rate or latency for auth/voting paths

#### Core application alarms

- application 5xx rate
- readiness failures
- backup age and backup failure
- job missed-run counts
- Stripe webhook failures
- SES bounce/complaint thresholds (account `Reputation.BounceRate` > 5% and `Reputation.ComplaintRate` > 0.25%; SES pauses sending near double those levels)
- dead-letter / outbox failure growth (`OutboxDepth` metric from the worker's per-cycle `outbox.depth` log line; backlog alarm at > 50 sustained 15 minutes)
- CloudFront p90 `OriginLatency` (> 3s sustained; requires the per-distribution additional-metrics subscription)
- ACM `DaysToExpiry` for the CloudFront certificate (< 30 days; lives in us-east-1 with a sibling SNS topic, since alarm actions must target a same-region topic)
- cutover zero-logins watch (`LoginSuccessCount` from the `auth.login_success` log line; gated by Terraform `enable_cutover_login_alarm`, enabled for the cutover monitoring window only and disabled in steady state, where quiet overnight hours would false-positive)
- any `logger.error()` line in the app log group — a CloudWatch log metric filter on `{ $.level = "error" }` increments a count routed through SNS to the admin email. Every error worth logging surfaces to an operator automatically.

#### Administrator-visible summaries

The Application Administrator dashboard may show summarized health and alarm state, but it must not become an AWS operations console.

### 12.4 Suggested operational thresholds

These values should be implemented and tuned conservatively, then reviewed based on real data.

| Signal | Warning | Critical |
|---|---|---|
| CPU | >80% for 10 minutes | >90% for 5 minutes |
| per-container memory | >80% sustained | >90% sustained or restart risk |
| application 5xx rate | investigate sustained increase | >5% for 1–2 minutes |
| backup age | investigate if trend is rising | >15 minutes |
| missed scheduled job | 1 missed execution | 3 consecutive misses or restart loop |
| WAL size | investigate growth trend | >1 GB |
| checkpoint latency | investigate trend | >5 seconds |
| `SQLITE_BUSY` frequency | investigate | >5% of operations |
| DB file / disk use | >80% | >90% |

### 12.5 Dashboards and notifications

Maintain at least:

- an operations dashboard for System Administrators
- an application health summary for Application Administrators
- a cost dashboard or budget view

Notifications should be sent to the appropriate audience:

- infrastructure/incident alarms to System Administrators
- app-visible alarms and work queue notifications to the `admin-alerts` path where appropriate
- cost alarms to the designated budget owners

### 12.6 Cost control

Target operational cost remains modest. Operators must:

- track monthly spend against budget
- alarm on meaningful overrun or projection
- review unexplained spend spikes promptly
- evaluate any new AWS service against both dollar cost and volunteer support cost

### 12.7 Cost-alarm threshold tuning runbook

When to run:

- alarm fatigue: cost alarms fire frequently on normal usage and the operator has started ignoring them
- alarm silence: no cost alarm has fired over a full quarter despite known spend variance
- a new AWS service is added (the threshold model needs a new baseline)
- a budget change from IFPA shifts the absolute spend envelope

Procedure:

1. In AWS Cost Explorer, pull daily cost for the last 90 days, grouped by service. Export to CSV if needed for offline analysis.
2. For each service the alarm watches, compute the baseline mean and standard deviation over the 90-day window. Discount any known spike days (e.g. one-time data transfer for a restore drill) before computing.
3. Set thresholds:

   - warning: `baseline_mean + 1.5 * baseline_stddev`, or `1.5 * baseline_mean` if stddev is small
   - critical: `baseline_mean + 3 * baseline_stddev`, or `2 * baseline_mean` if stddev is small

4. Update the Terraform variable for the alarm threshold (e.g. `var.cost_alarm_threshold_usd` in `terraform/{env}/cloudwatch.tf`).
5. `terraform plan` and review the diff; confirm no other alarms move unexpectedly.
6. `terraform apply` to push the new threshold.
7. Verify with a synthetic test: temporarily set the threshold to a value below current spend; confirm the alarm fires within the alarm period; restore the real threshold; confirm the alarm clears.

Required verification: the alarm test fires on a known-bad value and clears on restore. Document the new threshold and the rationale (baseline window, computed mean / stddev, any spikes excluded) in the access-review notes for the next §13.6 cycle.

---

## 13. Routine Security and Platform Operations

### 13.1 Monthly routine tasks

- review CloudWatch alarm history
- review CloudTrail for privileged production activity
- verify backup success and drill recency
- review SES reputation and bounce/complaint rates
- review container memory and restart trends
- review budget status and forecast
- run `npx audit-ci --moderate` from a clean checkout; triage any moderate-or-higher dependency advisories (per `docs/TESTING.md` §9)

### 13.2 Quarterly routine tasks

- IAM and access review
- Parameter Store namespace cleanup
- backup restore rehearsal
- secret and key rotation review
- alert-threshold tuning review
- production access, SSH authorized-key inventory, and offboarding review
- GitHub repository security posture: branch protection rules, required-checks list, open code-scanning alerts, and Dependabot alerts (via `gh api repos/<owner>/footbag-platform/...`)

### 13.3 Patch management

- apply OS security updates on a documented cadence
- patch outside peak traffic when restart is required
- verify health endpoints and logs after patching
- record the patch date and any notable changes

### 13.4 Parameter Store hygiene

- remove unused parameters only after verifying no code path depends on them
- keep descriptions and tags current
- review prod write permissions carefully
- never leave obsolete secrets accessible longer than necessary

### 13.5 SES and deliverability maintenance

- verify DNS authentication records remain intact
- monitor reputation and quota
- investigate bounce/complaint spikes
- keep webhook processing healthy and idempotent
- test email paths after any sender-domain or secret change

### 13.6 Access reviews and volunteer turnover

When a volunteer leaves or no longer needs access:

1. remove AWS access promptly
2. remove repository and CI/CD access
3. rotate any credentials that were directly known to that person if required
4. verify there are no forgotten personal email subscriptions on alerting paths
5. document completion

### 13.7 Resource tuning

This guide treats resource tuning as a runbook, not guesswork.

When tuning memory or instance size:

- use observed CloudWatch data
- change one variable at a time where possible
- rehearse in staging first
- document the reason and expected effect
- verify after deployment

### 13.8 Operator-workstation staging readiness smoke test

`tests/smoke/staging-readiness.test.ts` is the canonical end-to-end probe of the staging AWS runtime identity wiring. Four assertions, all against real AWS:

1. `sts:GetCallerIdentity` resolves to an `assumed-role` ARN under the staging app-runtime role.
2. `kms:GetPublicKey` on the JWT signing key returns RSA-2048 SIGN_VERIFY with RSASSA_PKCS1_V1_5_SHA_256 support.
3. KmsJwtAdapter signs and verifies a short-lived JWT round-trip against real KMS.
4. `ses:SendEmail` to `success@simulator.amazonses.com` succeeds end-to-end.

Run after any change that could affect the runtime identity chain: IAM policy edits on the source-profile user or the runtime role, KMS key policy edits, SES identity changes, runtime trust-policy changes, source-profile access-key rotation, or a host rebuild that touches `/root/.aws/`.

#### Workstation profile (one-time setup)

Append to the operator's `~/.aws/config`:

```ini
[profile <env>-runtime]
role_arn       = arn:aws:iam::<account-id>:role/footbag-<env>-app-runtime
source_profile = footbag-operator
region         = us-east-1
```

The operator-IAM-user keys are already in `~/.aws/credentials` for the operator profile; no new long-lived key material on the workstation. The chained AssumeRole into the staging runtime role inherits operator credentials at AWS-API call time. `mfa_serial` is intentionally omitted: the runtime role's permissions are a strict subset of the operator's `AdministratorAccess`, so MFA on this chained AssumeRole adds no defense beyond what the operator already carries. To require MFA prompts on this profile, add `mfa_serial = arn:aws:iam::<account-id>:mfa/<operator-mfa-device>`.

#### Invocation

```bash
npm run test:smoke
```

The runner script reads the KMS signing-key ARN and SES sender identity from `terraform -chdir=terraform/staging output -raw` and hardcodes `AWS_PROFILE`, `AWS_REGION`, and the smoke gate. The operator's workstation must already have `terraform init` run in `terraform/staging/`.

Expected: 4 passes, runtime under 15 seconds. The suite is excluded from the default `npm test` run via the `test:smoke` script's `tests/smoke/` glob, so dev and CI never accidentally reach AWS.

#### Failure modes

Each assertion has a distinct failure cause. The test file's header comment block (`tests/smoke/staging-readiness.test.ts`) carries the per-error mapping (e.g. `sts:GetCallerIdentity` returning the IAM user instead of an assumed-role ARN means the runtime role's trust principal does not include the workstation source). When a smoke run fails, read that legend before changing IAM, KMS, or SES.

#### On-host alternative

The same suite can run from the staging host using the host's existing `[profile footbag-staging-runtime]` chain configured at `/root/.aws/config`. The host path is operationally heavier (requires SSH plus a Node 22 runtime on the host, which this project does not install by default) and is rarely needed: the workstation path exercises the identical AWS API call paths.

### 13.9 On-call rotation and escalation policy

Current state: single maintainer, implicit on-call. The maintainer subscribes to the operator SNS topic for SEV-1 alarms and reviews SEV-2 / SEV-3 alarms during routine maintenance windows.

Severity definitions:

- **SEV-1**: service is unreachable or actively returning errors to users. Examples: origin returning 5xx for sustained periods, CloudFront serving the maintenance page from origin failure, backup gap exceeds RTO, KMS access lost so login or ballot operations fail.
- **SEV-2**: service is degraded but reachable. Examples: elevated 5xx rate, slow response times, partial feature failure (Stripe webhook backlog, SES bounce spike), resource pressure approaching alarm threshold.
- **SEV-3**: warning. Examples: single failed alarm not yet recurring, unexpected cost spike, SES sandbox warning, certificate expiry approaching.

Acknowledgment targets:

- SEV-1: 15 minutes during waking hours; next morning if outside waking hours unless the maintainer is available. Mitigation begins immediately on acknowledgment.
- SEV-2: 1 hour during waking hours; next business day otherwise.
- SEV-3: reviewed during the next monthly routine task per §13.1.

Notification routing:

- SEV-1: SMS via the operator SNS topic (subscribed for SEV-1 only) plus email.
- SEV-2 and SEV-3: email via the operator SNS topic.

Future state when the team grows beyond one maintainer:

- weekly primary plus backup rotation, calendar-tracked
- both primary and backup subscribed to the SEV-1 SNS topic
- escalation: backup paged if primary does not acknowledge within the SEV-1 acknowledgment target
- §13.6 access reviews include a check that the rotation calendar is current and SNS subscriptions match

The severity definitions and acknowledgment targets above are operational policy; the maintainer ratifies them before treating as binding and updates them in this section if the project's reality shifts.

### 13.10 Hall of Fame and Big Add Posse honors oversight

Honors-bearing claims (a claim landing on a member who carries a Hall of Fame or Big Add Posse flag) apply on the member's own wizard confirmation, the same as any other claim. Trustworthiness is established a priori: the imported `is_hof` / `is_bap` flags are cross-checked before go-live against the authoritative public rosters (footbaghalloffame.net for Hall of Fame, bigaddposse.com for Big Add Posse), and mismatches are curated out, so an honor-driven tier grant rests only on a validated flag.

After go-live, ongoing oversight is community self-policing plus the admin dispute-revert path: if a wrong honors-bearing link surfaces, route it through the dispute-revert procedure per §13.11.

### 13.11 Claim dispute and revert handling

When a confirmed claim is disputed (a member believes their own confirmation was wrong, or a real person arrives after someone else confirmed a claim under their identity), the dispute routes through the member-initiated help request reviewed under `A_Review_Member_Link_Help_Requests` (MIGRATION_PLAN §13 carries the system-side contract).

Operator workflow:

1. Open the admin work queue and review the dispute item alongside the original claim audit row to understand the chronology and the evidence-strength tag the claim carried.
2. Decide: revert (clear the back-link columns and revoke the claim tier grant; the legacy account or historical person becomes claimable by the correct person), decline (the original claim stands; reason required), or defer.
3. Record the decision per the audit rules in `A_Review_Member_Link_Help_Requests`: audit-logged with actor, original claim audit id, decision, optional reason, timestamp.
4. Notify the disputing member of the outcome by email, with a contact path for follow-up.

### 13.12 Heavyweight pentest harness

The operator-invoked pentest harness runs black-box probes against a throwaway local stack. It boots its own ephemeral database and server, seeds the canonical personas, and writes all reports to a temp directory outside the working tree, so it is safe to run on a workstation.

- Default run: `npm run test:pentest:heavy`. Runs the scriptable probes (security headers, internal-surface gating, upload abuse, origin-pin CSRF, open redirect, login rate-limit, SSRF input, session-cookie attributes) plus a report-only OWASP ZAP passive baseline, then prints a per-probe summary. A non-zero exit means a probe found a regression; triage it into a fix plus a regression test per `docs/TESTING.md` §9.6.
- Opt-in heavy legs pass through npm with `--`: `-- --zap-active` runs the ZAP full active scan (attacks the target, minutes-long), `-- --deps` runs the dependency / supply-chain scan (`npm audit`, plus Snyk when `SNYK_TOKEN` is set), and `-- --all` runs both. These legs are report-only.
- The ZAP legs require Docker; without it they skip with a message and the scriptable probes still run. Point the active scan only at the local stack or an environment explicitly authorized for active scanning, never at production.

---

## 14. Staging Refresh and Anonymization

### 14.1 Goal

Staging should be realistic enough for deployment rehearsal and debugging, but it must not become a raw production clone.

### 14.2 Required workflow

1. Export a production-derived snapshot using the approved operator path.
2. Restore into an isolated staging workspace or temporary copy.
3. Run the anonymization/purge transformation.
4. remove or replace production-only secrets and external integration endpoints
5. import the sanitized dataset into staging
6. verify the anonymization result
7. run smoke tests

### 14.3 Required anonymization checks

Before staging is declared ready, verify:

- no raw production login emails remain where policy requires anonymization
- no production Stripe secrets or webhook secrets remain
- no production SES sending configuration is active in staging
- no production-only admin bootstrap values remain
- no raw sensitive contact fields remain when they should be anonymized
- any test mail or payments route to test systems only

### 14.4 What not to do

- do not point staging at production secrets
- do not allow staging to send real production mail
- do not retain raw production data in staging longer than required
- do not skip post-refresh verification

---

## 15. Incident Response and Troubleshooting

### 15.1 Standard incident flow

1. Detect via alarm, dashboard, or user report.
2. Classify: deploy issue, origin issue, database issue, job issue, secret/config issue, AWS service issue, cost/security issue.
3. Stabilize the user experience; maintenance page is acceptable while diagnosing.
4. Gather evidence from logs, metrics, and recent changes.
5. Recover using the smallest safe runbook: restart, rollback, restore, or infra fix.
6. Verify health.
7. Document cause, action, and follow-up.

### 15.2 First checks by symptom

| Symptom | First checks |
|---|---|
| CloudFront showing maintenance page | origin reachability, recent deploy, readiness failure, memory alarms, nginx/web process health |
| `/health/live` fails | process crash, container restart loop, host issue |
| `/health/live` passes but `/health/ready` fails | SQLite access, memory pressure (backup freshness is alarm-surfaced per §10, not a readiness signal) |
| spike in 5xx | recent deploy, migration, secret rotation, upstream AWS auth errors, DB contention |
| backups failing | worker health, S3 permissions, bucket reachability, disk space, WAL/checkpoint issues |
| Stripe webhooks failing | webhook secret mismatch, signature validation, recent rotation, handler logs |
| SES complaint/bounce spike | sender reputation, template issue, recipient list problem, SES status |
| repeated `SQLITE_BUSY` | long transaction, backup overlap issue, migration, abnormal write load |
| no transactional email arriving (verify, password reset, confirmation) | locate the stuck outbox stage per §4.5 pipeline table; check worker container status; check SES sandbox verification for sender and recipient |
| high memory | image job pressure, worker leak, large request behavior, recent release |

### 15.3 Readiness-failure troubleshooting

If `/health/ready` is failing:
1. inspect the readiness output/check list
2. confirm the SQLite file is accessible and not corrupt
3. confirm the application boot completed far enough to serve the public slice
4. inspect recent deploy logs and restart history
5. if failure began after deploy, consider rollback
6. if failure is data-related, consider the restore path

If backup freshness alarms are firing while readiness still passes:
1. inspect worker health and job-run history
2. inspect S3 permissions and bucket reachability
3. inspect WAL/checkpoint and disk-space conditions
4. repair backup operations without redefining readiness semantics

### 15.4 Secret/config troubleshooting

Common causes:

- wrong `/footbag/{env}/...` path
- stale container process with cached startup values
- KMS permission mismatch
- wrong environment secret used in deployment
- missing restart after secret change
- container missing an env var that the shared config loader (`src/config/env.ts`) validates at module load, even if that container does not functionally use the var. The `worker` service imports the same config loader as `web` and therefore requires `PORT`, `PUBLIC_BASE_URL`, and `SESSION_SECRET` in its compose environment despite binding no port and signing no cookies; symptom is `Missing required environment variable: <NAME>` at startup and a crash-loop `Restarting (1)` status from `docker ps`.

Resolution order:

1. verify path and environment
2. verify IAM and KMS rights
3. verify parameter metadata and last update
4. restart or redeploy affected container
5. re-test the dependent path

### 15.5 SSH access troubleshooting

If SSH access fails:

- verify the instance is running and that you are using the correct public IP or static IP
- verify the Lightsail firewall still permits port 22 from your current approved source IP or CIDR
- verify you are using the correct named host account
- verify you are using the correct private key and that the matching public key is still installed on the host
- verify the host account has not been disabled or had `sudo` removed
- if emergency access requires a temporary firewall change, document the reason and narrow the rule again immediately after recovery

### 15.6 Standard log-collection commands

Run these from the operator workstation (replace `footbag-staging` with the target host SSH alias).

```bash
# Service status
ssh footbag-staging "sudo systemctl status footbag --no-pager -l"

# Recent journal entries
ssh footbag-staging "sudo journalctl -u footbag -n 50 --no-pager"

# Extended journal with full context (use for startup failures)
ssh footbag-staging "sudo journalctl -xeu footbag.service --no-pager | tail -50"

# Running containers
ssh footbag-staging "docker ps"

# Web container logs via Compose
ssh footbag-staging "sudo docker compose \
  -f /srv/footbag/docker/docker-compose.yml \
  -f /srv/footbag/docker/docker-compose.prod.yml \
  logs web --tail=30"

# Web container logs directly (useful when Compose context is unavailable)
ssh footbag-staging "sudo docker logs docker-web-1 2>&1 | tail -30"
```

Always use `sudo systemctl restart footbag`, not `start`. The `start` command is a no-op if the service is already active.

### 15.7 Stripe webhook health and incident response

Symptom-to-checks tree:

| Symptom | First checks |
|---|---|
| Stripe Dashboard shows webhook delivery failures | webhook endpoint reachable from public internet; CloudFront not blocking the webhook path; nginx X-Origin-Verify header is not breaking the request (Stripe does not send X-Origin-Verify, so the path must be exempt at the edge); CloudFront cache behavior for `/payments/webhook` does not strip the POST body |
| Signature validation failures in app logs | the host env `STRIPE_WEBHOOK_SECRET` (`/srv/footbag/env`) matches the signing secret in the Stripe Dashboard for that endpoint; recent rotation per §5.5 was completed and the app was restarted afterward; request timestamp skew (Stripe rejects events older than 5 minutes by default; the app should match); raw payload preserved exactly (Express body parsing must capture the raw body before JSON parsing) |
| Idempotency table grows without corresponding payment progress | the handler is inserting into `stripe_events` but failing in the subsequent transaction; check error logs for the specific `event_id`; verify the state-machine transitions are valid for the incoming event |
| Stripe retries exhausted (event marked failed in the Dashboard) | use the Stripe Dashboard event view to replay the event manually; if the issue is now fixed, the replay succeeds; if not, fix the root cause and replay |

Resolution order:

1. Confirm the webhook endpoint is reachable: `curl -I https://<domain>/payments/webhook` from outside the network. Expect 405 Method Not Allowed (or 200 to OPTIONS), not connection refused or 404.
2. Verify the signing secret: confirm `STRIPE_WEBHOOK_SECRET` in `/srv/footbag/env` matches the Stripe Dashboard webhook view.
3. Check app logs for the failing `event_id`; distinguish signature-validation error from handler error.
4. If the signing secret was recently rotated, confirm the app has restarted since rotation (per §5.5).
5. If the issue is transient or fixed, replay the failed event from the Stripe Dashboard. If the failure persists, escalate per §13.9.

### 15.8 Incident postmortem template

Use after any SEV-1 or SEV-2 incident (per §13.9). Within one week of resolution, capture the following sections:

**Title**: one-line incident name plus severity plus duration (e.g. "SEV-1 origin outage 2026-04-27 14:15 to 15:02 UTC").

**Summary**: one paragraph covering what happened, who noticed, how it was resolved.

**Timeline**: chronological list, each entry `<UTC time>: <event or action>`. Start at first signal (alarm fired, user report) and end at full recovery.

**Impact**: users affected (count or fraction), transactions lost, revenue impact (Stripe webhook gap), data integrity (any rows affected). If unknown, say so explicitly and add a follow-up to investigate.

**Root cause**: the single change or condition that caused the incident. If multiple, identify the primary one and list contributors separately.

**Contributing factors**: anything that made the incident worse than it had to be (slow detection, missing alarm, ambiguous runbook, deferred work).

**Immediate fix**: what was done to recover. Include any temporary workarounds left in place.

**Prevention measures**: concrete actions to prevent recurrence. Each one carries an owner and a due date. Example: "Add CloudWatch alarm on `BackupAgeMinutes` exceeding 10 minutes (owner: maintainer, due: 2026-05-15)".

**Lessons learned**: short list of generalizable insights (not action items, just observations).

Cadence and rules:

- postmortem complete within one week of resolution
- reviewed at the next monthly routine task per §13.1
- blameless framing: focus on systems, processes, and decisions; do not name individuals as responsible parties
- prevention measures are tracked to completion; carry forward each month if not done by the due date

Storage: a `docs/postmortems/` subdirectory committed to the repository, one Markdown file per incident named `YYYY-MM-DD-<short-slug>.md`. Postmortems are part of the operational record and are reviewed during volunteer onboarding per §13.6.

---

## 16. Operator Checklists

### 16.1 Production deployment checklist

- CI green
- Terraform changes reviewed and applied if needed
- staging validated
- migration reviewed if applicable
- backup current
- secret changes verified
- no CloudFront invalidation already in flight (relevant when the deploy changes a cached public template)
- deploy completed
- `/health/live` passes
- `/health/ready` passes
- smoke tests pass
- alarms quiet
- working tree committed and pushed (the deploy ships the local working tree via Dockerfile COPY, not git HEAD; CI validates the change only once it is pushed)

### 16.2 Secret rotation checklist

- change approved
- new value created
- stored under correct `/footbag/{env}/...` path (or `/srv/footbag/env` for `SESSION_SECRET` per §5.8)
- staging validated
- deploy/restart completed
- live verification completed
- grace period observed if dual-key flow used
- old value removed
- audit note recorded

Per-secret runbooks: §5.5 (Stripe), §5.6 (JWT/KMS), §5.7 (source-profile access keys), §5.8 (`SESSION_SECRET`).

### 16.3 Snapshot restore checklist

- maintenance state active
- restore point identified
- integrity check passed
- live DB replaced safely
- services restarted
- health endpoints pass
- smoke tests pass
- maintenance state removed
- incident notes updated

### 16.4 Access review checklist

- current System Administrator list reviewed
- production access list reviewed
- unused access removed
- offboarding completed
- Parameter Store write access reviewed
- KMS key policy reviewed
- findings documented

### 16.5 Backup-drill checklist

- snapshot selected
- restore target prepared
- restore executed
- health verified
- critical workflows tested
- timing recorded
- issues logged
- follow-up actions assigned

### 16.6 Cutover preflight checklist

The cutover preflight orchestrator sequences the validation gates from `MIGRATION_PLAN.md` §24. Manual operator preconditions before invoking it:

- ACM certificate for footbag.org issued in us-east-1 and attached to the production CloudFront distribution. Issuance is operator-initiated through AWS Support and allows several days of lead time; the cert is requested with both `footbag.org` and `www.footbag.org` covered.
- SES sending domain verified end-to-end on the production account, SPF/DKIM/DMARC records published, sandbox exit complete, bounce and complaint SNS topics subscribed. See §4.5 and §13.5. A test send from the production account to the operator mailbox confirms the path.
- DNS TTL on the legacy footbag.org zone reduced to 60 seconds at least 48 hours before the DNS swap. Webmaster coordination per `MIGRATION_PLAN.md` §19 item 18; capture the lowered-TTL timestamp in the cutover log.
- `footbag.org` MX already repointed to Google Managed Services in the discrete pre-T-0 mail-cutover step, all active `@footbag.org` aliases provisioned on Google, and inbound delivery verified end-to-end (MIGRATION_PLAN gate EX7 / §29.12a; runbook §16.8 MX-to-Google mail cutover). The web cutover does not change MX.
- Pre-cutover database snapshot taken and integrity verified per §10.5. Manifest captured (snapshot id, byte size, row counts for `members`, `legacy_members`, `historical_persons`, `name_variants`, `club_bootstrap_leaders`).
- Dev-admin shortcuts confirmed absent from the production runtime via `scripts/audit-dev-shortcuts.sh`; expected count is zero.
- `npm run test:smoke` and `npm run test:e2e` green against the production origin.

Each precondition halts the cutover if it fails. The orchestrator's pass means all gates are satisfied; the operator's go signal completes the cutover. After DNS swap, follow up with §13.10 (HoF and BAP honors oversight) and §7.6 (Cutover rollback decision rule) as needed.

The orchestrator's `CLAIM-SAFETY` gate re-runs the integration suite against the shipped working tree. Because a deploy ships the working tree rather than a committed SHA, this is the authoritative check that the artifact going live passes the claim-flow safety gates (anti-enumeration, rate limiting, claim and auto-link, mailbox-control round-trip, admin help-request). A cutover deploy must not pass `SKIP_TESTS=yes`, which would bypass the equivalent deploy-time `npm test`; the preflight gate is the backstop that the live artifact is verified.

### 16.7 DNS cutover sequence runbook

The DNS cutover swaps `footbag.org` and `www.footbag.org` from the legacy origin to the CloudFront distribution attached to the production certificate. The sequence is gated on §16.6 having passed; once started it is operator-driven and runs to completion before any further write traffic is taken. This sequence swaps only the apex and `www` A/AAAA records; it does not touch MX. The `@footbag.org` MX move to Google is a separate, earlier step (§16.8 MX-to-Google mail cutover; MIGRATION_PLAN §29.12a) completed before T-0, so the apex swap is MX-neutral. Retained `*.footbag.org` subdomains (including the `ifpa.` mail host) keep their existing records and must not be altered or clobbered by the apply.

The numerics below (60s TTL pre-shrink, T+24h TTL restore, T-0 to T+1h rollback window) are the generic-procedure defaults used for staging dry-runs and any cutover without its own overrides. For production footbag.org: the front-door cutover does not move DNS at all (MIGRATION_PLAN §29.12; the agreed Option A cutover is a reverse-proxy flip on the legacy server). This runbook applies later, at the post-stability DNS-handover milestone, where MIGRATION_PLAN §29.12 additionally requires a fresh zone snapshot first so mail and retained-subdomain records copy faithfully into Route 53. Where MIGRATION_PLAN §29.12 and this section disagree, MIGRATION_PLAN §29.12 wins for footbag.org.

Sequence:

**T-48 hours -- TTL drop.** Run `scripts/dns-ttl-preflight.sh` (or apply the equivalent Terraform change) to lower the TTL on the apex and `www` records on the *legacy* zone to 60 seconds. Both A/AAAA records are covered. Record the timestamp + resolver-observed TTL in the cutover log. From this point, any rollback before T-0 propagates within one minute.

**T-0 -- record swap.** Replace the legacy-origin A/AAAA records with `aws_route53_record` ALIAS entries pointing at the production CloudFront distribution (Z2FDTNDATAQYW2 for CloudFront). Apply via Terraform from `terraform/production/`. Record the apply timestamp and the Route 53 ChangeInfo id (`aws route53 get-change --id <id>` returns `INSYNC` when Route 53's authoritative servers have propagated; this typically lands in 30-60 seconds).

**T+1 hour -- propagation check across three resolvers.** Run from the operator workstation:

```
for resolver in 1.1.1.1 8.8.8.8 9.9.9.9; do
  echo "=== ${resolver} ==="
  dig @${resolver} footbag.org A +short
  dig @${resolver} www.footbag.org A +short
done
```

All three should return CloudFront edge IPs (the `aws-cloudfront-net` block) and not the legacy origin. If one resolver still returns the legacy IP after one hour, re-check the TTL on the *legacy* zone's authoritative servers; some upstream resolvers honor the long-cached SOA negative-cache window beyond the record TTL. A single straggler that resolves correctly via the others is tolerable; broad divergence is a rollback trigger.

**T+1 hour -- end-to-end verification.** `curl -sf https://footbag.org/health/live` and `curl -sf https://www.footbag.org/health/live` from at least one network outside the operator's primary ISP. Both must return HTTP 200 with the production cert presented. A 4xx/5xx from the new origin is a rollback trigger.

**T+1 hour -- retained-subdomain check.** Confirm every retained `*.footbag.org` subdomain (per `MIGRATION_PLAN.md` §19 item 16) still resolves to the legacy host and was not altered by the apply. Do not print any private operator-only subdomain into shared logs or output.

**T+24 hours -- TTL restore.** With the cutover stable, raise the TTL on the (now Route 53-managed) apex + `www` records to the long-term default (3600s). Re-apply Terraform; record the timestamp.

Rollback (anywhere from T-0 to T+1 hour): apply the prior Terraform state pinning the legacy-origin A/AAAA records. With TTLs at 60s, world resolves to the legacy origin inside two minutes. Past T+1 hour, rollback is still possible but accumulates the cost of any writes that landed on the new origin while DNS was diverging; consult the rollback decision framework in `MIGRATION_PLAN.md` §27 before triggering.

Dry-run note: dry-run the full sequence against the staging zone before production. Staging uses `staging.footbag.org` (or whatever the staging zone resolves to in `terraform/staging/route53.tf`); the same sequence applies and exercises the same Terraform pathways. A green dry-run confirms the Terraform module, the AWS profile permissions, and the propagation-check tooling all work before they're load-bearing on production.

### 16.8 External DNS/mail upstream coordination runbook

Whenever the platform's DNS zone or MX records are owned by an external operator (the legacy-site webmaster today; potentially other upstreams in future), changes that touch the records below cannot be applied without coordinated action. This runbook covers the long-term coordination pattern; cutover-specific applications layer their own gates on top (e.g. `MIGRATION_PLAN.md` §19 for the legacy-webmaster contract, §29.12 for the DNS cutover).

When this runbook applies:

- The maintainer needs ACM DNS validation records published on an upstream-owned zone.
- The maintainer needs apex or `www` A/AAAA/CNAME/ALIAS records swapped on an upstream-owned zone.
- The maintainer needs MX records updated or repointed.
- Any of the above need to be reverted under time pressure (DNS rollback).

When this runbook does NOT apply:

- The zone is in the maintainer's own Route 53 account (apply via Terraform directly; no external coordination needed).
- The change is read-only (DNS lookups, propagation checks). Read-only verification does not require upstream action.

Communication touchpoints:

- Primary contact: the operator's documented address for the upstream. For the legacy-site webmaster this is `brat@footbag.org` (DD §5.5); for other upstreams, capture the address in the operator's local secrets store alongside other per-upstream credentials.
- Lead time: minimum 7 days for any scheduled change (TTL pre-shrink, ACM validation publication, record swap window). Emergency rollback is faster (single record revert; see "Emergency rollback" below) but should still page the upstream operator immediately so they're aware the platform is in incident state.
- Handoff payload: the maintainer hands over a single message containing (a) the records to change with exact name + type + value + TTL, (b) the requested time window, (c) the maintainer's verification step the upstream operator can run after applying (typically `dig @<upstream-resolver> <name> <type>`), and (d) the rollback record values to keep in their back pocket.

Zone-authority handoff checklist (when transferring ownership of an upstream-owned zone to the maintainer's Route 53 account):

1. Stand up the target Route 53 hosted zone in the maintainer's account; capture the NS records the zone advertises.
2. Mirror every existing record from the upstream zone into the Route 53 zone. Verify with `dig @<target-NS> <name> <type>` from outside that the new authoritative servers return the same answers as the upstream.
3. Coordinate a registrar NS change with the registrar of record (this is a registrar action, not an upstream DNS-host action; identify the registrar via `whois <domain>`). NS changes propagate inside 24-48 hours but can take longer at non-compliant resolvers.
4. After NS change, leave the upstream zone live for at least 7 days so resolvers that cached the old NS records continue to get correct answers during the propagation window.
5. After 7 days, retire the upstream zone or hand it back to the upstream operator per their preference.

Emergency rollback:

- The upstream operator's contact path must be reachable on demand; document the secondary contact (phone, alternate email) before any cutover involving their zone.
- Rollback content: the prior record values are captured at change-publish time so a revert requires re-publishing one or two records, not re-deriving them. Keep these in the cutover log.
- TTL implications: if the cutover lowered TTLs to a propagation-friendly value (60-300s), rollback propagates within that TTL. If TTLs were not lowered (a change made under time pressure without the §16.7 pre-shrink), rollback propagation is bounded by the original record TTL.

Audit trail: every coordinated change produces (a) the maintainer's handoff message, (b) the upstream operator's confirmation that the change is live, and (c) the maintainer's post-change verification log (`dig` output from three resolvers per §16.7). Retain these in the operations log alongside the change itself; they are the evidence trail for the cutover sign-off and for any future rollback decision.

#### MX-to-Google mail cutover (footbag.org)

The ordinary `@footbag.org` inbound move to Google Managed Services is a discrete step run before the apex/`www` web cutover (decoupled; `MIGRATION_PLAN.md` §28 Email transition and §29.12a). It is gated by zone authority and a confirmed alias inventory, and tracked by MIGRATION_PLAN gate EX7. Outbound SES is unaffected (DKIM-based, MX-independent). `@ifpa.footbag.org` on llic.net is untouched.

Skeleton (detailed provider click-paths are filled in when the step is first executed and validated):

1. Provision every active `@footbag.org` mailbox or alias on Google from the confirmed inventory; send a test message to each and confirm receipt.
2. Update the `footbag.org` SPF record to authorize both AWS SES (outbound) and Google (inbound); publish Google's required DNS records alongside the SES DKIM CNAMEs.
3. Pre-shrink the `footbag.org` MX TTL (coordinate via the §16.8 upstream handoff if the zone is upstream-owned).
4. Repoint the `footbag.org` MX to Google. Optionally keep the legacy mail server as a transient lower-priority backup MX until Google delivery is confirmed.
5. Verify inbound end-to-end to every provisioned address from an external account; confirm DMARC alignment holds.
6. Once confirmed, withdraw legacy `@footbag.org` delivery and remove the backup MX.

Rollback: if Google inbound fails verification, revert the `footbag.org` MX to the legacy mail server (authoritative until step 6). The web cutover (§16.7) is independent and unaffected. Never modify the `ifpa.footbag.org` MX during this step.

### 16.9 Environment bring-up sequence

The ordered sequence for standing up a staging or production environment from provisioned infrastructure to serving traffic. Steps 3, 5, 6, and 7 are milestone-gated rather than same-day: run them when their milestone arrives, not eagerly. At any point, `scripts/bringup-status.sh --target <staging|production> --profile <profile>` reports each step as DONE / PENDING / UNKNOWN with the exact next command.

1. **Host env file** (`/srv/footbag/env`, per host). Set `TRUST_PROXY` to the exact X-Forwarded-For hop count (staging 2; production 3 while the legacy front door proxies the apex, dropping to 2 at the DNS-handover milestone) and `BACKUP_S3_BUCKET` to the environment's db-snapshots bucket. A missing `TRUST_PROXY` degrades to coarse per-edge rate limiting; a missing `BACKUP_S3_BUCKET` blocks step 4's uploads. Verify: `scripts/verify-staging-env.sh --target <t>` (§5.13).
2. **Terraform** (staging first, then production). `terraform -chdir=terraform/<t> plan`, review, `terraform import` any Console-created resource before applying (§6), then apply. The gated flags (`enable_backup_alarm`, `enable_cutover_login_alarm`, `ses_feedback_webhook_url`) default off and are flipped by the later steps.
3. **Payments activation** (at the payments-activation milestone, not before). `scripts/activate-payments.sh --target production --profile <prod-profile>` (§5.5): Stripe key to SSM, Dashboard webhook endpoint (manual, the script pauses for it), host env flip to `PAYMENT_ADAPTER=live` + `STRIPE_WEBHOOK_SECRET`, PAYMENTS-BOOT gate. Production refuses to boot on the stub adapter, so this precedes the production go-live deploy.
4. **Backup timer.** `scripts/install-backup-timer.sh --target <t>` (§10): installs and starts the systemd pair and runs the first snapshot immediately. After two `BackupAgeMinutes` datapoints, set `enable_backup_alarm = true` in `terraform/<t>/terraform.tfvars` and apply.
5. **SES feedback loop** (§5.11). Set the `ses_feedback_webhook_url` tfvar (full webhook URL including `?key=<SES_FEEDBACK_WEBHOOK_KEY>`; the variable is sensitive, keep it out of committed tfvars), apply, confirm the SNS SubscribeURL recorded in the `email.sns_subscription_pending` audit row, then validate with `scripts/verify-prod-email.sh --profile <prod-profile> --confirm-production --bounce-probe`.
6. **First admin** (production; §5.12). Provision the single-shot bootstrap token in SSM, hand it off out-of-band, and verify the parameter self-deletes after the claim.
7. **Cutover login alarm** (cutover window only). Set `enable_cutover_login_alarm = true` and apply for the window; set it back to false and apply after. Steady state is off.
8. **Deploy.** `./deploy_to_aws.sh` (ships the local working tree; §7). The per-deploy gates live in §16.1.

## 17. Test-data Operations

### 17.1 Scope and isolation model

Dev-admin shortcut data is data inserted to enable maintainer admin login on dev or staging. It is distinct from production-derived data, which is the subject of §14. Production must never receive dev-admin shortcut data; six independent guard layers refuse the operation, and one regression test enforces that the credential literal driving dev-admin accounts lives in a single file. (The term "test data" and the `--seed-test-data` flag are reserved for a future class of seed mechanisms covering fixtures, ballots, and similar test artifacts. They are not the subject of this section.)

The pattern lives under `src/dev-bootstrap/`. The admin seed is the only current instance. Future test-data seeds (ballots, event results, photos, fixtures) will share a similar shape but live under a separate subtree and are not part of the dev-shortcuts cutover-removal concern.

The tester-facing persona harness (`src/testkit/`: the canonical persona catalog, `/dev/switch`, `/dev/personas`) is a separate concern from this dev-admin seed and runs on development and staging; its operator and tester runbook lives in `docs/TESTING.md` §16.

### 17.2 Staging admin seed

Staging admin accounts seed directly into the running database via an opt-in `--seed-dev-admins` flag on the standard deploy entry point. The flag is allowlisted to `DEPLOY_TARGET=footbag-staging` only; any other target is hard-refused before the SSH connection.

1. Maintain `.local/staging-admin-seed.json` on the workstation. Gitignored, per-maintainer. Same JSON shape as the dev seed described in `docs/DEV_ONBOARDING.md §1.7.2`. Review the content before each deploy that uses the flag.

2. Run a deploy with the flag:

   ```bash
   ./deploy_to_aws.sh --seed-dev-admins
   ```

   Combinable with the bare/`-k` code-only deploy, `-r` for ship-current-DB, or a rebuild deploy (`--from-csv` / `--soup-to-nuts`). The seed always runs at the same phase: after the web service is up and healthy.

3. The pre-deploy plan summary shows `seed dev admins: yes`. Confirm before approving the deploy.

4. The remote half reports each entry's outcome on stdout: `seeded admin`, `no-op (dev-admin-seed marker present)`, or `CONFLICT (member exists without dev-admin-seed marker; not modifying)`. The deploy succeeds even if the seed step exits non-zero; the service is already up. Re-run after resolving the conflict.

5. Verify on the staging host:

   ```bash
   ssh footbag-staging 'sudo sqlite3 /srv/footbag/db/footbag.db "
     SELECT m.login_email, m.is_admin, mtg.reason_code
     FROM members m
     JOIN member_tier_grants mtg ON mtg.member_id = m.id
     WHERE mtg.reason_code = ''dev_admin_seed.admin_tier2''
     ORDER BY mtg.created_at DESC;
   "'
   ```

6. Log in to the staging URL with the seeded email plus the fixed dev-only password (see `src/dev-bootstrap/seedConfig.ts`).

### 17.3 Transport and argv-leak hardening

Sensitive values must never appear in a process's argv on any host. The deploy pipeline carries the seed content through three boundaries; each boundary uses stdin, not argv.

1. Workstation: `jq -c -e` validates and compacts `.local/staging-admin-seed.json`. The compacted JSON is appended to the SSH cat-pipe alongside the sudo password and `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`. Shell-builtin `printf` does not fork, so the value is not visible to any workstation-side process listing.

2. Staging host bash: receives the value as a shell environment variable (assigned by reading its own stdin). It is NOT written to `/srv/footbag/env`; the value is transient and exists for one deploy only.

3. Container: the staging-host bash pipes the value to `docker compose exec -T` via stdin, and the in-container shell reassigns it from `$(cat)` before invoking the seed binary. Passing the value via `docker compose exec -e VAR=value` is forbidden because the value would land in the exec subprocess's argv, visible to any `ps -ef` reader on the host.

Inside the container, the compiled seed (`node dist/dev-bootstrap/seed.js`) reads the env-var, validates the JSON shape, argon2-hashes the fixed dev-only password, and inserts the seed rows in a single transaction.

### 17.4 Adding a new dev-shortcut mechanism

Future dev-shortcut scripts follow the admin-seed shape. The acceptance bar:

- Lives at `src/dev-bootstrap/<additional-mechanism>.ts`. Compiles via the project `tsc` (no Dockerfile changes; `dist/` already ships).
- Imports `src/dev-bootstrap/seedConfig.ts` for the env-guard and shared marker conventions. Adds its own mechanism-specific exports (env-var name, seed file paths, marker constants).
- Reads from `FOOTBAG_DEV_<MECHANISM>_JSON` if set; otherwise from `.local/dev-<mechanism>.json`. Missing both is fatal (exit 1): silent no-ops mask operator mistakes.
- Writes marker columns under the `dev_admin_*` namespace with `created_by = 'dev-shortcuts/<mechanism>'` and an `audit_entries.action_type = 'grant_admin_dev_<mechanism>'`.
- Is idempotent on the marker; reports conflicts without modifying; exits 0 / 1 / 2 as the admin seed does.
- Adds a `--seed-<mechanism>` action to `scripts/manage-dev-admin-seed.sh` (or shares the `--seed-dev-admins` umbrella, running every dev-shortcut script whose staging file exists).
- Wires deploy transport in `scripts/deploy-code.sh` and `scripts/deploy-rebuild.sh` (cat-pipe of the compact JSON) and staging-side exec in `scripts/internal/deploy-code-remote.sh` and `scripts/internal/deploy-rebuild-remote.sh` (stdin-piped `docker compose exec`).
- Lands with a schema-coupling test under `tests/integration/devAdminSeed.<mechanism>.schemaCoupling.test.ts`. The env-guard contract test in `tests/integration/devAdminSeed.envGuard.test.ts` covers all mechanisms by exercising `seedConfig` once.

### 17.5 Guardrails

Dev-admin shortcut data must not reach production, and seed content must not leak via argv. The following invariants hold for every mechanism:

- **Module-import guard.** `src/dev-bootstrap/seedConfig.ts` throws on import unless `FOOTBAG_ENV ∈ {development, staging}`. Production-mode app processes fail fast at module load.
- **Script env-check.** `scripts/manage-dev-admin-seed.sh` refuses if `NODE_ENV=production` or `FOOTBAG_ENV=production`.
- **Deploy entry-point gate.** `deploy_to_aws.sh` allowlists `--seed-dev-admins` to `DEPLOY_TARGET=footbag-staging` only; any other target is refused before any SSH connection.
- **JSON validation gate.** `--seed-dev-admins` strips JSONC `//` line comments and runs `jq -e .` against the workstation-side seed file; malformed JSON aborts before SSH.
- **Container env source.** The staging remote scripts no longer override `FOOTBAG_ENV` for the seed exec; the container reads the value from its `/srv/footbag/env` file (set per host). `seedConfig.ts` then throws on import when the host says `FOOTBAG_ENV=production`, even if the operator misconfigured the deploy chain.
- **IAM/SSM namespace isolation.** The staging deploy role is bound to `/footbag/staging/*` SSM and cannot reach `/footbag/production/*`.
- **argv-leak hardening.** Seed content travels stdin only at every boundary: workstation→ssh, ssh→bash, bash→docker compose exec→in-container shell. `-e VAR=value` is never used for seed content. The principle is documented at `scripts/staging_diagnostics.sh` and enforced by code review.
- **Image-content gate (production only).** Production images are built with `INCLUDE_DEV_SHORTCUTS=0`, set by `scripts/deploy-rebuild.sh` when `FOOTBAG_ENV=production` and reinforced by per-service `build.args.INCLUDE_DEV_SHORTCUTS: 0` in `docker/docker-compose.prod.yml`. The compiled `dist/testkit/` and `dist/dev-bootstrap/` subtrees are absent from the production image; an operator who execs into a production container cannot run the seed even with a misconfigured env.

### 17.6 Password-leak protections

The fixed dev-admin-seed password literal in `src/dev-bootstrap/seedConfig.ts` is hard-coded for dev/staging convenience. Five invariants hold:

- **Single-source containment in code.** Regression test `tests/integration/devAdminSeed.passwordLeak.test.ts` greps source-controlled CODE files (.ts/.js/.sh/.hbs/.json/.yml) and fails if the literal appears in any file other than `src/dev-bootstrap/seedConfig.ts`. Documentation files are excluded from the scan; the discipline of keeping the literal out of docs is governed by doc-sync and human review.
- **No log emission.** Seed scripts emit `loginEmail`, outcome counts, and the env diagnostic only. The password literal is never logged. The argon2 hash is never logged either.
- **No network exposure.** The transport carries the seed JSON (emails, names, optional tier). The password literal does not cross the workstation→staging boundary; hashing happens inside the container at seed time.
- **Production-import refusal.** The module-import guard prevents the literal from being loaded under `FOOTBAG_ENV=production`.
- **Operator-level env guards.** The bash refusal gates at every entry point prevent the seed from being invoked against production-named targets.

Weakening any of these invariants requires removing the corresponding regression-test assertion.

### 17.7 Removal

There is no automated unseed action. Re-rebuild the staging database (`./deploy_to_aws.sh --from-csv`) to clear all seeded rows. To audit leftover rows on either dev or staging, grep the marker columns:

```sql
SELECT COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-shortcuts/%';
SELECT COUNT(*) FROM audit_entries     WHERE action_type LIKE 'grant_admin_dev_%';
SELECT COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%';
SELECT COUNT(*) FROM audit_entries     WHERE action_type = 'dev_admin_invariant_repair';
```

All four counts must be zero before any production deploy. `scripts/audit-dev-shortcuts.sh` runs these queries and exits non-zero if any return > 0; suitable as a CI gate at cutover. The `dev_admin_invariant_repair` marker comes from the dev-only `FOOTBAG_DEV_ADMIN_GRANT_TIER2` invariant-repair pass (see `docs/DEV_ONBOARDING.md` §1.7.3). The `dev_admin_register_allowlist.admin_tier2` marker comes from the dev/staging email-allowlist bootstrap (the unified handler in `src/dev-bootstrap/runtime.ts`); production-first-admin uses a different reason_code and is documented in §17.8. The env-config fail-fast guard prevents any of the dev/staging shortcuts from being set in production, so a non-zero count on production indicates an env-gate bypass and warrants investigation.

### 17.8 Production first-admin bootstrap

Production seeds its first administrator through a single-shot SSM-stored claim token, not the dev/staging email allowlist used by §17.2. The two mechanisms are environment-isolated: production deploys refuse to write `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`, the production process refuses to boot if the var is present, and the production overlay carries an explanatory comment documenting the no-op intent.

Design intent and audit-row shape are in DESIGN_DECISIONS §2.9. The route is `/admin/bootstrap-claim`. The SSM parameter path is `/footbag/production/app/bootstrap/admin_token` (SecureString). The token format is a 64-byte hex string generated by `openssl rand -hex 32`. After a successful claim the endpoint deletes the SSM parameter; subsequent attempts return the same response shape whether the token is missing or wrong.

Staging rehearsal (go-live blocker, MIGRATION_PLAN PC8): the full procedure is rehearsed on staging before cutover. `scripts/admin-bootstrap-token.sh --target staging --profile <staging-profile> provision` generates and stores the token (refusing to overwrite a live one) and prints it once; a non-admin staging account submits it at `/admin/bootstrap-claim`; the `status` action must then report the parameter ABSENT (a successful claim self-deletes it). If `status` reports PRESENT after a successful claim, the self-delete failed, the `admin.bootstrap_token_delete_failed` operational alarm fires, and the `cleanup` action kills the token by hand. An optional drill of `provision` followed by `cleanup` exercises the refuse-to-overwrite and manual-kill guards. The same script with `--target production` is the production provisioning step.

Operator procedure for initial production provisioning lives here once the staging rehearsal has validated it end to end.

