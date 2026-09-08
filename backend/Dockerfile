FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Slim install for Render free tier (512MB RAM) — full requirements.txt for local ML/RAG
COPY requirements-render.txt ./
RUN pip install --no-cache-dir -r requirements-render.txt

COPY . .

RUN mkdir -p /app/data/uploads /app/data/chroma_data uploads chroma_data

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV UPLOAD_DIR=./uploads
ENV CHROMA_PERSIST_DIR=./chroma_data
ENV LIGHTWEIGHT_RAG=true

EXPOSE 8000

CMD ["sh", "scripts/start.sh"]
