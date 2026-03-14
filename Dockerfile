FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY ui/package*.json ./ui/
RUN npm ci --prefix ui

COPY tsconfig.json ./
COPY src ./src
COPY ui ./ui

RUN npm run build
RUN npm run build --prefix ui


FROM node:20-bookworm-slim AS runtime

ARG INSTALL_OLLAMA=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Optional: include Ollama CLI in the image when requested at build time.
# Example: docker build --build-arg INSTALL_OLLAMA=true -t ai-compliance-investigator .
RUN if [ "$INSTALL_OLLAMA" = "true" ]; then curl -fsSL https://ollama.com/install.sh | sh; fi

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY ui/package*.json ./ui/
RUN npm ci --omit=dev --prefix ui

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui/.next ./ui/.next
COPY --from=builder /app/ui/pages ./ui/pages
COPY --from=builder /app/ui/next-env.d.ts ./ui/next-env.d.ts
COPY --from=builder /app/ui/tsconfig.json ./ui/tsconfig.json
COPY scripts/start-services.sh ./scripts/start-services.sh

RUN chmod +x ./scripts/start-services.sh

ENV NODE_ENV=production
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379
ENV OLLAMA_BASE_URL=http://localhost:11434

EXPOSE 3000 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/start-services.sh"]
