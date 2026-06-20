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

# CUTOVER-REMOVE: dev-admin shortcuts inclusion.
# Current: subtree kept out of the runtime image unless the build explicitly
#   opts in (staging only); production builds default to excluded so
#   `node dist/dev-shortcuts/...` is unreachable inside the prod container.
# Target: remove this ARG and the subtree entirely after production cutover.
ARG INCLUDE_DEV_SHORTCUTS=0
# Current: the internal QC subsystem (dist/internal-qc) ships in source but
#   must never reach a production runtime image; stripped alongside the dev
#   shortcuts as the interim safeguard. The statically-imported router
#   modules are replaced with null stubs so app boot stays intact.
# Target: the QC retirement removes the source subtree and this strip
#   together.
RUN if [ "$INCLUDE_DEV_SHORTCUTS" != "1" ]; then \
      rm -rf dist/testkit dist/dev-bootstrap dist/internal-qc && \
      mkdir -p dist/testkit && \
      printf 'module.exports = { devRouter: null };\n' > dist/testkit/devRoutes.js && \
      printf 'module.exports = { internalRouter: null };\n' > dist/routes/internalRoutes.js && \
      mkdir -p dist/dev-bootstrap && \
      printf 'module.exports = { initDevShortcuts: function () {}, applyDevStagingBootstrapAdmin: function () { return { applied: false }; }, repairAdminTier2Invariant: function () { return { repaired: 0 }; }, getInitialAdminEmails: function () { return new Set(); } };\n' > dist/dev-bootstrap/runtime.js; \
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

# CUTOVER-REMOVE: the David Leberknight build-switch journey reads avatar/photo
# fixtures from src/testkit/assets. tsc does not emit binary assets, so they are
# copied explicitly. They ride the dev-shortcuts: present on staging, stripped
# from the production image alongside the rest of the testkit (build-switch is
# disabled on production regardless).
COPY src/testkit/assets ./src/testkit/assets
RUN if [ "$INCLUDE_DEV_SHORTCUTS" != "1" ]; then rm -rf src/testkit/assets; fi

# Runtime environment — all sensitive values must be injected at deploy time,
# not baked into the image.
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck so compose and container runtimes can detect unresponsive containers
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
