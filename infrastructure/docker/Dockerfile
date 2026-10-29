FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN npm ci
EXPOSE 3000 3001
CMD ["npm", "run", "dev:api"]

FROM base AS browser-dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium

FROM browser-dependencies AS validation
COPY . .
RUN npm run generate
CMD ["sh", "infrastructure/docker/validate.sh"]

FROM base AS application
COPY . .
RUN npm run generate

# Immutable production builds. The API/worker share a compiled runtime.
FROM application AS production-build
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Optional development peers (Prisma CLI/TypeScript) are not runtime dependencies.
RUN rm -rf node_modules && npm ci --omit=dev --omit=peer --omit=optional --ignore-scripts

FROM node:24-bookworm-slim AS production-api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-build --chown=node:node /app/node_modules ./node_modules
COPY --from=production-build --chown=node:node /app/dist ./dist
COPY --from=production-build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /data/document-storage /data/budget-storage && chown -R node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/api/src/main.js"]

FROM production-api AS production-worker
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3003/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/worker/src/main.js"]

FROM node:24-bookworm-slim AS production-web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=production-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=production-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# Short-lived migration job only; never used as a serving container.
FROM application AS migration
USER node
CMD ["npm", "run", "migrate"]
