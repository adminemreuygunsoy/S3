# --- Stage 1: Base ---
FROM node:18-alpine AS base
WORKDIR /app

# --- Stage 2: Dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
# Install only production dependencies
RUN npm ci --only=production

# --- Stage 3: Runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# Create necessary directories
RUN mkdir -p /app/data /app/pipeline

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Copy Application Source Code
COPY app ./app

# Expose Port
EXPOSE 3000

# Start Server
CMD ["npm", "run", "server"]
