"""Custom exception classes for the Evaluator agent."""


class ValidationError(Exception):
    """Raised when input validation fails (400 response)."""

    pass


class EvaluationError(Exception):
    """Raised when evaluation processing fails (500 response)."""

    pass
