# Florida Annual Report - Backend Service
# Multi-stage Docker build for production deployment

# ==============================================================================
# Stage 1: Build Node.js application
# ==============================================================================
FROM node:20-alpine AS node-builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript (if applicable)
RUN npm run build 2>/dev/null || echo "No build step configured"

# ==============================================================================
# Stage 2: Python extraction service
# ==============================================================================
FROM python:3.12-slim AS python-builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install
COPY requirements.txt ./
COPY src/services/extraction-service/requirements.txt ./extraction-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r extraction-requirements.txt

# Copy extraction service code
COPY src/services/extraction-service/ ./extraction-service/

# ==============================================================================
# Stage 3: Production runtime
# ==============================================================================
FROM node:20-slim AS runtime

WORKDIR /app

# Install Python runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js application from builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/src ./src
COPY package*.json ./

# Copy Python extraction service from builder
COPY --from=python-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=python-builder /app/extraction-service ./src/services/extraction-service

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONPATH=/app/src/services/extraction-service
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
