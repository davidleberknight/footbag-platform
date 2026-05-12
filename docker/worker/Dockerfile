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

# CUTOVER-REMOVE: dev-admin shortcuts subtree, kept out of the runtime
# image unless the build explicitly opts in (staging only). See
# docker/web/Dockerfile for the same guard on the web image.
ARG INCLUDE_DEV_ADMIN_SHORTCUTS=0
RUN if [ "$INCLUDE_DEV_ADMIN_SHORTCUTS" != "1" ]; then \
      rm -rf dist/dev-admin-shortcuts; \
    fi

ENV NODE_ENV=production

CMD ["node", "dist/worker.js"]
