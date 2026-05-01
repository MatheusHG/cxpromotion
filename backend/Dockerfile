# --- Stage 1: install deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Stage 2: build TypeScript ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Stage 3: runtime (slim) ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Bin pra rodar migrate/seed dentro do container
COPY --from=build /app/dist/migrate.js /app/migrate.js
COPY --from=build /app/dist/seed.js    /app/seed.js

EXPOSE 4000
CMD ["node", "dist/index.js"]
