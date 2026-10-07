# Remote MCP server for https://mcp.chatpush.ru
# Build:  docker build -t chatpush-mcp-server .
# Run:    docker run -p 3000:3000 -e CHATPUSH_ALLOWED_HOSTS=mcp.chatpush.ru chatpush-mcp-server
#
# No credentials live in the image or in the environment: every request carries the caller's own
# ChatPush token in the Authorization header.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
USER node

# The health endpoint needs no token and makes no ChatPush calls.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/http.js"]
