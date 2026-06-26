# Build stage
FROM registry.access.redhat.com/ubi9/nodejs-24:latest AS build

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src/ src/

RUN npm run build

# Runtime stage
FROM registry.access.redhat.com/ubi9/nodejs-24:latest AS runtime

USER root
RUN dnf install -y git && dnf clean all

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/rhess.db

COPY package.json package-lock.json ./
RUN npm pkg set scripts.prepare="" && npm ci --omit=dev

COPY --from=build /build/dist ./dist

RUN mkdir -p /data \
  && chgrp -R 0 /data \
  && chmod -R g+rwX /data

VOLUME /data

EXPOSE 3000

USER 1001

CMD ["node", "dist/server/index.js"]
