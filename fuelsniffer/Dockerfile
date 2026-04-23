# syntax=docker/dockerfile:1

# ── Stage 1: builder ─────────────────────────────────────────────────────────
# Install all deps (including dev) and build inside the target Linux environment
# so platform-native binaries (e.g. @tailwindcss/oxide) are correct for Linux.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# The package-lock.json is generated on macOS and may miss Linux-specific
# optional dependencies. Use npm install (not ci) to resolve platform
# differences, then add the Linux musl Tailwind variant.
RUN npm install --prefer-offline && npm install @tailwindcss/oxide-linux-arm64-musl --no-save

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Provide placeholder env vars so Next.js static analysis doesn't throw
# when importing server modules at build time. Not used at runtime.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV SESSION_SECRET=placeholder_build_time_secret_not_used_at_runtime

RUN npm run build

# ── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
LABEL org.opencontainers.image.title="Fillip"
LABEL org.opencontainers.image.description="Fillip — find cheap fuel across Australia"
LABEL org.opencontainers.image.source="https://github.com/cdenn/fuelsniffer"
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
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrate.ts ./src/lib/db/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations then start the server
CMD ["sh", "-c", "npx tsx src/lib/db/migrate.ts && node server.js"]
