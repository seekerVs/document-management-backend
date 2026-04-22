FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libreoffice-core \
      libreoffice-writer \
      fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV LIBREOFFICE_BIN_PATH=soffice
ENV TEMP_FILE_DIR=/tmp/dms-conversions

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib

EXPOSE 3000

CMD ["node", "lib/index.js"]
