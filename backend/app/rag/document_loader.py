import json
import logging
from pathlib import Path

from pypdf import PdfReader
from docx import Document as DocxDocument

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_PDF_PAGES_LIGHT = 25
MAX_TEXT_CHARS_LIGHT = 200_000


def load_document(file_path: str) -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        reader = PdfReader(str(path))
        pages = reader.pages
        if settings.use_lightweight_rag and len(pages) > MAX_PDF_PAGES_LIGHT:
            pages = pages[:MAX_PDF_PAGES_LIGHT]
            logger.info("Lightweight mode: processing first %s PDF pages only", MAX_PDF_PAGES_LIGHT)
        text = "\n".join(page.extract_text() or "" for page in pages)
    elif suffix == ".docx":
        doc = DocxDocument(str(path))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    elif suffix in (".txt", ".log", ".csv"):
        text = path.read_text(encoding="utf-8", errors="ignore")
    elif suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        text = json.dumps(data, indent=2)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    if settings.use_lightweight_rag and len(text) > MAX_TEXT_CHARS_LIGHT:
        text = text[:MAX_TEXT_CHARS_LIGHT]
        logger.info("Lightweight mode: truncated document to %s characters", MAX_TEXT_CHARS_LIGHT)

    if not text.strip():
        raise ValueError("No readable text found in the uploaded file")

    return text
