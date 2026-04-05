# ─────────────────────────────────────────────────────────────
# OmniSwarm v4.0 — HuggingFace Spaces Production Dockerfile
# SDK: docker | app_port: 7860
# ─────────────────────────────────────────────────────────────

FROM node:20-slim AS builder

WORKDIR /build
COPY swarm-os/package.json ./
# Use npm install (not npm ci) — package-lock.json is excluded from repo
RUN npm install --omit=dev

# ─────────────────────────────────────────────────────────────
FROM node:20-slim

# node:20-slim ships with 'node' user at uid=1000 (HF Spaces requirement)
WORKDIR /app

# Copy production node_modules from builder stage
COPY --from=builder /build/node_modules ./node_modules

# Copy application source
COPY swarm-os/ .

# Create writable runtime directories, owned by the node user
RUN mkdir -p artifacts data && chown -R node:node /app

USER node

ENV PORT=7860
ENV NODE_ENV=production
ENV CLOUD_MODE=true
ENV MQTT_PORT=1883

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "demo/cloud-boot.mjs"]
