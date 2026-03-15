# AI Compliance Investigator

AI-driven investigation system for screening an entity against public web sources and producing a structured risk summary.
It combines search, evidence collection, LLM-based analysis, and report generation behind a Fastify API and a minimal Next.js UI.

## Project Demo

[![Watch the demo](demo_thumbnail.png)](https://youtu.be/X9BBmVs-SEQ)

## Technology Stack

- **API Layer:** Fastify, Next.js API route
- **Orchestration / Workflow:** LangGraph, BullMQ
- **LLM Runtime / Models:** Ollama, model routing between `mistral` and `llama3`
- **Search / Retrieval:** DuckDuckGo search via `duck-duck-scrape`
- **Scraping / Data Processing:** Axios, HTML text extraction/cleaning
- **Database / Storage:** Redis, local audit log file
- **Language:** TypeScript
- **Containerization:** Docker
- **CI/CD:** GitHub Actions, GHCR image publishing
- **Other Libraries:** Zod, Pino, Prometheus `prom-client`, OpenTelemetry

## AI & System Design Patterns

- Agent orchestration with LangGraph nodes for search, analysis, and report generation
- Tool-based workflow using a dedicated search tool inside the investigation pipeline
- Asynchronous queue-based processing with staged BullMQ workers
- Modular architecture with separated API, worker, agent, tool, and observability layers

## Capabilities Demonstrated

- Building an AI-assisted investigation workflow that evaluates entities against public web evidence
- Implementing staged processing for search, analysis, and report generation
- Integrating Redis-backed job queues and server-sent events for progress tracking
- Routing prompts to different Ollama models based on prompt size
- Adding operational observability with audit logging, Prometheus metrics, and OpenTelemetry tracing
- Delivering the system through both an API service and a lightweight web UI

## High-Level Flow

User -> Next.js UI -> Fastify API -> BullMQ queues/workers -> Search -> Evidence scraping -> Ollama analysis -> Report generation -> SSE progress + final result

## Future Plans

- Expand the analysis stage to evaluate more than the first two evidence links
- Add richer evidence sources beyond the current DuckDuckGo-based search flow
- Persist completed investigations in a queryable data store instead of Redis state and a local log file
- Strengthen frontend and API support for the existing `entityType` and `jurisdiction` fields
