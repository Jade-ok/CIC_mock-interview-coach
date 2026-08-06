"""PDF text extraction for the pdf_parser Lambda."""

import base64
import io

import pypdf


class EmptyDocumentError(Exception):
    """Raised when a PDF yields zero extractable text."""

    pass


def extract_text_from_pdf(base64_content: str) -> str:
    """Decode base64-encoded PDF and extract text from all pages.

    Args:
        base64_content: Base64-encoded PDF bytes (no data URI prefix).

    Returns:
        Extracted text string with pages separated by newlines.

    Raises:
        ValueError: If base64 cannot be decoded or content is not a valid PDF.
        EmptyDocumentError: If PDF yields zero extractable text.
    """
    # Decode base64
    try:
        pdf_bytes = base64.b64decode(base64_content, validate=True)
    except Exception as exc:
        raise ValueError(f"Failed to decode base64 content: {exc}") from exc

    # Open with pypdf
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError("Content is not a valid PDF document") from exc

    # Extract text from all pages
    pages_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text)

    # Check for empty extraction
    combined = "\n".join(pages_text).strip()
    if not combined:
        raise EmptyDocumentError("No text could be extracted from the document")

    return combined
