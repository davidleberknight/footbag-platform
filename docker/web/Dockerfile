# =============================================================================
# Footbag Platform — Web Container
# Multi-stage build: compile TypeScript in builder, run lean image in runtime.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# Full dev deps needed to compile TypeScript and build better-sqlite3 native.
# Both stages pin the identical base digest: the runtime stage reuses the native
# addons compiled here, so a different base could pair musl binaries with a
# mismatched C library. A floating tag would also let a hijacked upstream tag
# replace the base layer between rebuilds.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# Install build tools required by better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

# Copy manifests first so dependency layer is cached unless they change
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reduce the installed tree to production dependencies while still in the stage
# that owns the toolchain, so the runtime image can take the compiled addons as
# they are and needs no compiler of its own. Lifecycle scripts stay off: the
# native addons are already built, and re-running them here would be the only
# way this step could rebuild against a different target.
RUN npm prune --omit=dev --ignore-scripts


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
# Lean image with only production dependencies.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

WORKDIR /app

# Production dependencies arrive prebuilt from the builder stage, so this image
# carries no compiler, header, or build-script machinery for an intruder to use.
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JS from builder stage
COPY --from=builder /app/dist ./dist

# Production excludes the dev/staging-only subtrees. The dev-bootstrap
# register-allowlist and the testkit persona harness are permanent development
# and staging infrastructure, never present in production: production builds
# default to INCLUDE_DEV_SHORTCUTS=0, which strips dist/testkit and
# dist/dev-bootstrap. Statically-imported modules are replaced with no-op stubs
# so app boot stays intact.
ARG INCLUDE_DEV_SHORTCUTS=0
# The internal QC subsystem (dist/internal-qc) ships in source but must never
#   reach a production runtime image; it is stripped alongside the dev/staging
#   subtrees as the interim safeguard, and its statically-imported router module
#   is replaced with a null stub so app boot stays intact.
# Target: the QC retirement removes the source subtree and this strip together.
RUN if [ "$INCLUDE_DEV_SHORTCUTS" != "1" ]; then \
      rm -rf dist/testkit dist/dev-bootstrap dist/internal-qc && \
      mkdir -p dist/testkit && \
      printf 'module.exports = { devRouter: null };\n' > dist/testkit/devRoutes.js && \
      printf 'module.exports = { getDevOutboxCaptureClient: function () { return { fetchWorkerCaptured: function () { return Promise.resolve([]); } }; } };\n' > dist/testkit/devOutboxCaptureClient.js && \
      printf 'module.exports = { internalRouter: null };\n' > dist/routes/internalRoutes.js && \
      mkdir -p dist/dev-bootstrap && \
      printf 'module.exports = { applyDevStagingBootstrapAdmin: function () { return { applied: false }; }, getInitialAdminEmails: function () { return new Set(); } };\n' > dist/dev-bootstrap/runtime.js; \
    fi

# Copy non-compiled assets that tsc does not process (tsc emits only .js).
# The convention gate scripts/ci/check_runtime_data_paths_copied.sh enforces that
# every process.cwd()-anchored runtime read resolves under a COPY listed here.
# Views:  process.cwd()/src/views  -> /app/src/views
# Static: process.cwd()/src/public -> /app/src/public
# Rules:  process.cwd()/ifpa/rules -> /app/ifpa (loaded by rulesLoader)
# Symbolic-grammar content needs no COPY: symbolicGrammarService reads the
# symbolic_* database tables at runtime.
COPY src/views  ./src/views
COPY src/public ./src/public
COPY ifpa       ./ifpa

# Everything copied out of the repository arrives carrying the build context's
# permission bits, and the account this image drops to below owns none of it.
# Git records only the executable bit, so a file left owner-only on a build
# machine reads as clean, produces no diff, survives review, and still reaches
# the image unreadable; the first request that renders it then fails on a file
# that is present and correct in every checkout. Setting an exact mode here is
# what makes the layer independent of whatever the build machine happened to
# carry. Explicit octal rather than a+rX: this runs under the base image's
# BusyBox chmod, not the GNU coreutils a workstation has.
RUN find src/views src/public ifpa -type d -exec chmod 755 {} + \
 && find src/views src/public ifpa package.json package-lock.json -type f -exec chmod 644 {} +

# Runtime environment — all sensitive values must be injected at deploy time,
# not baked into the image.
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Drop to the base image's unprivileged account for everything the running
# process does. Root is reserved for the build-time steps above, which is why
# this sits after the last package install and file copy: the application reads
# its own tree and writes only to mounted volumes and the temp directory, so it
# never needs to own anything inside the image.
USER node

# Healthcheck so compose and container runtimes can detect unresponsive containers
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
