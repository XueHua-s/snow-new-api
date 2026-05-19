#!/usr/bin/env python3
"""Small Anthropic Messages bridge backed by a logged-in Claude Code CLI.

This is intended for private deployments where Claude Code is already
authenticated on the host and the gateway should not use an Anthropic API key.
It implements the subset of /v1/messages needed by text clients and delegates
the actual model call to `claude -p --model ...`.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


ALLOWED_MODELS = {
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
}


def extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif item.get("type") == "tool_result":
                    parts.append(str(item.get("content", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(part for part in parts if part)
    return str(content or "")


def build_prompt(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    system = payload.get("system")
    if system:
        parts.append("System:\n" + extract_text(system))
    for message in payload.get("messages") or []:
        if not isinstance(message, dict):
            continue
        role = message.get("role", "user")
        text = extract_text(message.get("content"))
        if text:
            parts.append(f"{role.capitalize()}:\n{text}")
    return "\n\n".join(parts).strip()


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class ClaudeBridgeHandler(BaseHTTPRequestHandler):
    server_version = "snow-claude-oauth-bridge/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_sse(self, text: str, model: str, input_tokens: int, output_tokens: int) -> None:
        msg_id = "msg_" + uuid.uuid4().hex
        events = [
            (
                "message_start",
                {
                    "type": "message_start",
                    "message": {
                        "id": msg_id,
                        "type": "message",
                        "role": "assistant",
                        "model": model,
                        "content": [],
                        "stop_reason": None,
                        "usage": {
                            "input_tokens": input_tokens,
                            "cache_creation_input_tokens": 0,
                            "cache_read_input_tokens": 0,
                            "output_tokens": 0,
                        },
                    },
                },
            ),
            ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}}),
            ("content_block_stop", {"type": "content_block_stop", "index": 0}),
            (
                "message_delta",
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                    "usage": {"output_tokens": output_tokens},
                },
            ),
            ("message_stop", {"type": "message_stop"}),
        ]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for event, payload in events:
            self.wfile.write(f"event: {event}\n".encode("utf-8"))
            self.wfile.write(("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n").encode("utf-8"))
            self.wfile.flush()

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"success": True})
            return
        self.send_json(404, {"type": "error", "error": {"type": "not_found_error", "message": "not found"}})

    def do_POST(self) -> None:
        if self.path != "/v1/messages":
            self.send_json(404, {"type": "error", "error": {"type": "not_found_error", "message": "not found"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:
            self.send_json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": str(exc)}})
            return

        model = str(payload.get("model") or "").strip()
        if model not in ALLOWED_MODELS:
            self.send_json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": f"unsupported model: {model}"}})
            return

        prompt = build_prompt(payload)
        if not prompt:
            self.send_json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "messages are required"}})
            return

        cli_path = os.environ.get("CLAUDE_CLI_PATH", "/root/.local/bin/claude")
        timeout = int(os.environ.get("CLAUDE_BRIDGE_TIMEOUT", "600"))
        env = os.environ.copy()
        env.setdefault("HOME", "/root")
        env["PATH"] = "/root/.local/bin:" + env.get("PATH", "")

        try:
            proc = subprocess.run(
                [cli_path, "-p", "--model", model, "--output-format", "text"],
                input=prompt,
                text=True,
                capture_output=True,
                timeout=timeout,
                env=env,
            )
        except subprocess.TimeoutExpired:
            self.send_json(504, {"type": "error", "error": {"type": "api_error", "message": "claude cli timed out"}})
            return

        if proc.returncode != 0:
            message = (proc.stderr or proc.stdout or "claude cli failed").strip()
            self.send_json(502, {"type": "error", "error": {"type": "api_error", "message": message}})
            return

        text = proc.stdout.strip()
        input_tokens = estimate_tokens(prompt)
        output_tokens = estimate_tokens(text)
        if payload.get("stream"):
            self.send_sse(text, model, input_tokens, output_tokens)
            return

        self.send_json(
            200,
            {
                "id": "msg_" + uuid.uuid4().hex,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [{"type": "text", "text": text}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {
                    "input_tokens": input_tokens,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "output_tokens": output_tokens,
                },
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("CLAUDE_BRIDGE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CLAUDE_BRIDGE_PORT", "3011")))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ClaudeBridgeHandler)
    print(f"Claude OAuth bridge listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
