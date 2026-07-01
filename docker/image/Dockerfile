# =============================================================================
# Footbag Platform — Image Worker Container
# Standalone Express server wrapping the Sharp pipeline behind an HTTP boundary.
# Same multi-stage pattern as web/worker; runtime stage runs imageWorker.js.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Sharp 0.34+ ships musl prebuilts but the existing pattern always rebuilds
# native deps via apk; matched here for parity with web/worker.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# python3/make/g++: native deps for sharp.
# ffmpeg: curator video full-transcode pipeline (DD §6.8). Re-encodes input
# bytes through libx264 + aac with explicit malware-stripping options
# (-map 0:v -map 0:a?, -map_metadata -1, -map_chapters -1, etc.). Used by
# the curator content seed and the future admin act-as upload path.
RUN apk add --no-cache python3 make g++ ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Production excludes the dev/staging-only subtrees. The dev-bootstrap
# register-allowlist and the testkit persona harness are permanent development
# and staging infrastructure, never present in production: the build strips
# dist/testkit, dist/dev-bootstrap, and dist/internal-qc when
# INCLUDE_DEV_SHORTCUTS != 1. imageWorker does not import the service chain that
# pulls in dev-bootstrap/runtime, but the module is stubbed rather than
# bare-removed so this image matches web/worker and cannot regress into a
# dangling-require boot crash if a future import reaches it.
ARG INCLUDE_DEV_SHORTCUTS=0
RUN if [ "$INCLUDE_DEV_SHORTCUTS" != "1" ]; then \
      rm -rf dist/testkit dist/dev-bootstrap dist/internal-qc && \
      mkdir -p dist/dev-bootstrap && \
      printf 'module.exports = { applyDevStagingBootstrapAdmin: function () { return { applied: false }; }, getInitialAdminEmails: function () { return new Set(); } };\n' > dist/dev-bootstrap/runtime.js; \
    fi

ENV NODE_ENV=production
ENV IMAGE_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/imageWorker.js"]
