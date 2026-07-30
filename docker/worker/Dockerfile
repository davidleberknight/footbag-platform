# =============================================================================
# Footbag Platform — Worker Container
# Runs the AP expiry loop and the email outbox drain.
# Same build pattern as web so images stay consistent.
# =============================================================================

# Both stages pin the identical base digest: the runtime stage reuses the native
# addons compiled here, so a different base could pair musl binaries with a
# mismatched C library. A floating tag would also let a hijacked upstream tag
# replace the base layer between rebuilds.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reduce to production dependencies while the toolchain is still present, so the
# runtime image can take the compiled addons as they are. Lifecycle scripts stay
# off: the native addons are already built.
RUN npm prune --omit=dev --ignore-scripts


FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

WORKDIR /app

# Production dependencies arrive prebuilt from the builder stage, so this image
# carries no compiler, header, or build-script machinery for an intruder to use.
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist

# Production excludes the dev/staging-only subtrees. The dev-bootstrap
# register-allowlist and the testkit persona harness are permanent development
# and staging infrastructure, never present in production: the build strips
# dist/testkit, dist/dev-bootstrap, and dist/internal-qc when
# INCLUDE_DEV_SHORTCUTS != 1. identityAccessService statically imports
# dev-bootstrap/runtime and the worker loads that service through
# operationsPlatformService, so the module is replaced with a no-op stub rather
# than merely removed; a bare rm leaves a dangling require and the worker cannot boot.
ARG INCLUDE_DEV_SHORTCUTS=0
RUN if [ "$INCLUDE_DEV_SHORTCUTS" != "1" ]; then \
      rm -rf dist/testkit dist/dev-bootstrap dist/internal-qc && \
      mkdir -p dist/dev-bootstrap && \
      printf 'module.exports = { applyDevStagingBootstrapAdmin: function () { return { applied: false }; }, getInitialAdminEmails: function () { return new Set(); } };\n' > dist/dev-bootstrap/runtime.js; \
    fi

ENV NODE_ENV=production

# The transcode dispatch server the web container calls.
EXPOSE 3100

# Drop to the base image's unprivileged account for everything the running
# process does. Root is reserved for the build-time steps above; the worker reads
# its own tree and writes only to the mounted database directory and the temp
# directory.
USER node

# The worker is long-running, so the image describes its own liveness rather than
# leaving a bare `docker run` with no health signal. Compose overrides this with
# its own probe wherever the stack runs under compose; both hit the same endpoint.
# Shell form so the port variable resolves at container start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${WORKER_INTERNAL_PORT:-3100}/health" || exit 1

CMD ["node", "dist/worker.js"]
