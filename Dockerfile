# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
RUN npm run build

# Production stage - Node.js server with volume support
FROM node:20-alpine
WORKDIR /app
RUN npm init -y && npm install express@4
COPY --from=build /app/dist ./dist
COPY server.js .

# Data volume mount point
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 80
CMD ["node", "server.js"]
