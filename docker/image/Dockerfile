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

# CUTOVER-REMOVE: dev-admin shortcuts inclusion.
# Current: subtree kept out of the runtime image unless the build explicitly
#   opts in (staging only).
# Target: remove this ARG and the subtree entirely after production cutover.
ARG INCLUDE_DEV_ADMIN_SHORTCUTS=0
RUN if [ "$INCLUDE_DEV_ADMIN_SHORTCUTS" != "1" ]; then \
      rm -rf dist/dev-admin-shortcuts; \
    fi

ENV NODE_ENV=production
ENV IMAGE_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/imageWorker.js"]
