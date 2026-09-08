"""AWS CloudTrail and CloudWatch live log fetchers."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger(__name__)

INVALID_CREDENTIAL_CODES = {
    "InvalidClientTokenId",
    "SignatureDoesNotMatch",
    "UnrecognizedClientException",
    "InvalidAccessKeyId",
    "IncompleteSignature",
    "InvalidToken",
    "ExpiredToken",
    "AuthFailure",
}


def format_aws_connection_error(exc: Exception) -> str:
    """Map AWS/boto3 errors to clear connection status messages."""
    try:
        from botocore.exceptions import ClientError, NoCredentialsError

        if isinstance(exc, NoCredentialsError):
            return "Unable to connect: the credentials are invalid."

        if isinstance(exc, ClientError):
            error = exc.response.get("Error", {})
            code = error.get("Code", "")
            message = error.get("Message", str(exc))

            if code in INVALID_CREDENTIAL_CODES:
                return "Unable to connect: the credentials are invalid."

            if code in ("AccessDenied", "AccessDeniedException"):
                return (
                    "Unable to connect: credentials were rejected or lack required "
                    f"permissions ({message})"
                )

            if code == "ResourceNotFoundException":
                return f"Unable to connect: AWS resource not found ({message})"

            return f"Unable to connect to AWS: {message}"
    except ImportError:
        pass

    text = str(exc).lower()
    if any(
        token in text
        for token in (
            "invalidclienttokenid",
            "signaturedoesnotmatch",
            "invalidaccesskeyid",
            "unrecognizedclient",
            "authfailure",
            "security token included in the request is invalid",
            "the security token included in the request is invalid",
        )
    ):
        return "Unable to connect: the credentials are invalid."

    if isinstance(exc, ValueError):
        return f"Unable to connect: {exc}"

    return f"Unable to connect to AWS: {exc}"


def _get_boto3_client(service: str, region: str, credentials: dict):
    import boto3

    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=credentials.get("access_key_id"),
        aws_secret_access_key=credentials.get("secret_access_key"),
        aws_session_token=credentials.get("session_token"),
    )


def test_aws_connection(
    region: str,
    credentials: dict,
    log_source: str,
    log_group_name: Optional[str] = None,
) -> dict[str, Any]:
    """Verify credentials and log source access."""
    sts = _get_boto3_client("sts", region, credentials)
    identity = sts.get_caller_identity()

    if log_source == "cloudtrail":
        ct = _get_boto3_client("cloudtrail", region, credentials)
        ct.lookup_events(MaxResults=1)
        source_label = "AWS CloudTrail"
    elif log_source == "cloudwatch":
        logs = _get_boto3_client("logs", region, credentials)
        if not log_group_name:
            raise ValueError("CloudWatch log group name is required")
        logs.describe_log_streams(logGroupName=log_group_name, limit=1)
        source_label = "Amazon CloudWatch Logs"
    else:
        raise ValueError(f"Unsupported log source: {log_source}")

    return {
        "account": identity.get("Account"),
        "arn": identity.get("Arn"),
        "user_id": identity.get("UserId"),
        "source": source_label,
        "region": region,
    }


def fetch_cloudtrail_events(
    region: str,
    credentials: dict,
    start_time: Optional[datetime] = None,
    max_results: int = 50,
) -> list[dict[str, Any]]:
    client = _get_boto3_client("cloudtrail", region, credentials)
    if not start_time:
        start_time = datetime.now(timezone.utc) - timedelta(minutes=15)

    response = client.lookup_events(
        StartTime=start_time,
        MaxResults=min(max_results, 50),
    )
    events = []
    for item in response.get("Events", []):
        raw = item.get("CloudTrailEvent", "{}")
        try:
            detail = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            detail = {"raw": raw}

        events.append({
            "id": item.get("EventId"),
            "time": item.get("EventTime").isoformat() if item.get("EventTime") else None,
            "name": item.get("EventName"),
            "source": item.get("EventSource"),
            "username": item.get("Username"),
            "region": region,
            "provider": "aws",
            "log_source": "cloudtrail",
            "detail": detail,
            "raw": raw if isinstance(raw, str) else json.dumps(raw),
        })
    return events


def fetch_cloudwatch_events(
    region: str,
    credentials: dict,
    log_group_name: str,
    start_time: Optional[datetime] = None,
    max_results: int = 50,
) -> list[dict[str, Any]]:
    if not log_group_name:
        raise ValueError("CloudWatch log group name is required")

    client = _get_boto3_client("logs", region, credentials)
    if not start_time:
        start_time = datetime.now(timezone.utc) - timedelta(minutes=15)

    start_ms = int(start_time.timestamp() * 1000)
    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    response = client.filter_log_events(
        logGroupName=log_group_name,
        startTime=start_ms,
        endTime=end_ms,
        limit=min(max_results, 100),
    )

    events = []
    for item in response.get("events", []):
        message = item.get("message", "")
        events.append({
            "id": str(item.get("eventId", item.get("timestamp"))),
            "time": datetime.fromtimestamp(
                item.get("timestamp", 0) / 1000, tz=timezone.utc
            ).isoformat(),
            "name": log_group_name,
            "source": "cloudwatch",
            "username": None,
            "region": region,
            "provider": "aws",
            "log_source": "cloudwatch",
            "detail": {"message": message},
            "raw": message,
        })
    return events


def fetch_live_events(
    region: str,
    credentials: dict,
    log_source: str,
    log_group_name: Optional[str] = None,
    since_iso: Optional[str] = None,
    max_results: int = 50,
) -> list[dict[str, Any]]:
    start_time = None
    if since_iso:
        try:
            start_time = datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
        except ValueError:
            start_time = datetime.now(timezone.utc) - timedelta(minutes=5)
    else:
        start_time = datetime.now(timezone.utc) - timedelta(minutes=5)

    if log_source == "cloudwatch":
        return fetch_cloudwatch_events(
            region, credentials, log_group_name or "", start_time, max_results
        )
    return fetch_cloudtrail_events(region, credentials, start_time, max_results)
