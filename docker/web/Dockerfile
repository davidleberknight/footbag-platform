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

# Copy non-compiled assets that tsc does not process.
# IMPORTANT: these must be explicitly copied — tsc only emits .js files.
# Views path: process.cwd()/src/views  → /app/src/views
# Static path: process.cwd()/src/public → /app/src/public
# Rules content: process.cwd()/ifpa/rules → /app/ifpa/rules (loaded by rulesLoader)
# Symbolic-grammar data: process.cwd()/exploration/symbolic-grammar-2 →
#   /app/exploration/symbolic-grammar-2. symbolicGrammarService reads these
#   committed CSVs at runtime to populate the observational symbolic-grammar
#   panels on the freestyle trick-detail and glossary pages; without this copy
#   the service's missing-file fail-safe leaves those panels silently empty.
COPY src/views  ./src/views
COPY src/public ./src/public
COPY ifpa       ./ifpa
COPY exploration/symbolic-grammar-2 ./exploration/symbolic-grammar-2

# Runtime environment — all sensitive values must be injected at deploy time,
# not baked into the image.
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck so compose and container runtimes can detect unresponsive containers
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
