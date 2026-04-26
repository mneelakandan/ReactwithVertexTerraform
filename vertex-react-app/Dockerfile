# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy and install frontend deps
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY public/ ./public/
COPY src/     ./src/
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production backend deps
COPY package-server.json ./package.json
RUN npm ci --omit=dev --prefer-offline

# Copy server + React build
COPY server.js .
COPY --from=builder /app/build ./build

# Cloud Run listens on $PORT (default 8080)
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["node", "server.js"]
