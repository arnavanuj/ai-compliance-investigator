# AI Compliance Investigator

## Architecture Overview

This service provides an AI-driven compliance investigation backend with queue-based execution and agent orchestration.

Core components:

- Fastify API (`src/server.ts`, `src/api/`)
- BullMQ queue (`src/queue/`)
- Worker processor (`src/workers/investigationWorker.ts`)
- LangGraph agent orchestration (`src/agents/`)
- Ollama LLM integration (`src/agents/ollamaClient.ts`)
- Observability (logs, tracing, metrics in `src/observability/`)
- Minimal Next.js UI (`ui/`)

## Agent Graph Flow

Current graph execution path:

`START -> search -> analysis -> report -> END`

Node responsibilities:

- `search`: collect evidence for the entity
- `analysis`: generate analysis text and risk classification
- `report`: generate structured investigation report

## API Endpoints

- `POST /investigations`
  - Existing queue-based endpoint.
  - Enqueues a job for worker processing.
- `POST /investigation`
  - Synchronous investigation endpoint used by the UI.
  - Returns investigation output directly.
- `GET /health`
- `GET /metrics`

## Run Backend API

From repository root:

```bash
npm install
npm run dev
```

API default address: `http://localhost:3000`

## Run Worker

From repository root (separate terminal):

```bash
npm run worker
```

## Run UI

From repository root:

```bash
cd ui
npm install
npm run dev
```

UI default address: `http://localhost:3001`

The UI calls the backend through a local Next.js API proxy and triggers `POST /investigation`.

## Docker

This repository includes a root `Dockerfile` that builds:

- Backend API (`dist/server.js`)
- Worker (`dist/workers/investigationWorker.js`)
- Next.js UI production bundle (`ui/.next`)

The container starts all three processes via `scripts/start-services.sh`.

### Build image

```bash
docker build -t ai-compliance-investigator:local .
```

Optional Ollama CLI install during build:

```bash
docker build --build-arg INSTALL_OLLAMA=true -t ai-compliance-investigator:local .
```

### Run container locally

```bash
docker run --rm -p 3000:3000 -p 3001:3001 ^
  -e REDIS_HOST=host.docker.internal ^
  -e REDIS_PORT=6379 ^
  -e REDIS_PASSWORD= ^
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 ^
  ai-compliance-investigator:local
```

- API: `http://localhost:3000`
- UI: `http://localhost:3001`

## CI/CD (GitHub Actions)

Workflow file: `.github/workflows/ci.yml`

### What CI does

1. Installs backend and UI dependencies with npm cache.
2. Runs TypeScript compile checks:
   1. `npx tsc --noEmit`
   2. `npx tsc --noEmit -p ui/tsconfig.json`
3. Runs lint/tests if scripts exist (`--if-present`).
4. Builds backend + UI.
5. Builds Docker image.
6. Optionally pushes Docker image to GHCR.

### Workflow triggers

- `push` to `main` or `master`
- `pull_request`
- `workflow_dispatch` with `push_image` boolean input

### Optional image push behavior

- `workflow_dispatch`: set `push_image=true`
- `push` to `main`: set repository variable `GHCR_PUSH=true` to enable push

If push is disabled, the workflow still builds and validates the image.

### GitHub Secrets / Variables

Add these repository secrets (Settings -> Secrets and variables -> Actions):

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `OLLAMA_BASE_URL`

Add this repository variable for automatic push on `main`:

- `GHCR_PUSH=true`

### Container registry output

When push is enabled, image is published to:

- `ghcr.io/<owner>/<repo>:<tag>`

Tags include branch and commit SHA metadata.

## Push Current Codebase To GitHub

If this folder is not yet a git repo, run:

```bash
git init
git add .
git commit -m "Add Docker + CI/CD workflow"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

If the repo already exists and remote is configured:

```bash
git add .
git commit -m "Add Docker + CI/CD workflow"
git push
```
