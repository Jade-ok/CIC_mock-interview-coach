"""Quick verification that pdf_parser/validation.py works correctly."""
from pdf_parser.validation import detect_invocation_mode, validate_request
import json

# Test detect_invocation_mode - Function URL mode
event_url = {"body": json.dumps({"resume": {"content": "abc", "format": "pdf"}})}
payload = detect_invocation_mode(event_url)
assert payload == {"resume": {"content": "abc", "format": "pdf"}}, f"Got: {payload}"
print("1. Function URL mode: OK")

# Test detect_invocation_mode - Direct mode
event_direct = {"resume": {"content": "abc", "format": "pdf"}}
payload = detect_invocation_mode(event_direct)
assert payload == {"resume": {"content": "abc", "format": "pdf"}}
print("2. Direct mode: OK")

# Test detect_invocation_mode - Invalid JSON
try:
    detect_invocation_mode({"body": "not-json"})
    assert False
except ValueError as e:
    assert "Failed to parse request body as JSON" in str(e)
print("3. Invalid JSON: OK")

# Test validate_request - no documents
valid, err = validate_request({})
assert not valid and "at least one document" in err
print("4. No documents: OK")

# Test validate_request - valid resume
valid, err = validate_request({"resume": {"content": "base64data"}})
assert valid and err is None
print("5. Valid resume: OK")

# Test validate_request - valid job_posting
valid, err = validate_request({"job_posting": {"content": "data", "format": "pdf"}})
assert valid and err is None
print("6. Valid job_posting: OK")

# Test validate_request - invalid format flag
valid, err = validate_request({"job_posting": {"content": "data", "format": "docx"}})
assert not valid and "Invalid format flag" in err
print("7. Invalid format flag: OK")

# Test validate_request - missing content
valid, err = validate_request({"resume": {}})
assert not valid and "Missing required fields" in err
print("8. Missing content: OK")

# Test validate_request - oversized document
big_content = "A" * 6_000_000
valid, err = validate_request({"resume": {"content": big_content}})
assert not valid and "4 MB size limit" in err
print("9. Oversized document: OK")

# Test validate_request - job_posting missing format
valid, err = validate_request({"job_posting": {"content": "data"}})
assert not valid and "Missing required fields" in err and "format" in err
print("10. Missing format: OK")

print("\nAll validation tests passed!")
