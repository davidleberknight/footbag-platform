# =============================================================================
# Footbag Platform — Web Container
# Multi-stage build: compile TypeScript in builder, run lean image in runtime.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# Full dev deps needed to compile TypeScript and build better-sqlite3 native.
FROM node:22-alpine AS builder

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


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
# Lean image with only production dependencies.
FROM node:22-alpine AS runtime

WORKDIR /app

# Build tools needed to rebuild better-sqlite3 native addon for this image's
# musl libc target (prebuilt binaries target glibc and won't work on Alpine).
RUN apk add --no-cache python3 make g++

# Install production deps (triggers better-sqlite3 native rebuild for Alpine)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

# Runtime environment — all sensitive values must be injected at deploy time,
# not baked into the image.
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck so compose and container runtimes can detect unresponsive containers
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
