# --- Stage 1: build SPA com Vite ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: servir com nginx + proxy /api → backend ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# nginx oficial roda envsubst em /etc/nginx/templates/*.template no startup
ENV BACKEND_HOST=cx-promocoes-backend
ENV BACKEND_PORT=4000
EXPOSE 80
