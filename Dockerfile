FROM node:20-slim

# Install Typst + openssl (Prisma needs openssl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils openssl && \
    TYPST_VERSION="0.13.1" && \
    curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz && \
    tar xf /tmp/typst.tar.xz -C /tmp && \
    mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst && \
    chmod +x /usr/local/bin/typst && \
    rm -rf /tmp/typst* && \
    apt-get remove -y curl xz-utils && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Use ARG for build-time only (does NOT persist to runtime)
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["sh", "-c", "echo 'Syncing DB...' && npx prisma db push --skip-generate --accept-data-loss 2>&1 && echo 'Starting Next.js on port '${PORT:-3000}'...' && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
