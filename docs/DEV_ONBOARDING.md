# Footbag Website Modernization Project --  Developer Onboarding Guide

## Local Quickstart, Architecture Orientation, and AWS Staging Deployment

This guide helps contributors do different things: understand how the platform is structured and how it was originally assembled, get it running locally (view working pages in your browser), deploy to AWS in a bootstrap scenario, and then close the bootstrap shortcuts.

> **Who you are (pick your lane).** This guide serves four kinds of contributor:
>
> - **New developer** — run it locally, learn the architecture, and deploy to **staging**. You never touch production. Lanes: Path A, then B, then C (history), then D/E/F.
> - **New tester** — run it locally and/or exercise **staging**; browse and switch between seeded personas at `/dev/personas` and read captured dev/staging mail without a real inbox. You never touch production. Lanes: Path A, the persona/tester harness (see `docs/TESTING.md` §16), then D/F.
> - **Initial operator / AWS maintainer** — the one who owns AWS, applies Terraform, performs production activation, and claims the first admin. The only lane that touches production. Lanes: everything above, plus Paths G, H, and I, plus the production Terraform spec.
> - **Other actors** — the historical-data and freestyle pipeline maintainer and docs/design contributors work mostly outside this guide; start at Path B for orientation, then their domain: the pipeline maintainer runs `legacy_data/run_pipeline.sh` and `freestyle/run_freestyle.sh` (and loads the gitignored operator dataset per §1.10A), while design and content contributors work in `docs/` and `src/views/`.
>
> Production (Paths G, H, I) is operator-only. New developers and testers stop at staging.

> **Choose your path**
>
> - **Path A**; I am a brand-new contributor on Windows + WSL. I need to install the tools, clone the repo with HTTPS, run the tests, start the dev server, and load the public pages locally.
> - **Path B**; I need the architecture mental model, scope boundaries, and workflow rules.
> - **Path C**; I need the original blank-slate build order, and detailed historical implementation logic, how to get that initial v0,1 setup to work.
> - **Path D**; I already have the app working locally, and I am continuing the AWS bootstrap deployment.
> - **Path E**; The first deployment works. I need the transition mental model: the Path E baseline boundaries, and where pre-production hardening lives.
> - **Path F**; The initial deployment is working. I want the complete repeatable staging deploy workflow, including routine code-only deploys and destructive schema/dev deploys that rebuild and replace the host DB from scratch.
> - **Path G**; (operator) The deploy workflow is established. I need the production-readiness hardening checklist before cutover.
> - **Path H**; (operator) Staging runs. I need to activate runtime AWS identity and transactional email on staging (KMS signing, SES, Stripe, Turnstile).
> - **Path I**; (operator) Staging is fully activated. I am performing production activation (domain, DNS, SES production access, production KMS, host credentials).

---

## Table of Contents

- [1. Path A — Local quickstart for a new contributor](#1-path-a--local-quickstart-for-a-new-contributor)
  - [1.1 Goal of this path](#11-goal-of-this-path)
  - [1.2 Supported machine setup](#12-supported-machine-setup)
  - [1.3 Required tools](#13-required-tools)
  - [1.4 First-time machine install steps](#14-first-time-machine-install-steps)
  - [1.5 Clone and install the project GitHub repository](#15-clone-and-install-the-project-github-repository)
  - [1.6 Local env file](#16-local-env-file)
  - [1.7 Reset the local database](#17-reset-the-local-database)
  - [1.8 Run the dev server](#18-run-the-dev-server)
  - [1.9 Browser verification (hello world)](#19-browser-verification-hello-world)
  - [1.10 Run the test suite](#110-run-the-test-suite)
  - [1.10A Optional: load the full operator dataset](#110a-optional-load-the-full-operator-dataset)
  - [1.10B Set up your developer tooling](#110b-set-up-your-developer-tooling-after-your-first-green-run)
  - [1.11 Optional: exercise Safe Browsing in dev](#111-optional-exercise-safe-browsing-in-dev)
  - [1.12 Optional deterministic checks](#112-optional-deterministic-checks)
  - [1.13 Docker parity check](#113-docker-parity-check)
  - [1.14 Dev and tester shortcuts (advanced)](#114-dev-and-tester-shortcuts-advanced)
  - [1.15 Filing a bug](#115-filing-a-bug)
  - [1.16 What's next](#116-whats-next)
- [2. Path B — Orientation: what this project is and how to think about it](#2-path-b--orientation-what-this-project-is-and-how-to-think-about-it)
  - [2.1 Project purpose and philosophy](#21-project-purpose-and-philosophy)
  - [2.2 Document relationships](#22-document-relationships)
  - [2.3 Current scope](#23-current-scope)
  - [2.4 Route contract and UI contract](#24-route-contract-and-ui-contract)
  - [2.5 Architecture mental model](#25-architecture-mental-model)
  - [2.6 Repo map](#26-repo-map)
- [3. Path C — Historical bootstrap](#3-path-c--historical-bootstrap)
  - [3.1 Why this section exists](#31-why-this-section-exists)
  - [3.2 Original blank-slate assumptions](#32-original-blank-slate-assumptions)
  - [3.3 Original implementation order](#33-original-implementation-order)
- [4. Path D — AWS staging deployment runbook](#4-path-d--aws-staging-deployment-runbook)
  - [4.1 Purpose](#41-purpose)
  - [4.2 Preconditions](#42-preconditions)
  - [4.3 Read this before first apply](#43-read-this-before-first-apply)
  - [4.4 Lightsail SSH security, set your operator CIDRs](#44-lightsail-ssh-security)
  - [4.5 AWS account/bootstrap setup](#45-aws-accountbootstrap-setup)
  - [4.6 Terraform staging apply](#46-terraform-staging-apply)
  - [4.7 Host bootstrap](#47-host-bootstrap)
  - [4.8 Deploy and start application](#48-deploy-and-start-application)
  - [4.9 Verification](#49-verification)
  - [4.10 Optional: enable Safe Browsing live mode](#410-optional-enable-safe-browsing-live-mode)
- [5. Path E — From first success to the repeatable staging baseline](#5-path-e--from-first-success-to-the-repeatable-staging-baseline)
  - [5.1 Why this section exists](#51-why-this-section-exists)
  - [5.2 What is complete now](#52-what-is-complete-now)
  - [5.3 Path E baseline boundaries](#53-path-e-baseline-boundaries)
  - [5.4 Where the remaining work moved](#54-where-the-remaining-work-moved)
- [6. Path F — Repeatable staging deploy workflow](#6-path-f--repeatable-staging-deploy-workflow)
  - [6.1 Who this path is for](#61-who-this-path-is-for)
  - [6.1A Claude Code Plan Mode for iteration](#61a-claude-code-plan-mode-for-iteration)
  - [6.2 Fix the SSH config alias](#62-fix-the-ssh-config-alias)
  - [6.3 Deploy scripts and what they do](#63-deploy-scripts-and-what-they-do)
  - [6.4 Routine deploy workflow](#64-routine-deploy-workflow)
  - [6.5 If something goes wrong on staging](#65-if-something-goes-wrong-on-staging)
- [7. Path G — Production-readiness hardening](#7-path-g--production-readiness-hardening)
  - [7.1 Why this section exists](#71-why-this-section-exists)
  - [7.2 Public edge and delivery hardening](#72-public-edge-and-delivery-hardening)
  - [7.3 GitHub and operator governance hardening](#73-github-and-operator-governance-hardening)
  - [7.4 Reliability and recovery](#74-reliability-and-recovery)
  - [7.5 Runtime configuration maturity](#75-runtime-configuration-maturity)
  - [7.6 Monitoring maturity](#76-monitoring-maturity)
- [8. Path H — Runtime AWS identity and transactional email activation](#8-path-h--runtime-aws-identity-and-transactional-email-activation)
  - [8.1 Why this path exists](#81-why-this-path-exists)
  - [8.2 Scope](#82-scope)
  - [8.3 Preconditions](#83-preconditions)
  - [8.3.1 Console sign-in for the operator identity](#831-console-sign-in-for-the-operator-identity)
  - [8.4 Naming convention](#84-naming-convention)
  - [8.5 Supersedes an earlier assumption](#85-supersedes-an-earlier-assumption)
  - [8.6 Step 1 — Create the KMS asymmetric signing key](#86-step-1--create-the-kms-asymmetric-signing-key)
  - [8.7 Step 2 — Create the source-profile IAM user](#87-step-2--create-the-source-profile-iam-user)
  - [8.8 Step 3 — Verify the SES sandbox sender and test recipient](#88-step-3--verify-the-ses-sandbox-sender-and-test-recipient)
  - [8.9 Step 4 — Attach policies and amend the runtime role's trust](#89-step-4--attach-policies-and-amend-the-runtime-roles-trust)
  - [8.10 Step 5 — Wire credentials, env, and the compose file](#810-step-5--wire-credentials-env-and-the-compose-file)
  - [8.11 Step 6 — Post-setup validation](#811-step-6--post-setup-validation)
  - [8.12 Where rotation lives](#812-where-rotation-lives)
  - [8.13 AWS SDK version pinning](#813-aws-sdk-version-pinning)
  - [8.14 Where the remaining AWS work lives](#814-where-the-remaining-aws-work-lives)
  - [8.15 Stripe activation (staging)](#815-stripe-activation-staging)
  - [8.16 Turnstile activation (staging)](#816-turnstile-activation-staging)
- [9. Path I — Production activation](#9-path-i--production-activation)
  - [9.1 Why this path exists](#91-why-this-path-exists)
  - [9.2 Scope](#92-scope)
  - [9.3 Preconditions](#93-preconditions)
  - [9.4 Domain acquisition and DNS delegation](#94-domain-acquisition-and-dns-delegation)
  - [9.5 Google Managed Services deliverability for noreply@footbag.org](#95-google-managed-services-deliverability-for-noreplyfootbagorg)
  - [9.6 SES production-access activation](#96-ses-production-access-activation)
  - [9.7 SES domain identity with DKIM](#97-ses-domain-identity-with-dkim)
  - [9.8 Production KMS key, source-profile, and runtime role](#98-production-kms-key-source-profile-and-runtime-role)
  - [9.9 Production SES sender identity and IAM pin](#99-production-ses-sender-identity-and-iam-pin)
  - [9.10 SES bounce/complaint webhook subscription](#910-ses-bouncecomplaint-webhook-subscription)
  - [9.11 Host credential wiring on the production Lightsail instance](#911-host-credential-wiring-on-the-production-lightsail-instance)
  - [9.12 Post-setup validation](#912-post-setup-validation)
  - [9.13 Stripe activation (production)](#913-stripe-activation-production)
  - [9.14 Turnstile activation (production)](#914-turnstile-activation-production)
- [10. Appendices](#10-appendices)
  - [10.1 Troubleshooting reference](#101-troubleshooting-reference)
  - [10.2 Deterministic seed-data reference](#102-deterministic-seed-data-reference)
  - [10.3 Smoke-check contract](#103-smoke-check-contract)
  - [10.4 Authoritative project facts preserved by this guide](#104-authoritative-project-facts-preserved-by-this-guide)
  - [10.5 Official references](#105-official-references)

---

## 1. Path A — Local quickstart for a new contributor

### 1.1 Goal of this path

Success for this path means you can:

- install the prerequisites
- clone the GitHub repo
- install dependencies
- create `.env` - local environment variables file
- reset the local DB
- launch the dev server
- verify `/events`, `/events/year/2020`, an event detail page, `/health/live`, and `/health/ready` in a browser (hello world)
- run the test suite
- set up your developer tooling (Git, Claude Code)
- optionally run the Docker parity stack and local smoke script

### 1.2 Supported machine setup

This guide targets an **Ubuntu (Linux) shell** and works from any Ubuntu install. The newcomer path on Windows is WSL Ubuntu (Windows Subsystem for Linux); on a Mac, run Ubuntu in a VM (for example UTM) or adapt the same commands in your native terminal. Once you have an Ubuntu shell, the rest of this guide is the same everywhere.

For Windows contributors, use this working model:

- Install WSL Ubuntu once at the start of §1.4 (the commands live there), then run everything in this guide from the **Ubuntu shell**, not from `cmd.exe` or PowerShell.
- Keep the repo **inside the Linux filesystem** (for example `~/GIT/footbag-platform`), not under `/mnt/c/...`.
- Use your normal Windows browser to open forwarded `localhost` ports, and the Cursor IDE on Windows.

Recommended Windows + WSL working model:

- install Cursor on Windows (for working with code).
- enable the WSL 2 backend and WSL integration for your Ubuntu distro (essential).
- run Node, npm, sqlite3, Git, SSH, and Claude Code from the WSL Ubuntu shell.

macOS and native-Linux contributors are fully supported. The simplest Mac path is an Ubuntu VM (for example UTM); every step works the same except reaching the running site in your browser, which uses an SSH tunnel into the VM (see §1.8). Alternatively, adapt the §1.4 install commands to your native terminal (Homebrew for the tools, `nvm` for Node 22) and continue from §1.5. Only §1.4 step 1 (WSL) is Windows-specific; on any non-Windows Ubuntu, start at §1.4 step 2.

### 1.3 Required tools

For the **minimum newcomer local path**, install these first:

- `git`
- Node.js via `nvm`
- `npm`
- `build-essential`
- `python3` (with `python3-venv` and `python3-pip`)
- `sqlite3`
- `ffmpeg`
- `curl`
- `unzip`
- `ca-certificates`
- `openssh-client`
- `rsync`

Claude Code (`@anthropic-ai/claude-code`) is required for all contributors, but it is not needed to run the site or the tests; set it up after your first hello-world success (§1.10B).

If you know you will continue into **Path D** or **Path E**, also install or verify these:

- Docker Desktop with WSL integration (install and verify steps are in §1.13)
- `docker compose` support
- Cursor on Windows

The AWS CLI and Terraform install as part of the AWS deployment path (§4.2), not here.

**Use Node 22 as the project baseline.**

Notes:

- the repo's Dockerfiles use `node:22-alpine` and `package.json` requires `"engines": {"node": ">=22.0.0"}`, so Node 22 keeps local and container behavior aligned
- `better-sqlite3` compiles a native addon during install, which is why `build-essential` is required; if you switch Node versions afterward, run `npm rebuild`
- `ffmpeg` is required by the local database reset: the curator seed re-encodes the committed demo videos through it, so a machine without `ffmpeg` stops at `scripts/reset-local-db.sh` with `FileNotFoundError: ... 'ffmpeg'`

### 1.4 First-time machine install steps

> Step 1 sets up Ubuntu on Windows via WSL. On a native Ubuntu machine or an Ubuntu VM (for example on a Mac), skip step 1 and start at step 2.

#### 1. If WSL is not installed yet

From **PowerShell as Administrator**:

```powershell
wsl --install
```

Restart Windows if prompted, then open **Ubuntu** from the Start menu and complete first-time Linux setup.

To confirm your distro is running WSL 2, from PowerShell run:

```powershell
wsl.exe -l -v
```

#### 2. Update Ubuntu and install baseline packages

In the Ubuntu Linux terminal shell (Run all the following commands one at a time):

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  python3 \
  python3-venv \
  python3-pip \
  sqlite3 \
  ffmpeg \
  git \
  unzip \
  zip \
  jq \
  ca-certificates \
  curl \
  openssh-client \
  rsync \
  gpg
```

Verify the basics:

```bash
sqlite3 --version
ffmpeg -version
python3 --version
git --version
ssh -V
rsync --version
```

#### 3. Install `nvm` and Node 22

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

**Close and reopen your terminal** (or run `source ~/.bashrc`) so that `nvm` is available. Then:

```bash
nvm install 22
nvm use 22
nvm alias default 22

node -v
npm -v
which node
```

`which node` should resolve to a path under `/home/...` or `/usr/...`, not `/mnt/c/...`.

These three steps are everything required to reach hello world. Git configuration and Claude Code are set up after your first green run (§1.10B); Docker is only for the parity check and AWS paths (§1.13).

### 1.5 Clone and Install the Project GitHub Repository

Clone via HTTPS; no SSH key required (again, run commands one at a time):

```bash
mkdir -p ~/GIT
cd ~/GIT
git clone https://github.com/davidleberknight/footbag-platform.git
cd footbag-platform
```

> **Clone from inside WSL (Windows).** Keep the repo in the Linux filesystem (for example `~/GIT/footbag-platform`), not under `/mnt/c/...`. The repo's `.gitattributes` keeps shell scripts LF-terminated, but if you ever see `bash: ...^M` errors the checkout picked up Windows CRLF line endings; re-clone from inside WSL rather than repairing it by hand.

```bash
npm install
```

If `npm install` fails while compiling `better-sqlite3`:

- confirm you are on Node 22
- confirm `build-essential` is installed
- confirm `which node` points to the WSL/Linux binary
- then rerun `npm install`

### 1.6 Local env file

Create the local environment file from the example:

```bash
cp .env.example .env
```

`cp .env.example .env` already provides every required value with safe development placeholders, so you do not need to hand-edit it to reach hello world.

The required local `.env` shape is:

```
COMPOSE_FILE=docker/docker-compose.yml
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
FOOTBAG_DB_PATH=./database/footbag.db
PUBLIC_BASE_URL=http://localhost:3000
SESSION_SECRET=changeme-use-a-long-random-string-in-production
INTERNAL_EVENT_SECRET=changeme-internal-event-secret-not-for-production
```

The app fails fast at boot if `SESSION_SECRET` or `INTERNAL_EVENT_SECRET` is missing. For local development, keep `.env` intentionally small.

Use local `.env` for:

- local-only development values
- non-secret defaults
- temporary local secrets needed only for development

Do not commit `.env` (make sure it is in your .gitignore)

### 1.7 Reset the local database

A fresh clone has no database yet. The event inputs the loader reads (`legacy_data/event_results/canonical_input/`) are committed real competitor data (event results and historical persons, with no member emails or contact data), so `reset-local-db.sh` applies the schema and loads them directly. Build it with one command:

```bash
bash scripts/reset-local-db.sh
```

It needs the `sqlite3` CLI and `python3` (installed in §1.4) and creates a Python virtualenv under `scripts/.venv` on first run. It applies the schema, loads the committed seed CSVs, and builds the freestyle tables via `freestyle/run_freestyle.sh`, so no separate freestyle build is needed. `./run_dev.sh` (§1.8) runs this automatically when `database/footbag.db` is missing, so on a fresh clone `./run_dev.sh` alone reaches a seeded, browsable site.

Two real-data inputs power the full dataset, and a hello-world clone needs neither:

- the footbag.org **mirror** (`legacy_data/mirror_footbag_org/`), gitignored, used to regenerate canonical event data from source (the `--soup-to-nuts` / `run_pipeline.sh full` path);
- the **IFPA member roster** (`legacy_data/membership/inputs/membership_input_normalized.csv`), gitignored because it holds member PII (emails and personal data), used for the full member load.

Both are separate maintainer handoffs; request them only when you need the full data load. The committed real event data and seed CSVs are enough to run and browse the site locally.

Expected result:

- `reset-local-db.sh` completes without error
- `database/footbag.db` is built
- the app has the committed real event archive for local browsing

Re-run `bash scripts/reset-local-db.sh` whenever you want a clean rebuild.

### 1.8 Run the dev server

```bash
./run_dev.sh
```

This launches both the web server (port 3000) and the image worker (port 4001). Avatar, photo, and curator video uploads route through the image worker over HTTP in the four-container topology (nginx + web + worker + image; see `docs/DEVOPS_GUIDE.md`); `npm run dev` alone fails uploads because no worker is listening. `./run_dev.sh` keeps both alive and tears both down on Ctrl+C; see also `npm run dev` and `npm run dev:image` if you want to run them individually for debugging.

Open the running site in your browser. Pick the block for your machine; all paths reach the same `http://localhost:3000`.

**Windows + WSL2.** WSL2 forwards the guest's `localhost` ports to Windows automatically, so open `http://localhost:3000` in your Windows browser. Nothing else to configure.

**Native Ubuntu or native macOS (no VM).** The server runs on the same machine as the browser; open `http://localhost:3000` directly.

**macOS with Ubuntu in a VM (for example UTM).** The Mac host and the Ubuntu guest do not share `localhost`, so the Mac browser cannot reach the guest's `localhost:3000` on its own. Keep the browser on `http://localhost:3000` and forward that port into the VM over an SSH tunnel. This is required, not just tidier: the app rejects form POSTs whose `Origin` does not match `http://localhost:3000`, so browsing to the VM's IP would make every form submission fail with `403 Forbidden`.

How the tunnel works: the app listens on `127.0.0.1:3000` *inside the guest*, which is a separate machine from the Mac, so the Mac's own `localhost` does not reach it. In `ssh -L localhost:3000:127.0.0.1:3000`, the first `localhost:3000` is the port SSH opens on the Mac and the second `127.0.0.1:3000` is where SSH delivers that traffic on the guest, so the Mac browser reaches the app while its address bar (and `Origin`) stays `http://localhost:3000`.

1. In the Ubuntu guest, install and start the SSH server (the baseline packages include only the client). If the guest firewall is on, also allow SSH:

   ```bash
   sudo apt install -y openssh-server
   sudo systemctl enable --now ssh
   sudo ufw allow OpenSSH   # only if ufw is enabled
   ```

2. In the Ubuntu guest, read the VM's actual IPv4 address (do not guess it):

   ```bash
   ip -4 route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}'
   ```

3. Start the dev server in its own terminal. From macOS Terminal, SSH into the VM (replace `<ubuntu-user>` with the Linux username you created when you first set up the Ubuntu VM, and `<vm-ip>` with the address that step 2 printed), then start the stack and leave this window open:

   ```bash
   ssh <ubuntu-user>@<vm-ip>
   cd ~/GIT/footbag-platform
   ./run_dev.sh
   ```

4. Open the port tunnel in a second macOS terminal, in the background. `-f -N` holds the forward with no remote shell; `ExitOnForwardFailure=yes` makes it abort instead of backgrounding a dead tunnel if port 3000 is already taken on the Mac (so you do not get a tunnel that looks fine but a browser that cannot connect):

   ```bash
   ssh -f -N -o ExitOnForwardFailure=yes \
     -L localhost:3000:127.0.0.1:3000 \
     <ubuntu-user>@<vm-ip>
   ```

   Tear the tunnel down when you are done:

   ```bash
   pkill -f "ssh -f -N .* -L localhost:3000:127.0.0.1:3000"
   ```

5. Confirm the server is reachable from the Mac, then browse to it:

   ```bash
   curl http://localhost:3000
   ```

   Open `http://localhost:3000` in your Mac browser. The browser hits its own forwarded port and SSH carries the traffic to `127.0.0.1:3000` inside the VM. Only port 3000 needs forwarding; the image worker on 4001 is called server-to-server inside the VM, so the browser never contacts it. Decoupling the server window from the tunnel means restarting one never drops the other.

If direct SSH to the VM IP is not reachable (depending on the UTM network mode), add a VM port forward for SSH (Mac `localhost:2222` to guest port 22) and connect through it, keeping the same app-port tunnel. This `2222` is local to UTM and unrelated to the `2222` used later for AWS Lightsail:

```bash
ssh -p 2222 -o ExitOnForwardFailure=yes \
  -L localhost:3000:127.0.0.1:3000 \
  <ubuntu-user>@localhost
```

The browser URL stays `http://localhost:3000`.

### 1.9 Browser verification (hello world)

This is the primary local success path.

Open these in a browser:

| URL                                                                              | Expected outcome                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [http://localhost:3000/events](http://localhost:3000/events)                     | events landing page renders, listing the committed event archive  |
| [http://localhost:3000/events/year/2020](http://localhost:3000/events/year/2020) | 2020 archive renders the real events for that year |
| [http://localhost:3000/health/live](http://localhost:3000/health/live)           | `{"ok":true,"check":"live"}`                         |
| [http://localhost:3000/health/ready](http://localhost:3000/health/ready)         | `{"ok":true,"check":"ready"}`                        |

What matters here:

- the Events landing page renders cleanly
- the 2020 year archive lists the real events for that year
- opening any event from the archive renders its detail/results page cleanly
- the health endpoints return clean liveness/readiness responses
- you can click around the public slice locally without stack traces or route confusion

These event pages render the committed real competitor archive (event results and historical persons, with no member emails or contact data); the local DB also loads real public member and club names from the committed seed CSVs, which populates clubs and affiliations. The mirror and member-roster handoffs add the full member load and let you regenerate the canonical data from source.

### 1.10 Run the test suite

```bash
npm test
```

Run the suite to confirm your environment is healthy end to end; it is self-contained (integration tests use their own ephemeral SQLite databases) and does not need the dev server running.

The suite is split:

- `npm test`; unit + integration suites only; the default everyday verification. Excludes smoke, e2e, and dev-only crawls via `vitest run --exclude 'tests/smoke/**' --exclude 'tests/e2e/**' --exclude 'tests/dev/**'`.
- `npm run test:unit`; pure-function tests under `tests/unit/`; no DB.
- `npm run test:integration`; HTTP-via-supertest tests under `tests/integration/`; each file owns its own temp SQLite DB via `tests/fixtures/testDb.ts`.
- `npm run test:smoke`; staging AWS smoke tests under `tests/smoke/`; run only when the user explicitly asks "run ALL tests" or when verifying staging AWS wiring. Requires the `footbag-staging-runtime` AWS profile and accessible Terraform staging state; a developer granted AWS access configures that workstation profile per `docs/DEVOPS_GUIDE.md` §18.8.
- `npm run test:strong-hash`; re-runs the password-hash and anti-enumeration login-timing tests at full production argon2 cost (the default suite uses a cheap test-only hash profile for speed). Run on demand to validate the real hashing path.
- `npm run test:pre-pr`; pre-PR gate; build + conventions check + unit + integration; sub-2-minute target per `docs/TESTING.md` §11.1. Run before pushing.
- `npm run test:e2e`; Playwright browser tests under `tests/e2e/`; spins up the full stack locally with an ephemeral DB.
- `npm run test:watch`; vitest in watch mode for fast iteration.
- `npm run build`; `tsc -p tsconfig.json` typecheck. Must pass before any PR.

The suite includes a migration-testing cluster under `tests/integration/` that exercises the legacy-data import path (legacy-claim merge, two-step emailed-token claim flow, batch auto-link SYS job, HP-detail Claim CTA, transaction atomicity).

#### The full local suite (`run_all_tests.sh`)

`npm test` is the inner loop. Before a PR, run the comprehensive local gate. The e2e gate drives Playwright, whose browsers are a one-time install:

```bash
npx playwright install        # one-time: Playwright e2e browsers
./run_all_tests.sh --full     # the complete suite
```

Developers and testers should run the complete suite with `--full`, and it is meant to pass for them on a plain workstation. The default `./run_all_tests.sh` runs every gate that is safe on a workstation: build, lint, dependency audit, conventions, secret-scan, unit, integration, e2e, and terraform fmt/validate (`--quick` skips e2e and terraform for a fast loop). `--full` adds the heavyweight pentest, the staging-AWS smoke, and the persona-crawl; on a fixture-seeded clone (no operator data handoff, no AWS profile) the staging-smoke and persona-crawl SKIP with a warning while every other gate still runs, so the run completes green instead of failing on data or credentials you are not expected to have.

> **The persona-crawl gate, for developers and testers.** `--full` includes a persona-crawl that drives the build-switch persona journey (`/dev/build-switch?as=...`) and checks a fully onboarded profile: the Hall-of-Fame identity, the co-led `Wellington Hack Crew` club, and the media and onboarding pages. That data comes from the full operator load, so the gate SKIPs on a clone without it. To run it, do the full data load (below), start `./run_dev.sh`, then `./run_all_tests.sh --with-persona-crawl`.
>
> **Final note — the full data load needs operator data kept out of GitHub, including a PII file.** The full load (`./run_dev.sh --from-csv`) requires the operator dataset, which a fresh clone does not have. Part of it is the IFPA member roster, `legacy_data/membership/inputs/membership_input_normalized.csv`, which is deliberately kept out of GitHub because it contains member PII (email addresses and personal data). Request the dataset from the project maintainer if you need the full load. The hello-world journey above and the default `./run_all_tests.sh` need none of it; they run entirely on committed data (the committed canonical event data plus the committed seed CSVs).

#### Writing new tests

Place new tests under the matching directory: pure functions go to `tests/unit/`, HTTP/route tests go to `tests/integration/`. Use the factories at `tests/fixtures/factories.ts` to insert deterministic test data (`insertMember`, `insertEvent`, `insertClub`, etc.); never hand-roll INSERT statements.

#### CSRF Origin-pin: tests that POST must import the helper

`src/middleware/requireOriginPin.ts` rejects state-changing requests (POST/PUT/PATCH/DELETE) whose `Origin` header does not match `config.publicBaseUrl`. Supertest does not set Origin by default, so integration tests that exercise mutations import a wrapper instead of `supertest` directly:

```typescript
import request from '../fixtures/supertestWithOrigin';
```

The wrapper auto-sets `Origin: process.env.PUBLIC_BASE_URL` on `.post()`, `.put()`, `.patch()`, `.delete()`, and on `request.agent(app)`. GETs pass through unmodified. Override per-call with `.set('Origin', ...)` when you intentionally test mismatched origins (see `tests/integration/csrf.origin-pin.test.ts` for the canonical Origin-matrix example, which deliberately imports raw `supertest`).

Manual curl POSTs against the local dev server must also set `Origin: http://localhost:3000`, or the response will be a `403 Forbidden` before the controller runs.

#### Adapter parity test contract

New adapters (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, future) land with three permanent tests per `tests/CLAUDE.md`:

1. Boot-time config test in `tests/unit/env-config.test.ts`; `src/config/env.ts` fails fast at module load when required prod-mode env vars are absent.
2. Interface parity test in `tests/integration/adapter-parity.test.ts`; both implementations satisfy the TypeScript interface and produce identical-structure observable outputs (injected fake AWS client, not a mocked SDK).
3. Staging-smoke test in `tests/smoke/`; hits real staging AWS via assumed-role chain; gated behind `RUN_STAGING_SMOKE=1`.

#### Dev test libraries

`npm install` brings in the dev-only libraries below. No further setup is required for the contributor unless noted.

**fast-check.** Property-based testing. Import in any unit or integration test:

```typescript
import fc from 'fast-check';

fc.assert(fc.property(fc.string(), (s) => roundTrip(s) === s));
```

Use for invariant assertions, fuzzing, and enumeration-safety checks. Targets `docs/TESTING.md` §12.2 Rigor 4.

**@stryker-mutator/core, @stryker-mutator/vitest-runner.** Mutation testing. Requires a `stryker.config.json` at repo root (not committed yet). When adopted, run:

```bash
npx stryker run
```

Scope: the safety-critical short list per `docs/TESTING.md` §12.1 (auth, privacy filters, migration matchers, role gates). Targets Rigor 5.

**@axe-core/playwright.** Accessibility checks for Playwright e2e tests. Import inside a test:

```typescript
import AxeBuilder from '@axe-core/playwright';

const { violations } = await new AxeBuilder({ page }).analyze();
expect(violations).toEqual([]);
```

Per `docs/TESTING.md` §14.1.

**audit-ci.** Dependency vulnerability scanner beyond `npm audit`. Run:

```bash
npx audit-ci --moderate
```

Exits non-zero on moderate-or-higher advisories. Per `docs/TESTING.md` §9.

#### Pentest tooling (not auto-installed)

**OWASP ZAP.** Heavyweight pentest scanner. Distributed as a Java tool / Docker image, not an npm package. One-time install when first wiring `test:pentest:heavy`:

```bash
docker pull owasp/zap2docker-stable
```

Per `docs/TESTING.md` §9.3. Operator-invoked; never runs unattended against production.

### 1.10A Optional: load the full operator dataset

The hello-world clone runs on the committed real event data (`canonical_input`) plus the committed seed CSVs (public member and club names). The full real dataset needs two inputs that are gitignored and handed off separately by the maintainer, never committed:

- the footbag.org **mirror** (`legacy_data/mirror_footbag_org/`), an offline archival crawl of the live site that the pipeline parses to regenerate canonical event data. It is large (roughly 55 to 60 GB) and is normally taken as a maintainer handoff rather than re-crawled. To regenerate it from scratch, run the crawl from `legacy_data/` via `create_mirror_footbag_org.py <member_email> <password>` (run inside the `legacy_data` Python venv): a member account login reaches member-only content, `ffmpeg` is required (every fetched image and video is re-encoded through it to strip malware), and the crawl runs for multiple days, saving progress so it resumes after an interruption.
- the **IFPA member roster** (`legacy_data/membership/inputs/membership_input_normalized.csv`), a curated CSV of the IFPA membership kept out of GitHub because it holds member PII (emails and personal data). It drives the full member load and is the input the `--from-csv` enrichment pass reads.

Request whichever you need from the maintainer, then load:

```bash
./run_dev.sh --from-csv      # full enrichment rebuild + media + personas; no mirror, no dev-admins; needs the member roster
./run_dev.sh --soup-to-nuts  # everything --from-csv does, plus mirror rebuild + dev admins
```

The **freestyle** tables are not part of this handoff: they build entirely from committed inputs via `freestyle/run_freestyle.sh` (which `reset-local-db.sh` runs automatically), so freestyle content is already complete on a fresh hello-world clone.

Beyond these local inputs, the full migration also draws on the **legacy footbag.org database export**, a raw MariaDB `mysqldump` of the live site supplied by the legacy-site webmaster. It is the source of the legacy member-account import that runs at migration cutover (the historical accounts members later reconnect to through the claim flow): the platform parses it into canonical loader input and drops the credential and session columns. Because it carries clear-text passwords and member PII, it is worked only in an operator-controlled environment and never committed or shared (see `docs/DATA_GOVERNANCE.md`).

### 1.10B Set up your developer tooling (after your first green run)

With hello world working and the tests passing, set up the tooling you need to start contributing.

Configure Git so your commits carry your identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

Install Claude Code (required for all contributors). You need an Anthropic plan (Pro or above):

```bash
npm install -g @anthropic-ai/claude-code
claude --version
claude        # then run /login and complete the browser OAuth sign-in
```

Always start `claude` from the repository root (`~/GIT/footbag-platform`), not a subdirectory or your home directory, so it loads the project's `CLAUDE.md` and the path-scoped rules under `.claude/`. On Windows, Claude Code runs inside WSL Linux; the Cursor IDE runs on Windows and connects to it.

For how the harness fits together — what loads when, where rules, skills, hooks, and permissions live, and how to change any of it safely — see `docs/CLAUDE_CODE_GUIDE.md`.

### 1.11 Optional: exercise Safe Browsing in dev

Default dev behavior: stub `SafeBrowsingAdapter` with the canonical Google
malware test URL pre-seeded. Submitting `http://malware.testing.google.test/testing/malware/`
through any external-link form (gallery edit, member profile) rejects with
"This URL is not allowed." No setup required, no outbound call, no API key.

To exercise the live Google Safe Browsing v4 API end-to-end locally:

1. Get an API key (5 min): in the Google Cloud Console, create or sign in to
   a project, enable the "Safe Browsing API" under APIs & Services → Library,
   then APIs & Services → Credentials → Create Credentials → API key. Free
   tier: 10,000 lookups/day.
2. Create `.local/secrets.json` (gitignored; the `.local/` directory holds all per-operator local files): write `{"safe_browsing_api_key": "<your-key>"}` as the file content.
3. In your local `.env`: `SAFE_BROWSING_ADAPTER=live` (uncomment the line
   that ships in `.env.example`).
4. `./run_dev.sh`. The validator now calls Google for every external URL
   submitted through the admin/curator/member gallery edit flows.

To run the staging-pinned `safe-browsing.smoke.test.ts` against a personal
key (bypasses the staging-AWS runner):

```
SAFE_BROWSING_API_KEY="<your-key>" RUN_STAGING_SMOKE=1 \
  node_modules/.bin/vitest run tests/smoke/safe-browsing.smoke.test.ts
```

Expects 3/3 pass.

### 1.12 Optional deterministic checks

The browser checks in §1.9 are the required proof. The routes below are **optional additional deterministic checks** (the 404 cases hold regardless of which dataset is loaded):

- `/events/event_2026_draft_event`; should not be public; expected 404
- `/events/event_9999_does_not_exist`; expected 404
- `/events/year/1899`; empty year page should still render cleanly (confirmed in `smoke-local.sh`)

Use these when:

- troubleshooting
- verifying the deterministic seed contract
- comparing behavior to the smoke scripts
- debugging route and visibility edge cases

### 1.13 Docker parity check

Docker is part of the required workflow because the deployed origin is containerized.

Do this before anyone touches AWS.

**Install Docker first (if you have not already).** Install Docker Desktop on Windows, enable the **WSL 2 based engine**, and enable WSL integration for your Ubuntu distro. Then verify from the Ubuntu shell:

```bash
docker --version
docker compose version
```

> **Note on `COMPOSE_FILE`:** The `.env` file sets `COMPOSE_FILE=docker/docker-compose.yml`. This only applies when running bare `docker compose` without `-f` flags. The parity commands below use explicit `-f` flags that override `COMPOSE_FILE`. Always use the explicit `-f` form shown here.

> **Note on `--env-file`:** The parity commands require `--env-file .env` so that Docker Compose can substitute `SESSION_SECRET` (and any future secrets) from your local `.env` into the container. Without it, Compose resolves variable substitution from `docker/` (the compose file's directory), finds no `.env` there, and the app crashes at startup. This mirrors how the production deploy passes `--env-file /srv/footbag/env`.

> **Note on TypeScript compilation:** The `docker/web/Dockerfile` is a multi-stage build that runs `npm run build` inside the builder stage. You do not need to run `npm run build` before `docker compose build`; the Dockerfile handles compilation internally.

Run the base parity stack locally in a separate terminal (or detached):
```bash
docker compose \
  --env-file .env \
  -f docker/docker-compose.yml \
  up --build --detach
```

Then run the smoke checks against the containerized local app:

```bash
chmod +x scripts/smoke-local.sh
BASE_URL=http://localhost ./scripts/smoke-local.sh
```

What you are proving here:

- nginx fronts the web container correctly
- the runtime container shape behaves like deployment shape
- the DB mount path is correct
- web and nginx stay healthy under Compose

Bring the stack down when done:

```bash
docker compose \
  --env-file .env \
  -f docker/docker-compose.yml \
  down
```

### 1.14 Dev and tester shortcuts (advanced)

> These are advanced shortcuts for maintainers and testers. None of them are needed to reach hello world or run the default test suite; a new developer can skip this section. The tester journey is the developer journey above plus the persona switching in §1.14.3.

#### 1.14.1 Dev admin allowlist (maintainers)

Admin in dev confers the curator role, which authors real `/curated/` content (the committed source of truth), so it is restricted to the project maintainers and is not a default setup step. Normal local development needs no admin, and a new developer does not self-grant it. If you need admin for a specific task, coordinate with a maintainer rather than adding yourself.

For reference, the mechanism: the dev site auto-promotes a registrant whose normalized email is listed in the gitignored `.local/initial-admins.txt` allowlist (one email per line; `#` comments and blank lines allowed). A member whose email is not listed registers normally as a non-admin. The `.local/` directory is gitignored; never commit a file containing email addresses.

Staging uses the same allowlist but reads it from an env var, not a file. The deploy pipeline parses your workstation's `.local/initial-admins.txt` into `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` and writes it into `/srv/footbag/env` on the staging host; the staging runtime reads the env var. The file path is not consulted on staging because the staging container runs `NODE_ENV=production`. For production, three layers of defense prevent the dev/staging allowlist from firing: the deploy pipeline refuses to write the env var on a production host, the env-config fail-fast refuses to boot a production process with the var set, and the production docker overlay carries an explanatory comment documenting the no-op intent. Production-first-admin uses a separate SSM-stored claim-token mechanism described in DESIGN_DECISIONS §2.9 and operationally documented in DEVOPS_GUIDE §20.8.

#### 1.14.2 Dev-only shortcuts

Several conveniences exist to reduce friction during local manual testing. The env-var-gated entries refuse to start outside their permitted environments via fail-fast guards in `src/config/env.ts`; the persona-harness operator script runs in development or staging only. Production carries none of them.

| Shortcut | Type | Allowed envs | What it does |
|---|---|---|---|
| `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` | env var | development AND staging | Email allowlist matched at registration; matching registrants get `is_admin=1` plus a Tier 2 grant plus audit rows in one transaction. The deploy pipeline parses `.local/initial-admins.txt` into this env var; the workstation file is the dev source. Production refused at boot and at deploy time. |
| `GET /dev/switch?as=<slug>` | dev route | development and staging | Issues a real session cookie for a seeded persona via the production JWT primitive, so you act as any persona without a login chain. Audit-marked `testkit.persona_switch`. |
| `./scripts/manage-test-personas.sh --seed-test-personas` (or `./run_dev.sh --seed-test-personas`) | operator script | development AND staging | Seeds the canonical persona catalog. Tier grants marked `dev_persona_seed.tier_grant`. Production blocked by the testkit import guard and the production image strip. |

Production has none of these shortcuts. Production admins requiring legacy-claim recovery use `manualLegacyClaimRecovery` (DD §3.9).

##### Switch between personas in the browser (/dev/personas)

Removes login friction during local manual testing of tier-gated and member-only flows. Seed the persona catalog once, then open `/dev/personas` to browse every loadable persona and click its Switch link to act as that persona without a login chain (or, if you already know the slug, hit `/dev/switch?as=<slug>` directly):

```bash
export FOOTBAG_ENV=development
./run_dev.sh --seed-test-personas
# then in a browser:
#   http://localhost:3000/dev/personas             (the persona catalog: browse and click Switch)
#   http://localhost:3000/dev/switch?as=t0_fresh   (direct by slug: tier0)
#   http://localhost:3000/dev/switch?as=admin_t2   (direct by slug: admin)
```

The `/dev` router mounts under `FOOTBAG_ENV ∈ {development, staging}`, so the switch surface exists in development and staging but never in production. It issues a real session cookie via the same primitive the production login path uses (`createSessionJwt`), verified by the same auth middleware, then redirects to `/`. The canonical persona catalog lives in `src/testkit/canonicalPersonas.ts`.

For the full tester workflow built on this harness (purchase flow from a fresh persona, the stub-checkout decline button, onboarding/legacy/clubs walk-throughs, and the captured-email card on dev and staging), see the tester runbook in `docs/TESTING.md` §16.

A stub `legacy_members` row with no `legacy_email` (for example before the legacy data dump is loaded) is claimable from the onboarding wizard's `legacy_claim` task via the historical-person card-confirm path, which needs no email roundtrip; the mailbox-control round-trip is optional and only upgrades the audit evidence tier. Admins requiring manual recovery use the `manualLegacyClaimRecovery` flow.


### 1.15 Filing a bug

Defects route through GitHub Issues using the templates in `.github/ISSUE_TEMPLATE/`:

- **Bug report** (`bug_report.yml`); general defects in any area (auth, clubs, members, events, media, admin, docs, security).
- **Migration or onboarding bug** (`migration_or_onboarding_bug.yml`); defects in the legacy-data import, claim flows, or first-run onboarding paths.
- **Security vulnerability**; routes via `config.yml` `contact_links` to GitHub's private vulnerability reporting. Not a public issue form.

Issues land on the **footbag-platform bug tracker** GitHub Projects board with five custom fields:

- *Area*: auth, migration, onboarding, clubs, members, events, media, admin, staging, docs, security.
- *Environment*: local, staging, production.
- *Severity*: blocker, major, normal, minor.
- *User role*: anonymous, member, club leader, admin, event organizer, legacy claimant.
- *Status*: New, In progress, In review, Done, Won't fix.

Lifecycle workflows on the board automate Status transitions: opening an issue auto-adds it as New; linking a PR moves it to In review; merging or closing the issue moves it to Done. No manual board curation is required during normal flow.

Per `docs/TESTING.md` §9.6, every closed bug lands with a regression test at the cheapest appropriate layer. A bug without a regression test is not closed.

To re-provision the board (e.g. recovering after deletion or onto a fork), run `scripts/setup-bug-tracker-project.sh`. The script is idempotent and derives owner/repo from `gh repo view`. Five lifecycle workflows remain a one-time GH UI step per the script's trailing instructions.

### 1.16 What's next

With hello world running and the tests green, here is where to go next:

- **Architecture orientation:** Path B (§2) for the mental model, scope boundaries, and repo map. Read it before doing code work.
- **More tests:** `./run_all_tests.sh` runs the fuller suite; `--full` adds the pentest, the staging-AWS smoke, and the persona-crawl. On a fixture-only clone (no operator data, no AWS profile) the staging-smoke and persona-crawl skip with a warning, so the run still completes green.
- **The full dataset:** load the optional operator dataset and footbag.org mirror (§1.10A) when you need the real event archive and member roster; both are gitignored maintainer handoffs.
- **Testers:** browse and switch between seeded personas at `/dev/personas` and read captured dev/staging mail without a real inbox; the full tester runbook is `docs/TESTING.md` §16.
- **AWS staging deploy:** Path D (§4) when you continue toward deployment. Production hardening and activation (Paths G through I) are operator-only.

## 2. Path B — Orientation: what this project is and how to think about it

### 2.1 Project purpose and philosophy

The Footbag Website Modernization Project is a volunteer-maintained community platform intended to become the modern public hub for footbag.

Read the PROJECT_SUMMARY doc first.

### 2.2 Document relationships

Treat this guide as one document in a wider authority-doc set.

Read these first when working on code:

- `PROJECT_SUMMARY.md`
- `USER_STORIES.md`
- `DESIGN_DECISIONS.md`
- `DATA_MODEL.md`

How they relate:

- user stories define what the website must do
- the view-layer rule (`.claude/rules/view-layer.md`) defines the shared rendering standard every public page follows
- each service's file-header JSDoc defines its responsibilities and contract
- design decisions define what architectural shortcuts are intentional and what is forbidden
- The data mode / schema sql is the executable truth for the current data baseline

### 2.3 Current scope

The events + health slice below was the original proof-of-stack; the platform now serves the full public site. The routers mounted in `src/app.ts` are:

- `/health` — liveness and readiness (`/health/live`, `/health/ready`)
- `/` (public) — the public site: events, clubs, freestyle, net, sideline, records, hof, bap, media, rules, ifpa, history, legal, plus member auth and onboarding (login, register, verify, password, members, payments, tags)
- `/admin` — admin and curator workflows (authentication + admin gated)
- `/ipc` — internal worker channel (shared-secret auth)
- `/internal` and `/dev` — development and staging only (QC tooling and the persona-switch harness); never mounted in production

The original events routes (`GET /events`, `GET /events/year/:year`, `GET /events/:eventKey`) remain the canonical example of the route-to-service-to-view shape; their contract is §2.4.

What the events section does:

A visitor can:

- browse upcoming public events
- browse completed public events by year
- open one canonical public event page
- read public results where result rows exist
- still see historical events even when result rows do not exist yet

What the original slice proved (still true of every section):

- the stack works
- public routing works
- page shaping belongs in the service layer
- SQLite read paths work
- Docker parity is real
- the first AWS deployment path is tractable

### 2.4 Route contract and UI contract

The events and health contracts below are the reference example; every public section follows the same route-to-service-to-view shape with service-shaped view models.

#### Event identity

Public event identity uses:

`eventKey` shape: `event_{year}_{event_slug}`

The stored standardized tag includes the leading `#`, but the public route key does not.

Example:

- stored tag: `#event_2025_beaver_open`
- route key: `event_2025_beaver_open`

#### Year archive behavior

`GET /events/year/:year`:

- shows the full selected year
- is not paginated
- includes completed public events for that year
- shows inline grouped results when rows exist
- still shows the event when rows do not exist
- explicitly says when results are not yet available

#### Canonical event page behavior

`GET /events/:eventKey`:

- is the one canonical public event page
- uses one route and one template
- can emphasize details or results through page-model fields
- still renders for historical events with no result rows
- returns 404 for invalid keys, unknown keys, and non-public events

#### Health behavior

- `/health/live` is a cheap process liveness check
- `/health/ready` is a minimal SQLite-readiness check for this stage

### 2.5 Architecture mental model

This is a server-rendered TypeScript application built with:

- Node.js
- Express
- Handlebars
- SQLite
- Docker
- Terraform
- Lightsail
- CloudFront

Think about the code in four layers:

Views
- Handlebars templates
- logic-light

Controllers
- parse request inputs
- call services
- choose status codes
- render templates or return JSON

Services
- own business rules
- validate route keys and year inputs
- shape page-oriented data
- decide visibility rules
- translate temporary DB contention into safe service failures

DB / infrastructure layer
- one SQLite module
- prepared statements prepared once at startup
- transaction helper
- no ORM
- no repository layer

Adapters
- the only seam to external services (`src/adapters/*`)
- AWS SES, KMS-backed JWT signing, S3 media storage, image/video processing, Stripe, Safe Browsing, SSM secrets, CAPTCHA
- swapped between stub/local in development and live/AWS in staging and production
- no AWS or Stripe SDK import lives outside this layer

### 2.6 Repo map

The layered shape is the right mental map. The tree below shows the original events slice; the current `src/` keeps the same layout at much larger scale (about 38 controllers, 83 services, and 11 adapters under `src/adapters/`, plus the admin, member, media, freestyle, clubs, net, and other sections).

.
├─ src/
│  ├─ config/
│  │  ├─ env.ts
│  │  └─ logger.ts
│  ├─ controllers/
│  │  ├─ eventController.ts
│  │  └─ healthController.ts
│  ├─ db/
│  │  ├─ db.ts
│  │  └─ openDatabase.ts
│  ├─ routes/
│  │  ├─ publicRoutes.ts
│  │  └─ healthRoutes.ts
│  ├─ services/
│  │  ├─ eventService.ts
│  │  ├─ operationsPlatformService.ts
│  │  ├─ serviceErrors.ts
│  │  └─ sqliteRetry.ts
│  ├─ views/
│  │  ├─ layouts/
│  │  │  └─ main.hbs
│  │  ├─ events/
│  │  │  ├─ index.hbs
│  │  │  ├─ year.hbs
│  │  │  └─ detail.hbs
│  │  ├─ partials/
│  │  │  └─ result-section.hbs
│  │  └─ errors/
│  │     ├─ not-found.hbs
│  │     └─ unavailable.hbs
│  ├─ public/
│  │  └─ css/
│  │     └─ style.css
│  ├─ app.ts
│  └─ server.ts
├─ database/
│  └─ schema.sql
├─ tests/
│  └─ integration/
│     └─ app.routes.test.ts
├─ scripts/
│  ├─ reset-local-db.sh
│  └─ smoke-local.sh
├─ docker/
│  ├─ web/
│  │  └─ Dockerfile
│  ├─ worker/
│  │  └─ Dockerfile
│  ├─ nginx/
│  │  ├─ nginx.conf.template
│  │  └─ 40-render-nginx-conf.sh
│  ├─ docker-compose.yml
│  └─ docker-compose.prod.yml
├─ ops/
│  └─ systemd/
│     └─ footbag.service
├─ terraform/
│  ├─ shared/
│  ├─ staging/
│  └─ production/
├─ docs/
│  └─ DEV_ONBOARDING.md
├─ .env.example
├─ .gitignore
├─ package.json
└─ tsconfig.json

Important file-level responsibilities:


| File or path                        | Responsibility                                           |
| ----------------------------------- | -------------------------------------------------------- |
| src/app.ts                          | Express app construction, middleware, route registration |
| src/server.ts                       | process startup and shutdown                             |
| src/config/env.ts                   | environment loading and validation                       |
| src/config/logger.ts                | structured logging                                       |
| src/db/db.ts                        | Database queries & SQLite connections / transaction      |
| src/db/openDatabase.ts              | SQLite connection bootstrap and PRAGMAs                  |
| src/services/eventService.ts        | Event and Results business rules and page shaping        |
| src/controllers/eventController.ts | route-to-service render bridge                           |
| src/controllers/healthController.ts | liveness/readiness handlers                              |
| src/routes/publicRoutes.ts          | public route wiring                                      |
| src/views/events/*.hbs              | server-rendered public Handlebars templates              |
| database/schema.sql                  | Schema definition                                        |
| scripts/reset-local-db.sh           | local DB rebuild                                         |
| scripts/smoke-local.sh              | local/container/origin smoke checks                      |
| docker/docker-compose.yml           | base runtime stack                                       |
| docker/docker-compose.prod.yml      | deployment overrides                                     |
| ops/systemd/footbag.service         | production Compose wrapper                               |
| terraform/                          | environment infrastructure definitions                   |

## 3. Path C — Historical bootstrap

### 3.1 Why this section exists

This section is historical and architectural context.

It explains:

- how the initial functionality was originally built
- what order the parts were intended to come together 
- why particular files exist
- how to reason about repo archaeology

It is not the first thing a new contributor should follow today.

### 3.2 Original blank-slate assumptions

The original onboarding guide assumed a technically capable engineer joining the project with:

- a blank Windows machine
- WSL running Ubuntu
- a blank or newly prepared GitHub repository
- a blank AWS account or an account not yet prepared for this project

That framing made sense for the original build-out. It no longer describes the main present-day onboarding entry point, which is why it lives here.

### 3.3 Original implementation order

The original build order was deliberate. In cleaned-up form, it was:

#### Repository skeleton and initial files

- package metadata
- TypeScript config
- .gitignore
- .env.example
- conventional directory layout

#### Package and TypeScript tooling

- Express
- Handlebars
- better-sqlite3
- dotenv
- TypeScript
- tsx
- Vitest
- Supertest

#### Baseline config

- env loading/validation
- logger
- simple script set: dev, build, start, test

#### SQLite bootstrap path

- one DB module
- PRAGMAs
- statement catalog
- transaction helper
- no migration framework prerequisite yet

#### Deterministic seed data

- upcoming public event
- completed public event with results
- completed public event without results
- non-public event that must not leak

#### Host-run local app first

- `src/app.ts`
- `src/server.ts`
- prove the app outside Docker before adding deployment complexity

#### Public read routes

- `GET /events`
- `GET /events/year/:year`
- `GET /events/:eventKey`

#### Handlebars views

- list page
- year page
- canonical event detail page
- no-results handling
- error pages

#### Health endpoints

- `/health/live`
- `/health/ready`

#### Tests and smoke scripts

- integration tests
- local smoke script
- smoke-public script; out of scope for the initial slice

#### Docker parity artifacts

- web image
- worker image
- nginx
- Compose stack
- production overrides

#### Terraform and ops artifacts

- terraform/shared
- terraform/staging
- terraform/production
- ops/systemd/footbag.service

The original guide strongly emphasized the order: do not build giant infrastructure before the app runs locally and in Docker.

#### Historical implementation batches

The original batch plan is still useful as a mental model:

- Batch 1: repository skeleton and toolchain
- Batch 2: app bootstrap
- Batch 3: database bootstrap and seed path
- Batch 4: EventService public read models
- Batch 5: controllers, routes, and templates
- Batch 6: integration tests and smoke scripts
- Batch 7: Docker parity artifacts
- Batch 8: Terraform and ops artifacts

Good historical checkpoints were:

- `npm install` succeeds
- `npm run build` works, even if source is still minimal
- app starts cleanly
- DB resets cleanly
- readiness query works
- route smoke checks pass
- Docker parity works
- Terraform fmt and validate pass

## 4. Path D — AWS staging deployment runbook

### 4.1 Purpose

This path takes a developer who already has the app working locally and gets the current slice deployed to staging safely.

It is deliberately operational, ordered, and explicit.

### 4.2 Preconditions

First, make sure you followed ALL of the steps described in section 1.4: First-time machine install steps.

Do not begin AWS work until every item below is green in the same WSL environment you plan to use for deployment work.

#### Local application gate

These must already work:

```bash
npm test
bash scripts/reset-local-db.sh
npm run dev
```

And you must already have verified in a browser:

- `/events`
- `/events/year/2025`
- `/events/event_2025_beaver_open`
- `/health/live`
- `/health/ready`

If local host-run is not green, AWS will only hide application problems behind more moving parts.

#### Docker gate

The deployed origin is containerized. Prove that shape locally first.

These must already work:

```bash
docker --version
docker compose version
docker compose -f docker/docker-compose.yml up --build
BASE_URL=http://localhost ./scripts/smoke-local.sh
docker compose -f docker/docker-compose.yml down
```

#### Operator tooling gate

These must already work before you start Terraform or SSH bootstrap:

```bash
aws --version
terraform version
ssh -V
rsync --version
```

If `ssh` or `rsync` is missing, install it per section 1.4. If `aws` or `terraform` is missing, install them now.

#### Install the AWS CLI and Terraform

On most x86_64 setups:

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -u awscliv2.zip
sudo ./aws/install
aws --version
```

If `uname -m` reports `aarch64`, use the ARM64 AWS CLI package instead.

Then install Terraform:

```bash
curl -fsSL https://apt.releases.hashicorp.com/gpg | \
  gpg --dearmor | \
  sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null

echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" | \
  sudo tee /etc/apt/sources.list.d/hashicorp.list

sudo apt update
sudo apt install -y terraform
terraform version
```

Verify the version is >= 1.11 (required by this project's `providers.tf`).

#### Credential/profile gate

Before running Terraform or AWS CLI commands, confirm the operator profile works:

```bash
export AWS_PROFILE=footbag-operator
aws sts get-caller-identity
```

If profile setup is not working yet (footbag-operator not found), complete section 4.5 first.

### 4.3 Read this before first apply

This is a first-deploy path, not a mature production platform.

Do not blindly run terraform apply until the pre-apply corrections below are complete.

The fragile parts are:

- first-apply inputs must be honest
- unsupported CloudFront origin assumptions must be removed
- monitoring must be gated to signals that actually exist
- host bootstrap (Docker, /srv/footbag, rsync, init DB, systemd) is manual; see §4.7
- CloudFront maintenance-page behavior is not truly functional yet
- Lightsail static IPs and instances share a single namespace; they cannot
  have the same name simultaneously; `lightsail.tf` uses
  `footbag-staging-web-ip` for the static IP and `footbag-staging-web` for
  the instance; do not make these the same or instance creation will fail
  with "Some names are already in use"

### 4.4 Lightsail SSH security, set your operator CIDRs

`lightsail.tf` restricts port 22 to `var.operator_cidrs`. You must supply real values in `terraform.tfvars` before first apply, never leave this as a placeholder.

Find your current public IP from WSL:

```bash
curl -s https://checkip.amazonaws.com
```

Set the value in `terraform.tfvars`; one `/32` entry per authorized operator:

```hcl
# Single operator
operator_cidrs = ["203.0.113.10/32"]

# Multiple operators
operator_cidrs = [
  "203.0.113.10/32",   # Alice; home
  "198.51.100.42/32",  # Bob; office
]
```

Notes on `operator_cidrs`:

- `/32` means exactly that one IP address. Do not use broader ranges like `/24` unless you control a stable office block.
- Operators on a dynamic home IP must update their entry and re-run `terraform apply` when their IP changes.
- To add or remove an operator: update the list and run `terraform apply`; Terraform replaces only the firewall rule.
- For temporary access from a different location (travel, etc.): add a second entry for that session, apply, then remove it and re-apply when done.

> [!NOTE]
> Some ISPs block outbound port 22 to AWS EC2 IP ranges. If SSH on port 22 times out
> despite the firewall rule being correct, use the Lightsail browser SSH console to
> configure sshd to also listen on port 2222, then use `-p 2222` for all SSH commands.
> `lightsail.tf` opens port 2222 to `operator_cidrs` for this reason.

> [!IMPORTANT]
> The Lightsail firewall is Terraform-managed. Do not change firewall rules in the Lightsail console; console changes are silently overwritten on the next `terraform apply`. To modify SSH access at any point, update `operator_cidrs` in `terraform.tfvars` and run `terraform apply`.

`**terraform.tfvars` must never be committed to git.** The root `.gitignore` already excludes `*.tfvars` while keeping `*.tfvars.example` tracked. Verify this protection is in place before your first apply:

```bash
git check-ignore -v terraform/staging/terraform.tfvars
```

Expected output: a line showing `.gitignore` matched the `*.tfvars` pattern for `terraform/staging/terraform.tfvars` (the exact line number varies as `.gitignore` changes). If that command produces no output, the file is not ignored; stop and fix `.gitignore` before proceeding.

#### 3. CloudFront origin — use DNS, not raw IP, and use the two-pass apply

CloudFront custom origins require a publicly resolvable DNS hostname, not a raw IP address. `cloudfront.tf` uses `var.lightsail_origin_dns` for the origin domain. This creates a chicken-and-egg problem on first deploy because the instance must exist before you can retrieve its DNS name.

The two-pass apply pattern:

- pass 1: set `enable_cloudfront = false` in `terraform.tfvars`, apply; creates Lightsail resources only
- construct the CloudFront origin hostname from the static IP Terraform output
  using nip.io for staging (see section 4.6 step 4); Lightsail does not
  provide public DNS hostnames; `publicDnsName` always returns `None`
- set `lightsail_origin_dns` to that value and `enable_cloudfront = true` in `terraform.tfvars`
- pass 2: apply the full stack including CloudFront

If you skip the two-pass approach and set `enable_cloudfront = true` before the DNS name exists, you will get an unsupported edge-to-origin configuration that may appear to apply successfully but will not work.

#### 4. Bootstrap shared Terraform state and fill real backend values

Change: apply `terraform/shared`, create the remote state bucket, and replace the TODO bucket values in `terraform/staging/backend.tf`.

Why it matters: `terraform/staging` cannot initialize cleanly until the bucket exists and the backend references are real.

If skipped: `terraform init` fails before you even reach plan/apply.

Done looks like:

- `terraform/shared` has been applied successfully
- the state bucket exists with versioning and encryption
- `staging/backend.tf` contains the real bucket name and region
- shared local state has been backed up outside the repo

#### 5. Monitoring gates

Keep `enable_cwagent_alarms = false` and `enable_backup_alarm = false` in `terraform.tfvars` for the first deployment. The `cloudfront_5xx` alarm is gated on `enable_cloudfront` and is created in pass 2 alongside the distribution; it does not exist after pass 1. The CWAgent and backup-age alarms are separately gated because the signals they monitor do not exist yet.

Alarms for signals that do not exist are worse than no alarms; they train the team to ignore monitoring. The backup-age alarm uses `treat_missing_data = "breaching"` and will enter ALARM immediately if enabled before the backup job exists and emits metrics.

#### 6. Confirm current Terraform operational assumptions

Before first apply, also verify these notes still hold in your staging setup:

- use explicit environment directories: `terraform/shared`, `terraform/staging`, `terraform/production`
- S3 backend with `use_lockfile = true` requires Terraform >= 1.11; verify with `terraform version`
- the AWS provider is pinned to `~> 5.0` in `providers.tf`; AWS provider v6.0 was released June 2025 with breaking changes; do not change this pin unless you have explicitly reviewed the v6 migration guide
- `**.tflock` IAM requirement:** when `use_lockfile = true` is active, Terraform writes a `.tflock` object alongside the state file; the operator IAM policy must include `s3:PutObject` and `s3:DeleteObject` on `<bucket>/<key-prefix>*.tflock` or `terraform apply` will fail with `AccessDenied` at lock acquisition

### 4.5 AWS account/bootstrap setup

#### Root account hardening

1. Sign in as the AWS account root user once.
2. Enable MFA on the root account.
3. Do **not** create access keys for the root user.
4. Record root-account recovery ownership and MFA custody according to your team's security practice.
5. Stop using root after this bootstrap step and continue with a named operator identity.

#### Create the first named operator identity

> [!NOTE]
> If IAM Identity Center is already configured for this AWS account, prefer `aws configure sso --profile footbag-operator` over creating long-lived access keys. See the AWS references in section 6.3. Use the steps below only if IAM Identity Center is not yet available.

Use the **AWS Console** to create `footbag-operator`; you have no working CLI credentials yet.

1. Sign in to the AWS Console as root.
2. Go to **IAM → Users → Create user**.
3. Create the user: `footbag-operator`.
4. Enable MFA for that user.
5. Attach `AdministratorAccess` for the bootstrap phase.
6. Create CLI access keys: IAM → Users → footbag-operator → Security credentials → Create access key → choose "CLI" use case.
7. Save the access key ID and secret access key immediately; AWS only shows the secret once.

Configure the local AWS CLI profile:

```bash
aws configure --profile footbag-operator
# Enter: AccessKeyId, SecretAccessKey, region (e.g. us-east-1), output format (json)

export AWS_PROFILE=footbag-operator
aws sts get-caller-identity
```

> [!WARNING]
> This is an intentional bootstrap shortcut, not the desired durable state.
>
> - Scope down `AdministratorAccess` after first successful apply (see Path E, section 5.2).
> - Remove long-lived access keys after first deployment (see Path E, section 5.2).

> [!NOTE]
> `export AWS_PROFILE=footbag-operator` applies only to the current shell session. If you open a new terminal for any later phase, re-run the export before any Terraform or AWS CLI commands. This is a common source of mid-bootstrap failures.

#### Domain and DNS for first deployment

For this runbook, a custom domain is deferred.

The minimum successful deployment uses the default CloudFront `*.cloudfront.net` URL. ACM and Route 53 come later.

#### Bootstrap remote Terraform state

Bootstrap the remote-state bucket before initializing `terraform/staging`. This directory intentionally uses local state because it is the thing that creates the remote backend.

From the repo root:

```bash
cd terraform/shared

cat > terraform.tfvars <<EOF
aws_account_id      = "123456789012"
state_bucket_suffix = "YOUR_UNIQUE_SUFFIX"
EOF

terraform init
terraform validate
terraform apply
```

After the shared apply:

- terraform output -raw terraform_state_bucket_name
- record the real state-bucket name from the Terraform output (format: `footbag-terraform-state-<suffix>`)
- paste that bucket name into `terraform/staging/backend.tf`, replacing the example `footbag-terraform-state-a1b2c3d4e5` bucket value
- back up `terraform/shared/terraform.tfstate` immediately: cp terraform.tfstate ~/footbag-shared-tfstate-backup.json

#### What becomes Terraform-managed after handoff

After bootstrap, Terraform should own:

- Lightsail resources
- static IP resources
- CloudFront resources
- project S3 buckets
- runtime IAM scaffolding
- firewall posture where represented in infra
- logging/alarm resources
- Parameter Store path scaffolding where practical

Human-owned responsibilities remain:

- root credential custody
- MFA device management
- initial secret-value entry
- Terraform execution/review
- SSH key custody
- deployment approvals
- final smoke verification

#### Parameter Store path structure

Parameter Store is optional in this minimum deployment, but if you use it as AWS-side reference storage, use a readable convention:

/footbag/staging/app/...
/footbag/staging/secrets/...
/footbag/production/app/...
/footbag/production/secrets/...

Examples provisioned by `terraform/staging/ssm.tf`:

/footbag/staging/app/port
/footbag/staging/app/log_level
/footbag/staging/app/public_base_url
/footbag/staging/app/db_path

Not yet provisioned (deferred hardening; see Path E, section 5.3):

/footbag/staging/app/node_env
/footbag/staging/secrets/origin_verify_secret

Remember: the running app reads /srv/footbag/env, not SSM.

#### Lightsail runtime identity model

Three identities, distinct scopes, per DD §3.5 and §7.2:

- **`footbag-operator`** is the env-agnostic human AWS/Terraform identity. Used from operator terminals for Terraform plans/applies and AWS CLI work. Do not mount this profile into containers.
- **`footbag-staging-source-profile`** is a staging-scoped IAM user with a single permission: `sts:AssumeRole` on the runtime role below. Its long-lived access keys live on the host at `/root/.aws/credentials` (root-owned, mode 0600), not in `/srv/footbag/env`. This is the "source profile" in DD §7.2. Rotation: at least every 90 days (CIS Benchmark); runbook in `docs/DEVOPS_GUIDE.md` §10.7.
- **`aws_iam_role.app_runtime`** (Terraform resource; IAM role name `footbag-staging-app-runtime`) is the staging-scoped IAM role the running app acts as. It holds the KMS Sign/GetPublicKey, SES SendEmail, SSM read, and S3 snapshot permissions. The app never handles this role's credentials directly. The AWS SDK default chain reads `AWS_PROFILE=footbag-staging-runtime` from `/srv/footbag/env`, looks up `role_arn` + `source_profile` in `/root/.aws/config`, calls `sts:AssumeRole`, and hands the process temporary credentials. This is the assumed runtime role and, per DD §7.2, is the authoritative runtime principal.

Earlier iterations of the public slice served pages from `process.env` plus SQLite only and did not require any runtime AWS API calls. That changed when KMS-backed JWT sessions and SES-backed transactional email were introduced; the assumed-role chain above is how those calls authenticate.

Lightsail has no EC2 instance profile, so credentials cannot be attached to the instance. The source-profile + assumed-role chain is the supported substitute: long-lived keys stay on the host (root-owned, minimum permission), and the temporary credentials the app actually uses are scoped to the runtime role and expire naturally. See Path H (§8) for one-time staging activation.

### 4.6 Terraform staging apply

> **Terraform version:** Terraform >= 1.11 is required. Verify before proceeding:
>
> ```bash
> terraform version
> ```

Use this sequence.

#### 1. Prepare shared state first

> **If `terraform/shared` has already been applied**, skip this step.
> Confirm the state bucket exists and `terraform/staging/backend.tf`
> contains the real bucket name, then proceed to step 2.

```bash
cd terraform/shared
cat > terraform.tfvars <<EOF
aws_account_id      = "YOUR_AWS_ACCOUNT_ID"
state_bucket_suffix = "YOUR_UNIQUE_SUFFIX"
EOF

terraform init
terraform validate
terraform apply
```

Record the state bucket output.

#### 2. Prepare staging values

In `terraform/staging/backend.tf`, replace the placeholder bucket and region values.

In `terraform/staging/terraform.tfvars`, fill at least:

First, print your SSH public key locally:

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy that full single-line public key into `ssh_public_key` below.

```hcl
aws_account_id         = "123456789012"
state_bucket_suffix    = "<same suffix as shared>"
ssh_public_key         = "<contents of ~/.ssh/id_ed25519.pub>"
alarm_email            = "you@example.com"
operator_cidrs         = ["<your-ip>/32"]  # see §4.4 for multi-operator format
# domain_name and route53_zone_id remain empty for test deployment

# Two-pass CloudFront bootstrap — critical for first apply pass:
enable_cloudfront    = false
lightsail_origin_dns = ""

# Monitoring gates — leave false until signals exist:
enable_cwagent_alarms = false
enable_backup_alarm   = false
```

`terraform.tfvars` is excluded from git by `*.tfvars` in `.gitignore`. Never commit this file; it will contain real IP addresses.

#### 3. Initialize and validate

```bash
cd terraform/staging
terraform init
terraform validate
```

#### 3b. Recover orphaned resources (if static IP or key pair already exist in AWS)

If a previous partial apply created resources in AWS that are not in Terraform state, import them before running plan/apply. Skipping this step causes instance creation to fail with "Some names are already in use".

Check for orphaned resources:

```bash
aws lightsail get-static-ips --profile footbag-operator
aws lightsail get-key-pairs --profile footbag-operator
terraform state list | grep lightsail
```

If any Lightsail resources appear in the AWS output but not in `terraform state list`, import them:

```bash
terraform import aws_lightsail_static_ip.web footbag-staging-web-ip
terraform import aws_lightsail_key_pair.operator footbag-staging-operator
```

Then proceed to step 4.

#### 4. First apply pass for Lightsail, if needed

With `enable_cloudfront = false` set in `terraform.tfvars`, the first apply creates Lightsail resources only. After it completes, construct the CloudFront origin hostname from the static IP. Lightsail does not provide public DNS hostnames; unlike EC2, the `publicDnsName` API field always returns `None`. Instead, construct a resolvable hostname using nip.io:

```bash
STATIC_IP=$(terraform output -raw lightsail_static_ip)
echo "${STATIC_IP}.nip.io"
```

Set the output value as `lightsail_origin_dns` in `terraform.tfvars`:

```hcl
lightsail_origin_dns = "203.0.113.20.nip.io"   # <static-ip>.nip.io resolves to that IP; use the temporary IP Lightsail is handing out
enable_cloudfront    = true
```

For production, replace nip.io with a real DNS A record pointing to the static IP (e.g. `origin.staging.footbag.org`). Do not use nip.io in production.

Then proceed to step 5.

#### 5. Full plan and review

```bash
terraform plan -out=tfplan
```

Review the plan carefully. Confirm:

- Lightsail and static IP are being created
- port 22 uses `operator_cidrs`, not `0.0.0.0/0`
- CloudFront is using DNS, not raw IP
- gated alarms are not being created
- the CloudFront 5xx alarm is being created
- no fake `user_data` bootstrap exists

#### 6. Apply

```bash
terraform apply tfplan
```

#### 7. Record outputs immediately

Capture and keep these in operator notes:

```bash
terraform output lightsail_static_ip
terraform output lightsail_instance_name
terraform output cloudfront_domain
terraform output cloudfront_distribution_id
terraform output snapshots_bucket_name
terraform output dr_bucket_name
terraform output maintenance_bucket_name
terraform output kms_key_arn
terraform output alarm_topic_arn
```

`lightsail_static_ip` is used to construct the nip.io origin hostname for the two-pass CloudFront setup (see step 4).

#### 8. Confirm the alarm subscription (and CloudFront status optionally)

- confirm the SNS email subscription: open the inbox configured as `alarm_email` in `terraform.tfvars` and click the confirmation link AWS sent.

CloudFront status check: N/A; CloudFront doesn't exist yet (enable_cloudfront = false). 
But if it does exist when you are reading this doc, then:
- wait for the CloudFront distribution status to show `Deployed` before you test through the edge; CloudFront takes **15–30 minutes** to propagate globally after apply; the `*.cloudfront.net` URL is assigned immediately but returns errors during propagation

```bash
CF_ID=$(terraform output -raw cloudfront_distribution_id)
aws cloudfront get-distribution \
  --id "$CF_ID" \
  --query 'Distribution.Status' \
  --output text \
  --profile footbag-operator
```

> [!NOTE]
> After this apply the Lightsail origin still accepts direct HTTP on port 80 from the public internet. CloudFront is the intended entry point, but direct-origin bypass protection is not yet implemented. Do not treat this deployment as CloudFront-locked until Path E section 5.3 is complete.

### 4.7 Host bootstrap

Once infra exists, bootstrap the host in this order.

#### 1. First SSH login and real operator account

First login:

> [!NOTE]
> If port 2222 times out on first attempt, sshd has not yet been configured to listen
> on it. Use the Lightsail browser SSH console (AWS Console → Lightsail →
> footbag-staging-web → Connect) to log in as `ec2-user`, then run:
> `printf 'Port 22\nPort 2222\n' | sudo tee -a /etc/ssh/sshd_config >/dev/null && sudo systemctl reload sshd`
> Then retry the SSH command below.

ec2-user is only used on first login, from then on, the user name will be footbag.

```bash
LIGHTSAIL_IP=$(terraform output -raw lightsail_static_ip)
ssh -i ~/.ssh/id_ed25519 -p 2222 ec2-user@$LIGHTSAIL_IP
```

Immediately create your named operator account:

```bash
sudo useradd -m -G wheel footbag
sudo mkdir -p /home/footbag/.ssh
sudo bash -c 'echo "<your SSH public key>" > /home/footbag/.ssh/authorized_keys'
sudo chown -R footbag:footbag /home/footbag/.ssh
sudo chmod 700 /home/footbag/.ssh
sudo chmod 600 /home/footbag/.ssh/authorized_keys
```

> **Note:** Do not use `tee <<< "..."` for authorized_keys on Amazon Linux 2023. The here-string wraps long keys across two lines, breaking SSH auth silently. Use `sudo bash -c 'echo "..." > file'` instead.

Still as `ec2-user`, set a password for the footbag account (required for sudo):

```bash
sudo passwd footbag
```

Store this password in your credentials vault (KeePassXC).

Then verify in a new terminal:

```bash
ssh -i ~/.ssh/id_ed25519 -p 2222 footbag@$LIGHTSAIL_IP
sudo whoami
```

`sudo whoami` must return `root` before you stop using `ec2-user`.

> [!IMPORTANT]
> The Lightsail firewall is Terraform-managed via `operator_cidrs`. Do not use the Lightsail console to modify firewall rules; console changes are silently overwritten on the next `terraform apply`. To update SSH access at any point, modify `operator_cidrs` in `terraform.tfvars` and run `terraform apply`.

#### 2. Install Docker and required packages

On the host:

```bash
# Docker engine — from AL2023 native repos (moby-engine)
sudo dnf install -y docker sqlite

# Docker Compose plugin — not in AL2023 native repos; install binary from Docker GitHub
sudo mkdir -p /usr/local/lib/docker/cli-plugins
COMPOSE_VER=$(curl -s https://api.github.com/repos/docker/compose/releases/latest \
  | grep -oP '"tag_name": "\K[^"]+')
sudo curl -SL \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

sudo systemctl enable --now docker
sudo usermod -aG docker footbag
```

Log out and back in so group membership takes effect.

Verify:

```bash
docker --version
docker compose version
sqlite3 --version
```

All three must return version strings.

> [!IMPORTANT]
> Do not use the Docker CE RHEL repo (`download.docker.com/linux/rhel`) on Amazon Linux 2023. AL2023 reports a version string of `2023.x.x` which matches no RHEL repo path and returns 404. Use the AL2023 native `docker` package and install the Compose plugin as a standalone binary as shown above.

#### 3. Prepare /srv/footbag and the live env file

```bash
sudo mkdir -p /srv/footbag
SESSION_SECRET_VAL=$(openssl rand -hex 32)
INTERNAL_EVENT_SECRET_VAL=$(openssl rand -hex 32)
sudo tee /srv/footbag/env > /dev/null <<EOF
NODE_ENV=production
LOG_LEVEL=info
FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db
FOOTBAG_DB_DIR=/srv/footbag/db
PUBLIC_BASE_URL=https://<cloudfront_domain from terraform output>
SESSION_SECRET=${SESSION_SECRET_VAL}
INTERNAL_EVENT_SECRET=${INTERNAL_EVENT_SECRET_VAL}
EOF
unset SESSION_SECRET_VAL INTERNAL_EVENT_SECRET_VAL
sudo chown root:root /srv/footbag/env
sudo chmod 600 /srv/footbag/env
```

`INTERNAL_EVENT_SECRET` (web↔worker IPC auth) is required at every boot; the deploy also auto-seeds it into `/srv/footbag/env` when absent, so a deploy-first flow does not need it set by hand, but a manual `systemctl start` before the first deploy does. `SESSION_SECRET` must be generated fresh per environment. The deploy script and the application both reject values shorter than 32 characters or containing the literal placeholder substring `changeme`. Never reuse the value across staging and production.

Required values in this minimum deployment:

- `NODE_ENV`
- `LOG_LEVEL`
- `FOOTBAG_DB_PATH`
- `FOOTBAG_DB_DIR`
- `PUBLIC_BASE_URL`
- `SESSION_SECRET`
- `INTERNAL_EVENT_SECRET`

Do not add runtime AWS credentials here. They are provisioned separately via Path H (§8) and live under `/root/.aws` on the host, not in `/srv/footbag/env`.

If you mirror values into Parameter Store for reference, keep the same values under the `/footbag/staging/app/...` path structure, but remember `/srv/footbag/env` is the live runtime source of truth.

#### 4. Copy application files

From your local machine: use footbag@203.0.113.20 
Note that 203.0.113.20.nip.io maps to 203.0.113.20 for DNS (use temp IP lightsail is handing out)

```bash
rsync -av --delete -e "ssh -p 2222" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.terraform \
  --exclude=legacy_data \
  --exclude=terraform \
  --exclude=tests \
  --exclude=docs \
  --exclude=ifpa \
  --exclude=.claude \
  --exclude=aws \
  --exclude=coverage \
  --exclude=.env \
  --exclude='.env.*' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  ./ footbag@203.0.113.20:~/footbag-release/
```

> Adjust `-p 2222` to match your configured SSH port if different.

Then on the host:

```bash
sudo rsync -a --delete ~/footbag-release/ /srv/footbag/
sudo chown -R root:root /srv/footbag
```

> [!IMPORTANT]
> Promote from a user-owned staging path into `/srv/footbag`. Do not copy directly into the root-owned runtime path from your laptop.

#### 5. Initialize the database

On first deploy only:

```bash
sudo sqlite3 /srv/footbag/db/footbag.db < /srv/footbag/database/schema.sql
```

To load seed data (run the seed pipeline from the repo root):

```bash
bash scripts/reset-local-db.sh
```

Then lock down the DB file:

```bash
sudo chown root:root /srv/footbag/db/footbag.db
sudo chmod 600 /srv/footbag/db/footbag.db
```

On later deploys, reuse the existing DB file.

> [!NOTE]
> **Runtime user note:**
>
> The web container runs as root and the bind-mounted directory `/srv/footbag/db` is root-owned, so the SQLite main file and its WAL/SHM sidecars are writable as deployed. If you later add a non-root `USER` to the Dockerfile, update host ownership and modes on `/srv/footbag/` and `/srv/footbag/db/` to match.

#### 6. Install and verify footbag.service

Required `footbag.service` contract:

- `After=docker.service`
- `Requires=docker.service`
- `WorkingDirectory=/srv/footbag`
- `EnvironmentFile=/srv/footbag/env`
- starts with `docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up --detach --remove-orphans --no-build` (`--no-build`: images are pre-built on the workstation and loaded onto the host, never built at boot)
- stops with the matching `docker compose ... down`

### 4.8 Deploy and start application

On the host:

```bash
cd /srv/footbag
# Images are built on the operator workstation and shipped to the host via
# `docker save | ssh | docker load`; the host is too small to build them and a
# boot-time build OOMs it. See DEVOPS_GUIDE §13.1 for the build-and-ship step,
# which must run before the service starts.
sudo cp ops/systemd/footbag.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now footbag
sudo systemctl status footbag
```

The systemd service starts the stack with `up --detach --remove-orphans --no-build` (matching the actual `footbag.service` file); it never builds at boot.

Expected behavior:

- `footbag.service` may show `active (exited)` if it is a `Type=oneshot` unit with `RemainAfterExit=yes`
- nginx and web containers should be running
- the worker container should be running (not exited): it is a long-running process that drains the email outbox and runs the scheduled daily jobs (`restart: unless-stopped`)
- the worker should be running steadily, not restart-looping

Useful checks:

```bash
docker ps
docker compose \
  -f /srv/footbag/docker/docker-compose.yml \
  -f /srv/footbag/docker/docker-compose.prod.yml \
  logs web --tail=20
sudo systemctl restart footbag
sudo systemctl status footbag
```

> [!NOTE]
> During `compose up`, Compose may warn that PUBLIC_BASE_URL is unset. That is expected. The variable is needed at container start time, and systemd supplies it from /srv/footbag/env.

On later deploys (after the first):

```bash
cd /srv/footbag
# Load the freshly-shipped images first (DEVOPS_GUIDE §13.1), then restart:
sudo systemctl restart footbag
```

### 4.9 Verification

#### 1. Verify the origin directly

In a browser: http://203.0.113.20/events (or whatever temp IP lightsail is handing out)

ALso: Use the local smoke script against the Lightsail host on port 80:

```bash
BASE_URL=http://$LIGHTSAIL_IP ./scripts/smoke-local.sh
```

All documented checks must pass.

Also confirm manually:

- `/health/live`
- `/health/ready`
- `/events`
- `/events/year/2025`

#### 2. Verify through CloudFront

Only after distribution status is `Deployed`:

```bash
CF_DOMAIN=$(terraform output -raw cloudfront_domain)
BASE_URL=https://$CF_DOMAIN ./scripts/smoke-local.sh
```

Then do a manual browser pass:

- `https://<cloudfront_domain>/events`
- `https://<cloudfront_domain>/events/year/2025`
- `https://<cloudfront_domain>/events/event_2025_beaver_open`
- `https://<cloudfront_domain>/events/event_2026_spring_classic`
- `https://<cloudfront_domain>/events/event_9999_does_not_exist`

Also expect the smoke script to cover these routes:

- `GET /health/live` → 200
- `GET /health/ready` → 200
- `GET /events` → 200
- `GET /events/year/2025` → 200
- `GET /events/year/1899` → 200
- `GET /events/event_2026_draft_event` → 404
- `GET /events/event_9999_does_not_exist` → 404
- `GET /events/not-a-valid-key` → 404

Expected outcomes:

- health endpoints succeed
- `/events` renders normally
- `/events/year/2025` renders normally
- browser styling looks normal
- no stack traces or internal details leak

If CloudFront returns 403 or 502:

- the distribution may still be propagating
- the origin domain may not be resolving correctly
- wait a few minutes and retry
- if the problem persists, inspect the CloudFront origin settings and confirm the configured DNS name resolves to the Lightsail IP

### 4.10 Optional: enable Safe Browsing live mode

Deploys land with `SAFE_BROWSING_ADAPTER=stub` by default; submitted external URLs pass scheme + SSRF + reachability checks but no Google call is made. Enabling live mode requires a Google Cloud project with the Safe Browsing v4 API and an operator-provisioned API key. The runbook below covers a one-time bootstrap; rotation lives in DEVOPS_GUIDE §10.10.

#### Prerequisites

- §4.6 has run (Terraform creates the SSM SecureString shell with a TODO placeholder under `/footbag/<env>/secrets/safe_browsing_api_key`).
- §4.8 has succeeded (first deploy is healthy with stub Safe Browsing).
- Operator workstation has the AWS CLI configured with the staging assumed-role profile.

#### Procedure

1. Sign in at `console.cloud.google.com` with the operator Google account. Create a new project (suggested name `footbag-staging` for staging, `footbag-production` for production); note the project ID.
2. Enable the Safe Browsing API: APIs & Services → Library → search "Safe Browsing API" → Enable. Free tier is 10,000 lookups per day.
3. Generate the API key: APIs & Services → Credentials → Create Credentials → API key.
3a. Persist the canonical operator copy in KeePassXC (or equivalent encrypted-at-rest password manager). Encrypted at rest, no plaintext on disk. The local copy is for recovery and recreating the put-parameter call if SSM is wiped or another environment is later provisioned with the same key. SSM remains the runtime source of truth.
3b. Copy the value to a temp file with restrictive mode for the put-parameter call:
   ```
   printf %s '<paste-key>' > /tmp/sb-key && chmod 600 /tmp/sb-key
   ```
4. (Optional) Restrict the key. API restrictions: select "Safe Browsing API" only. Application restrictions: leave "None" at first; the smoke test runs from the operator workstation, so any IP allowlist must include both the staging Lightsail IP and the operator workstation IP.
5. Put the value into SSM with shell-history-safe hygiene per DEVOPS_GUIDE §10.4:
   ```
   AWS_PROFILE=footbag-staging-runtime aws ssm put-parameter \
     --name /footbag/staging/secrets/safe_browsing_api_key \
     --value "file:///tmp/sb-key" \
     --type SecureString \
     --key-id alias/footbag-staging \
     --overwrite
   ```
   For production, swap `staging` → `production` in both the profile and the parameter path.
6. Remove the temp file:
   ```
   shred -u /tmp/sb-key
   ```
7. SSH to the target host and flip the adapter to live:
   ```
   sudo sed -i 's/^SAFE_BROWSING_ADAPTER=stub/SAFE_BROWSING_ADAPTER=live/' /srv/footbag/env
   ```
8. Redeploy via the entry-point script:
   ```
   DEPLOY_TARGET=footbag-staging ./deploy_to_aws.sh
   ```
   The deploy preserves the operator's `SAFE_BROWSING_ADAPTER=live` line.

#### Verification

- From the operator workstation:
  ```
  npm run test:smoke
  ```
  All three `safe-browsing.smoke.test.ts` cases pass (key non-placeholder; benign URL returns safe; canonical Google malware-test URL matches). Failure here means step 5 did not land or the GCP project does not have Safe Browsing API enabled.
- Submit a known-malware URL through any external-link form. Validation rejects with the user-facing message "This URL is not allowed."

## 5. Path E — From first success to the repeatable staging baseline

### 5.1 Why this section exists

After the first successful AWS deployment, the project sits in an in-between state: no longer bootstrap-only, but not yet durably hardened.

Path F is now the complete repeatable staging deploy workflow.

Path G covers the production-readiness hardening that follows once the deploy baseline is established.

### 5.2 What is complete now

At this point, the project has a working staging origin, a host runtime layout, a repeatable service wrapper, three deploy scripts in the repo, and an initial GitHub Actions CI baseline.

In practical terms, the team can now do both of the following:

- deploy routine code changes while preserving the live staging DB
- deploy schema/dev-data changes by rebuilding and replacing the staging DB from scratch

### 5.3 Path E baseline boundaries

The Path E staging baseline operates within these boundaries; each item is provisioned by the path or section noted.

- `/srv/footbag/env` is operator-managed; the deploy remote-half reconciles `X_ORIGIN_VERIFY_SECRET` and `FOOTBAG_ENV` on every run (design state of staging)
- images are built on the operator workstation and shipped via `docker save | docker load`
- staging data is disposable through `scripts/deploy-rebuild.sh`; production schema migrations preserve live data per `docs/DEVOPS_GUIDE.md` §15.3
- public-edge hardening (Path G §7.2), durable backup/restore (Path G §7.4), and CloudWatch monitoring (Path G §7.6) are provisioned by Path G

### 5.4 Where the remaining work moved

Use Path F for the operational staging deploy workflow.

Use Path G for the production-readiness hardening roadmap that completes before production cutover.

## 6. Path F — Repeatable staging deploy workflow

### 6.1 Who this path is for

Use this path when the initial AWS bootstrap is complete (Path D done), the host runtime layout is healthy, and you need the complete repeatable staging deploy workflow.

**Do not use this path to recover a broken host bootstrap.** If `/srv/footbag/env`, the service unit, or the `/srv/footbag` layout is missing or broken, recover the host using §4.7 and §4.8 first.

Path F is the routine staging deploy workflow. Production-readiness hardening lives in Path G.

Current state entering this path:

- the staging host exists and is reachable
- `footbag.service` is installed and used as the runtime entry point
- `/srv/footbag/env` remains the live runtime source of truth
- `scripts/deploy-code.sh` exists for routine code-only deploys
- `scripts/deploy-rebuild.sh` exists for destructive staging/dev deploys that rebuild and replace the host DB from scratch
- `scripts/deploy-migrate.sh` exists as a stub for future non-destructive schema migrations
- initial GitHub Actions CI exists
- production-readiness hardening lives in Path G, not here

### 6.1A Claude Code Plan Mode for iteration

Use Plan Mode before editing when the task is primarily planning-heavy or the implementation is not yet obvious.

Use Plan Mode when:

- the change touches multiple files or layers
- you need to inspect route/service/db/test dependencies first
- you are planning legacy-data migration, member import, account-claim, or password-reset work
- you are doing refactor planning, sequencing analysis, or "what should we build next?" work

Skip Plan Mode when the change is small, obvious, and describable in one sentence.

How to use it:

- In an active Claude Code session, press `Shift+Tab` until `plan mode on` appears.
- Or type `/plan mode` in the Claude Code prompt.

Recommended prompt pattern for this repo:

- Tell Claude to read `CLAUDE.md`, the nearest local `CLAUDE.md`, and the likely touched code and tests first.
- Tell Claude current code is the source of truth for implemented behavior.
- Tell Claude not to use browser automation unless explicitly asked.
- Ask Claude to return: baseline observed, files likely to change, dependencies or prerequisites, risks and tradeoffs, verification plan, and recommended implementation order.

After the plan is reviewed, switch back to normal mode to implement.

### 6.2 Fix the SSH config alias

The `~/.ssh/config` entry for `footbag-staging` was created during bootstrap with `User ec2-user`. Update it to `User footbag` before using the deploy script:

```
Host footbag-staging
  Hostname 203.0.113.20
  Port 2222
  User footbag
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Verify:

```bash
ssh footbag-staging "whoami"
```

Expected output: `footbag`.

### 6.3 Deploy scripts and what they do

Do not inline deploy script bodies in this guide. The executable source of truth lives in `scripts/`. This section explains what each script does, what commands it runs, and why.

#### Which script to use

Use `scripts/deploy-code.sh` for routine code-only deploys. This is the normal path when the code changes but the live staging database should stay in place. This script has no database logic of any kind. It preserves `/srv/footbag/env` and the live DB on every run.

Use `scripts/deploy-rebuild.sh` for schema-changing or seed-data-changing staging/dev deploys when staging data is disposable. This script is intentionally destructive. It preserves `/srv/footbag/env` but destroys and replaces the live DB from a freshly rebuilt local `database/footbag.db`.

Use `scripts/deploy-migrate.sh` for non-destructive schema or data changes against a live DB that must be preserved. This script is not yet implemented. It exits with an error if run. Implement it once the backup/restore path (Path G §7.4) is tested and the project requires non-destructive migrations.

Do not teach manual `scp` + `ssh cp` database replacement as the normal workflow. The destructive staging/dev DB-replacement path is handled by `scripts/deploy-rebuild.sh`.

Why both code-deploy and rebuild scripts build on the operator workstation, not on the host: the host (nano_3_0, 512 MB) cannot fit a parallel `docker compose build`. Scripts build locally and transfer images via `docker save | docker load`.

#### What `scripts/deploy-code.sh` does, command by command, and why

1. Resolves the SSH alias target with `ssh -G` and extracts the hostname.
   Why: show the operator exactly which host is being targeted.

2. Confirms connectivity with `ssh <target> "echo ..."`.
   Why: fail fast before any upload starts.

3. Deletes and recreates the temporary upload directory with `rm -rf ~/footbag-release && mkdir -p ~/footbag-release`.
   Why: each deploy starts from a clean user-owned staging directory.

4. Uploads a restricted allowlist of deployable files with `rsync -av --delete -e "ssh" ...`.
   Why: push only runtime-relevant code files. The database directory is not in the allowlist.

5. Promotes the staged release into `/srv/footbag` with `sudo rsync -a --delete --exclude env --exclude footbag.db`.
   Why: update the runtime tree without overwriting the host env file or the live DB. The live DB is protected at both the upload and the promote step.

6. Resets ownership under `/srv/footbag` with `chown -R root:root`.
   Why: align the deployed tree with the documented root-owned host runtime model.

7. Reinstalls `ops/systemd/footbag.service` and runs `systemctl daemon-reload`.
   Why: keep the installed unit aligned with repo changes.

8. Builds images on the operator workstation with `docker compose -f docker/docker-compose.yml build`, then ships them via `docker save docker-web docker-worker | ssh REMOTE 'sudo -S -p "" docker load'`.
   Why: the host (nano_3_0) cannot fit a parallel docker build. The systemd unit's `ExecStart` uses `--no-build`; restart loads the just-shipped images.

9. Restarts `footbag` and checks service status.
   Why: the deploy is not complete until the runtime actually restarts.

10. Runs `BASE_URL=http://<origin-ip> bash scripts/smoke-local.sh` from the local machine.
    Why: verify the origin contract, not just container startup.

#### What `scripts/deploy-rebuild.sh` does, command by command, and why

1. Prints a loud destructive warning before doing anything else.
   Why: this script always replaces the host DB.

2. Confirms SSH connectivity.
   Why: fail fast before any destructive remote action.

3. Runs the local test preflight unless `SKIP_TESTS=yes` is set.
   Why: avoid shipping obviously broken code.

4. Rebuilds the local DB with `bash scripts/reset-local-db.sh` unless `SKIP_DB_REBUILD=yes` is set.
   Why: produce the replacement DB from the current schema and seed pipeline.

5. Verifies the rebuilt local DB with `sqlite3` integrity checks.
   Why: fail locally before anything is uploaded.

6. Confirms that required schema objects exist, including `legacy_person_club_affiliations`.
   Why: make sure the rebuilt DB matches the code being deployed.

7. Prepares the remote upload directory and uploads the deployable runtime files, including the rebuilt DB.
   Why: stage both code and replacement data together.

8. Reads `/srv/footbag/env` on the host, validates required runtime vars, and resolves `FOOTBAG_DB_PATH`.
   Why: the host env file remains the runtime source of truth.

9. Rejects `SESSION_SECRET` values containing `#`.
   Why: systemd `EnvironmentFile` parsing treats `#` as an inline comment delimiter.

10. Stops `footbag` and brings the compose stack fully down.
    Why: avoid conflicts while replacing the DB file and runtime tree.

11. Promotes the new release into `/srv/footbag` while preserving `/srv/footbag/env`.
    Why: align code and runtime artifacts with the rebuilt DB.

12. Removes the current DB path and installs the rebuilt DB as a fresh root-owned file.
    Why: avoid bad leftover host-path states and make the destructive replacement explicit.

13. Verifies the copied DB again on the host with `sqlite3`.
    Why: confirm the exact host-mounted DB is valid before restart.

14. Builds images on the operator workstation, ships them via `docker save | ssh sudo docker load`, reinstalls the systemd unit, and restarts `footbag` (whose `ExecStart` uses `--no-build` to load the just-shipped images).
    Why: finish the deploy the same way the routine path does, without ever invoking `docker build` on the host.

15. Dumps `systemctl`, `journalctl`, and compose diagnostics automatically if restart fails.
    Why: destructive deploy failures must surface actionable diagnostics immediately.

16. Runs the smoke check against the staging origin.
    Why: the deployment is only finished when the runtime contract is working.

#### What `scripts/deploy-migrate.sh` will do (not yet implemented)

This script will deploy code changes and run migration SQL against the existing live DB. Non-destructive: all existing live data is preserved. New schema objects, backfills, and additive data changes are applied in place.

It becomes the active schema/data-change deploy path once the project reaches the point where host data must be preserved. Until then, use `scripts/deploy-rebuild.sh`.

Planned sequence: backup the live DB, deploy code, stop the service, run migration SQL with `sqlite3`, verify DB integrity, restart, smoke check. On any failure: restore from the pre-migration backup and restart.

Do not implement this script until the backup/restore path (Path G §7.4) is tested and a working restore has been rehearsed in staging.

The point of this section is not to duplicate shell source. The point is to explain the exact operational sequence so a contributor understands what the scripts do and why the three deploy paths are different.


### 6.4 Routine deploy workflow

Routine deploys are operational and live in `docs/DEVOPS_GUIDE.md` §13.3 (standard deployment runbook). Schema migrations against non-disposable data live in §15.3.

### 6.5 If something goes wrong on staging

Deploy troubleshooting lives in `docs/DEVOPS_GUIDE.md`: §13.4 (rollback), §13.5 (restart), and §5.6 (standard log-collection commands).

---

## 7. Path G — Production-readiness hardening

### 7.1 Why this section exists

Path G covers the operational hardening that must complete before production cutover: public-edge security (§7.2), GitHub and operator access governance (§7.3), durable backup and restore (§7.4), runtime configuration maturity (§7.5), monitoring and alerting (§7.6). Each subsection is a pre-production blocker, not optional follow-up.

### 7.2 Public edge and delivery hardening

If CloudFront pass 2 is not already complete, finish it here rather than treating it as part of the routine deploy path.

#### Prerequisites

- `export AWS_PROFILE=footbag-operator` in your terminal
- SSH alias `footbag-staging` working (`ssh footbag-staging` connects on port 2222)
- `npm test` and `npm run build` passing locally

#### Phase A: Deploy code to staging host first

The nginx config must land before CloudFront is enabled. CloudFront strips `X-Forwarded-Proto` from origin requests but sends `CloudFront-Forwarded-Proto` instead. The `map` directive in `docker/nginx/nginx.conf.template` (rendered into `/etc/nginx/nginx.conf` at container startup by `40-render-nginx-conf.sh`) translates this to `X-Forwarded-Proto` so the app sets the session cookie `Secure` flag correctly. Without this, login cookies would lack the `Secure` flag when accessed through CloudFront. When accessed directly (no CloudFront header), the map falls back to `$scheme`.

```bash
bash deploy_to_aws.sh -k
```

Verify the site still works via direct IP:

```bash
curl -I http://203.0.113.20/
curl -I http://203.0.113.20/health/ready
```

Both should return 200.

#### Phase B: Enable CloudFront on staging

1. In `terraform/staging/terraform.tfvars`, set:
   - `lightsail_origin_dns = "203.0.113.20.nip.io"`
   - `enable_cloudfront = true`

2. Plan and review:

```bash
cd terraform/staging
terraform plan -out=tfplan
```

Expect: 2 resources to add (`aws_cloudfront_distribution.main[0]` and `aws_cloudwatch_metric_alarm.cloudfront_5xx[0]`), 0 to change, 0 to destroy. The dashboard resource will show as changed (it picks up the new distribution ID in its widget JSON).

3. Apply:

```bash
terraform apply tfplan
terraform output cloudfront_domain
terraform output cloudfront_distribution_id
```

Save both outputs. The domain will be something like `d1234abcdef8.cloudfront.net`.

4. Wait for CloudFront to deploy (15 to 30 minutes):

```bash
CF_ID=$(terraform output -raw cloudfront_distribution_id)
aws cloudfront get-distribution \
  --id "$CF_ID" \
  --query 'Distribution.Status' \
  --output text
```

Repeat until it returns `Deployed`.

#### Phase C: Update host config

SSH to staging and update `PUBLIC_BASE_URL` to the CloudFront domain:

```bash
ssh footbag-staging
sudo sed -i 's|PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://<cloudfront-domain>|' /srv/footbag/env
sudo systemctl restart footbag
```

Verify containers came back:

```bash
docker ps
curl -s http://localhost/health/ready | head
```

Then exit the SSH session.

#### Phase D: Smoke test through CloudFront

Replace `<cf>` with the actual CloudFront domain in all commands below.

**D1. Automated smoke check:**

```bash
BASE_URL=https://<cf> bash scripts/smoke-local.sh
```

All checks should pass.

**D2. Static asset caching:**

```bash
curl -I https://<cf>/css/style.css
curl -I https://<cf>/js/clubs-map.js
curl -I https://<cf>/img/world-map.svg
```

Expect 200 with `X-Cache` header. On repeat requests, `Age` header should increase (assets cache for up to 1 day).

**D3. Health endpoint (no caching):**

```bash
curl -I https://<cf>/health/ready
```

`Age` header should always be 0 or absent (`/health/*` TTL is 0).

**D4. Browser tests (manual):**

Open `https://<cf>/` in a browser.

1. Navigate public pages (home, events, clubs, players). Confirm pages render correctly.
2. Go to `/login`. Log in with the test account. Confirm:
   - Login POST succeeds (not 405 or 403)
   - Redirect lands on the member dashboard
   - In browser dev tools, the `footbag_session` cookie has the `Secure` flag set
3. Test `returnTo`: visit `/login?returnTo=/members/footbag_hacky`. After login, confirm redirect goes to the profile page.
4. Test avatar: go to profile edit, upload an avatar. Confirm it saves and displays.
5. Log out. Confirm logout POST works and session clears.

**D5. Verify direct IP still works:**

```bash
curl -I http://203.0.113.20/
```

Should still return 200. Direct access is not blocked until 1-F (X-Origin-Verify).

#### Phase E: Update local records

Update local operator notes to reflect the new state:

- Updated tfvars values (`enable_cloudfront = true`, `lightsail_origin_dns`)
- `aws_cloudfront_distribution.main` now in Terraform state
- Outputs `cloudfront_domain` and `cloudfront_distribution_id` populated
- Staging CloudFront status is ACTIVE with the published domain
- Deployment checklist: CloudFront pass 2 is complete

#### Rollback

If anything breaks, disable CloudFront and revert the host config:

```bash
# Edit terraform/staging/terraform.tfvars: set enable_cloudfront = false
cd terraform/staging
terraform plan -out=tfplan
terraform apply tfplan
```

Then revert PUBLIC_BASE_URL on the host:

```bash
ssh footbag-staging
sudo sed -i 's|PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=http://203.0.113.20|' /srv/footbag/env
sudo systemctl restart footbag
```

#### Remaining public-edge hardening (after CloudFront exists)

After CloudFront is active and validated, three operations close the public-edge posture: attach the custom domain, enforce origin-bypass protection, and provision the maintenance page. They are independent of each other; attach them in the order below so that the maintenance page can use the final custom domain. Until all three land, do not rely on the maintenance page as a graceful-downtime path and expect direct-to-origin traffic to reach the host.

##### Attach custom domain (ACM + Route 53)

Prerequisites:

- The project's canonical domain is owned in Route 53 (or at least has a Route 53 hosted zone that can serve as the authoritative DNS for it).
- `var.domain_name` and `var.route53_zone_id` are populated in `terraform/staging/terraform.tfvars`.

1. Uncomment the ACM resources in `terraform/staging/acm.tf` (all three: `aws_acm_certificate.main`, `aws_route53_record.acm_validation`, `aws_acm_certificate_validation.main`).

2. Uncomment the Route 53 records in `terraform/staging/route53.tf` (`apex_a`, `apex_aaaa`, `www_a`).

3. In `terraform/staging/cloudfront.tf`:
   - Uncomment the `aliases` line on `aws_cloudfront_distribution.main`.
   - Replace the `viewer_certificate { cloudfront_default_certificate = true }` block with:

     ```hcl
     viewer_certificate {
       acm_certificate_arn      = aws_acm_certificate_validation.main.certificate_arn
       ssl_support_method       = "sni-only"
       minimum_protocol_version = "TLSv1.2_2021"
     }
     ```

4. Plan and review:

   ```bash
   cd terraform/staging
   terraform plan -out=tfplan
   ```

   Expect: one ACM certificate, its DNS validation records (one per name), one `aws_acm_certificate_validation`, three Route 53 alias records (apex A, apex AAAA, www A), and one change on `aws_cloudfront_distribution.main` (viewer_certificate + aliases).

5. Apply:

   ```bash
   terraform apply tfplan
   ```

   Certificate validation takes 1 to 5 minutes; `terraform apply` blocks on `aws_acm_certificate_validation.main` until DNS propagation succeeds.

6. Wait for CloudFront to redeploy (15 to 30 minutes):

   ```bash
   CF_ID=$(terraform output -raw cloudfront_distribution_id)
   aws cloudfront get-distribution --id "$CF_ID" --query 'Distribution.Status' --output text
   ```

7. Validate DNS resolution and TLS:

   ```bash
   dig +short <domain>
   dig +short www.<domain>
   curl -I https://<domain>/health/ready
   curl -I https://www.<domain>/health/ready
   ```

   Both `dig` calls resolve to CloudFront edge IPs (Route 53 alias targets). Both `curl` calls return 200 with TLS handshake against the new ACM cert.

8. Update `PUBLIC_BASE_URL` on the host:

   ```bash
   ssh footbag-staging
   sudo sed -i 's|PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://<domain>|' /srv/footbag/env
   sudo systemctl restart footbag
   exit
   ```

9. Run the full smoke check against the custom domain:

   ```bash
   BASE_URL=https://<domain> bash scripts/smoke-local.sh
   ```

Rollback: comment the ACM and Route 53 resources back, restore `cloudfront_default_certificate = true` in `cloudfront.tf`, `terraform apply`, revert `PUBLIC_BASE_URL` to the CloudFront default URL.

##### Enforce origin-bypass protection (X-Origin-Verify)

Origin-bypass protection injects a shared secret on every CloudFront-to-origin request and rejects (444, silent close) any origin request that lacks the matching header. Direct-to-Lightsail-IP probes are also rejected at the Lightsail firewall: port 80 ingress is pinned to the CloudFront origin-facing prefix list via `data.http.aws_ip_ranges` in `terraform/staging/lightsail.tf`.

Components: `random_id.origin_verify_secret` Terraform resource generates a 64-character hex value; `aws_ssm_parameter.origin_verify_secret` (SecureString) stores it (`terraform/staging/ssm.tf`); CloudFront `custom_header` reads it via a `data` block (`terraform/staging/cloudfront.tf`); nginx enforces it via the gate rendered into `/etc/nginx/nginx.conf` from `nginx.conf.template` by `40-render-nginx-conf.sh` at container startup (`docker/nginx/`); the deploy remote-half mirrors the SSM value into `/srv/footbag/env` so nginx and CloudFront always agree.

Initial activation: a single `terraform apply` plus one deploy. No two-apply ceremony, no manual `aws ssm put-parameter`, no manual env-file mirror.

```bash
cd terraform/staging
terraform init -upgrade        # picks up the random + http providers
terraform apply
bash deploy_to_aws.sh -k
```

Validation:

```bash
STATIC_IP=$(cd terraform/staging && terraform output -raw lightsail_static_ip)
CF_DOMAIN=$(cd terraform/staging && terraform output -raw cloudfront_domain)

# Through CloudFront: expect HTTP/2 200.
curl -I "https://${CF_DOMAIN}/health/ready"

# Direct to the Lightsail static IP: expect TCP RST / curl exit 7
# ("Failed to connect") at the firewall layer. If TCP completes, expect
# curl exit 52 ("Empty reply from server") at the nginx layer (444 from
# the X-Origin-Verify gate).
curl -I "http://${STATIC_IP}/health/ready"
```

Production cutover follows the same sequence in `terraform/production/`. Rotation procedure: see DEVOPS_GUIDE.md §10.9.

##### Provision the maintenance page (S3 + OAC)

Serve a static `/maintenance.html` from S3 behind CloudFront so that origin outages are covered by a graceful page rather than a CloudFront 5xx. Uses Origin Access Control (OAC), not the older Origin Access Identity.

The `maintenance` S3 bucket already exists (`aws_s3_bucket.maintenance` in `terraform/staging/s3.tf`) but has no OAC, no bucket policy, and no object.

1. Upload the maintenance HTML. If no canonical page exists yet, author a minimal static page first under a repo-tracked path (for example `docker/nginx/maintenance.html`):

   ```bash
   MAINT_BUCKET=$(cd terraform/staging && terraform output -raw maintenance_bucket || echo "footbag-staging-maintenance")
   aws s3 cp docker/nginx/maintenance.html "s3://${MAINT_BUCKET}/maintenance.html" \
     --content-type text/html \
     --cache-control "public, max-age=60"
   ```

2. Add an Origin Access Control in `terraform/staging/cloudfront.tf`:

   ```hcl
   resource "aws_cloudfront_origin_access_control" "maintenance" {
     name                              = "${local.prefix}-maintenance-oac"
     description                       = "OAC for the maintenance S3 bucket"
     origin_access_control_origin_type = "s3"
     signing_behavior                  = "always"
     signing_protocol                  = "sigv4"
   }
   ```

3. Add the S3 origin to `aws_cloudfront_distribution.main`, alongside the existing `lightsail-origin`:

   ```hcl
   origin {
     origin_id                = "maintenance-origin"
     domain_name              = aws_s3_bucket.maintenance.bucket_regional_domain_name
     origin_access_control_id = aws_cloudfront_origin_access_control.maintenance.id

     s3_origin_config {
       origin_access_identity = ""
     }
   }
   ```

4. Add an `ordered_cache_behavior` for `/maintenance.html`:

   ```hcl
   ordered_cache_behavior {
     path_pattern           = "/maintenance.html"
     target_origin_id       = "maintenance-origin"
     viewer_protocol_policy = "redirect-to-https"
     allowed_methods        = ["GET", "HEAD"]
     cached_methods         = ["GET", "HEAD"]
     compress               = true

     cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
     origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
   }
   ```

5. Add `custom_error_response` blocks so CloudFront serves `/maintenance.html` when the origin is unavailable:

   ```hcl
   custom_error_response {
     error_code            = 502
     response_code         = 503
     response_page_path    = "/maintenance.html"
     error_caching_min_ttl = 0
   }

   custom_error_response {
     error_code            = 503
     response_code         = 503
     response_page_path    = "/maintenance.html"
     error_caching_min_ttl = 0
   }

   custom_error_response {
     error_code            = 504
     response_code         = 504
     response_page_path    = "/maintenance.html"
     error_caching_min_ttl = 0
   }
   ```

6. Add a bucket policy in `terraform/staging/s3.tf` granting CloudFront (via the OAC) read access to the maintenance bucket:

   ```hcl
   data "aws_iam_policy_document" "maintenance_bucket" {
     statement {
       actions   = ["s3:GetObject"]
       resources = ["${aws_s3_bucket.maintenance.arn}/*"]

       principals {
         type        = "Service"
         identifiers = ["cloudfront.amazonaws.com"]
       }

       condition {
         test     = "StringEquals"
         variable = "AWS:SourceArn"
         values   = [aws_cloudfront_distribution.main[0].arn]
       }
     }
   }

   resource "aws_s3_bucket_policy" "maintenance" {
     bucket = aws_s3_bucket.maintenance.id
     policy = data.aws_iam_policy_document.maintenance_bucket.json
   }

   resource "aws_s3_bucket_public_access_block" "maintenance" {
     bucket                  = aws_s3_bucket.maintenance.id
     block_public_acls       = true
     block_public_policy     = false
     ignore_public_acls      = true
     restrict_public_buckets = false
   }
   ```

7. Plan, apply, wait for CloudFront to redeploy.

8. Validate `/maintenance.html` is reachable:

   ```bash
   curl -I https://<domain>/maintenance.html
   ```

   Expect 200 with `X-Cache` set (first call `Miss from cloudfront`, subsequent `Hit from cloudfront`).

9. Simulate an origin failure to confirm the error-response fallback:

   ```bash
   ssh footbag-staging
   sudo systemctl stop footbag
   exit

   # From the workstation:
   curl -I https://<domain>/
   ```

   Expect 503 with the maintenance page body. Restart the service afterward:

   ```bash
   ssh footbag-staging
   sudo systemctl start footbag
   ```

### 7.3 GitHub and operator governance hardening

Initial CI now exists, but the governance around it still needs to be closed. Three one-time operations: enable GitHub branch protection on `main`, scope `footbag-operator` down from `AdministratorAccess` to a least-privilege policy, and retire the Lightsail `ec2-user` default account. Two additional governance notes appear at the end.

#### Enable branch protection on `main`

1. GitHub → the repository → Settings → Branches → Branch protection rules → Add rule.
2. Branch name pattern: `main`.
3. Enable:
   - Require a pull request before merging.
   - Require approvals: 1.
   - Require status checks to pass before merging:
     - `Type-check`
     - `Unit tests`
     - `Integration tests`
   - Require branches to be up to date before merging.
   - Require linear history (optional but recommended).
4. Save.
5. Verify by opening a test PR with a known-failing check; confirm the merge button is blocked until the check passes.

Refresh the required-check names if the CI workflow job names change: branch protection reads the exact job-name strings from the latest runs.

#### Scope down `footbag-operator` from `AdministratorAccess`

The operator IAM user initially holds `AdministratorAccess` for bootstrap. After the first successful deploy, move it to a least-privilege policy covering only services the project uses.

1. Define the scoped policy in `terraform/staging/iam.tf` (or a sibling file) with statements covering:
   - Lightsail (full: instance management, static IP, SSH key, firewall rules)
   - CloudFront (full: distribution, OAC, cache policies)
   - S3 (the project's state bucket, media bucket, snapshots bucket, DR bucket, maintenance bucket; scoped by ARN)
   - SSM Parameter Store under `/footbag/*`
   - KMS scoped to the project's keys by ARN (SSM key, JWT signing key)
   - SNS (the operator alert topic)
   - CloudWatch (metrics, alarms, dashboards)
   - IAM self-rotation (only on the operator user's own access keys)
   - STS for `sts:AssumeRole` if the operator assumes any project roles

2. Attach the scoped policy to `footbag-operator` via Terraform. Leave `AdministratorAccess` attached for one `terraform apply` cycle so you can compare permission sets in practice.

3. Apply:

   ```bash
   cd terraform/staging
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

4. Exercise the operator path end-to-end while both policies are attached:
   - `terraform plan` and `terraform apply` on a no-op change.
   - `aws s3 ls` on each project bucket.
   - `aws cloudfront list-distributions`.
   - `bash deploy_to_aws.sh -k`.

5. When the above is green, detach `AdministratorAccess`:

   ```bash
   aws iam detach-user-policy \
     --user-name footbag-operator \
     --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   ```

6. Re-exercise the same paths. Any denied action indicates a missing statement in the scoped policy. Tighten, re-apply, re-test. Keep the final policy in Terraform HCL so the scope-down is reproducible and audit-trailable.

#### Retire `ec2-user`

The Lightsail default `ec2-user` account was used for initial SSH before the named operator account existed. After named operator SSH is validated, retire it.

Prerequisite: `ssh footbag-staging` (the named operator account) has worked for multiple sessions without needing `ec2-user` as a fallback.

1. SSH in as the named operator and escalate:

   ```bash
   ssh footbag-staging
   sudo -i
   ```

2. Lock the `ec2-user` account (lock rather than delete; locked accounts preserve audit trails):

   ```bash
   passwd -l ec2-user
   usermod -s /usr/sbin/nologin ec2-user
   ```

3. Remove `ec2-user`'s authorized SSH keys:

   ```bash
   rm /home/ec2-user/.ssh/authorized_keys
   ```

4. Verify the named operator still has access in a fresh shell:

   ```bash
   ssh footbag-staging -o ControlMaster=no -o ControlPath=none
   ```

5. Attempt to log in as `ec2-user` from the workstation using the old key:

   ```bash
   ssh -i ~/.ssh/footbag-lightsail-key ec2-user@<lightsail-static-ip> -p 2222
   ```

   Expect "Permission denied" or immediate disconnect.

Rollback: `usermod -s /bin/bash ec2-user` and restore the authorized_keys file from a backup. Rotate or delete the old key material only after a cooling-off period.

#### Additional governance notes

- Long-lived IAM access keys on `footbag-operator` remain in place until the project selects a short-lived-credential path (IAM Identity Center, workload identity federation, or equivalent). Until that decision lands, rotate keys on the 90-day cadence per `docs/DEVOPS_GUIDE.md` §10.7.
- Lightsail browser SSH can be disabled once named-operator SSH is fully reliable. Browser SSH has no per-IP allowlist and expands the attack surface; disable it from the Lightsail console under the instance's Networking tab once an alternative recovery path is confirmed.

### 7.4 Reliability and recovery

The staging deploy workflow exists, but durable recovery does not. Close it with three one-time operations: install the shipped backup timer, enable the backup-age alarm, and rehearse a full restore drill. The goal is to move from "we can redeploy" to "we can recover," and it is a prerequisite for implementing `scripts/deploy-migrate.sh`.

#### Install the backup timer

The backup producer is the committed `scripts/backup-db.sh`, placed on the host at `/srv/footbag/scripts/backup-db.sh` by the normal deploy rsync. It runs under the app's assumed-role AWS profile (the same `/root/.aws` chain the app uses — there is no separate backup IAM user or credentials file), reads `BACKUP_S3_BUCKET` and `FOOTBAG_ENV` from `/srv/footbag/env`, WAL-checkpoints and `.backup`-snapshots the live SQLite file, runs an integrity check, gzips the snapshot, and uploads it to `s3://<snapshots-bucket>/routine/YYYY/MM/DD/footbag-<timestamp>.db.gz` with bounded retry. Each run emits two CloudWatch metrics in the `Footbag/<env>` namespace: `BackupAgeMinutes` (minutes since the previous successful backup) and `BackupConsecutiveFailures` (raised after three consecutive failed runs).

The systemd pair lives in the repo at `ops/systemd/footbag-backup.service` and `ops/systemd/footbag-backup.timer` (every 5 minutes, `Persistent=true`, giving a ~5-minute recovery-point objective). Install them with the shipped helper, which stages the units over SSH, reloads systemd, enables the timer, and runs one backup immediately so a missing prerequisite fails loudly at install time:

```bash
scripts/install-backup-timer.sh --target staging
```

Verify:

```bash
ssh footbag-staging
sudo systemctl status footbag-backup.timer
sudo journalctl -u footbag-backup.service --no-pager | tail
aws s3 ls --recursive "s3://<snapshots-bucket>/routine/" | tail
```

Expect the timer active, the service journal showing a recent successful run, and the bucket listing new objects every 5 minutes.

#### Enable the backup-age alarm

Without a freshness alarm, a silent backup failure can go unnoticed until the next restore drill. The Terraform scaffolding for the alarm already exists in `terraform/staging/cloudwatch.tf`; enabling it now that the metric is being emitted is a one-line tfvars change.

1. Trigger a manual backup run to confirm the metric appears:

   ```bash
   sudo systemctl start footbag-backup.service
   aws cloudwatch list-metrics --namespace Footbag/staging
   ```

2. Enable the alarm in `terraform/staging/terraform.tfvars`:

   ```hcl
   enable_backup_alarm = true
   ```

3. `terraform plan` and `terraform apply`.

4. Confirm the alarm reaches the operator by temporarily stopping the timer and waiting past the alarm threshold, then re-enabling:

   ```bash
   sudo systemctl stop footbag-backup.timer
   # Wait past the configured threshold; observe the alarm firing via SNS email.
   sudo systemctl start footbag-backup.timer
   ```

#### Rehearse a full restore

Rehearse this before any migration-related work. Completing the drill is a gate for MIGRATION_PLAN.md §29.1.

1. Capture baseline state so you can compare after restore:

   ```bash
   ssh footbag-staging
   sudo sqlite3 /srv/footbag/db/footbag.db 'SELECT COUNT(*) FROM members;' > /tmp/members-baseline.txt
   ```

2. Stop the service:

   ```bash
   sudo systemctl stop footbag
   ```

3. Pick a known-good snapshot and copy it down (snapshots are gzipped under `routine/`):

   ```bash
   KEY=$(aws s3 ls --recursive s3://<snapshots-bucket>/routine/ | awk '{print $4}' | sort | tail -1)
   aws s3 cp "s3://<snapshots-bucket>/${KEY}" /tmp/restore.db.gz
   gunzip -f /tmp/restore.db.gz   # yields /tmp/restore.db
   ```

4. Verify snapshot integrity:

   ```bash
   sqlite3 /tmp/restore.db 'PRAGMA integrity_check;'
   ```

   Expect `ok`.

5. Replace the live DB in place:

   ```bash
   sudo install -o root -g root -m 600 /tmp/restore.db /srv/footbag/db/footbag.db
   ```

6. Restart the service:

   ```bash
   sudo systemctl start footbag
   ```

7. Run the smoke check and compare member counts:

   ```bash
   BASE_URL=https://<public-url> bash scripts/smoke-local.sh
   sudo sqlite3 /srv/footbag/db/footbag.db 'SELECT COUNT(*) FROM members;'
   ```

   Confirm the smoke passes and the member count matches expectations for the snapshot age.

8. Time the sequence end-to-end. Target: under 5 minutes RTO from "stop service" to "smoke passes."

9. Record the timing in operator notes and confirm it meets the `docs/DEVOPS_GUIDE.md` §16.1 target.

### 7.5 Runtime configuration maturity

`/srv/footbag/env` remains the runtime source of truth and now includes runtime AWS credentials for the app-runtime IAM identity. Manual host edits remain the delivery mechanism; this becomes harder to live with as secrets multiply.

Remaining work:

- keep `/srv/footbag/env` as the runtime source of truth
- decide when manual host edits become too fragile; access-key rotation every 90 days is the first recurring forcing function now that the app has runtime AWS credentials
- if needed later, add a helper that materializes `/srv/footbag/env` from Parameter Store
- keep local `.env`, host `/srv/footbag/env`, and optional AWS-side reference storage clearly distinct

### 7.6 Monitoring maturity

Some monitoring exists in concept. Close the full loop with three one-time operations: install the CloudWatch agent (CWAgent) on the runtime host, enable the CWAgent CPU / memory / disk alarms, and validate SNS alert delivery end-to-end. Backup-freshness alarms are covered in §7.4; the CloudFront 5xx alarm is enabled automatically with CloudFront in §7.2.

#### Install CWAgent on the Lightsail host

1. SSH in and install the agent. The repo's `scripts/install-cwagent-staging.sh` runs steps 1–5 idempotently; if running by hand on Amazon Linux 2023, use the rpm:

   ```bash
   ssh footbag-staging
   sudo bash -c '
   cd /tmp
   curl -fsSL https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm -o amazon-cloudwatch-agent.rpm
   dnf install -y ./amazon-cloudwatch-agent.rpm
   '
   ```

2. Create the agent config at `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`:

   ```bash
   sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<'EOF'
   {
     "agent": {
       "metrics_collection_interval": 60,
       "run_as_user": "root"
     },
     "metrics": {
       "namespace": "CWAgent",
       "append_dimensions": {
         "InstanceId": "footbag-staging-web"
       },
       "metrics_collected": {
         "cpu": {
           "measurement": ["usage_active", "usage_idle", "usage_iowait", "usage_user", "usage_system"],
           "totalcpu": true
         },
         "mem": {
           "measurement": ["mem_used_percent", "mem_available_percent"]
         },
         "disk": {
           "measurement": ["used_percent"],
           "resources": ["/"],
           "drop_device": true
         }
       }
     }
   }
   EOF
   ```

   The `InstanceId` value is a literal string, not the `${aws:InstanceId}` IMDS template. Lightsail's IMDS instance-id format is undocumented in AWS sources, and `aws_lightsail_instance.web.id` in Terraform is the Lightsail instance name; pinning the literal name here keeps the CWAgent-emitted dim and the alarm-side dim aligned.

3. CWAgent publishes with its own dedicated `cwagent-publisher` IAM user, not the app's runtime role. The installer writes that user's static keys to `/etc/amazon-cloudwatch-agent.aws/credentials` (profile `footbag-staging-cwagent`) and points the agent at them via `/opt/aws/amazon-cloudwatch-agent/etc/common-config.toml`. Verify the keys resolve to that user:

   ```bash
   sudo AWS_SHARED_CREDENTIALS_FILE=/etc/amazon-cloudwatch-agent.aws/credentials \
     AWS_PROFILE=footbag-staging-cwagent aws sts get-caller-identity
   ```

   Expect the `footbag-staging-cwagent-publisher` user ARN. If the keys are missing or wrong, CWAgent fails to publish and its log at `/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log` shows the credential error.

4. Confirm the publisher user's `cloudwatch:PutMetricData` grant (scoped to the `CWAgent` namespace) is in place. The `aws_iam_user_policy.cwagent_publisher_putmetric` policy ships in `terraform/staging/iam.tf`; a current `terraform apply` is sufficient.

   ```bash
   aws iam get-user-policy \
     --user-name footbag-staging-cwagent-publisher \
     --policy-name footbag-staging-cwagent-publisher-putmetric
   ```

5. Start the agent and confirm metrics arrive:

   ```bash
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
     -a fetch-config \
     -m onPremise \
     -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
     -s

   sudo systemctl status amazon-cloudwatch-agent
   ```

   Then from the workstation:

   ```bash
   aws cloudwatch list-metrics --namespace CWAgent
   ```

   Expect entries for `cpu_usage_active`, `mem_used_percent`, and `disk_used_percent`, all carrying `InstanceId=footbag-staging-web`.

#### Enable CWAgent alarms

1. In `terraform/staging/terraform.tfvars`:

   ```hcl
   enable_cwagent_alarms = true
   ```

2. `terraform plan` and `terraform apply`. Expect CPU, memory, and disk alarms added.

3. Verify alarm states:

   ```bash
   aws cloudwatch describe-alarms --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}' --output table
   ```

   Each should show `INSUFFICIENT_DATA` initially and transition to `OK` within one evaluation period.

#### Validate SNS alert delivery end-to-end

CloudWatch alarms are only useful if the operator receives them. Confirm the path with a deliberate test.

1. Identify the SNS topic and confirm the operator subscription is active:

   ```bash
   cd terraform/staging
   TOPIC_ARN=$(terraform output -raw alerts_topic_arn)
   aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN"
   ```

   Expect at least one `Protocol=email` subscription in the `Confirmed` state (not `PendingConfirmation`).

2. Publish a test message:

   ```bash
   aws sns publish \
     --topic-arn "$TOPIC_ARN" \
     --subject "footbag.org monitoring test" \
     --message "Manual SNS delivery check."
   ```

3. Confirm the operator receives the email within one minute.

4. Force a real alarm to confirm the alarm-to-SNS path. A simple approach: temporarily lower the CPU alarm threshold in `cloudwatch.tf` to 1%, `terraform apply`, wait for the alarm to breach, confirm the SNS email arrives, then revert.

#### Document the operator dashboard

Record the CloudWatch dashboard URL, the `/health/live` and `/health/ready` URLs through CloudFront, and the confirmed SNS subscription address in operator notes. These are the first-check locations when an alarm fires.

---

## 8. Path H — Runtime AWS identity and transactional email activation

> [!IMPORTANT]
> **Staging email is `SES_ADAPTER=stub`; the live-SES-on-staging steps in this path are a
> superseded early approach, retained for reference.** Staging exercises email-gated flows
> through the persona test harness and the in-page simulated-email card (DD §5.6), not through
> live AWS SES, and `env.ts` refuses a `FOOTBAG_ENV=staging` boot with `SES_ADAPTER=live`. The
> SES steps below (§8.8 sender/recipient verification, the `OutboundEmail` statement in §8.9 4b,
> the §8.10 5b SES env, and the §8.11 SES smoke test) document the original early-staging
> live-sandbox-SES procedure. They are kept because Path I reuses the same mechanics for
> production SES (§9.6-§9.10, §9.12) and remain a useful reference, but they are not current
> staging configuration. KMS JWT signing in this path IS current and required on staging. Live
> SES delivery and its validation are production-only (Path I).

### 8.1 Why this path exists

Earlier paths assume the running app uses only `process.env` and SQLite and makes no AWS API calls at runtime. That assumption held until KMS-backed JWT session signing and SES-backed transactional email were introduced. Those two capabilities require the app to call AWS at request time. Per DD §3.5 and §7.2, the authoritative runtime principal on Lightsail is an assumed IAM role reached through a source-profile credential chain on a root-owned host AWS config; Lightsail has no EC2 instance profile, so this chain is the supported substitute. Path H is the one-time activation runbook that extends the existing deferred runtime role (`aws_iam_role.app_runtime`), creates the source-profile IAM user, stands up the KMS signing key and the SES sender, and wires the chain on the staging host (host config files, `/srv/footbag/env`, and the production compose file).

Path H is parallel to Path D in feel: executed once per environment, not part of the routine deploy workflow. Access-key rotation is stewardship, not activation; it lives in `docs/DEVOPS_GUIDE.md` §10.7 (see §8.12 below for the pointer).

### 8.2 Scope

Staging only. Four tasks, in order:

1. A KMS asymmetric signing key.
2. A new minimal source-profile IAM user plus an extension of the existing deferred runtime role (`aws_iam_role.app_runtime`): new trust statement and new inline-policy statements for KMS Sign and SES Send.
3. A SES sandbox sender identity plus a verified test recipient.
4. Host AWS config/credentials files, `/srv/footbag/env` additions, and a compose-file update that mounts `/root/.aws` read-only into the app container.

This path assumes the staging baseline from Paths D through F is already in place: the `footbag-operator` human identity exists, Terraform state is bootstrapped, the Lightsail instance is running, and the routine deploy workflow is working. If any of that is not true, complete those paths first.

Out of scope: custom domains, ACM, Route 53, new CloudFront work (§7.2); backups and monitoring (§7.4, §7.6); production (production KMS, SES production-access, and production IAM are a separate later activation); domain-identity verification (this path uses a sandbox email identity only); Terraform HCL reconciliation of the inline policy + trust edits made via Console in this path.

### 8.3 Preconditions

Before starting, confirm:

- You are signed in to the AWS Console with your human operator identity, not root.
- `AWS_PROFILE=footbag-operator` is active in any terminal you will use for validation.
- The staging Lightsail host is reachable via the SSH alias `footbag-staging`.
- You have the current staging base URL (canonical source: `README.md` and `docs/DEVOPS_GUIDE.md`).

Have your local operator-specifics notes open so you can record identifiers as you go. This path will tell you which values you need to retain.

### 8.3.1 Console sign-in for the operator identity

Path H is Console-driven in §8.6 through §8.9. Before starting, sign in to the AWS Console as the operator IAM user (`footbag-operator`, not root) per `docs/DEVOPS_GUIDE.md` §8.3 "Operator console sign-in". That section covers the account ID, password, and MFA TOTP mechanics, and notes where the required credentials are held.

After sign-in, confirm the Console region selector (top-right) is **US East (N. Virginia) us-east-1**. This check is repeated at the start of §8.6 because a misregioned KMS key is the most common expensive mistake in this path.

For a new volunteer taking over this runbook: you need vault access before you can execute Path H. Arrange handoff with the outgoing maintainer per DEVOPS_GUIDE §8.3 and §4.5 of this guide before proceeding.

### 8.4 Naming convention

Follows the existing project pattern `footbag-<env>-<component>[-<qualifier>]` seen in `footbag-staging-web` (Lightsail instance), `footbag-staging-web-ip` (static IP), and `alias/footbag-staging` (existing SSM KMS key).

- KMS alias: `alias/footbag-staging-jwt`.
- Existing runtime IAM role (reuse, do not create): Terraform name `aws_iam_role.app_runtime`, IAM role name `footbag-staging-app-runtime`, declared in `terraform/staging/iam.tf`.
- New source-profile IAM user: `footbag-staging-source-profile`. Holds only `sts:AssumeRole` on the runtime role; its long-lived access keys are delivered to the host.
- New inline-policy statements on the runtime role: `JwtSigning` (`kms:Sign` + `kms:GetPublicKey`) and `OutboundEmail` (`ses:SendEmail`).
- Source-profile user inline policy: `footbag-staging-source-profile-assume-role` (single `sts:AssumeRole` statement).
- AWS SDK profile name used on the host: `footbag-staging-runtime`.

The human operator identity (`footbag-operator`) remains env-agnostic; the names above are env-specific because the resources they label are env-specific. See also §4.5 "Lightsail runtime identity model" for the three-identity split (operator, source-profile user, runtime role) and its rationale.

### 8.5 Supersedes an earlier assumption

The "current public slice does not need runtime AWS API calls" stance expressed earlier in this document (§4.5, earlier wording now revised) was accurate before this activation. It is no longer accurate once Path H has run: the app now assumes the runtime role once per process startup (via `sts:AssumeRole` through the source-profile chain) and then calls `kms:Sign` on every login and session re-issue, `kms:GetPublicKey` once per process (cached in memory), and `ses:SendEmail` for every verification, reset, and confirmation email the outbox drains.

Lightsail has no EC2 instance profile, so these calls route through the source-profile + assumed-role chain rather than through an instance-attached role. That is what this path provisions.

### 8.6 Step 1 — Create the KMS asymmetric signing key

Do this first because step 4 (the IAM policy) needs the key ARN.

Confirm the AWS Console region selector (top-right) is `US East (N. Virginia) us-east-1` before creating any resource in this path; the KMS key, SES identity, IAM policy resource ARNs, and `AWS_REGION=us-east-1` in §8.10 step 5b all assume this region. A key created in a different region will produce a `NotFoundException` from the SDK at runtime.

1. AWS Console → KMS → Customer managed keys → **Create key**.
2. Key type: **Asymmetric**.
3. Key usage: **Sign and verify**.
4. Key spec: **RSA_2048**.
5. Alias: `footbag-staging-jwt`.
6. Description: `JWT session signing for staging. RSA-2048. Do not repurpose.`
7. Key administrators: leave as your human operator.
8. Key users: leave empty for now; the app IAM user created in step 2 gets access via the inline policy in step 4, not via the key policy.
9. Finish and create.
10. Before leaving the KMS console, view the generated key policy and confirm it contains the `Enable IAM User Permissions` statement (`Principal: AWS: arn:aws:iam::<ACCOUNT>:root`, `Action: kms:*`). This statement is what lets the step-4 IAM policy authorize KMS Sign calls. Without it the IAM policy is silently ineffective.

Record locally:

- KMS key ARN (full `arn:aws:kms:us-east-1:...:key/...` form).
- KMS alias (`alias/footbag-staging-jwt`).

You will paste the ARN into step 4 and step 5.

### 8.7 Step 2 — Create the source-profile IAM user

Do this second because step 4 attaches an inline policy that references both the KMS key ARN from step 1 and the runtime role ARN, and because the runtime role's trust policy in step 4 needs this user's ARN.

1. AWS Console → IAM → Users → **Create user**.
2. Username: `footbag-staging-source-profile`.
3. Do **not** grant console access.
4. Do **not** attach any managed policies at this step; the inline policy is added in step 4.
5. Create the user.
6. Go to the user → **Security credentials** → **Create access key** → choose **Application outside AWS** (or **Other**) as the use case, confirm.
7. Save the access key ID and secret access key immediately. AWS shows the secret only once.

Record locally:

- Source-profile IAM user ARN.
- Access key ID.
- Date of access-key issuance (tracked for rotation cadence in `docs/DEVOPS_GUIDE.md` §10.7).

Treat the secret access key with the same custody you use for `footbag-operator` credentials. Do not paste it into checked-in files, chat logs, or shared screens. The source-profile user holds only `sts:AssumeRole` (attached in step 4): a leaked key lets an attacker only attempt to assume the runtime role, and revoking the role's trust of this user severs access instantly.

### 8.8 Step 3 — Verify the SES sandbox sender and test recipient

> Superseded for staging (see the Path H SES note in §8). Staging runs the stub SES adapter;
> the steps below are retained as the live-SES procedure Path I reuses for production.

Before starting, confirm `noreply@footbag.org` is deliverable via Google Managed Services (per DD §5.5), either as a mailbox or as a forward to an operator inbox; SES email-identity verification requires clicking a link delivered to that address, and without an inbound route the verification email is dropped silently. If no route exists, create it in Google Managed Services first.

**Preflight:** before triggering the SES verification email, send a manual test message from a different external account (e.g. a personal gmail) to `noreply@footbag.org` and confirm it arrives at the destination inbox. If it does not arrive, the SES verification email will also be silently dropped and this step will appear to hang. Fix the Google Managed Services route first, then continue.

1. AWS Console → SES → **Verified identities** → **Create identity**.
2. Identity type: **Email address**.
3. Email address: `noreply@footbag.org`.
4. Create. AWS sends a verification email; click the link to confirm ownership.
5. Repeat steps 1-4 for the email address you will use as the test recipient in §8.11 post-setup validation. You will need to click the verification link sent to that mailbox to confirm.

In SES sandbox, the account can only send to verified recipients, so the test recipient is how you exercise the full send path during step 6 validation. Verifying the recipient in SES is necessary but not sufficient; the IAM policy in §8.9 step 4b must also permit `ses:SendEmail` on the recipient's identity ARN. The identity-wildcard pattern used there covers every address you verify in this step without a separate IAM edit per tester.

Record locally:

- Verified sender (`noreply@footbag.org`).
- Verified test recipient.
- SES region (`us-east-1`).

The account stays in SES sandbox. Production access is a separate support ticket and is out of scope for this path.

The IAM policy in the next step uses v1 SES actions (`ses:SendEmail`, `ses:SendRawEmail`) matching the v1 SES SDK client. AWS has not deprecated the v1 API. SESv2-specific features (for example configuration sets with Virtual Deliverability Manager) would require a separate IAM and client update.

### 8.9 Step 4 — Attach policies and amend the runtime role's trust

These three IAM resources — the source-profile user's `sts:AssumeRole` policy, the runtime role's KMS-Sign + SES-Send inline policy (`app_jwt_ses`), and the runtime role's trust policy — are Terraform-managed in `terraform/staging/iam.tf`; `terraform apply` is the canonical path and source of truth (per the project's Terraform-only rule). The JSON below documents what each resource contains, for review and for inspecting the live policy in the Console. Do not hand-create these in the Console as a parallel source — that drifts from Terraform.

**4a. Source-profile user → `sts:AssumeRole` only.**

Terraform resource `aws_iam_user_policy.source_profile_assume_role` (`iam.tf`), applied by `terraform apply`. It grants the source-profile user only `sts:AssumeRole` on the runtime role (the `Resource` resolves to the runtime role ARN):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeRuntimeRole",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "<RUNTIME_ROLE_ARN>"
    }
  ]
}
```

To inspect the live policy: IAM → Users → `footbag-staging-source-profile` → Permissions. Do not hand-create a second inline policy — that drifts from Terraform.

**4b. Runtime role → add KMS Sign + SES Send inline statements.**

Terraform resource `aws_iam_role_policy.app_jwt_ses` (`iam.tf`), alongside the role's pre-existing SSM-read and S3-snapshots policies. The `JwtSigning` Resource is pinned to the single KMS key; the `OutboundEmail` Resource uses an identity wildcard within the account (see note below):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "JwtSigning",
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey"
      ],
      "Resource": "<KMS_KEY_ARN_FROM_STEP_1>"
    },
    {
      "Sid": "OutboundEmail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:us-east-1:<ACCOUNT_ID>:identity/*"
    }
  ]
}
```

To inspect: IAM → Roles → `footbag-staging-app-runtime` → Permissions.

**Why the identity wildcard for `OutboundEmail`.** In SES sandbox mode, AWS performs an IAM permission check against BOTH the sender identity AND every recipient identity on each `ses:SendEmail` call. A policy that pins `Resource` to the sender identity alone will refuse sends to a verified sandbox recipient with `User ... is not authorized to perform ses:SendEmail on resource arn:aws:ses:...:identity/<RECIPIENT>`. The recipient still must be verified in SES per §8.8; the wildcard does not bypass SES's sandbox check, it only allows the role to reach SES for identities within this account. Each new tester requires only an §8.8 SES verification step; no IAM edit per tester. SES production access (out of scope for this path) removes the recipient-identity permission check; at that point the Resource can be tightened back to the single sender identity ARN.

`ses:SendRawEmail` is not granted. The app uses `@aws-sdk/client-ses` `SendEmailCommand` exclusively; if a future change needs raw MIME (attachments), add `ses:SendRawEmail` at that point.

**4c. Runtime role → amend trust policy to trust the source-profile user.**

Terraform sets `aws_iam_role.app_runtime.assume_role_policy` (`iam.tf`) so the source-profile user can assume the role, replacing the original `ec2.amazonaws.com` stub (scaffolded for instance-profile use, which Lightsail cannot assume). The trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustSourceProfileUser",
      "Effect": "Allow",
      "Principal": {
        "AWS": "<SOURCE_PROFILE_USER_ARN_FROM_STEP_2>"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

AWS resolves the `Principal` ARN to the source-profile user's internal unique ID at save time; never delete and recreate that user as a rotation strategy (a recreated user with the same name has a different unique ID and the trust silently refuses `AssumeRole`). Rotation is always "second key under the existing user" (`docs/DEVOPS_GUIDE.md` §10.7).

Do not delete and recreate the source-profile user to rotate credentials. AWS resolves the principal ARN to the user's internal unique ID at save time, so a recreated user with the same name produces a trust that looks correct in JSON but silently refuses `AssumeRole` until the trust policy is re-edited. Rotate by issuing a second access key under the same user (see `docs/DEVOPS_GUIDE.md` §10.7).

### 8.10 Step 5 — Wire credentials, env, and the compose file

Four sub-steps. Access-key material lives in `/root/.aws/credentials` (root-owned, 0600). `/srv/footbag/env` carries only non-secret runtime config and the AWS profile name. The compose file mounts `/root/.aws` read-only into the app container and passes the env vars through.

**5a. Write root-owned AWS config/credentials on the staging host.**

Replace every `<...>` placeholder in the heredocs below before pasting. `<ACCESS_KEY_ID_FROM_STEP_2>` and `<SECRET_ACCESS_KEY_FROM_STEP_2>` come from §8.7; `<RUNTIME_ROLE_ARN>` is the ARN of `footbag-staging-app-runtime` (IAM → Roles → copy ARN), also referenced in §8.9 step 4a; `<LOGS_PUBLISHER_ROLE_ARN>` is the ARN of `footbag-staging-logs-publisher`, the least-privilege role the Docker daemon assumes to ship container logs to CloudWatch (both roles are created by `terraform apply`). The single-quoted `<<'EOF'` deliberately disables shell expansion, so an unreplaced placeholder is written verbatim to the file and the chain will fail silently at `sts:AssumeRole`.

```bash
ssh footbag-staging

sudo install -d -m 0700 -o root -g root /root/.aws

set +o history   # keep the pasted key values out of the host ~/.bash_history (they would persist there even after rotation)
sudo tee /root/.aws/credentials > /dev/null <<'EOF'
[footbag-staging-source-profile]
aws_access_key_id = <ACCESS_KEY_ID_FROM_STEP_2>
aws_secret_access_key = <SECRET_ACCESS_KEY_FROM_STEP_2>
EOF
sudo chmod 0600 /root/.aws/credentials
set -o history

sudo tee /root/.aws/config > /dev/null <<'EOF'
[profile footbag-staging-runtime]
role_arn = <RUNTIME_ROLE_ARN>
source_profile = footbag-staging-source-profile
region = us-east-1

[profile footbag-staging-logs]
role_arn = <LOGS_PUBLISHER_ROLE_ARN>
source_profile = footbag-staging-source-profile
region = us-east-1
EOF
sudo chmod 0600 /root/.aws/config
```

The `footbag-staging-logs` profile is what the Docker daemon uses for the `awslogs` log driver: the deploy remote-half writes a dockerd drop-in that points at this profile and refuses to deploy if the profile cannot assume the logs-publisher role, so it must exist (and `terraform apply` must have created that role and the CloudWatch log groups) before the first deploy that carries container-log shipping.

Verify the chain before going further:

```bash
sudo AWS_PROFILE=footbag-staging-runtime aws sts get-caller-identity
```

The `Arn` in the output should be `arn:aws:sts::<ACCOUNT>:assumed-role/footbag-staging-app-runtime/...`, confirming the SDK performed the AssumeRole call. If instead you see an IAM-user ARN or an AccessDenied, the trust policy (§8.9 step 4c) or the source-profile inline policy (§8.9 step 4a) is misconfigured.

**Stanza-prefix footgun:** the stanza name rule differs between the two files and is a common silent misconfiguration. In `/root/.aws/config` the role profile stanza MUST include the literal word `profile`: `[profile footbag-staging-runtime]`. In `/root/.aws/credentials` the source profile stanza MUST NOT include it: `[footbag-staging-source-profile]`. Swapping either produces a chain that fails silently, with `get-caller-identity` returning the source user's identity instead of the assumed role.

**5b. Append non-secret AWS config to `/srv/footbag/env`.**

`/srv/footbag/env` is the runtime source of truth on the Lightsail host for non-secret runtime config (see §10.4). Access-key material does not live here.

```bash
sudo tee -a /srv/footbag/env > /dev/null <<'EOF'

# Runtime AWS wiring for KMS JWT signing on staging. Staging email is the stub SES
# adapter (DD §5.6); SES_FROM_IDENTITY is an unused placeholder kept to satisfy the
# deploy var check and compose passthrough. The superseded live-sandbox-SES variant
# (SES_ADAPTER=live) is documented in the Path H SES note above.
# Long-lived access keys are in /root/.aws/credentials (root-owned, 0600),
# not here. The app reaches AWS via the assumed-role chain.
JWT_SIGNER=kms
JWT_KMS_KEY_ID=<KMS_KEY_ARN_FROM_STEP_1>
SES_ADAPTER=stub
SES_FROM_IDENTITY=noreply@footbag.org
AWS_REGION=us-east-1
AWS_PROFILE=footbag-staging-runtime
EOF
```

> [!IMPORTANT]
> **Confirm `SESSION_SECRET` is set and valid on the host.** Verify `SESSION_SECRET` is present in `/srv/footbag/env` from §4.7 Step 3 with a real value. The deploy script will refuse to proceed if it is shorter than 32 characters or contains the literal `changeme` placeholder. If the host was provisioned before the §4.7 update or you carried over `.env.example` text, regenerate it now:

```bash
sudo sed -i '/^SESSION_SECRET=/d' /srv/footbag/env
echo "SESSION_SECRET=$(openssl rand -hex 32)" | sudo tee -a /srv/footbag/env > /dev/null
```

Local-dev reference. The equivalent block for a contributor's local `.env` (commented because dev defaults are applied automatically when `NODE_ENV !== 'production'`) is the following. Add it to `.env.example` so new contributors see these keys exist and know what to uncomment when switching to high-fidelity local testing:

```
# Auth / runtime-AWS wiring
# Dev defaults: JWT_SIGNER=local and SES_ADAPTER=stub are applied automatically
# when NODE_ENV !== 'production'. In production both must be set explicitly.
# JWT_SIGNER=local
# JWT_KMS_KEY_ID=arn:aws:kms:us-east-1:<ACCOUNT>:key/<KEY_ID>
# JWT_LOCAL_KEYPAIR_PATH=database/dev-jwt-keypair.pem
# SES_ADAPTER=stub
# SES_FROM_IDENTITY=noreply@footbag.org
# AWS_REGION=us-east-1
# AWS_PROFILE=footbag-staging-runtime
```

**5c. Extend `docker/docker-compose.prod.yml`.**

Both the `web` and `worker` services must bind-mount `/root/.aws` read-only and pass the new env vars through. Without this, the SDK inside the container cannot see the credentials or the profile.

Under both `services.web` and `services.worker` add:

- to `volumes:`; `- /root/.aws:/root/.aws:ro`
- to `environment:`; `AWS_PROFILE: ${AWS_PROFILE}`, `AWS_REGION: ${AWS_REGION}`, `JWT_SIGNER: ${JWT_SIGNER}`, `JWT_KMS_KEY_ID: ${JWT_KMS_KEY_ID}`, `SES_ADAPTER: ${SES_ADAPTER}`, `SES_FROM_IDENTITY: ${SES_FROM_IDENTITY}`

The systemd unit already invokes compose with `--env-file /srv/footbag/env`, so the `${...}` substitutions resolve from the values set in 5b. Commit and redeploy per Path F.

**5d. Restart `footbag.service` and confirm a clean start.**

```bash
# Confirm host Node version (must be 22.x to match the pinned AWS SDK engine
# requirement; the SDK will refuse to load on Node 18 or earlier).
node --version

sudo systemctl restart footbag
sudo systemctl status footbag --no-pager | head -20
```

If the service does not come back cleanly, check journal logs (§6.5 covers the common commands) and revert the env and compose additions before continuing.

### 8.11 Step 6 — Post-setup validation

All checks run after the application code that consumes these env vars has deployed to staging. If you run this path before that code has landed, skip this section and return afterward.

From your local machine, exercise the KMS signing path by logging in and inspecting the session cookie format. Use the current staging base URL in place of `<base-url>` throughout:

```bash
# 1. KMS signing path: login, inspect the session cookie format.
curl -s -c /tmp/cookies.txt -X POST \
  -d "email=<known-verified-member>&password=<known-password>" \
  <base-url>/login -i | head -30

# The footbag_session cookie value should have three base64url segments
# separated by dots. The first segment decodes to JSON with "alg":"RS256"
# and a "kid" that matches the KMS key ARN from step 1.
```

Then exercise the SES path. **Superseded for staging** (see the Path H SES note in §8): this
live-SES validation applies only to the original early-staging approach and is reused by Path I
for production. On current staging (stub SES) there is no AWS send to validate; captured mail
appears in the in-page simulated-email card.

**First-send test recipient: use `success@simulator.amazonses.com`.** The SES mailbox simulator is always a safe recipient, does not require verification, and sidesteps the SES account-level suppression list (which silently drops messages to addresses that previously bounced in this account). Using it first isolates the SES IAM + identity path from the end-to-end anti-enumeration and member-row preconditions.

On the staging host, insert an outbox row directly. The column set below covers the current NOT NULL constraints and the "at least one recipient target" CHECK in `outbox_emails`; verify against `database/schema.sql` if the schema may have evolved:

```bash
ssh footbag-staging

sudo sqlite3 /srv/footbag/db/footbag.db <<'EOF'
INSERT INTO outbox_emails
  (id, created_at, created_by, updated_at, updated_by,
   subject, body_text, recipient_email)
VALUES
  ('ses-smoke-' || lower(hex(randomblob(6))),
   datetime('now'), 'ses-smoke',
   datetime('now'), 'ses-smoke',
   'Path H SES smoke test',
   'Path H validation send.',
   'success@simulator.amazonses.com');
EOF
```

The worker container runs continuously (`restart: unless-stopped` in `docker/docker-compose.prod.yml`) and polls the outbox on its own interval (see `src/worker.ts`); you do not need to trigger it manually. Wait for the poll to elapse, then confirm:

```bash
sudo sqlite3 /srv/footbag/db/footbag.db \
  "SELECT id, status, sent_at, last_error FROM outbox_emails \
   WHERE recipient_email = 'success@simulator.amazonses.com' \
   ORDER BY created_at DESC LIMIT 1;"
```

`status=sent` with a non-null `sent_at` confirms KMS-assumed-role credentials, the `ses:SendEmail` grant, and the sender identity are all wired correctly. Only after this passes, switch to the verified real test recipient for the end-to-end password-reset flow below.

**Precondition for the end-to-end password-reset check:** confirm a staging member row exists with the same email as the verified test recipient (seed or register-and-verify beforehand). Anti-enumeration (DD §3.8) makes the reset request a silent no-op otherwise, and no outbox row is ever created.

```bash
# 2. SES path: request a password reset for the verified test recipient.
curl -s -X POST -d "email=<verified-test-recipient>" \
  <base-url>/password/forgot -i | head -5

# Response is always 200 with the generic "if an account exists" message
# (anti-enumeration, DD §3.8).
```

On the staging host, confirm the outbox row transitioned:

```bash
ssh footbag-staging

sudo sqlite3 /srv/footbag/db/footbag.db \
  "SELECT id, status, sent_at, last_error FROM outbox_emails \
   ORDER BY created_at DESC LIMIT 1;"
```

The latest row should show `status=sent` and a non-null `sent_at`. If it shows `failed` or `pending`, check the logs for the SES error; common causes are the IAM policy not attached yet and the recipient not verified in sandbox.

Finally, confirm the verified test recipient received the reset email.

For routine post-change verification of the staging runtime identity wiring (after IAM, KMS, SES, or trust-policy changes; after access-key rotation; after a host rebuild), the operator-workstation path via `npm run test:smoke` is the canonical runbook. See `docs/DEVOPS_GUIDE.md` §18.8.

### 8.12 Where rotation lives

The access keys issued in §8.7 belong to the source-profile user `footbag-staging-source-profile`. They are long-lived credentials. CIS Benchmarks call for rotation at least every 90 days; current AWS IAM best-practices guidance prefers short-lived credentials overall and flags unused keys via last-accessed information. The rotation runbook (target file on the host: `/root/.aws/credentials`; target profile: `footbag-staging-source-profile`) is stewardship rather than first-time activation and lives in `docs/DEVOPS_GUIDE.md` §10.7. Rotate by issuing a second access key under the same user; do not delete and recreate the user (see §8.9 step 4c for the principal-ARN pitfall). The runtime role's permissions and trust policy are untouched by rotation. Record the access-key issuance date in your local operator notes so the rotation schedule can be tracked against it.

### 8.13 AWS SDK version pinning

The three AWS SDK client packages (`@aws-sdk/client-kms`, `@aws-sdk/client-ses`, `@aws-sdk/client-sts`) are pinned to EXACT versions in `package.json` (no caret, no tilde). All three must be kept at the same version.

AWS SDK v3 has a near-daily release cadence (roughly 18 to 20 minor/patch releases per month) and a documented history of shipping behavior-changing regressions under non-major version bumps, including credential-chain regressions that would silently break the staging assumed-role path on which this entire setup depends. Caret ranges cannot be trusted across that cadence when the app's entire auth and email paths route through KMS and SES.

To upgrade: update all three client entries together in a single PR, run `npm install` to refresh `package-lock.json`, run `npm test` and `npm run build`, then commit `package.json` and `package-lock.json` in the same commit. Never update one client without the others. Never run `npm install` in the course of unrelated work without checking for SDK drift (`git diff package-lock.json`). Deploy uses `npm ci`, which installs exactly what the lock file says; this is correct and must not change.

The Lightsail host Node.js runtime must be 22.x. The pinned SDK versions declare a minimum engine of Node 20, but this repo's `package.json` `engines` field requires 22.x and the rest of the toolchain assumes it. Confirm with `node --version` on the host before first deploy (see §8.10 step 5d).

### 8.14 Where the remaining AWS work lives

This path deliberately does not cover other outstanding AWS hardening. Those items track against Path G:

- Custom domain, ACM certificate, Route 53, X-Origin-Verify, S3 maintenance page: §7.2.
- Branch-protection refinement, operator scope-down from `AdministratorAccess`, retiring `ec2-user`: §7.3.
- Host-side SQLite backups and restore drill: §7.4.
- `/srv/footbag/env` manual-edits fragility threshold: §7.5. Access-key rotation is the first recurring forcing function.
- CWAgent activation, backup-freshness metrics, SNS delivery: §7.6.

Once all Path G items are complete, the durable operational content (including this path, condensed) migrates into `docs/DEVOPS_GUIDE.md`.

### 8.15 Stripe activation (staging)

One-time setup. Run after `terraform/staging` apply has provisioned the Parameter Store paths declared in `terraform/staging/ssm.tf`, and after the Stripe code (adapter, webhook handler, payment service per DD §6.1) is shipped to staging.

Prerequisites:

- Stripe account with test mode enabled and IFPA's billing details configured
- access to the Parameter Store secret `/footbag/staging/secrets/stripe_secret_key` (its shell is declared in `terraform/staging/ssm.tf` with a placeholder value you overwrite). The webhook signing secret is not in Parameter Store — it is the `STRIPE_WEBHOOK_SECRET` entry in the host env file `/srv/footbag/env`.
- staging origin reachable on a public HTTPS URL (CloudFront enabled per §7.2)

Procedure:

1. In the Stripe Dashboard, switch to test mode. Go to **Developers > API keys** and copy the test publishable key and the test secret key.
2. Store the test secret key in Parameter Store:

   ```bash
   # <test-secret-key> is a placeholder — paste your real Stripe test secret key in its place.
   # Write it to a 0600 temp file and pass it by file:// so the key never appears in the
   # `aws` process arguments (visible to any `ps` reader); shred the file afterward.
   printf %s '<test-secret-key>' > /tmp/ssm-val && chmod 600 /tmp/ssm-val
   aws ssm put-parameter \
     --name /footbag/staging/secrets/stripe_secret_key \
     --value file:///tmp/ssm-val \
     --type SecureString \
     --overwrite
   shred -u /tmp/ssm-val
   ```

3. In the Stripe Dashboard, go to **Developers > Webhooks > Add endpoint**. Set the endpoint URL to the staging webhook route (e.g. `https://<staging-cloudfront-domain>/webhooks/stripe`). Subscribe to the event types listed in DD §6.1 (one-time payment events, subscription lifecycle events, refund events).
4. Copy the signing secret from the new webhook endpoint. It is delivered as the `STRIPE_WEBHOOK_SECRET` entry in the host env file `/srv/footbag/env` (read by the app at boot and forwarded into the container by Docker Compose), not Parameter Store. Set it with the shipped helper, which replaces-or-appends the entry safely rather than hand-editing the file:

   ```bash
   # Sets STRIPE_WEBHOOK_SECRET (and, with PAYMENT_ADAPTER=live, flips payments on) in /srv/footbag/env.
   scripts/activate-payments.sh --help
   ```

5. Restart the staging app so the new Parameter Store values are loaded at boot:

   ```bash
   ssh footbag-staging "sudo systemctl restart footbag"
   ```

6. From the Stripe Dashboard webhook view, click **Send test webhook** for `checkout.session.completed`. Verify in CloudWatch logs that the handler accepted the event, validated the signature, wrote the `stripe_events` row, and applied the state transition.
7. Configure subscription products, dunning rules, and payout schedule in the Stripe Dashboard per DD §6.1. These are operator-managed in Stripe; the platform does not duplicate them.

Validation gate: one synthetic webhook delivery succeeds end-to-end and a corresponding `stripe_events` row exists in the staging DB.

### 8.16 Turnstile activation (staging)

One-time setup. Run after the Turnstile integration code (client widget on the five protected forms, server-side `siteverify` call before any DB read per DD §8.3) is shipped to staging. Turnstile uses one Parameter Store secret and one host env var (below); neither is created by `terraform apply`.

Prerequisites:

- Cloudflare account with permission to manage Turnstile sites
- permission to write the Parameter Store secret `/footbag/staging/secrets/turnstile_secret_key` (read by the live captcha adapter's `siteverify` call) and to set the public `TURNSTILE_SITE_KEY` entry in `/srv/footbag/env`
- staging origin reachable on a public HTTPS URL

Procedure:

1. In the Cloudflare dashboard, go to **Turnstile > Add site**. Set the hostname to the staging public hostname. Choose Managed mode (the Cloudflare-recommended default per DD §8.3). Save.
2. Cloudflare displays the site key (public, embedded in HTML) and the secret key (private, used by `siteverify`). Copy both.
3. Set the site key and store the secret key. The site key is public and is delivered as the `TURNSTILE_SITE_KEY` entry in `/srv/footbag/env` (read at boot, forwarded into the container by Docker Compose) — it is not a Parameter Store value. The secret key is read from Parameter Store by the live captcha adapter at `/footbag/staging/secrets/turnstile_secret_key`; Terraform does not declare this parameter, so create it directly under the project KMS key:

   ```bash
   # Public site key: set TURNSTILE_SITE_KEY in /srv/footbag/env (delivered to the container by the deploy).
   # Secret key -> Parameter Store, KMS-encrypted. <secret-key> is a placeholder for the real key.
   printf %s '<secret-key>' > /tmp/ssm-val && chmod 600 /tmp/ssm-val
   aws ssm put-parameter \
     --name /footbag/staging/secrets/turnstile_secret_key \
     --value file:///tmp/ssm-val \
     --type SecureString \
     --key-id alias/footbag-staging \
     --overwrite
   shred -u /tmp/ssm-val
   ```

4. Restart the staging app so the new values are loaded at boot:

   ```bash
   ssh footbag-staging "sudo systemctl restart footbag"
   ```

5. Visit each of the five protected forms (login, register, password-reset, claim-lookup, verify-email-resend) on the staging site. Confirm the Turnstile widget renders and a successful submission proceeds.
6. Submit a form with a known-bad Turnstile token (use Cloudflare's testing-mode site key for failure simulation per Cloudflare documentation). Confirm the server-side `siteverify` call rejects the submission with the expected error before any DB read.
7. Test fail-open behavior: temporarily block egress to `challenges.cloudflare.com` from the staging host (or set the env override flag the app honors per DD §8.3). Confirm submissions proceed without `siteverify` and an alarm is emitted to CloudWatch.

Validation gate: all five forms gate correctly; fail-open path is tested and emits the expected alarm.

---

## 9. Path I — Production activation

### 9.1 Why this path exists

Path H activates KMS-backed JWT session signing, runtime AWS identity, and SES-backed transactional email on staging. Path I is the equivalent activation for production: it establishes a production AWS account posture with its own KMS signing key, runtime role, SES domain identity, and bounce/complaint handling, and stands up the production Lightsail host with the credential chain it needs. The shape of each step mirrors Path H; the names, ARNs, domain, and sender identity are production-scoped.

Several production-only operations have no staging equivalent and are covered here in full: domain acquisition and DNS delegation, Google Managed Services deliverability for the canonical sender, the SES production-access support ticket, SES domain identity with DKIM, and the bounce/complaint webhook subscription.

Like Path H, this is a one-time activation per environment, not part of the routine deploy workflow.

### 9.2 Scope

Production only. The work falls into two groups:

**Production-only procedures authored here (§9.4 through §9.7, §9.10):**
1. Domain acquisition and DNS delegation
2. Google Managed Services deliverability for `noreply@footbag.org`
3. SES production-access activation (AWS support ticket)
4. SES domain identity with DKIM
5. SES bounce/complaint webhook subscription

**Mirrors of Path H with production naming (§9.8, §9.9, §9.11, §9.12):**

| Path H entity (staging) | Path I entity (production) |
|---|---|
| `alias/footbag-staging-jwt` | `alias/footbag-production-jwt` |
| `footbag-staging-source-profile` | `footbag-production-source-profile` |
| `footbag-staging-app-runtime` | `footbag-production-app-runtime` |
| `footbag-staging-source-profile-assume-role` | `footbag-production-source-profile-assume-role` |
| SDK profile name `footbag-staging-runtime` | `footbag-production-runtime` |

Out of scope: code changes (the app already selects KMS signing and live SES adapters via env vars; no compilation difference between staging and production); migration cutover itself (see `docs/MIGRATION_PLAN.md` §23 State 4).

### 9.3 Preconditions

Before starting Path I, confirm:

- Path H on staging is complete and behaviorally smoke-validated end-to-end (login → KMS JWT; register → outbox → SES → recipient inbox).
- AWS account hardening from Path D applied to the production AWS account: root MFA enabled, named human operator identity in place, Terraform state bootstrapped for production.
- A production Lightsail instance exists and is reachable over SSH using a named operator account.
- IFPA has secured control of `footbag.org` (or the project's canonical public domain), including registrar-level ownership and access to configure authoritative DNS.
- Operator vault access is arranged for the production KMS key material, source-profile access keys, and backup credentials.

### 9.4 Domain acquisition and DNS delegation

Production cutover requires IFPA to own `footbag.org` at the registrar level and to delegate authoritative DNS to a provider the project operates. Two provider patterns are supported: Cloudflare (used for Email Routing in §9.5; recommended) and AWS Route 53 (used for ACM validation and CloudFront alias records).

1. Registrar ownership: IFPA confirms domain renewal and registrar credentials in the operator vault. Registrar choice is outside this runbook; the only requirement is that registrar-level NS record edits are possible.

2. Pick the authoritative DNS provider:
   - **Cloudflare**: free tier sufficient; needed anyway for Email Routing in §9.5. Create a Cloudflare account under an IFPA-owned email and add the `footbag.org` zone. Cloudflare returns two nameservers.
   - **AWS Route 53**: the existing staging `acm.tf` and `route53.tf` templates use Route 53. Create a hosted zone in Route 53 in the production AWS account.

   Mixing providers (Cloudflare for email + Route 53 for web) is possible but complicates ownership; prefer one provider authoritative for the whole zone.

3. Delegate DNS at the registrar by setting the domain's NS records to the chosen provider's nameservers. Propagation takes up to 48 hours globally; typically completes within an hour.

4. Confirm delegation:

   ```bash
   dig NS footbag.org +short
   ```

   Expect the chosen provider's nameservers.

5. Record in operator notes: registrar used, renewal contact, DNS provider, zone ID (if Route 53).

### 9.5 Google Managed Services deliverability for noreply@footbag.org

SES verifies a sender identity by sending a confirmation email to that address; the address must be deliverable. `@footbag.org` inbound is handled by Google Managed Services (DD §5.5), so `noreply@footbag.org` is made deliverable there for the verification step and for any replies to operational emails.

1. In the Google Managed Services admin console for `footbag.org`, confirm the domain is verified and the `footbag.org` MX points to Google.

2. Create a route for `noreply@footbag.org`: either a mailbox or a forward to an operator inbox the project controls.

3. If a forward is used, confirm the destination address (open the confirmation link sent to the operator inbox).

4. Test end-to-end by sending a test message from a personal account to `noreply@footbag.org`. Confirm it arrives.

5. Ensure SPF authorizes AWS SES so DKIM/SPF alignment holds for the outbound sends added in §9.7. Inbound delivery via Google and outbound via SES coexist on the same domain; the SPF record lists SES as an authorized sender.

### 9.6 SES production-access activation

Production cutover is incompatible with SES sandbox (caps are 200 sends/day with per-recipient verification). Production access is an AWS support ticket with a typical 24 to 48-hour approval window.

1. Confirm the production AWS account has a verified SES identity in the target region (us-east-1). If not, verify `noreply@footbag.org` per Path H §8.8 first; AWS deprioritizes production-access requests from accounts with no verified identities.

2. In the AWS Console, go to SES → Account dashboard → Request production access.

3. Provide (paraphrase for the project):
   - Use case: Transactional email for a volunteer-run sports-community platform. Email types: registration verification, password reset, password-change confirmation, post-migration notification batch (one-time to legacy accounts with explicit consent).
   - Expected volume: initial steady state under 500 emails/day; one-time migration batch whose size equals the count of legacy accounts to be notified.
   - Recipient list: registered members (opt-in at registration; consent recorded in `members.email_verified_at`).
   - Bounce and complaint handling: described in §9.10.
   - Compliance: unsubscribe mechanism via account preferences (not applicable to transactional types).

4. AWS typically responds within 24 to 48 hours. Expect either approval with default limits (50,000 sends/day, 14 sends/second) or a request for more detail. Respond promptly; delays here extend the cutover timeline.

5. After approval, confirm:

   ```bash
   aws ses get-send-quota --region us-east-1
   ```

   Expect non-sandbox values (`Max24HourSend` well above 200).

### 9.7 SES domain identity with DKIM

A domain identity (distinct from the email identity verified in Path H §8.8) allows SES to send from any address at the domain and supports DKIM signing. DKIM signing improves deliverability and reputation. Verify the domain identity after §9.6 approves; some receiving providers reject DKIM-signed mail from sandbox accounts.

1. In SES → Identities → Create identity → Domain:
   - Identity: `footbag.org`
   - Enable DKIM. Accept Easy DKIM defaults (three CNAME records).

2. SES returns three CNAME records. Add them to the `footbag.org` zone:
   - **Cloudflare**: paste the three CNAME records into the DNS tab. Leave proxy status set to DNS only (gray cloud); DKIM must resolve to the AWS values, not Cloudflare's proxy.
   - **Route 53**: add them as standard CNAME records via Terraform or console.

3. SES polls DNS and confirms verification within 72 hours (usually within 15 minutes). Poll:

   ```bash
   aws ses get-identity-verification-attributes --identities footbag.org --region us-east-1
   ```

   Expect `VerificationStatus=Success` on the identity and on the three DKIM tokens.

4. Point the app's SES sender ARN at the domain identity (`arn:aws:ses:us-east-1:<account-id>:identity/footbag.org`) instead of the single-address identity. This broadens the allowed sender addresses; `SES_FROM_IDENTITY` still pins the From address to `noreply@footbag.org`.

5. Send a test DKIM-signed email. Inspect headers at the recipient to confirm `DKIM-Signature` is present and `dkim=pass` appears in `Authentication-Results`.

### 9.8 Production KMS key, source-profile, and runtime role

Mirror Path H §8.6 through §8.9 with production-scoped names. Execute each Path H step against the production AWS account, substituting per the table in §9.2.

Terraform: `terraform/production/` already exists, mirroring `terraform/staging/` and adding the ACM certificate, Route 53 records, SES domain identity, DR replication, and the maintenance bucket. Before the first plan, copy `terraform/production/terraform.tfvars.example` to `terraform.tfvars` and fill in the values that have no default (`aws_account_id`, `operator_cidrs`, `lightsail_origin_dns`, `route53_zone_id`, `ssh_public_key`, `alarm_email`), then run `terraform -chdir=terraform/production init` with AWS credentials that can reach the shared state bucket's `production/` key. The CloudFront and ACM resources require a real `domain_name` and a `route53_zone_id` whose zone Route 53 actually serves, so the first apply blocks on ACM DNS validation until the domain is delegated.

Exercise the source-profile → runtime-role chain locally with `aws sts get-caller-identity` before proceeding to §9.9.

### 9.9 Production SES sender identity and IAM pin

Mirror Path H §8.8 and §8.9 against the production identity.

1. Confirm `noreply@footbag.org` is deliverable via Google Managed Services (§9.5).
2. Verify the sender identity in SES (email identity, distinct from the domain identity in §9.7): add and confirm the verification link at the operator inbox.
3. Amend the `OutboundEmail` statement on the production runtime role's inline policy so `Resource` is the ARN of the `noreply@footbag.org` identity (`arn:aws:ses:us-east-1:<account-id>:identity/noreply@footbag.org`). If §9.7 is already complete, point to the domain identity ARN for broader sender flexibility; the app still pins the From address via `SES_FROM_IDENTITY`.
4. `terraform apply`.

### 9.10 SES bounce/complaint webhook subscription

Bounce and complaint rates determine SES sender reputation. Uncontrolled bounces get production access revoked. Subscribe an SNS topic to SES bounce and complaint notifications, and surface the events to the application's suppression list.

1. Create the SNS topic in `terraform/production/sns.tf`:

   ```hcl
   resource "aws_sns_topic" "ses_feedback" {
     name = "${local.prefix}-ses-feedback"
   }
   ```

2. In SES → Identities → `footbag.org` (or the email identity) → Notifications, set:
   - Bounce notifications: the `ses_feedback` topic.
   - Complaint notifications: the `ses_feedback` topic.
   - (Delivery notifications: optional; noisy.)
   - Include original headers: enabled.
   - Disable email feedback forwarding. With SNS enabled, SES will not also send bounce emails to the From address.

3. Provision the webhook auth secret and wire the subscription with the shipped mechanism (not a hand-rolled handler): run `scripts/activate-ses-feedback.sh --target production` (`docs/DEVOPS_GUIDE.md` §10.11). It generates the dedicated `SES_FEEDBACK_WEBHOOK_KEY`, installs it into `/srv/footbag/env`, and prints the `ses_feedback_webhook_url` (the public `/webhooks/ses-feedback` route plus `?key=…`). Set that URL as the `ses_feedback` topic's subscription. This key must exist before `SES_ADAPTER=live` — the production process refuses to boot without it.

4. SNS posts a subscription-confirmation message. The app does not auto-fetch the SubscribeURL (that would fetch an attacker-suppliable URL); it records it in an `email.sns_subscription_pending` audit row. Read `subscribe_url` from that row and confirm it once. The handler then marks hard-bounce (`bounceType=Permanent`) and complaint suppression on the recipient and appends an audit event per delivery.

5. Validate end-to-end by sending to AWS's bounce simulator:

   ```bash
   aws ses send-email \
     --from noreply@footbag.org \
     --destination ToAddresses=bounce@simulator.amazonses.com \
     --message 'Subject={Data="test"},Body={Text={Data="test"}}' \
     --region us-east-1
   ```

   Confirm the SNS topic receives the bounce event (via CloudWatch logs or a temporary operator-email subscription) and confirm the suppression row is written for the simulated recipient.

### 9.11 Host credential wiring on the production Lightsail instance

Mirror Path H §8.10 against the production host.

1. Write `/root/.aws/credentials` and `/root/.aws/config` on the production host with production source-profile credentials (from §9.8), the production runtime-role ARN, and a `[profile footbag-production-logs]` stanza whose `role_arn` is the production logs-publisher role and whose `source_profile` is the production source-profile (the `awslogs` container-log driver assumes it). Both the runtime and logs-publisher roles, and the CloudWatch log groups the driver requires, come from `terraform apply` against `terraform/production/`; the logs profile must resolve before the first deploy or the deploy's container-log-shipping guard aborts.
2. Update `/srv/footbag/env` on production with:
   - `JWT_SIGNER=kms`
   - `JWT_KMS_KEY_ID=alias/footbag-production-jwt`
   - `SES_ADAPTER=live`   (requires `SES_FEEDBACK_WEBHOOK_KEY` provisioned in §9.10, or the production process refuses to boot)
   - `SES_FROM_IDENTITY=noreply@footbag.org`
   - `AWS_REGION=us-east-1`
   - `AWS_PROFILE=footbag-production-runtime`
   - `SESSION_SECRET` set to a fresh production value (min 32 chars, never the staging value, never `changeme`).
3. Update the compose file on the production host to mount `/root/.aws` read-only per Path H §8.10.
4. Restart the app.

### 9.12 Post-setup validation

Mirror Path H §8.11 against production.

1. Verify the source-profile → runtime-role chain from the host:

   ```bash
   ssh footbag-production
   sudo -u root aws sts get-caller-identity
   ```

   Expect the production runtime role ARN.

2. Exercise the KMS signing path: issue a login against production and inspect the resulting `footbag_session` cookie's JWT `kid` header to confirm it matches the production KMS key ID.

3. Exercise the SES path: trigger a registration flow and confirm the verification email arrives at a test inbox with DKIM signature present. Confirm the `/register/check-email` page renders the standard copy with no in-page preview card (the live-mode posture in DD §5.6).

4. Exercise the bounce path: send to `bounce@simulator.amazonses.com` via the outbox and confirm the suppression row is written (§9.10 step 5).

5. Run the production email send-path check: `scripts/verify-prod-email.sh --profile footbag-production-runtime --confirm-production` (add `--inbox <operator-address>` for an end-to-end deliverability and DKIM confirmation). It sends through live SES to the AWS mailbox simulator (reputation-safe) and prints the SES MessageId. This complements the staging-pinned KMS/SES wiring assertions in `tests/smoke/staging-readiness.test.ts`.

6. Record in operator notes: production activation date, operator who performed the cutover, KMS key ID, SES production-access approval ticket ID, validated sender identity.

Path I is complete when all five validation steps pass. Production activation is now the canonical state; `docs/DEVOPS_GUIDE.md` covers routine operations from this point.

### 9.13 Stripe activation (production)

One-time setup. Mirrors §8.15 against the production AWS account and the live Stripe environment. Run after staging activation (§8.15) is verified.

Production-specific differences from §8.15:

- live mode in the Stripe Dashboard (not test mode); the live secret key replaces the test secret key
- live publishable key embedded in production builds
- production webhook endpoint URL points at the production domain (e.g. `https://footbag.org/webhooks/stripe`)
- a separate production webhook signing secret (each Stripe webhook endpoint has its own secret)
- Parameter Store paths under `/footbag/production/stripe/api_key` and `/footbag/production/stripe/webhook_secret`
- live subscription products configured separately from test-mode products; Stripe does not auto-copy them
- live payout schedule, dunning rules, and bank account configured in the Stripe Dashboard production view per DD §6.1

Procedure: follow the §8.15 steps replacing `staging` with `production` and `test` with `live` throughout. The validation gate is MIGRATION_PLAN.md gate EX5.

### 9.14 Turnstile activation (production)

One-time setup. Mirrors §8.16 against the production hostname. Run after staging activation (§8.16) is verified.

Production-specific differences from §8.16:

- a new Cloudflare Turnstile site configured for the production hostname (each hostname requires its own Turnstile site; the staging site key does not work on production)
- production-scoped site key and secret key
- Parameter Store paths under `/footbag/production/turnstile/site_key` and `/footbag/production/turnstile/secret_key`

Procedure: follow the §8.16 steps replacing `staging` with `production` throughout.

---

## 10. Appendices

### 10.1 Troubleshooting reference

#### Local newcomer setup mistakes

- WSL not installed, or the distro is not actually running in WSL 2 mode (`wsl.exe -l -v` to check)
- repo cloned under `/mnt/c/...` instead of the Linux filesystem
- `which node` resolves to the Windows binary under `/mnt/c/...`
- running `source ~/.nvm/nvm.sh` before restarting the terminal after nvm install; `nvm` will not be found; close and reopen the terminal first
- Node version drift breaks native addon builds (`better-sqlite3` requires Node 22 for the documented baseline)
- `sqlite3` CLI missing; `sudo apt install -y sqlite3`
- `.env` missing or `FOOTBAG_DB_PATH` wrong
- Docker Desktop installed on Windows but WSL integration not enabled for the Ubuntu distro
- `docker` command works in Windows but not in the Ubuntu shell
- the old standalone `docker-compose` v1 tool confused with the `docker compose` v2 plugin
- AWS CLI, Terraform, SSH, or `rsync` never installed in WSL; run the tooling gate from §4.2 to confirm
- shell scripts fail with `^M` because repo was cloned or edited outside WSL (CRLF issue)
- `ModuleNotFoundError: No module named 'apt_pkg'` on any command or after `apt-get update`; broken `command-not-found` handler; fix with `sudo apt-get install --reinstall python3-apt`; the `apt-get update` error is a harmless post-hook and can be ignored

#### Route and runtime mistakes

- public statuses leak non-public events
- `/events/year/:year` gets shadowed by `/events/:eventKey`; register the year route first
- historical no-results events hidden instead of rendered clearly
- controllers own business rules that belong in services
- templates own business logic that belongs in services
- `dotenv` loads too late and `FOOTBAG_DB_PATH` is empty when `db.ts` initializes; `import 'dotenv/config'` must be the first import in `server.ts`

#### Docker parity mistakes

- Docker parity skipped entirely before AWS work
- nginx not fronting the web container correctly
- DB mount path wrong
- `docker compose pull` used on host instead of the `docker save | docker load` ship path; images are built on the workstation and shipped manually

#### AWS/bootstrap mistakes

- continuing to use root after bootstrap
- creating or keeping root access keys
- leaving `footbag-operator` without MFA
- `export AWS_PROFILE=footbag-operator` not re-run after opening a new terminal; all Terraform and AWS CLI commands will use wrong credentials
- assuming runtime AWS credentials are optional; they are now required for KMS (JWT signing) and SES (transactional email); see Path H for activation and §4.5 "Lightsail runtime identity model" for the rationale
- assuming Lightsail gives you an EC2 instance-profile story identical to EC2; it does not
- leaving SSH broadly exposed; verify `operator_cidrs` is set to real CIDRs before first apply (see §4.4)
- forgetting to install `rsync` on the Lightsail host before running the rsync deployment step in §4.7
- updating Parameter Store and expecting the running app to change without also updating `/srv/footbag/env`
- copying files directly into the root-owned `/srv/footbag` without using a staging path and sudo promotion
- mixing staging and production state in the same Terraform path
- creating Terraform state storage without versioning or encryption
- relying on old Terraform DynamoDB locking patterns; this project uses `use_lockfile = true` (S3 native locking, requires `>= 1.11`)
- assuming `user_data` bootstraps the instance; it is intentionally omitted; all Docker install is manual via SSH (see §4.7)
- using raw IP as the CloudFront origin; CloudFront custom origins require a resolvable DNS hostname, not a raw IP
- assuming Lightsail provides a public DNS hostname like EC2 does.
  `aws lightsail get-instance --query 'instance.publicDnsName'` always
  returns `None`; construct the CloudFront origin hostname from the static
  IP Terraform output using nip.io for staging (see §4.6 step 4)
- naming the Lightsail static IP and instance the same; Lightsail rejects
  instance creation with "Some names are already in use" because static IPs
  and instances share a single namespace; `lightsail.tf` uses distinct names
  (`footbag-staging-web-ip` for the static IP, `footbag-staging-web` for
  the instance); do not change these to match
- skipping or mis-sequencing the two-pass CloudFront bootstrap
- running `sudo dnf install -y docker-compose-plugin` without first adding the Docker CE repo; the package is not in Amazon Linux 2023 default repos
- SSH to the Lightsail instance timing out despite correct `operator_cidrs` and a running instance; some ISPs block outbound port 22 to AWS EC2 IP ranges; use `-p 2222` and the Lightsail browser SSH console to configure sshd if needed (see §4.4 note and §4.7 step 1)
- Claude Code hooks failing with a PreToolUse hook error on every Bash call; `jq` is required by the hook scripts; install with `sudo apt-get install -y jq`

### 10.2 Deterministic seed-data reference

These seeded routes are useful for local browser verification and integration tests. The deploy smoke check does not rely on them.


| Route                             | What it proves                               |
| --------------------------------- | -------------------------------------------- |
| /events/event_2025_beaver_open    | completed public event with results          |
| /events/event_2025_quiet_open     | completed public event with no results yet   |
| /events/event_2026_spring_classic | upcoming public event                        |
| /events/event_2026_draft_event    | draft event remains non-public; expected 404 |
| /events/event_9999_does_not_exist | unknown key returns 404                      |
| /events/year/1899                 | empty year still renders cleanly             |


These are reference checks, not the main onboarding story.

### 10.3 Smoke-check contract

`scripts/smoke-local.sh` is the canonical smoke-check baseline. All checks must be data-independent so the script runs against any staging DB without seed data. It should verify at least:

- `/health/live`
- `/health/ready`
- `/events`
- `/events/year/2025`
- one empty year page (year guaranteed to have no events, e.g. `/events/year/1899`)
- one non-public event returning 404
- one missing key returning 404
- one badly formatted key returning 404

Why this matters:

- it checks the documented public contract, not just “server responds”
- it keeps deterministic seeded scenarios from drifting silently
- it can be reused locally, in Docker parity mode, against the origin, and through CloudFront by changing `BASE_URL`

A `smoke-public.sh` script has not yet been created.

### 10.4 Authoritative project facts preserved by this guide

This guide preserves these project constraints:

- Express + Handlebars + TypeScript, server-rendered
- one SQLite DB module
- prepared statements prepared once
- thin controllers
- services own page shaping
- no ORM
- no repository layer
- canonical GET /events/:eventKey public route
- non-paginated whole-year archive page
- explicit no-results rendering for historical events with no result rows
- minimal readiness semantics (DB-only)
- Lightsail origin behind CloudFront
- /srv/footbag/env as the live runtime config source in non-local deployments
- Parameter Store as optional AWS-side reference storage, not the runtime source of truth
- hardened per-operator SSH for host access
- manual bootstrap only until Terraform authority is established

### 10.5 Official references

#### Windows / WSL

- [Microsoft Learn — Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install)

#### Git / GitHub

- [GitHub Docs — Cloning a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [Git — `git clone` documentation](https://git-scm.com/docs/git-clone)

#### AWS

- [AWS CLI install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS CLI quickstart](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)
- [IAM Identity Center with AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [aws configure sso](https://docs.aws.amazon.com/cli/latest/reference/configure/sso.html)
- [Root user best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html)
- [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Lightsail SSH keys and connection overview](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-ssh-in-amazon-lightsail.html)
- [Set up SSH keys for Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-set-up-ssh.html)
- [Lightsail firewall and port rules](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail)
- [Lightsail IAM / security overview](https://docs.aws.amazon.com/lightsail/latest/userguide/security_iam.html)
- [Lightsail instance creation](https://docs.aws.amazon.com/lightsail/latest/userguide/how-to-create-amazon-lightsail-instance-virtual-private-server-vps.html)
- [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [SecureString and KMS](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)
- [Parameter Store IAM access](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html)
- [CloudFront origin settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html)
- [CloudFront custom origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
- [CloudFront custom origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html)
- [CloudFront custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html)
- [CloudFront error-page procedure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-procedure.html)

#### Terraform

- [Install Terraform](https://developer.hashicorp.com/terraform/install)
- [Install tutorial](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli)
- [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- [State workspaces](https://developer.hashicorp.com/terraform/language/state/workspaces)
- [CLI workspace overview](https://developer.hashicorp.com/terraform/cli/workspaces)
- [Resource targeting warning / guidance](https://developer.hashicorp.com/terraform/tutorials/state/resource-targeting)

#### Docker

- [Docker Desktop on WSL 2](https://docs.docker.com/desktop/features/wsl/)
- [Docker WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/)
- [Docker Compose install overview](https://docs.docker.com/compose/install/)
- [Docker Compose plugin install on Linux](https://docs.docker.com/compose/install/linux/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)

#### Node / npm

- [Node downloads](https://nodejs.org/en/download)
- [Node release status](https://nodejs.org/en/about/previous-releases)
- [npm install guidance](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)

#### Cursor and Claude Code

- [Cursor downloads](https://cursor.com/docs/downloads)
- [Cursor docs home](https://cursor.com/docs)
- [Cursor quickstart](https://cursor.com/docs/get-started/quickstart)
- [Cursor rules](https://cursor.com/docs/context/rules)
- [Claude Code quickstart](https://docs.anthropic.com/en/docs/claude-code/quickstart)
- [Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/setup)
- [Claude Code overview](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
- [Claude Code common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
- [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)

