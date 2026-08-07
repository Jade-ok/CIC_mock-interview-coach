"""Tests for interviewer.config_loader module."""

import json
from io import BytesIO
from unittest.mock import patch

import pytest
from botocore.exceptions import ClientError

from interviewer.config_loader import (
    ConfigLoadError,
    load_interview_profile,
    load_interview_structure,
)


@patch("interviewer.config_loader._s3_client")
class TestLoadInterviewStructure:
    """Tests for load_interview_structure."""

    def test_valid_json_returns_parsed_dict(self, mock_client):
        """Valid S3 JSON returns parsed dict."""
        data = {"phases": ["intro", "technical"], "duration": 30}
        mock_body = BytesIO(json.dumps(data).encode("utf-8"))
        mock_client.get_object.return_value = {"Body": mock_body}

        result = load_interview_structure("my-bucket", "config/structure.json")

        assert result == data
        mock_client.get_object.assert_called_once_with(
            Bucket="my-bucket", Key="config/structure.json"
        )

    def test_s3_no_such_key_raises_config_load_error(self, mock_client):
        """S3 NoSuchKey error raises ConfigLoadError with 'interview_structure' in message."""
        error_response = {"Error": {"Code": "NoSuchKey", "Message": "Not found"}}
        mock_client.get_object.side_effect = ClientError(error_response, "GetObject")

        with pytest.raises(ConfigLoadError, match="interview_structure"):
            load_interview_structure("my-bucket", "missing-key.json")

    def test_invalid_json_raises_config_load_error(self, mock_client):
        """Invalid JSON content raises ConfigLoadError with 'interview_structure' in message."""
        mock_body = BytesIO(b"not valid json {{{")
        mock_client.get_object.return_value = {"Body": mock_body}

        with pytest.raises(ConfigLoadError, match="interview_structure"):
            load_interview_structure("my-bucket", "config/bad.json")


@patch("interviewer.config_loader._s3_client")
class TestLoadInterviewProfile:
    """Tests for load_interview_profile."""

    def test_valid_json_returns_parsed_dict(self, mock_client):
        """Valid S3 JSON returns parsed dict."""
        data = {"name": "Student", "major": "CS", "skills": ["Python", "AWS"]}
        mock_body = BytesIO(json.dumps(data).encode("utf-8"))
        mock_client.get_object.return_value = {"Body": mock_body}

        result = load_interview_profile("my-bucket", "profiles/student.json")

        assert result == data
        mock_client.get_object.assert_called_once_with(
            Bucket="my-bucket", Key="profiles/student.json"
        )

    def test_s3_no_such_key_raises_config_load_error(self, mock_client):
        """S3 NoSuchKey error raises ConfigLoadError with 'interview_profile' in message."""
        error_response = {"Error": {"Code": "NoSuchKey", "Message": "Not found"}}
        mock_client.get_object.side_effect = ClientError(error_response, "GetObject")

        with pytest.raises(ConfigLoadError, match="interview_profile"):
            load_interview_profile("my-bucket", "missing-profile.json")

    def test_invalid_json_raises_config_load_error(self, mock_client):
        """Invalid JSON content raises ConfigLoadError with 'interview_profile' in message."""
        mock_body = BytesIO(b"<<<not json>>>")
        mock_client.get_object.return_value = {"Body": mock_body}

        with pytest.raises(ConfigLoadError, match="interview_profile"):
            load_interview_profile("my-bucket", "profiles/bad.json")
