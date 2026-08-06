"""Document processing orchestrator for the pdf_parser Lambda."""

from .parser import EmptyDocumentError, extract_text_from_pdf


def process_documents(payload: dict) -> dict:
    """Orchestrate document processing for resume and/or job posting.

    Handles three modes:
    - Combined: both resume and job_posting in one request
    - Resume-only: just a resume PDF
    - Job-posting-only: just a job posting (PDF or plain text)

    Implements partial success: if one document fails extraction in a combined
    request, the successful result is still returned alongside an error entry
    for the failed document.

    Args:
        payload: Validated request payload with optional 'resume' and
                 'job_posting' fields.

    Returns:
        dict with extracted text keys (resume_text, job_posting_text) and/or
        error keys (resume_error, job_posting_error) for failed extractions.
    """
    result = {}

    # Process resume if present (always PDF)
    if "resume" in payload:
        resume = payload["resume"]
        try:
            result["resume_text"] = extract_text_from_pdf(resume["content"])
        except (ValueError, EmptyDocumentError) as exc:
            result["resume_error"] = str(exc)

    # Process job_posting if present
    if "job_posting" in payload:
        job_posting = payload["job_posting"]
        fmt = job_posting.get("format", "pdf")

        if fmt == "text":
            # Plain text passes through without processing
            result["job_posting_text"] = job_posting["content"]
        else:
            # PDF format — extract text
            try:
                result["job_posting_text"] = extract_text_from_pdf(
                    job_posting["content"]
                )
            except (ValueError, EmptyDocumentError) as exc:
                result["job_posting_error"] = str(exc)

    return result
