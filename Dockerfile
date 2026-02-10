# Stage 1: 编译前端
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: 运行后端
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY functions/ ./functions/
COPY database/ ./database/
COPY wrangler.toml .
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8080
CMD ["npx", "wrangler", "pages", "dev", "./dist", "--kv", "img_url", "--r2", "img_r2", "--ip", "0.0.0.0", "--port", "8080", "--persist-to", "./data"]
