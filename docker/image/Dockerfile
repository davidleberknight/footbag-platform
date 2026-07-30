# =============================================================================
# Footbag Platform — Image Worker Container
# Standalone Express server wrapping the Sharp pipeline behind an HTTP boundary.
# Same multi-stage pattern as web/worker; runtime stage runs imageWorker.js.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# Both stages pin the identical base digest: the runtime stage reuses the native
# addons resolved here, so a different base could pair musl binaries with a
# mismatched C library. A floating tag would also let a hijacked upstream tag
# replace the base layer between rebuilds.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# Sharp 0.34+ ships musl prebuilts but the existing pattern always rebuilds
# native deps via apk; matched here for parity with web/worker.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reduce to production dependencies while the toolchain is still present, so the
# runtime image can take the resolved native packages as they are. Lifecycle
# scripts stay off: the native addons are already in place.
RUN npm prune --omit=dev --ignore-scripts


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

WORKDIR /app

# ffmpeg: curator video full-transcode pipeline. Re-encodes input bytes through
# libx264 + aac with explicit malware-stripping options (-map 0:v -map 0:a?,
# -map_metadata -1, -map_chapters -1, etc.). Used by the curator content seed and
# the admin act-as upload path. It is a runtime dependency of the transcode, not
# a build tool, which is why it stays when the compiler toolchain does not: this
# container executes untrusted media, so the less of a build environment it
# carries, the less an escape from that decoder can reach for.
RUN apk add --no-cache ffmpeg

# Production dependencies, including sharp's musl binaries, arrive prebuilt from
# the builder stage.
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

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

# Drop to the base image's unprivileged account for everything the running
# process does. This container decodes untrusted media through ffmpeg and sharp,
# so it is the one that most needs the process to hold no privileges it could
# lose control of; root stays reserved for the build-time steps above.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/imageWorker.js"]
