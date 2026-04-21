# Stage 1: Build the frontend
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Only install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built frontend, server, and MCP server
COPY --from=build /app/dist ./dist
COPY server ./server
COPY mcp-server.js ./mcp-server.js

# Copy seed notes (used as defaults if vault is empty)
COPY vault ./vault-seed

# Startup script: seed vault if empty, then start server
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV VAULT_DIR=/data/vault

EXPOSE 3001

VOLUME ["/data/vault"]

ENTRYPOINT ["/docker-entrypoint.sh"]
