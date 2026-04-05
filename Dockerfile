# ─────────────────────────────────────────────────────────────
# OmniSwarm v4.0 — HuggingFace Spaces Production Dockerfile
# SDK: docker | app_port: 7860
#
# Single-container deployment:
#   • Embedded aedes MQTT broker (replaces FoxMQ binary)
#   • Express + Socket.IO dashboard (port 7860)
#   • Mass-scenario AI agents (5000+ simulated nodes)
# ─────────────────────────────────────────────────────────────

FROM node:20-slim AS builder

WORKDIR /build

# Copy only package files first for layer caching
COPY swarm-os/package*.json ./

# Install ALL deps (including aedes, ws needed for embedded broker)
RUN npm ci

# ─────────────────────────────────────────────────────────────
FROM node:20-slim

# HuggingFace Spaces requires a non-root user with uid=1000
RUN useradd -m -u 1000 omniswarm

# App directory
WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /build/node_modules ./node_modules

# Copy application source
COPY swarm-os/ .

# Create writable directories for runtime artifacts and crypto keys
RUN mkdir -p artifacts data && chown -R omniswarm:omniswarm /app

USER omniswarm

# HuggingFace Spaces injects PORT=7860
ENV PORT=7860
ENV NODE_ENV=production
ENV CLOUD_MODE=true

# Expose dashboard
EXPOSE 7860

# Health check — HF Spaces pings the root
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Boot the cloud launcher
CMD ["node", "demo/cloud-boot.mjs"]
