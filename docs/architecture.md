# Architecture Overview

See the main [README](../README.md) for the Mermaid diagram and deployment guide.

## Component Responsibilities

- **Frontend (Next.js):** Auth state, dashboard UI, chat streaming, file uploads
- **API Layer (FastAPI):** Validation, rate limiting, JWT, routing
- **Agent Router:** Keyword-based routing to specialized SOC agents
- **RAG Pipeline:** Document load → chunk → embed → ChromaDB → retrieve → LLM
- **ML Pipeline:** Rule engine + Isolation Forest → severity score → LLM summary
- **PostgreSQL:** Users, sessions, messages, documents metadata, logs, reports
