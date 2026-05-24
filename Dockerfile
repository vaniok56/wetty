FROM node:20-alpine AS base
RUN apk add --no-cache build-base python3 py3-setuptools make g++ git
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.browser.json tsconfig.node.json build.js ./

RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssh-client
WORKDIR /app

ENV NODE_ENV=production \
    BASE=/ \
    PORT=3001 \
    TITLE=terminal.cactuz.icu \
    SSHAUTH=publickey \
    SSHKEY=/run/terminal-ssh/id_ed25519 \
    KNOWNHOSTS=/run/terminal-ssh/known_hosts

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/build ./build

EXPOSE 3001
CMD ["node", "build/main.js"]
