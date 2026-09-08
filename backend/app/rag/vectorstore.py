import logging
import os
from typing import List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_store_instance = None


def get_vector_store():
    """Use ChromaDB when available, otherwise lightweight local store."""
    global _store_instance
    if _store_instance is not None:
        return _store_instance

    if settings.use_lightweight_rag:
        from app.rag.simple_store import SimpleVectorStore

        _store_instance = SimpleVectorStore()
        logger.info("Using SimpleVectorStore (lightweight mode — Render / low memory)")
        return _store_instance

    try:
        import chromadb  # noqa: F401
        from app.rag.embeddings import get_embeddings
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        import uuid
        from chromadb.config import Settings as ChromaSettings

        class ChromaVectorStore:
            def __init__(self):
                os.makedirs(settings.chroma_persist_dir, exist_ok=True)
                self.client = chromadb.PersistentClient(
                    path=settings.chroma_persist_dir,
                    settings=ChromaSettings(anonymized_telemetry=False),
                )
                self.collection = self.client.get_or_create_collection(
                    name=settings.chroma_collection,
                    metadata={"hnsw:space": "cosine"},
                )
                self.embeddings = get_embeddings()
                self.splitter = RecursiveCharacterTextSplitter(
                    chunk_size=1000,
                    chunk_overlap=150,
                    separators=["\n\n", "\n", ". ", " "],
                )

            def add_document(self, text, source, doc_id=None, metadata=None):
                chunks = self.splitter.split_text(text)
                if not chunks:
                    return 0
                ids = [f"{doc_id or uuid.uuid4().hex}_{i}" for i in range(len(chunks))]
                metadatas = [
                    {"source": source, "chunk_index": i, **(metadata or {})}
                    for i in range(len(chunks))
                ]
                embeddings = self.embeddings.embed_documents(chunks)
                self.collection.add(
                    ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas
                )
                return len(chunks)

            def search(self, query: str, top_k: int = 5) -> List[dict]:
                query_embedding = self.embeddings.embed_query(query)
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k,
                    include=["documents", "metadatas", "distances"],
                )
                items = []
                if not results["documents"] or not results["documents"][0]:
                    return items
                for doc, meta, dist in zip(
                    results["documents"][0],
                    results["metadatas"][0],
                    results["distances"][0],
                ):
                    items.append({
                        "content": doc,
                        "source": meta.get("source", "unknown"),
                        "score": round(1 - dist, 4),
                        "metadata": meta,
                    })
                return items

            def delete_by_source(self, source: str) -> None:
                existing = self.collection.get(where={"source": source})
                if existing and existing.get("ids"):
                    self.collection.delete(ids=existing["ids"])

        _store_instance = ChromaVectorStore()
        logger.info("Using ChromaDB vector store")
    except Exception as exc:
        from app.rag.simple_store import SimpleVectorStore

        logger.warning("ChromaDB unavailable (%s), using SimpleVectorStore", exc)
        _store_instance = SimpleVectorStore()

    return _store_instance


# Backward-compatible alias
ChromaVectorStore = get_vector_store
