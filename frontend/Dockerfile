# syntax=docker/dockerfile:1
# ---- build stage: Angular production bundle ------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY shared/ shared/
RUN npm run build --workspace shared

COPY frontend/ frontend/
WORKDIR /app/frontend
RUN npx ng build --configuration production

# ---- serve stage: nginx ---------------------------------------------------------
FROM nginx:1.25-alpine AS runtime
# SPA + API/WebSocket proxy. /api is stripped before hitting the api service
# (backend routes are unprefixed: /auth, /users, ...).
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
