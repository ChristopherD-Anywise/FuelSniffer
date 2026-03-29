# syntax=docker/dockerfile:1

# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Install all deps (including dev) and build inside the target Linux environment
# so platform-native binaries (e.g. @tailwindcss/oxide) are correct for Linux.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Force fresh install inside Linux container — ensures correct platform-native
# binaries (e.g. @tailwindcss/oxide-linux-arm64-musl) are downloaded, not
# copied from a Mac host where the darwin variant would have been installed.
RUN npm ci --prefer-offline=false

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user to run the app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what next start needs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration runner and migration files for the startup entrypoint
COPY --from=builder /app/src/lib/db/migrate.ts ./src/lib/db/migrate.ts
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start the server
CMD ["sh", "-c", "npx tsx src/lib/db/migrate.ts && node server.js"]
