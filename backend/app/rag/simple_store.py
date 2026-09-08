"""Lightweight in-memory vector store (no ChromaDB / HuggingFace required)."""

import json
import math
import os
import re
import uuid
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import get_settings

settings = get_settings()
STORE_FILE = Path(settings.chroma_persist_dir) / "simple_vectors.json"


class SimpleVectorStore:
    """TF-based store for local dev when ChromaDB is unavailable."""

    def __init__(self):
        os.makedirs(settings.chroma_persist_dir, exist_ok=True)
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=150
        )
        self._data: List[Dict] = self._load()

    def _load(self) -> List[Dict]:
        if STORE_FILE.exists():
            return json.loads(STORE_FILE.read_text(encoding="utf-8"))
        return []

    def _save(self) -> None:
        STORE_FILE.write_text(json.dumps(self._data), encoding="utf-8")

    def _tokenize(self, text: str) -> Counter:
        tokens = re.findall(r"[a-z0-9]{3,}", text.lower())
        return Counter(tokens)

    def _similarity(self, a: Counter, b: Counter) -> float:
        if not a or not b:
            return 0.0
        dot = sum(a[t] * b[t] for t in a if t in b)
        norm_a = math.sqrt(sum(v * v for v in a.values()))
        norm_b = math.sqrt(sum(v * v for v in b.values()))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def add_document(
        self,
        text: str,
        source: str,
        doc_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> int:
        chunks = self.splitter.split_text(text)
        for i, chunk in enumerate(chunks):
            self._data.append({
                "id": f"{doc_id or uuid.uuid4().hex}_{i}",
                "content": chunk,
                "source": source,
                "tokens": dict(self._tokenize(chunk)),
                "metadata": metadata or {},
            })
        self._save()
        return len(chunks)

    def search(self, query: str, top_k: int = 5) -> List[dict]:
        q_tokens = self._tokenize(query)
        scored = []
        for item in self._data:
            score = self._similarity(q_tokens, Counter(item["tokens"]))
            if score > 0:
                scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "content": item["content"],
                "source": item["source"],
                "score": round(score, 4),
                "metadata": item.get("metadata", {}),
            }
            for score, item in scored[:top_k]
        ]

    def delete_by_source(self, source: str) -> None:
        self._data = [d for d in self._data if d.get("source") != source]
        self._save()
