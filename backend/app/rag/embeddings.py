import logging
from functools import lru_cache

from langchain_community.embeddings import HuggingFaceEmbeddings

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@lru_cache
def get_embeddings():
    return HuggingFaceEmbeddings(
        model_name=settings.huggingface_embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
