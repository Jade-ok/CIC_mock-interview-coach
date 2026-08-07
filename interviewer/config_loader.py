import json
import os

import boto3
import botocore.exceptions


class ConfigLoadError(Exception):
    """Raised when an S3 config cannot be loaded or parsed."""
    pass


_s3_client = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def load_interview_structure(bucket: str, key: str) -> dict:
    """
    Fetch and parse interview_structure.json from S3.

    Args:
        bucket: S3 bucket name (from S3_BUCKET env var)
        key: S3 object key (from INTERVIEW_STRUCTURE_KEY env var)

    Returns:
        Parsed dict of the interview structure.

    Raises:
        ConfigLoadError: If the object is missing, inaccessible, or not valid JSON.
            Error message will include "interview_structure" for identification.
    """
    try:
        response = _s3_client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read().decode("utf-8")
        return json.loads(body)
    except botocore.exceptions.ClientError as e:
        raise ConfigLoadError(
            f"Failed to load interview_structure from s3://{bucket}/{key}: {e}"
        ) from e
    except json.JSONDecodeError as e:
        raise ConfigLoadError(
            f"Failed to parse interview_structure from s3://{bucket}/{key}: {e}"
        ) from e


def load_interview_profile(bucket: str, key: str) -> dict:
    """
    Fetch and parse student_interview_profile.json from S3.

    Args:
        bucket: S3 bucket name (from S3_BUCKET env var)
        key: S3 object key (from INTERVIEW_PROFILE_KEY env var)

    Returns:
        Parsed dict of the interview profile.

    Raises:
        ConfigLoadError: If the object is missing, inaccessible, or not valid JSON.
            Error message will include "interview_profile" for identification.
    """
    try:
        response = _s3_client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read().decode("utf-8")
        return json.loads(body)
    except botocore.exceptions.ClientError as e:
        raise ConfigLoadError(
            f"Failed to load interview_profile from s3://{bucket}/{key}: {e}"
        ) from e
    except json.JSONDecodeError as e:
        raise ConfigLoadError(
            f"Failed to parse interview_profile from s3://{bucket}/{key}: {e}"
        ) from e
