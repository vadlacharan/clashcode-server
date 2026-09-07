# Syntax School backend — custom Next server (Payload admin + REST + Socket.IO)
# Runtime needs the full node_modules (tsx runs the custom server), so no
# standalone/next-build tricks here — install, build, run.
# NOTE: node:24 keeps npm in sync with the lockfile (npm 11).

FROM node:24-bookworm-slim

WORKDIR /app

# Install deps first for layer caching (tsx is a devDependency and is required
# at runtime, so we keep devDependencies installed).
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Source + payload config
COPY . .

# Build-time placeholders — the real values come from the environment at runtime.
ARG DATABASE_URL=postgres://placeholder:placeholder@127.0.0.1:5432/placeholder
ARG PAYLOAD_SECRET=build-time-placeholder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

EXPOSE 3000

# `npm start` = NODE_ENV=production tsx src/server.ts (Next + Socket.IO)
CMD ["npm", "run", "start"]
