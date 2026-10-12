# syntax=docker/dockerfile:1
# ---- build stage: compile shared + backend ------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY shared/ shared/
COPY backend/ backend/
RUN npm run build --workspace shared \
  && npx prisma generate --schema backend/prisma/schema.prisma \
  && npx tsc -p backend/tsconfig.json

# ---- runtime stage -------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY shared/package.json shared/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev

COPY --from=build /app/shared/dist shared/dist
COPY shared/package.json shared/
COPY --from=build /app/backend/dist backend/dist
COPY backend/prisma backend/prisma

# The checked-in schema is sqlite for dev; the container runs Postgres. Derive the
# postgres dialect schema in place and promote the postgres migrations dir so
# `prisma migrate deploy` finds them (migrations-postgres/migration_lock.toml).
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' backend/prisma/schema.prisma \
  && mv backend/prisma/migrations-postgres backend/prisma/migrations \
  && npx prisma generate --schema backend/prisma/schema.prisma

WORKDIR /app/backend
EXPOSE 3001
# migrate deploy on boot (versioned migrations; see prisma/migrations-postgres).
CMD ["sh", "-c", "node /app/node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma && node dist/src/main.js"]
