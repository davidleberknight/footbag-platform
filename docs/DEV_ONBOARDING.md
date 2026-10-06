# Footbag Website Modernization Project --  Developer Onboarding Guide

## Local Quickstart and Architecture Orientation

This guide helps contributors understand how the platform is structured and get it running locally (view working pages in your browser). It is the single ordered developer procedure: clone the repository, run `bash scripts/setup-dev-workstation.sh`, start the site with `./run_dev.sh`, and run the complete local test suite with `./run_all_tests.sh`.

> **Who you are (pick your lane).** This guide serves four kinds of contributor:
>
> - **New developer** — run it locally and learn the architecture. Lanes: Path A, then B.
> - **New tester** — run it locally; browse and switch between seeded personas at `/dev/personas` and read captured dev mail without a real inbox. Lanes: Path A, then the persona/tester harness (see `docs/TESTING.md` §16).
> - **Initial operator / AWS maintainer** — owns AWS, applies Terraform, performs production activation, and claims the first admin. Starts here at Path A and Path B; AWS work is outside this guide (see §3).
> - **Other actors** — the historical-data and freestyle pipeline maintainer and docs/design contributors work mostly outside this guide; start at Path B for orientation, then their domain: the pipeline maintainer runs `legacy_data/run_pipeline.sh` and `freestyle/run_freestyle.sh` (and loads the gitignored operator dataset per §1.10A), while design and content contributors work in `docs/` and `src/views/`.

> **Choose your path**
>
> - **Path A**; I am a brand-new contributor on Windows + WSL. I need to clone the repo with HTTPS, install the tools, start the dev server, load the public pages locally, and run the tests.
> - **Path B**; I need the architecture mental model, scope boundaries, and workflow rules.
> - **AWS deployment and operations**; §3 says how staging access is granted.

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
  - [1.14 Dev and tester tooling (advanced)](#114-dev-and-tester-tooling-advanced)
  - [1.15 Filing a bug](#115-filing-a-bug)
  - [1.16 What's next](#116-whats-next)
- [2. Path B — Orientation: what this project is and how to think about it](#2-path-b--orientation-what-this-project-is-and-how-to-think-about-it)
  - [2.1 Project purpose and philosophy](#21-project-purpose-and-philosophy)
  - [2.2 Document relationships](#22-document-relationships)
  - [2.3 Current scope](#23-current-scope)
  - [2.4 Route contract and UI contract](#24-route-contract-and-ui-contract)
  - [2.5 Architecture mental model](#25-architecture-mental-model)
  - [2.6 Repo map](#26-repo-map)
- [3. AWS deployment and operations](#3-aws-deployment-and-operations)
  - [3.1 Staging as a dev-and-tester](#31-staging-as-a-dev-and-tester)
- [4. Appendices](#4-appendices)
  - [4.1 Troubleshooting reference](#41-troubleshooting-reference)
  - [4.2 Deterministic seed-data reference](#42-deterministic-seed-data-reference)
  - [4.3 Smoke-check contract](#43-smoke-check-contract)
  - [4.4 Authoritative project facts preserved by this guide](#44-authoritative-project-facts-preserved-by-this-guide)
  - [4.5 Official references](#45-official-references)

---

## 1. Path A — Local quickstart for a new contributor

### 1.1 Goal of this path

Success for this path means you can:

- clone the GitHub repo
- install every tool and dependency with `bash scripts/setup-dev-workstation.sh`
- launch the dev server with `./run_dev.sh`, which builds the local DB on first run
- verify `/events`, `/events/year/2020`, an event detail page, `/health/live`, and `/health/ready` in a browser (hello world)
- run the test suite, then the complete local gate with `./run_all_tests.sh`
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

macOS and native-Linux contributors are fully supported. The simplest Mac path is an Ubuntu VM (for example UTM); every step works the same except reaching the running site in your browser, which uses an SSH tunnel into the VM (see §1.8). The setup script (§1.5) supports x86_64 Ubuntu, native or under WSL. On an ARM machine, such as an Apple Silicon Mac or an ARM Ubuntu VM, adapt its steps by hand to the same pinned versions; there the Python loaders use Python's built-in SQLite module, because the pinned SQLite wheel is published for x86_64 only. Only §1.4 step 1 (WSL) is Windows-specific; on any non-Windows Ubuntu, start at §1.4 step 2.

### 1.3 Required tools

One canonical, idempotent script installs every tool the repository needs, at the version the push gate pins, and nothing you already have: `bash scripts/setup-dev-workstation.sh`, run from inside the clone (§1.5). It covers:

- the system `python3` pointed back at Ubuntu's own interpreter if it was changed, because apt's own tools only load under that one (the project always names its pinned interpreter instead)
- the apt baseline: `build-essential`, `python3`, `python3-venv`, `python3-pip`, `sqlite3`, `ffmpeg`, `git`, `unzip`, `zip`, `jq`, `ca-certificates`, `curl`, `openssh-client`, `rsync`, `gpg`, `age`, and `lsof`
- Python at exactly the version in `.python-version`, as a checksum-verified standalone build under `~/.local`
- Node at exactly the version in `.nvmrc`, through a pinned, checksum-verified `nvm`
- the `gitleaks` secret scanner at the push gate's version, unless a running Docker can supply it
- Terraform at the push gate's version
- the npm dependencies, with `npm ci` unless `node_modules` already holds every package at the version `package-lock.json` pins
- Playwright's Chromium browser with its system libraries
- the two Python environments: the seeder environment under `scripts/.venv`, and the legacy pipeline environment built by `bash legacy_data/run_pipeline.sh venv`. Both serve only the pre-go-live migration pipelines, which are deleted after cutover.
- the repository's git hooks

Every download is compared with a pinned checksum before anything from it is unpacked. The script shows its plan and changes nothing until you type `APPLY`; `--check` reports what it would install and changes nothing, and `--yes` accepts the confirmation in advance. Re-run it any time: on a machine that already has everything, it reports that there is nothing to do.

Docker is the one prerequisite the script does not install; it reports Docker's state and §1.13 covers the install. The AWS CLI is for operators and dev-testers only: `bash scripts/setup-dev-workstation.sh --aws` adds the pinned AWS CLI v2.

Claude Code (`@anthropic-ai/claude-code`) is required for all contributors, but it is not needed to run the site or the tests; set it up after your first hello-world success (§1.10B).

For the local Docker parity check (§1.13), also have:

- Docker: Docker Desktop with WSL integration on Windows, or Docker Engine (`docker-ce`) from
  Docker's apt repository on native Linux or inside the Mac VM. Install and verify steps are in
  §1.13, which covers all three.
- `docker compose` support (the `docker-compose-plugin` package on native Linux)
- Cursor on Windows
- Free memory, if you will also deploy: the image build runs on your workstation rather than on
  the host, and it needs roughly 2 GB free as a floor, 3 GB to be comfortable. A build with under
  a gigabyte available fails as a V8 heap exhaustion partway through rather than as a clear
  out-of-memory message. Free memory is what counts, not installed memory, so close the browser
  before a deploy on a smaller machine.

**Every version is pinned.** The npm dependencies are exact in `package.json` and locked in `package-lock.json`, so install them with `npm ci`, never `npm install`, and change a version or an override only with `scripts/pin-npm-package.sh`. Node comes from `.nvmrc` (22.22.1), which `package.json` `engines` requires exactly; Python comes from `.python-version` (3.12.12). The Python packages come from hash-pinned `requirements.txt` files, compiled from their `requirements.in` files by `scripts/lock-python-deps.sh` and installed with `--require-hashes`. Terraform is pinned exactly (1.14.7). A convention gate refuses any unpinned version.

Notes:

- `better-sqlite3` compiles a native addon during install, which is why `build-essential` is required; if you switch Node versions afterward, run `npm rebuild`
- `ffmpeg` is required by the local database reset: the curator seed re-encodes the committed demo videos through it

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

#### 2. Make sure `git` is available

Everything else installs from inside the clone, so `git` is the one tool you need first. Ubuntu and WSL Ubuntu usually ship it. In the Ubuntu Linux terminal shell, check:

```bash
git --version
```

Only if that command is not found, install it:

```bash
sudo apt update && sudo apt install -y git
```

These two steps, the clone, and the setup script in §1.5 are everything required to reach hello world. Git configuration and Claude Code are set up after your first green run (§1.10B); Docker is only for the parity check (§1.13).

### 1.5 Clone and Install the Project GitHub Repository

Clone via HTTPS; no SSH key required (run commands one at a time):

```bash
mkdir -p ~/GIT
cd ~/GIT
git clone https://github.com/davidleberknight/footbag-platform.git
cd footbag-platform
```

> **Clone from inside WSL (Windows).** Keep the repo in the Linux filesystem (for example `~/GIT/footbag-platform`), not under `/mnt/c/...`. The repo's `.gitattributes` keeps shell scripts LF-terminated, but if you ever see `bash: ...^M` errors the checkout picked up Windows CRLF line endings; re-clone from inside WSL rather than repairing it by hand.

Then install every tool and dependency (§1.3 lists what it covers):

```bash
bash scripts/setup-dev-workstation.sh
```

It prints its plan and asks you to type `APPLY`; parts of it use `sudo`. When it finishes, **open a new terminal** so the freshly installed Node (through `nvm`) and the tools under `~/.local/bin` are on your `PATH`, and confirm from the repository root:

```bash
cd ~/GIT/footbag-platform
bash scripts/setup-dev-workstation.sh --check
node -v
which node
```

`--check` exits 0 and reports nothing to do; `node -v` prints the version in `.nvmrc`; `which node` resolves to a path under `/home/...`, not `/mnt/c/...`. If the script reports something still missing, open a new terminal and run it again.

The git hooks activate on their own: npm's prepare step runs `scripts/install-git-hooks.sh` on every install, and so does every run of `./run_dev.sh` and `./run_all_tests.sh`. Confirm with `git rev-parse --git-path hooks`, which ends in `.githooks`. The pre-commit hook scans your staged changes for secrets with `gitleaks`, natively at the pinned version or through a running Docker; on a machine with neither (a different native version counts as neither) it warns and allows the commit, and CI runs the scan on every push.

If installing the npm dependencies fails while compiling `better-sqlite3`:

- confirm `node -v` matches `.nvmrc`
- confirm `build-essential` is installed
- confirm `which node` points to the WSL/Linux binary
- then delete `node_modules` and rerun `npm ci`

### 1.6 Local env file

You do not need one to reach hello world. Every value the app requires carries a development default in the config loader: the port, the public base URL, the database path, and the two secrets that have no default on a deployed host, the session signing key and the web-to-worker key. Those two fall back to fixed literals, which is safe because neither authenticates anything beyond your own machine, and the host verifier refuses both by name so they cannot reach a server. A clean checkout runs.

The docker stack is the one exception. It sets `NODE_ENV=production` deliberately, for parity with the deployed system, so the development fallbacks do not apply to it and both secrets are required exactly as they are on a host. `npm run compose:dev` generates a pair per run, so it too needs no file.

Create a `.env` when you want a setting to differ from a default, or to persist between runs:

```bash
cp .env.example .env
```

Anything the file sets wins over a default, because the loader only falls back when a variable is unset.

Nothing requires the file, deploying included. The post-deploy smoke check probes the address the deployed host records it serves, and a production deploy asks the staging host for its address the same way before verifying staging, so no site address needs a copy on the workstation.

A local `.env` looks like:

```
COMPOSE_FILE=docker/docker-compose.yml
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
FOOTBAG_DB_PATH=./database/footbag.db
PUBLIC_BASE_URL=http://localhost:3000
```

Every line there restates a default, so a file holding exactly this changes nothing. Keep it small: put in it only what you want different.

Use local `.env` for:

- local-only development values
- non-secret defaults
- a credential you issued to yourself in a vendor's sandbox, such as the signing secret the payment provider's local listener prints

Never put a project credential in it. The project's own keys for AWS, payments, the URL-reachability check and the form widget live in AWS Systems Manager Parameter Store, are read at runtime by an authenticated identity, and a copy on a workstation sits outside every rotation the project runs.

Do not commit `.env` (make sure it is in your .gitignore)

### 1.7 Reset the local database

A fresh clone has no database yet. The event inputs the loader reads (`legacy_data/event_results/canonical_input/`) are committed real competitor data (event results and historical persons, with no member emails or contact data), so `reset-local-db.sh` applies the schema and loads them directly. Build it with one command:

```bash
bash scripts/reset-local-db.sh
```

It needs the `sqlite3` CLI and the pinned Python (installed by the setup script in §1.5) and uses the seeder Python environment under `scripts/.venv`, building or repairing it when it does not work at the pinned version and proving it satisfies the hash-pinned `scripts/requirements.txt`. It applies the schema, loads the committed seed CSVs, and builds the freestyle tables via `freestyle/run_freestyle.sh`, so no separate freestyle build is needed. `./run_dev.sh` (§1.8) runs this automatically when `database/footbag.db` is missing, so on a fresh clone `./run_dev.sh` alone reaches a seeded, browsable site.

Two real-data inputs power the full dataset, and a hello-world clone needs neither:

- the footbag.org **mirror**, reached through the gitignored `footbag_legacy_mirror` repo-root symlink (wire it with `ln -s legacy_data/legacy_mirror/mirror_footbag_org footbag_legacy_mirror` from the repo root when the crawl lives in this checkout), used to regenerate canonical event data from source (the `--soup-to-nuts` / `run_pipeline.sh full` path);
- the **IFPA member roster** (`legacy_data/membership/inputs/membership_input_normalized.csv`), gitignored because it is a maintainer handoff no committed source can regenerate, used for the full member load. It holds member names, membership status, expiration and tier, and no email addresses or other contact data.

Both are separate maintainer handoffs; request them only when you need the full data load. The committed real event data and seed CSVs are enough to run and browse the site locally. (The legacy member load is a third, maintainer-only track with inputs of its own — the legacy database dump plus, for a production build, recorded human rulings held in the maintainers' private checkout; a machine without them loads anyway and says so. `legacy_data/member_data_scripts/README.md` covers it.)

Expected result:

- `reset-local-db.sh` completes without error
- `database/footbag.db` is built
- the app has the committed real event archive for local browsing

Re-run `bash scripts/reset-local-db.sh` when you want a clean rebuild, and only then. It is a reset, not a refresh: it deletes `database/footbag.db` and rebuilds it from committed inputs, discarding database-native curator work that no committed file can restore — authored adjudication drafts, publication and resolution state, curator-created canonical tricks, and application-only aliases, source links and modifier links.

To pull committed freestyle input changes into the database you already have, run `freestyle/run_freestyle.sh` instead. It reconciles in place, preserves database-native curator authority, never deletes the database file, and is safe to re-run: a second run straight after the first changes nothing. Run it on its own only when you are keeping the database you have; every rebuild path runs it as one of its own stages, so a rebuild is never followed by a separate refresh.

### 1.8 Run the dev server

```bash
./run_dev.sh
```

Before launching, it installs the npm dependencies with `npm ci` unless `node_modules` already holds every package at the version `package-lock.json` pins, activates the git hooks, reports any missing tool, builds the seeder and legacy pipeline Python environments, and builds the local database if `database/footbag.db` is missing. It then launches three processes: the web app (port 3000), the image worker (port 4001), and the outbox worker. Avatar, photo, and curator video uploads route through the image worker over HTTP, mirroring the deployed four-container topology (nginx, web, worker, image); `npm run dev` alone fails uploads because no image worker is listening. `./run_dev.sh` keeps all three alive and tears them down on Ctrl+C; `npm run dev`, `npm run dev:image`, and `npm run dev:worker` run them individually for debugging.

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

If direct SSH to the VM IP is not reachable (depending on the UTM network mode), add a VM port forward for SSH (Mac `localhost:2222` to guest port 22) and connect through it, keeping the same app-port tunnel. This `2222` is local to UTM and unrelated to the `2222` used for SSH to the AWS Lightsail host:

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

Run the suite to confirm your environment is healthy end to end; it is self-contained (integration tests use their own ephemeral SQLite databases) and does not need the dev server running. It does need the legacy pipeline Python environment, which the setup script and `./run_dev.sh` build (or build it alone with `bash legacy_data/run_pipeline.sh venv`); packages installed into the system `python3` are not used.

The suite is split:

- `npm test`; unit + integration suites only; the default everyday verification. Excludes smoke, e2e, and dev-only crawls via `vitest run --exclude 'tests/smoke/**' --exclude 'tests/e2e/**' --exclude 'tests/dev/**'`.
- `npm run test:unit`; pure-function tests under `tests/unit/`; no DB.
- `npm run test:integration`; HTTP-via-supertest tests under `tests/integration/`; each file owns its own temp SQLite DB via `tests/fixtures/testDb.ts`. A few files drive committed command-line scripts as subprocesses under the legacy pipeline Python environment.
- `npm run test:smoke -- --target staging`; staging AWS smoke tests under `tests/smoke/`; run only when verifying staging AWS wiring, and only with staging access (§3).
- `npm run test:strong-hash`; re-runs the password-hash and anti-enumeration login-timing tests at full production argon2 cost (the default suite uses a cheap test-only hash profile for speed). Run on demand to validate the real hashing path.
- `npm run test:quick`; the fast pre-commit loop, exactly `./run_all_tests.sh --quick`; build + test type-check + lint + conventions check + harness self-check + generated-content + secret scan + unit + integration. The bare `./run_all_tests.sh` is the push and PR gate.
- `npm run test:e2e`; Playwright browser tests under `tests/e2e/`; spins up the full stack locally with an ephemeral DB.
- `npm run test:watch`; vitest in watch mode for fast iteration.
- `npm run build`; `tsc -p tsconfig.json` typecheck. Must pass before any PR.

The suite includes a migration-testing cluster under `tests/integration/` that exercises the legacy-data import path (legacy-claim merge, the matching rules, the claim step's cards, transaction atomicity).

#### The full local suite (`run_all_tests.sh`)

`npm test` is the whole unit and integration run, and a focused `npx vitest run <file>` is the inner loop. `./run_all_tests.sh --quick` is the commit loop, and the bare `./run_all_tests.sh` is the push and PR gate:

```bash
./run_all_tests.sh --quick    # before a commit (what npm run test:quick runs)
./run_all_tests.sh            # before a push or PR: the complete local suite
./run_all_tests.sh --plan     # print the rows a run would schedule, and run nothing
./run_all_tests.sh --skip-py  # the full run minus the pre-go-live Python gates; ends INCOMPLETE, no pass receipt
                              # (the default flips to skipping them once that Python is declared done)
```

The setup script (§1.5) already installed the Playwright browser the e2e gates drive, and every tool the gates use. The runner prints a report of missing or wrong-version tools before any gate starts, and refuses to start only when `sqlite3` or `curl` is missing, because every gate needs them. A push-gate check whose own tool is absent (the gitleaks secret scanner with no running Docker to supply it, or Terraform) skips itself; CI runs it on every push, so the run can still pass, and it ends with a warning that this machine lacks a tool the project uses, naming each skipped check. Re-run `bash scripts/setup-dev-workstation.sh` to install what it names.

Developers and testers run the bare `./run_all_tests.sh` before a push, and it is meant to pass for them on a plain workstation: it contacts no deployed environment and needs no AWS identity or role. It runs every CI job that is safe on a workstation, each test once, most of them inside the clean room, which rebuilds the tree in a throwaway worktree with an empty home directory and runs them as the push gate sees it. The accessibility specs run inside the e2e gate. The only push-gate jobs it cannot carry are the two GitHub-hosted ones, CodeQL static analysis and the pull-request dependency review. A GREEN run writes the local pass receipt a production release needs. A run ends INCOMPLETE when a check standing for a push-gate job produced no result (for example, `--skip-secret-scan` left the scan out), and VOID when the tree changed while it was in flight: the gates did not all read the same source, so their verdict is about no single commit, and the report names each file whose content changed. The individual gate results still stand; only the verdict over them is withdrawn. Hold the tree still, or re-run. What each tier proves, both pass receipts, and production readiness are in `docs/TESTING.md` §11.7, and `./run_all_tests.sh --help` lists every flag.

`--staging` adds four read-only checks against staging to either mode. They need the dev-tester role, which comes with staging access (§3), write nothing to staging, and never touch production:

```bash
scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --quick --staging
```

> **Real-data testing, for developers and testers.** Two rows of the bare run exercise the real migrated data when this machine holds the full authoritative member load (`./run_dev.sh --all-data`, which needs the operator dataset below); without it each reports "not required" and neither holds the run back. The **real-claim crawl** builds a claimed account for one real migrated record via `GET /dev/build-claim?as=<legacy_member_id>` on a local dev stack the row boots over `FOOTBAG_DB_PATH` or `database/footbag.db`, and checks that the owner reaches its edit page and the profile renders cleanly; it defaults to the numerically-lowest Hall-of-Fame honoree carrying a legacy link, or target a specific record with `PERSONA_CRAWL_LEGACY_ID`. `PERSONA_CRAWL_BASE_URL` may name another loopback address; anything else is refused, because the crawl claims a real record. The **read-only invariant gate** runs whole-population reconciliation and referential-integrity checks over the loaded data, emitting counts and pass/fail only — never names or emails; `FOOTBAG_DB_PATH` aims it at another database. `--with-persona-crawl` and `--with-realdata-invariants` add either row to `--quick`. To become a real claimed account interactively, browse to `GET /dev/build-claim?as=<legacy_member_id>`.
>
> **Final note — the full data load needs operator data kept out of GitHub.** The full loads (`./run_dev.sh --from-csv`, and `./run_dev.sh --all-data` for the authoritative member load the real-data rows need) require the operator dataset, which a fresh clone does not have. Part of it is the IFPA member roster, `legacy_data/membership/inputs/membership_input_normalized.csv`, which is kept out of GitHub as a maintainer handoff no committed source can regenerate; it holds member names, membership status, expiration and tier, and no contact data. Request the dataset from the project maintainer if you need the full load. The hello-world journey above and the default `./run_all_tests.sh` need none of it; they run entirely on committed data (the committed canonical event data plus the committed seed CSVs).

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

New adapters (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, future) land with three permanent tests per `.claude/rules/adapter-conventions.md`:

1. Boot-time config test in `tests/unit/env-config.test.ts`; `src/config/env.ts` fails fast at module load when required prod-mode env vars are absent.
2. Interface parity test in `tests/integration/adapter-parity.test.ts`; both implementations satisfy the TypeScript interface and produce identical-structure observable outputs (injected fake AWS client, not a mocked SDK).
3. Staging-smoke test in `tests/smoke/`; hits real staging AWS via assumed-role chain; gated behind `RUN_STAGING_SMOKE=1`.

#### Dev test libraries

`npm ci` brings in the dev-only libraries below. No further setup is required for the contributor unless noted.

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

Exits non-zero on moderate-or-higher advisories when run by hand; CI and `./run_all_tests.sh` report its findings as warnings and never fail on them. Per `docs/TESTING.md` §9.

#### Pentest tooling

**OWASP ZAP.** Heavyweight pentest scanner, run as a Docker image rather than an npm package. The pentest scripts under `scripts/pentest/` pin the image by digest (`ghcr.io/zaproxy/zaproxy@sha256:...`) and Docker pulls it automatically on first use, so there is nothing to install; the ZAP leg of `test:pentest:heavy` needs a running Docker and skips without one. A scan that does not finish within its time limit is stopped and reported NOT RUN, so a hung container cannot stall the run.

Per `docs/TESTING.md` §9.3. Operator-invoked; never runs unattended against production.

### 1.10A Optional: load the full operator dataset

The hello-world clone runs on the committed real event data (`canonical_input`) plus the committed seed CSVs (public member and club names). The full real dataset needs two inputs that are gitignored and handed off separately by the maintainer, never committed:

- the footbag.org **mirror** (`legacy_data/legacy_mirror/mirror_footbag_org/`, reached through the `footbag_legacy_mirror` repo-root symlink), an offline archival crawl of the live site that the pipeline parses to regenerate canonical event data. It is large (roughly 55 to 60 GB) and is normally taken as a maintainer handoff rather than re-crawled. To regenerate it from scratch, run the crawl from the repo root via `legacy_data/legacy_mirror/create_mirror_footbag_org.py <member_email>` (inside the `legacy_data` Python venv; leave the password off the command line and the crawler asks for it with a hidden prompt): a member account login reaches member-only content, `ffmpeg` is required (every fetched image and video is re-encoded through it to strip malware), and the crawl runs for multiple days, saving progress so it resumes after an interruption.
- the **IFPA member roster** (`legacy_data/membership/inputs/membership_input_normalized.csv`), a curated CSV of the IFPA membership (names, status, expiration and tier, no contact data) kept out of GitHub as a maintainer handoff no committed source can regenerate. It drives the full member load and is the input the `--from-csv` enrichment pass reads.

Request whichever you need from the maintainer, then load:

```bash
# All three DESTROY the local database and discard curator work. For an ordinary
# freestyle refresh, run freestyle/run_freestyle.sh instead. Each of these runs
# the freestyle build as one of its own stages, so never follow one with a
# separate refresh.
./run_dev.sh --from-csv      # full enrichment rebuild + media + personas; no mirror, no dev-admin allowlist; needs the member roster
./run_dev.sh --all-data      # everything --from-csv does, plus the legacy member load; the rebuild path for a database that already carries member data, which --from-csv would leave empty
./run_dev.sh --soup-to-nuts  # everything --from-csv does, plus mirror rebuild + the dev-admin allowlist
```

The **freestyle** tables are not part of this handoff: `freestyle/run_freestyle.sh` builds them from committed inputs (and `reset-local-db.sh` runs it automatically), so freestyle content is already complete on a fresh hello-world clone. On a clone that has been used, that command is also the routine refresh: two kinds of data live in these tables, and it treats them differently. Everything built from `freestyle/inputs/` is reproducible and is reconciled from the files. What curators create through the application is in no committed file and is preserved rather than rebuilt.

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

Claude Code is the one tool installed outside `scripts/setup-dev-workstation.sh` and its pinned versions: nothing in the repository runs it, and it updates itself in place, so a pin would not hold.

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
2. Write the key into AWS Systems Manager Parameter Store as a SecureString at `/footbag/<environment>/secrets/safe_browsing_api_key`, with `scripts/provision-url-screening-key.sh --target <environment> store`, which prompts for the value so it never reaches a process argument list or your shell history. There is deliberately no workstation file for this: a credential on a laptop sits outside every rotation the project runs, so the key lives in one store and the adapter reads it from there.
3. In your local `.env`: `SAFE_BROWSING_ADAPTER=live` (uncomment the line
   that ships in `.env.example`), plus `SECRETS_ADAPTER=live`. This step needs
   a configured AWS profile; without one, leave the default stub in place.
4. Export `FOOTBAG_ENV` in the shell, matching the environment you wrote the
   parameter into — the adapter derives its Parameter Store prefix from it, so
   this is what decides which key it reads:

   ```
   FOOTBAG_ENV=staging ./run_dev.sh
   ```

   It has to be exported rather than set in `.env`. The launcher establishes
   the label before Node starts, and `dotenv` never overrides a variable that
   is already set, so an `.env` entry is read after the decision has been made
   and changes nothing. The launcher defaults to `development` when you do not
   export one, which sends every lookup to `/footbag/development/...`, where
   no parameter exists.
5. The validator now calls Google for every external URL submitted through the
   admin, curator and member gallery edit flows.

To run `safe-browsing.smoke.test.ts` against a personal
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

**Install Docker, the container runtime, first (if you have not already).** The setup script reports Docker's state but does not install it.

On **native Linux**, install Docker Engine from Docker's own apt repository rather than the distribution's `docker.io` package, which lags and ships an older Compose. Follow Docker's "Install Docker Engine on Ubuntu" instructions for the repository setup, then `sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`. Add yourself to the `docker` group (`sudo usermod -aG docker "$USER"`) and open a new shell so the membership applies; without it every command below needs `sudo`. There is no Docker Desktop in this path and none is needed.

On **Windows**, install Docker Desktop, enable the **WSL 2 based engine**, and enable WSL integration for your Ubuntu distro.

On **macOS**, if you are using the Ubuntu VM path from §1.2, install Docker Engine inside the VM as for native Linux.

Then verify from the Ubuntu shell:

```bash
docker --version
docker compose version
```

> **Note on secrets and `.env`:** The stack runs `NODE_ENV=production` for parity with the deployed system, so it needs both shared secrets. `npm run compose:dev` generates a pair per run when nothing supplies them, and passes your `.env` to Compose only when one exists, so a `.env` is optional here too. Precedence: an exported shell value wins, then a `.env` entry, then the generated value.

> **Note on TypeScript compilation:** The `docker/web/Dockerfile` is a multi-stage build that runs `npm run build` inside the builder stage. You do not need to run `npm run build` before building the images; the Dockerfile handles compilation internally.

Bring the full four-container stack (nginx, web, worker, image) up with the one-command wrapper. It builds the images, runs in the foreground, and tears the stack down automatically on Ctrl+C, exit, or crash:

```bash
npm run compose:dev
```

In a second terminal, run the smoke checks against the containerized local app:

```bash
BASE_URL=http://localhost ./scripts/smoke-local.sh
```

What you are proving here:

- nginx fronts the web container correctly
- the runtime container shape behaves like deployment shape
- the DB mount path is correct
- web and nginx stay healthy under Compose

Bring the stack down when done by pressing Ctrl+C in the terminal running `npm run compose:dev`; the wrapper removes the containers itself.

### 1.14 Dev and tester tooling (advanced)

> These are advanced tools for maintainers and testers. None of them are needed to reach hello world or run the default test suite; a new developer can skip this section. The tester journey is the developer journey above plus the persona switching in §1.14.2.

#### 1.14.1 Dev admin allowlist (maintainers)

Admin in dev confers the curator role, which authors real `/curated/` content (the committed source of truth before go-live), so it is restricted to the project maintainers and is not a default setup step. Normal local development needs no admin, and a new developer does not self-grant it. If you need admin for a specific task, coordinate with a maintainer rather than adding yourself.

For reference, the mechanism: the dev site auto-promotes a registrant whose normalized email is listed in an operator-local allowlist (one email per line; `#` comments and blank lines allowed). A member whose email is not listed registers normally as a non-admin. The allowlist carries maintainer email addresses, so it lives in the maintainers' private operations checkout rather than this one, reached through the canonical repo-root symlink; a developer without that checkout gets an empty allowlist, which is a supported configuration.

Staging uses the same allowlist but reads it from an env var, not a file. The deploy pipeline parses your workstation's copy into `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` and writes it into `/srv/footbag/env` on the staging host; the staging runtime reads the env var. A deploy from a machine without the private checkout leaves the staging value as it is. The file path is not consulted on staging because the staging container runs `NODE_ENV=production`. For production, three layers of defense prevent the dev/staging allowlist from firing: the deploy pipeline refuses to write the env var on a production host, the env-config fail-fast refuses to boot a production process with the var set, and the production docker overlay carries an explanatory comment documenting the no-op intent. Production-first-admin uses a separate SSM-stored claim-token mechanism described in DESIGN_DECISIONS §2.9.

#### 1.14.2 Dev and staging test infrastructure

Several conveniences exist to reduce friction during local manual testing. They are permanent development and staging infrastructure, excluded from the production image at build time rather than removed from source at cutover. The env-var-gated entries refuse to start outside their permitted environments via fail-fast guards in `src/config/env.ts`; the persona-harness operator script runs in development or staging only. Production carries none of them.

| Tool | Type | Allowed envs | What it does |
|---|---|---|---|
| `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` | env var | development AND staging | Email allowlist matched at registration; matching registrants get `is_admin=1` plus a Tier 2 grant plus audit rows in one transaction. The deploy pipeline parses the operator-local allowlist in the private operations checkout into this env var; that same file is the dev source. Production refused at boot and at deploy time. |
| `GET /dev/switch?as=<slug>` | dev route | development and staging | Issues a real session cookie for a seeded persona via the production JWT primitive, so you act as any persona without a login chain. Audit-marked `testkit.persona_switch`. |
| `./scripts/manage-test-personas.sh --seed-test-personas` (or `./run_dev.sh --seed-test-personas`) | operator script | development AND staging | Seeds the canonical persona catalog. The rebuild modes that seed personas (`--from-csv`, `--all-data`, `--soup-to-nuts`) run this too, so a rebuilt database carries the catalog, including its two admin personas, without the dev-admin allowlist being involved. Tier grants marked `dev_persona_seed.tier_grant`. Production blocked by the testkit import guard and the production image strip. |
| `./scripts/manage-test-personas.sh --refresh-test-personas --apply` (or the default refresh on `./run_dev.sh` and a code-only staging deploy) | operator script | development AND staging | Rebuilds every persona from its current spec, deleting persona-owned rows first. The only path that makes an existing database match a changed catalog; reports and writes nothing without `--apply`, and leaves a database with no personas untouched. Production blocked by the same import guard and image strip, and refused for any deploy target but staging. |

Production carries none of these tools. A member who needs a legacy identity linked after onboarding files the identity-link request from their profile, and an administrator applies the link (the `A_Review_Member_Link_Help_Requests` user story).

##### Switch between personas in the browser (/dev/personas)

Removes login friction during local manual testing of tier-gated and member-only flows. Seed the persona catalog once, then open `/dev/personas` to browse every loadable persona and click its Switch link to act as that persona without a login chain (or, if you already know the slug, hit `/dev/switch?as=<slug>` directly):

`./run_dev.sh` sets `FOOTBAG_ENV=development` itself, so nothing needs exporting first:

```bash
./run_dev.sh --seed-test-personas
# then in a browser:
#   http://localhost:3000/dev/personas             (the persona catalog: browse and click Switch)
#   http://localhost:3000/dev/switch?as=t0_fresh   (direct by slug: tier0)
#   http://localhost:3000/dev/switch?as=admin_t2   (direct by slug: admin)
```

The `/dev` router mounts under `FOOTBAG_ENV ∈ {development, staging}`, so the switch surface exists in development and staging but never in production. It issues a real session cookie via the same primitive the production login path uses (`createSessionJwt`), verified by the same auth middleware, then redirects to `/`. The canonical persona catalog lives in `src/testkit/canonicalPersonas.ts`.

For the full tester workflow built on this harness (purchase flow from a fresh persona, the stub-checkout decline button, onboarding/legacy/clubs walk-throughs, and the captured-email card on dev and staging), see the tester runbook in `docs/TESTING.md` §16.

A stub `legacy_members` row with no email and no date of birth (for example before the legacy data dump is loaded) offers nothing to corroborate a self-serve claim, so the onboarding wizard's `legacy_claim` task shows it without a claim control; an administrator links it through the identity-link request after onboarding.


### 1.15 Filing a bug

Defects are filed in the maintainers' private tracker (GitHub Issues on the private operations repository) using its Bug template: state observed versus expected behavior with the exact route or surface, reference members by record id and structural description (never name plus contact data), and never paste secret values. A contributor without access to that tracker reports the same information to the maintainer instead, per `CONTRIBUTING.md`'s "Reporting a problem or proposing work", and the maintainer files it. Security vulnerabilities go through GitHub's private vulnerability reporting on this public repository (see `SECURITY.md`), never a regular issue.

Per `docs/TESTING.md` §9.6, every closed bug lands with a regression test at the cheapest appropriate layer. A bug without a regression test is not closed.

### 1.16 What's next

With hello world running and the tests green, here is where to go next:

- **Architecture orientation:** Path B (§2) for the mental model, scope boundaries, and repo map. Read it before doing code work.
- **More tests:** `./run_all_tests.sh` is the complete local gate: the full suite once, with the unit and integration tiers run as the coverage run inside the clean room, plus the security probes and the pentest's scriptable probes; the OWASP ZAP scan runs only with `--zap`, before a production deploy. It needs nothing but the checkout and contacts no deployed environment; the real-data rows report "not required" without the full member load, and the read-only staging checks run only with `--staging` and the dev-tester role.
- **The full dataset:** load the optional operator dataset and footbag.org mirror (§1.10A) when you need the real event archive and member roster; both are gitignored maintainer handoffs.
- **Testers:** browse and switch between seeded personas at `/dev/personas` and read captured dev/staging mail without a real inbox; the full tester runbook is `docs/TESTING.md` §16.
- **AWS deployment and operations:** see §3. Get the application running locally and under Docker first: infrastructure is stood up after the app it serves, never before.

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
- `/dev` — development and staging only (the persona-switch harness); never mounted in production

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
│  │     └─ error.hbs
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
│  ├─ production/
│  └─ identity/
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

## 3. AWS deployment and operations

Local development, the test suite, and the architecture orientation above need no AWS access. Staging access is granted by a maintainer to fully vetted volunteers only, as a dev-and-tester. A dev-and-tester needs nothing beyond this public repository: no access to the maintainers' private operations repository and no checkout of it. The rest of AWS operations belongs to the maintainers and is documented in that private repository.

### 3.1 Staging as a dev-and-tester

A dev-and-tester has their own host account on staging and their own IAM user, whose only permission is to assume one shared staging job role, `FootbagDevTester`, under their own name. The role reaches staging and nothing in production. The account name is lower case, first name then last, joined by an underscore (`<first>_<last>`), and names both the host account and the IAM user.

**Joining.** Three steps on your own machine, from this checkout, with the maintainer's onboarding run between the first and the second:

1. Make your key pair and send three things:

   ```bash
   bash scripts/setup-dev-workstation.sh --aws \
     --account <first>_<last>
   ```

   It installs the pinned tools, the AWS CLI included, creates the pair at `~/.ssh/id_ed25519_<first>_<last>` if it is missing (asking for a passphrase), and prints the public key line, its SHA256 fingerprint and the address this machine connects from. Send the maintainer the key and the address, and the fingerprint by a different channel, so the key can be checked as it arrives.

   That pair is for staging alone. No step in joining, leaving or coming back changes, moves or deletes any other key in `~/.ssh`, such as the one you use for GitHub. If the key you send is one you already use elsewhere, the acceptance copies it to that path when you type `APPLY` and leaves the original where it is.
2. Accept the onboarding. The maintainer's onboarding places a sealed file that only your key opens in your own account on the staging host, and gives you the command to run, with the staging host's address filled in:

   ```bash
   bash scripts/accept-dev-tester-onboarding.sh --target staging \
     --account <your_account> --host <staging address>
   ```

   It checks your tools first, fetches the sealed file over your own login, and proves it was issued in this project's AWS account before trusting anything in it. It then shows each change and asks you to type `APPLY`: your AWS profiles, the pinned staging host key, the SSH stanza, and your own sudo password in place of the one-time one (at least 12 characters, kept in `~/AWS/DEV_TESTER_HOST.txt`). It removes the sealed file from the host, ends by setting up and checking your workstation as you, and prints an evidence block to send the maintainer.
3. Prove the path with a code-only deploy and the smoke suite, after telling the maintainer:

   ```bash
   bash scripts/as-dev-tester.sh --account <your_account> \
     ./deploy_to_aws.sh
   bash scripts/as-dev-tester.sh --account <your_account> \
     npm run test:smoke -- --target staging
   ```

**Working on staging.** Develop locally with `./run_dev.sh` as before. Reach staging only by putting a command through `bash scripts/as-dev-tester.sh --account <your_account>`, which runs it as you: on AWS as the job role under your name, on the host as your account. A command run without it has no identity and is refused.

- Message the maintainer before any staging deploy, of any kind, every time. Staging is shared, and a deploy can replace what someone else is testing. The read-only `--staging` test rows are exempt.
- A schema change reaches staging with `./deploy_to_aws.sh --public-data`, through the wrapper. It rebuilds staging's database from the committed public inputs alone and replaces it. Staging then lacks the real legacy members, the roster-based enrichment, the account rulings and board flags, and every other member row it held, until a maintainer's full rebuild restores them. The run says so before it starts and as the last thing it prints, and it is refused for production.

**Leaving.** Offboarding disables your host account, retires your AWS identity and its key, and removes your address from the staging allow-list. Your clone of this repository is untouched, and repository access is granted and withdrawn separately. Offboarding removes only the staging pair at `~/.ssh/id_ed25519_<your_account>`, never your other keys. To come back, make a fresh pair, retiring the one your acceptance recorded, and join again from step 1 with the new key; `--replace-key` acts on that one path alone:

```bash
bash scripts/setup-dev-workstation.sh --aws \
  --account <your_account> --replace-key retired
```

## 4. Appendices

### 4.1 Troubleshooting reference

#### Local newcomer setup mistakes

- WSL not installed, or the distro is not actually running in WSL 2 mode (`wsl.exe -l -v` to check)
- repo cloned under `/mnt/c/...` instead of the Linux filesystem
- `which node` resolves to the Windows binary under `/mnt/c/...`
- `node` or `nvm` not found right after the setup script ran; open a new terminal so `nvm` and `~/.local/bin` are on your `PATH`, then re-run `bash scripts/setup-dev-workstation.sh --check`
- Node version drift breaks native addon builds (`better-sqlite3` is built for the Node in `.nvmrc`); re-run the setup script, then `npm rebuild`
- a tool missing or at the wrong version; `bash scripts/setup-dev-workstation.sh --check` names it, and re-running the script without `--check` installs it
- `FOOTBAG_DB_PATH` set in a local `.env` to a path that does not hold the database; remove the line to fall back to the default
- Docker Desktop installed on Windows but WSL integration not enabled for the Ubuntu distro
- `docker` command works in Windows but not in the Ubuntu shell
- the old standalone `docker-compose` v1 tool confused with the `docker compose` v2 plugin
- shell scripts fail with `^M` because repo was cloned or edited outside WSL (CRLF issue)
- `ModuleNotFoundError: No module named 'apt_pkg'` on any command or after `apt-get update`: the system `python3` has been pointed at a Python other than Ubuntu's own, which apt's tools cannot load; `bash scripts/setup-dev-workstation.sh` points it back and repairs any Python environment that change broke

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

### 4.2 Deterministic seed-data reference

These seeded routes are useful for local browser verification and integration tests. The deploy smoke check does not rely on them.


| Route                             | What it proves                               |
| --------------------------------- | -------------------------------------------- |
| /events/event_2025_beaver_open    | completed public event with results          |
| /events/event_2026_draft_event    | key with no public event; expected 404       |
| /events/event_9999_does_not_exist | unknown key returns 404                      |
| /events/year/1899                 | empty year still renders cleanly             |


These are reference checks, not the main onboarding story.

### 4.3 Smoke-check contract

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

### 4.4 Authoritative project facts preserved by this guide

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
- /srv/footbag/env as the file the runtime reads in non-local deployments, mirrored from Parameter Store on every deploy
- Parameter Store as the runtime source of truth for deployed secrets, with a hand edit on the host reverted by the next deploy
- hardened SSH for host access: administrators to the shared account with their own keys, dev-and-testers to their own named staging accounts
- Terraform as the authority for infrastructure, with host bootstrap steps reproducible and reflected in the runbooks

### 4.5 Official references

#### Windows / WSL

- [Microsoft Learn — Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install)

#### Git / GitHub

- [GitHub Docs — Cloning a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
- [Git — `git clone` documentation](https://git-scm.com/docs/git-clone)

#### AWS

- [AWS CLI install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS CLI quickstart](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)
- [Using an IAM role in the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html) — the hand-typed flow, for background; here a dev-and-tester's own profile and the job-role profile that chains from it are written by `scripts/accept-dev-tester-onboarding.sh`
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

