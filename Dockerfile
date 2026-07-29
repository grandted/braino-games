# syntax=docker/dockerfile:1

# Tiny Brain Games — production image.
#
# Two stages. The first has the dev dependencies (vite, tsc) and produces
# dist/. The second has none: Node runs the server straight from TypeScript
# by stripping types, and node:sqlite ships inside the Node binary, so the
# runtime image needs no node_modules at all.

# ---------------------------------------------------------------- build ----
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies first, so a source edit doesn't re-install them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# -------------------------------------------------------------- runtime ----
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    TANGENT_PORT=8787 \
    TANGENT_DB=/app/data/tangent.db \
    TANGENT_STATIC=/app/dist

WORKDIR /app

# package.json is here for "type": "module" — nothing is installed from it.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
# The server imports game rules out of src/ (modes, evolution, scoring), so
# the source tree ships with it. See CLAUDE.md — those files are shared.
COPY --from=build /app/src ./src
COPY --from=build /app/server ./server

# The database lives here. Owned by `node` so the unprivileged user can write
# it, and pre-created so a named volume inherits that ownership.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 8787

# No curl or wget assumed — Node has fetch, and it is already installed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.TANGENT_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form: node is PID 1 and receives SIGTERM itself, which is what closes
# the sqlite handle cleanly (see the signal handlers in server/index.ts).
CMD ["node", "server/index.ts"]
