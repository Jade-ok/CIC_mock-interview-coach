"""Stage 2: Interviewer — runs in isolation with mocked S3."""
import json
import sys
import os
from unittest.mock import patch, MagicMock

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

# Set env vars
os.environ["S3_BUCKET"] = "test-bucket"
os.environ["INTERVIEW_STRUCTURE_KEY"] = "interview_structure.json"
os.environ["INTERVIEW_PROFILE_KEY"] = "student_interview_profile.json"
os.environ["AWS_REGION"] = "us-east-1"

# Load local config files
with open(os.path.join(ROOT, ".kiro", "specs", "interviewer-agent", "schemas", "interview_structure.json")) as f:
    INTERVIEW_STRUCTURE = json.load(f)
with open(os.path.join(ROOT, ".kiro", "specs", "interviewer-agent", "schemas", "student_interview.json")) as f:
    STUDENT_PROFILE = json.load(f)

# Read analyst output from temp file
with open(os.path.join(ROOT, "_test_analyst_output.json")) as f:
    analyst_output = json.load(f)

# Mock S3
def mock_get_object(Bucket, Key):
    if "structure" in Key:
        content = json.dumps(INTERVIEW_STRUCTURE).encode()
    else:
        content = json.dumps(STUDENT_PROFILE).encode()
    mock_body = MagicMock()
    mock_body.read.return_value = content
    return {"Body": mock_body}

with patch("interviewer.config_loader._s3_client") as mock_s3:
    mock_s3.get_object.side_effect = mock_get_object
    from interviewer.handler import lambda_handler
    event = {"analyst_output": analyst_output}
    response = lambda_handler(event, None)

body = json.loads(response["body"])
if body.get("success"):
    print(json.dumps({"runtime_context": body["runtime_context"]}))
    sys.exit(0)
else:
    print(json.dumps(body), file=sys.stderr)
    sys.exit(1)
