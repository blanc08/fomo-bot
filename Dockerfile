# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# ==========================================
# Stage 2: Production runner stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install dumb-init or use Docker's built-in init for handling PID 1 signals cleanly
RUN apk add --no-cache dumb-init

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Use standard non-root user 'node' provided by the official Node image
USER node

# Start with dumb-init for graceful termination (SIGINT / SIGTERM)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
