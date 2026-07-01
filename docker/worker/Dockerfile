# =============================================================================
# Footbag Platform — Worker Container
# Runs the AP expiry loop and the email outbox drain.
# Same build pattern as web so images stay consistent.
# =============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

CMD ["node", "dist/worker.js"]
