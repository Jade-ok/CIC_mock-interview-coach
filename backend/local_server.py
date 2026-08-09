"""Local HTTP and WebSocket adapter for the complete application.

The HTTP routes invoke the same Python handlers used by Lambda. Interviewer
configuration is read from ``backend/config`` instead of S3. The mounted voice
application invokes Nova 2 Sonic through the developer's normal AWS credential
chain.
"""

from __future__ import annotations

import importlib
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

import boto3
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load optional local credentials without replacing values already provided by
# the active shell or AWS profile.
load_dotenv(Path(__file__).resolve().parent / ".env.local", override=False)

# This module is the pure local entry point. Prevent a stale shell variable from
# accidentally enabling hosted cost guardrails in the local process.
os.environ["HOSTED_GUARDRAILS_ENABLED"] = "false"

from backend.functions.interviewer.context_builder import build_runtime_context
from backend.functions.interviewer.validation import validate_input
from backend.functions.shared.python.session_guard import start_interview_session
from backend.voice_agent.server import app as voice_app

CONFIG_DIR = Path(__file__).resolve().parent / "config"
logger = logging.getLogger(__name__)


def _active_aws_identity() -> dict:
    session = boto3.Session()
    if session.get_credentials() is None:
        raise RuntimeError(
            "No AWS credentials found. Configure AWS_PROFILE or export AWS credentials."
        )
    return session.client("sts", region_name=session.region_name or "us-east-1").get_caller_identity()


@asynccontextmanager
async def lifespan(_: FastAPI):
    identity = await run_in_threadpool(_active_aws_identity)
    logger.warning(
        "Local AWS identity: account=%s arn=%s",
        identity.get("Account", "unknown"),
        identity.get("Arn", "unknown"),
    )
    yield


app = FastAPI(title="Mock Interview Coach Local Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_json(name: str) -> dict:
    with (CONFIG_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _lambda_handler(module_name: str, function_name: str) -> Callable:
    module = importlib.import_module(module_name)
    return getattr(module, function_name)


def _to_http_response(response: dict) -> JSONResponse:
    status_code = int(response.get("statusCode", 500))
    body = response.get("body", {})
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            body = {"error": body}
    return JSONResponse(status_code=status_code, content=body)


def _build_local_interviewer_response(payload: dict) -> dict:
    analyst_output, error_message = validate_input(payload)
    if error_message is not None:
        return {
            "statusCode": 200,
            "body": json.dumps({"success": False, "error_message": error_message}),
        }

    try:
        runtime_context = build_runtime_context(
            analyst_output,
            _load_json("interview_structure.json"),
            _load_json("student_interview_profile.json"),
        )
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "statusCode": 500,
            "body": json.dumps(
                {"success": False, "error_message": f"Local config error: {exc}"}
            ),
        }

    return {
        "statusCode": 200,
        "body": json.dumps({"success": True, "runtime_context": runtime_context}),
    }


async def _invoke(module_name: str, function_name: str, payload: dict) -> JSONResponse:
    handler = _lambda_handler(module_name, function_name)
    event = {"body": json.dumps(payload)}
    response = await run_in_threadpool(handler, event, None)
    return _to_http_response(response)


@app.post("/api/pdf-parser")
async def pdf_parser(request: Request) -> JSONResponse:
    return await _invoke(
        "backend.functions.pdf_parser.handler", "lambda_handler", await request.json()
    )


@app.post("/api/session")
async def session(request: Request) -> JSONResponse:
    event = {"body": json.dumps(await request.json())}
    response = await run_in_threadpool(start_interview_session, event)
    return JSONResponse(status_code=200, content=response)


@app.post("/api/analyst")
async def analyst(request: Request) -> JSONResponse:
    return await _invoke(
        "backend.functions.analyst.handler", "lambda_handler", await request.json()
    )


@app.post("/api/interviewer")
async def interviewer(request: Request) -> JSONResponse:
    payload = await request.json()
    response = await run_in_threadpool(_build_local_interviewer_response, payload)
    return _to_http_response(response)


@app.post("/api/evaluator")
async def evaluator(request: Request) -> JSONResponse:
    return await _invoke(
        "backend.functions.evaluator.lambda_handler", "handler", await request.json()
    )


@app.get("/api/health")
async def local_health() -> dict[str, str]:
    return {"status": "healthy"}


# Keep the voice relay's existing /, /ws, /ping, and /health routes.
app.mount("/", voice_app)
