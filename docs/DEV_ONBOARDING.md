# Footbag Website Modernization Project --  Developer Onboarding Guide

## Local Quickstart and Architecture Orientation

This guide helps contributors understand how the platform is structured and how it was originally assembled, and get it running locally (view working pages in your browser). AWS staging and production deployment, including the bring-up and hardening runbooks, lives in AWS_OPERATIONS.md (private GitHub repo); running AWS commands requires access to the private operations repository.

> **Who you are (pick your lane).** This guide serves four kinds of contributor:
>
> - **New developer** — run it locally and learn the architecture. Lanes: Path A, then B, then C (history).
> - **New tester** — run it locally; browse and switch between seeded personas at `/dev/personas` and read captured dev mail without a real inbox. Lanes: Path A, then the persona/tester harness (see `docs/TESTING.md` §16).
> - **Initial operator / AWS maintainer** — owns AWS, applies Terraform, performs production activation, and claims the first admin. Starts here at Path B for orientation; all AWS staging and production setup is in AWS_OPERATIONS.md (private GitHub repo).
> - **Other actors** — the historical-data and freestyle pipeline maintainer and docs/design contributors work mostly outside this guide; start at Path B for orientation, then their domain: the pipeline maintainer runs `legacy_data/run_pipeline.sh` and `freestyle/run_freestyle.sh` (and loads the gitignored operator dataset per §1.10A), while design and content contributors work in `docs/` and `src/views/`.
>
> AWS staging and production setup lives in the private operations repository (AWS_OPERATIONS.md); running AWS commands requires access to it.

> **Choose your path**
>
> - **Path A**; I am a brand-new contributor on Windows + WSL. I need to install the tools, clone the repo with HTTPS, run the tests, start the dev server, and load the public pages locally.
> - **Path B**; I need the architecture mental model, scope boundaries, and workflow rules.
> - **Path C**; I need the original blank-slate build order, and detailed historical implementation logic, how to get that initial v0,1 setup to work.
> - **AWS staging and production deployment**; I am the operator bringing up, hardening, or activating AWS. This lives in AWS_OPERATIONS.md (private GitHub repo) and requires access to the private operations repository.

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
- [4. AWS deployment and operations](#4-aws-deployment-and-operations)
- [5. Appendices](#5-appendices)
  - [5.1 Troubleshooting reference](#51-troubleshooting-reference)
  - [5.2 Deterministic seed-data reference](#52-deterministic-seed-data-reference)
  - [5.3 Smoke-check contract](#53-smoke-check-contract)
  - [5.4 Authoritative project facts preserved by this guide](#54-authoritative-project-facts-preserved-by-this-guide)
  - [5.5 Official references](#55-official-references)

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

For the local Docker parity check (§1.13), also install or verify these:

- Docker Desktop with WSL integration (install and verify steps are in §1.13)
- `docker compose` support
- Cursor on Windows

The AWS CLI and Terraform install as part of the AWS deployment steps in AWS_OPERATIONS.md (private GitHub repo), not here.

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

These three steps are everything required to reach hello world. Git configuration and Claude Code are set up after your first green run (§1.10B); Docker is only for the parity check (§1.13) and AWS deployment work (AWS_OPERATIONS.md, private GitHub repo).

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

This launches both the web server (port 3000) and the image worker (port 4001). Avatar, photo, and curator video uploads route through the image worker over HTTP in the four-container topology (nginx + web + worker + image; see DEVOPS_GUIDE.md (private GitHub repo)); `npm run dev` alone fails uploads because no worker is listening. `./run_dev.sh` keeps both alive and tears both down on Ctrl+C; see also `npm run dev` and `npm run dev:image` if you want to run them individually for debugging.

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

If direct SSH to the VM IP is not reachable (depending on the UTM network mode), add a VM port forward for SSH (Mac `localhost:2222` to guest port 22) and connect through it, keeping the same app-port tunnel. This `2222` is local to UTM and unrelated to the `2222` used for SSH to the AWS Lightsail host (AWS_OPERATIONS.md, private GitHub repo):

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
- `npm run test:smoke`; staging AWS smoke tests under `tests/smoke/`; run only when the user explicitly asks "run ALL tests" or when verifying staging AWS wiring. Requires the `footbag-staging-runtime` AWS profile and accessible Terraform staging state; a developer granted AWS access configures that workstation profile per DEVOPS_GUIDE.md (private GitHub repo), "Operator-workstation staging readiness smoke test".
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

> **Real-data testing, for developers and testers.** With the operator dataset loaded, two opt-in gates exercise the real migrated data, and both SKIP cleanly on a fixture-only clone. The **real-claim crawl** (`--with-persona-crawl`) builds a claimed account for a real migrated record via `GET /dev/build-claim?as=<legacy_member_id>` and walks its surfaces (profile, honors, results, media, any co-led club), proving migrated data renders and behaves once claimed; it defaults to the numerically-lowest Hall-of-Fame honoree carrying a legacy link, or target a specific record with `PERSONA_CRAWL_LEGACY_ID`. The **read-only invariant gate** (`--with-realdata-invariants`) runs whole-population reconciliation and referential-integrity checks over the loaded data, emitting counts and pass/fail only — never names or emails. To run either: do the full data load (below), start `./run_dev.sh`, then `./run_all_tests.sh --with-persona-crawl` and/or `./run_all_tests.sh --with-realdata-invariants`. To become a real claimed account interactively, browse to `GET /dev/build-claim?as=<legacy_member_id>`. Both gates re-point at staging with an env var — `PERSONA_CRAWL_BASE_URL` aims the crawl at a running staging stack, `FOOTBAG_DB_PATH` aims the invariant gate at the staging database. The full flag set with defaults lives in `./run_all_tests.sh -h`. The human stratified-sampling walk that complements these gates is an operator procedure in DEVOPS_GUIDE.md (private GitHub repo).
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

Bring the full four-container stack (nginx, web, worker, image) up with the one-command wrapper. It runs in the foreground and tears the stack down automatically on Ctrl+C, exit, or crash, so use a second terminal for the smoke checks below:

```bash
npm run compose:dev
```

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

> These are advanced shortcuts for maintainers and testers. None of them are needed to reach hello world or run the default test suite; a new developer can skip this section. The tester journey is the developer journey above plus the persona switching in §1.14.2.

#### 1.14.1 Dev admin allowlist (maintainers)

Admin in dev confers the curator role, which authors real `/curated/` content (the committed source of truth), so it is restricted to the project maintainers and is not a default setup step. Normal local development needs no admin, and a new developer does not self-grant it. If you need admin for a specific task, coordinate with a maintainer rather than adding yourself.

For reference, the mechanism: the dev site auto-promotes a registrant whose normalized email is listed in the gitignored `.local/initial-admins.txt` allowlist (one email per line; `#` comments and blank lines allowed). A member whose email is not listed registers normally as a non-admin. The `.local/` directory is gitignored; never commit a file containing email addresses.

Staging uses the same allowlist but reads it from an env var, not a file. The deploy pipeline parses your workstation's `.local/initial-admins.txt` into `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` and writes it into `/srv/footbag/env` on the staging host; the staging runtime reads the env var. The file path is not consulted on staging because the staging container runs `NODE_ENV=production`. For production, three layers of defense prevent the dev/staging allowlist from firing: the deploy pipeline refuses to write the env var on a production host, the env-config fail-fast refuses to boot a production process with the var set, and the production docker overlay carries an explanatory comment documenting the no-op intent. Production-first-admin uses a separate SSM-stored claim-token mechanism described in DESIGN_DECISIONS §2.9 and operationally documented in DEVOPS_GUIDE.md (private GitHub repo), "Production first-admin bootstrap".

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

Defects are filed in the maintainers' private tracker (GitHub Issues on the private operations repository) using its Bug template: state observed versus expected behavior with the exact route or surface, reference members by record id and structural description (never name plus contact data), and never paste secret values. Security vulnerabilities go through GitHub's private vulnerability reporting on this public repository (see `SECURITY.md`), never a regular issue.

Per `docs/TESTING.md` §9.6, every closed bug lands with a regression test at the cheapest appropriate layer. A bug without a regression test is not closed.

### 1.16 What's next

With hello world running and the tests green, here is where to go next:

- **Architecture orientation:** Path B (§2) for the mental model, scope boundaries, and repo map. Read it before doing code work.
- **More tests:** `./run_all_tests.sh` runs the fuller suite; `--full` adds the pentest, the staging-AWS smoke, and the persona-crawl. On a fixture-only clone (no operator data, no AWS profile) the staging-smoke and persona-crawl skip with a warning, so the run still completes green.
- **The full dataset:** load the optional operator dataset and footbag.org mirror (§1.10A) when you need the real event archive and member roster; both are gitignored maintainer handoffs.
- **Testers:** browse and switch between seeded personas at `/dev/personas` and read captured dev/staging mail without a real inbox; the full tester runbook is `docs/TESTING.md` §16.
- **AWS deployment and operations:** staging and production bring-up, hardening, and activation live in AWS_OPERATIONS.md (private GitHub repo); running AWS commands requires access to the private operations repository.

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

The layered shape is the right mental map. The tree below shows the original events slice; the current `src/` keeps the same layout at much larger scale (about 42 controllers, 89 services, and 11 adapters under `src/adapters/`, plus the admin, member, media, freestyle, clubs, net, and other sections).

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

## 4. AWS deployment and operations

AWS staging and production deployment for this project, the Terraform apply, host bring-up, production-readiness hardening, runtime AWS identity and transactional email activation, and production activation, is documented in AWS_OPERATIONS.md (private GitHub repo), the canonical AWS reference. Running any AWS command requires access to the private operations repository, and a contributor is invited to it before doing AWS work. Local development and the architecture orientation above need no AWS access.

## 5. Appendices

### 5.1 Troubleshooting reference

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

### 5.2 Deterministic seed-data reference

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

### 5.3 Smoke-check contract

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

### 5.4 Authoritative project facts preserved by this guide

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

### 5.5 Official references

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

