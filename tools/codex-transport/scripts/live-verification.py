#!/usr/bin/env python3
"""Gated live acceptance through the real Go gateway, Rust sidecar and isolated DB.

Never run with real credentials until the S08/S09 synthetic review gate is released.
Input is stdin or an owner-only regular file, never argv/environment. Reports are
allowlisted counters/hashes; upstream bodies, credentials and Docker logs are omitted.
"""
import argparse
import base64
import hashlib
import http.client
import http.server
import importlib.util
import json
import os
import re
from pathlib import Path
import secrets
import select
import signal
import socket
import socketserver
import threading
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid

IMAGE = "docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33"
PROXY_ENV = [
    item
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    )
    for item in ("-e", key + "=")
]
INITIAL = 1000000
FIXTURE_ID = 9001
EXPRESSION = 'tier("live_verification", p * 2 + c * 2)'


class Failure(Exception):
    """Only fixed stage labels and allowlisted diagnostics cross the boundary."""

    def __init__(self, stage, diagnostics=None):
        super().__init__(stage)
        self.diagnostics = diagnostics or {}


def management_diagnostics(path, status, result):
    phase = {
        "/api/status": "health",
        "/api/setup": "setup",
        "/api/user/login": "login",
        "/api/channel/fetch_models/9001": "model_discovery",
    }.get(path, "unknown")
    details = {"management_phase": phase, "http_status": status}
    message = result.get("message", "") if isinstance(result, dict) else ""
    if not isinstance(message, str):
        return details
    upstream = re.search(r"upstream status: ([1-5][0-9]{2})(?![0-9])", message)
    if upstream:
        details["upstream_status"] = int(upstream.group(1))
    transport = re.search(r"codex transport: ([a-z_]+) \(([a-z_]+)\)", message)
    codes = {"invalid_metadata", "unsupported_policy", "target", "proxy", "connect", "tls", "timeout", "cancelled", "upstream_io", "capacity", "internal"}
    phases = {"local_connect", "upstream_connect", "maybe_sent", "headers_received", "body_truncated"}
    if transport and transport.group(1) in codes and transport.group(2) in phases:
        details["transport_code"], details["transport_phase"] = transport.groups()
    if "failed to refresh Codex channel credential" in message:
        details["category"] = "credential_refresh_failed"
    return details


def read_credentials(path=None, stream=None):
    if path:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_mode & 0o077
                or info.st_uid != os.getuid()
            ):
                raise Failure("credential_file_permissions")
            raw = source.read(65537)
    else:
        raw = (stream or sys.stdin.buffer).read(65537)
    if len(raw) > 65536:
        raise Failure("credential_input_size")
    try:
        value = json.loads(raw)
        # A refresh token is intentionally not retained or sent for this minimal test.
        result = {key: value[key] for key in ("access_token", "account_id", "expired")}
        if any(
            not isinstance(v, str) or not v or "\n" in v or "\r" in v
            for v in result.values()
        ):
            raise ValueError()
        return result
    except (ValueError, KeyError, TypeError):
        raise Failure("credential_input_invalid") from None


def docker(*args, input_data=None, check=True):
    result = subprocess.run(
        ["docker", *args],
        input=input_data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode:
        raise Failure("docker_operation")
    return result.stdout.decode()


def usage_summary(event):
    if event.get("type") != "response.completed":
        raise Failure("incomplete_response")
    response = event.get("response", {})
    usage = response.get("usage", {})
    values = {
        key: usage.get(key) for key in ("input_tokens", "output_tokens", "total_tokens")
    }
    if any(type(v) is not int or v < 0 or v > 1000000 for v in values.values()):
        raise Failure("invalid_usage")
    if values["total_tokens"] != values["input_tokens"] + values["output_tokens"]:
        raise Failure("usage_total_mismatch")
    if response.get("status") != "completed" or not response.get("id"):
        raise Failure("response_status")
    values["response_id_sha256"] = hashlib.sha256(response["id"].encode()).hexdigest()
    return values


def verify_accounting(snapshot, generations):
    charge = sum(g["total_tokens"] for g in generations)
    expected_user = [INITIAL - charge, charge, len(generations)]
    if (
        snapshot["user"] != expected_user
        or snapshot["token"] != [INITIAL - charge, charge]
        or snapshot["channel"] != charge
    ):
        raise Failure("accounting_balance_mismatch")
    logs = snapshot["logs"]
    if len(logs) != len(generations):
        raise Failure("accounting_log_count")
    for log, usage in zip(logs, generations):
        if (
            log["quota"] != usage["total_tokens"]
            or log["prompt_tokens"] != usage["input_tokens"]
            or log["completion_tokens"] != usage["output_tokens"]
        ):
            raise Failure("accounting_usage_mismatch")
        if (
            not log["request_id"]
            or log["channel_id"] != FIXTURE_ID
            or log["token_id"] != FIXTURE_ID
        ):
            raise Failure("accounting_log_linkage")
    return snapshot


def helper(mode):
    """Runs inside the isolated helper; credentials enter only over docker exec stdin."""
    db = sqlite3.connect("/data/live.db")
    db.row_factory = sqlite3.Row
    if mode == "seed":
        value = json.load(sys.stdin)

        def insert(table, values):
            columns = ",".join('"' + key + '"' for key in values)
            db.execute(
                'INSERT INTO "'
                + table
                + '" ('
                + columns
                + ") VALUES ("
                + ",".join("?" for _ in values)
                + ")",
                tuple(values.values()),
            )

        insert(
            "users",
            dict(
                id=FIXTURE_ID,
                username="live-fixture",
                password="unused",
                role=1,
                status=1,
                quota=INITIAL,
                used_quota=0,
                request_count=0,
                group="default",
                auth_version=1,
                setting='{"billing_preference":"wallet_only"}',
            ),
        )
        insert(
            "tokens",
            dict(
                id=FIXTURE_ID,
                user_id=FIXTURE_ID,
                key=value["api_token"],
                name="live-validation",
                status=1,
                expired_time=-1,
                remain_quota=INITIAL,
                used_quota=0,
                unlimited_quota=False,
                model_limits_enabled=False,
                group="default",
            ),
        )
        insert(
            "channels",
            dict(
                id=FIXTURE_ID,
                type=57,
                key=json.dumps(value["credential"]),
                status=1,
                name="isolated-live",
                models="live-validation-model",
                group="default",
                base_url="https://chatgpt.com",
                used_quota=0,
                auto_ban=0,
                setting=json.dumps(
                    {"responses_websocket_enabled": True, "proxy": "http://egress:8080"}
                ),
                channel_info=b"{}",
                settings="{}",
            ),
        )
        insert(
            "abilities",
            dict(
                group="default",
                model="live-validation-model",
                channel_id=FIXTURE_ID,
                enabled=True,
                priority=0,
                weight=0,
            ),
        )
        for key, value in {
            "billing_setting.billing_mode": '{"live-validation-model":"tiered_expr"}',
            "billing_setting.billing_expr": json.dumps(
                {"live-validation-model": EXPRESSION}
            ),
            "group_ratio_setting.group_ratio": '{"default":1}',
            "LogConsumeEnabled": "true",
            "ModelRequestRateLimitEnabled": "false",
            "RetryTimes": "0",
        }.items():
            db.execute(
                "INSERT OR REPLACE INTO options (key,value) VALUES (?,?)", (key, value)
            )
        db.commit()
    elif mode == "model":
        value = json.load(sys.stdin)
        db.execute(
            "UPDATE channels SET model_mapping=? WHERE id=?",
            (json.dumps({"live-validation-model": value["model"]}), FIXTURE_ID),
        )
        db.commit()
    elif mode == "accounting":
        logs = [
            dict(row)
            for row in db.execute(
                "SELECT id,quota,prompt_tokens,completion_tokens,request_id,channel_id,token_id FROM logs WHERE token_id=? AND type=2 ORDER BY id",
                (FIXTURE_ID,),
            )
        ]
        result = {
            "user": list(
                db.execute(
                    "SELECT quota,used_quota,request_count FROM users WHERE id=?",
                    (FIXTURE_ID,),
                ).fetchone()
            ),
            "token": list(
                db.execute(
                    "SELECT remain_quota,used_quota FROM tokens WHERE id=?",
                    (FIXTURE_ID,),
                ).fetchone()
            ),
            "channel": db.execute(
                "SELECT used_quota FROM channels WHERE id=?", (FIXTURE_ID,)
            ).fetchone()[0],
            "logs": logs,
        }
        print(json.dumps(result))
    db.close()


class Egress(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        # Opaque TLS tunnel only; no TLS interception, custom roots or auth logging.
        if (
            os.environ.get("LIVE_ALLOW_EGRESS") != "true"
            or self.path != "chatgpt.com:443"
        ):
            self.send_error(403)
            return
        upstream = None
        try:
            upstream = socket.create_connection(("chatgpt.com", 443), timeout=20)
            self.connection.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            while True:
                ready, _, _ = select.select([upstream, self.connection], [], [], 180)
                if not ready:
                    return
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (
                        upstream if source is self.connection else self.connection
                    ).sendall(data)
        except OSError:
            pass
        finally:
            if upstream:
                upstream.close()
            self.close_connection = True


class GatewayForwarder(socketserver.BaseRequestHandler):
    """Opaque local test-client connection; never records local bearer tokens."""

    def handle(self):
        remote = None
        try:
            remote = socket.create_connection(("app", 3000), timeout=5)
            while True:
                ready, _, _ = select.select([remote, self.request], [], [], 180)
                if not ready:
                    return
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (remote if source is self.request else self.request).sendall(data)
        except OSError:
            pass
        finally:
            if remote:
                remote.close()


class Deployment:
    def __init__(self, app_image, sidecar_image, allow_egress=True):
        self.allow_egress = allow_egress
        self.prefix = "codex-live-" + uuid.uuid4().hex[:10]
        self.app_image, self.sidecar_image = app_image, sidecar_image
        self.containers = []
        self.volumes = []
        self.network = None
        self.app = self.prefix + "-app"
        self.store = self.prefix + "-store"
        self.port = None

    def cleanup(self):
        # Once cleanup starts, repeated termination cannot interrupt secret removal.
        previous = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            self._cleanup()
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)

    def _cleanup(self):
        for name in reversed(self.containers):
            docker("rm", "-f", name, check=False)
        for name in reversed(self.volumes):
            docker("volume", "rm", name, check=False)
        if self.network:
            docker("network", "rm", self.network, check=False)
        # A successful inventory is required: engine failure never proves absence.
        failed = False
        for kind, names, field in (
            ("container", self.containers, "Names"),
            ("volume", self.volumes, "Name"),
            ("network", [self.network] if self.network else [], "Name"),
        ):
            if not names:
                continue
            options = ["--all"] if kind == "container" else []
            try:
                inventory = docker(kind, "ls", *options, "--format", "{{." + field + "}}")
            except Failure:
                raise Failure("ephemeral_cleanup_unverified") from None
            failed |= bool(set(inventory.splitlines()).intersection(names))
        if failed:
            raise Failure("ephemeral_cleanup_failed")

    def run(self, name, image, *args, network=None):
        self.containers.append(name)
        docker(
            "run",
            "-d",
            "--name",
            name,
            "--platform",
            "linux/arm64",
            "--log-driver",
            "none",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            network or self.network,
            *PROXY_ENV,
            *args,
            image,
            "sleep",
            "infinity",
        )

    def initialize(self):
        self.network = self.prefix + "-internal"
        docker("network", "create", "--internal", self.network)
        for suffix in ("data", "socket"):
            name = self.prefix + "-" + suffix
            self.volumes.append(name)
            docker(
                "volume",
                "create",
                "--driver",
                "local",
                "--opt",
                "type=tmpfs",
                "--opt",
                "device=tmpfs",
                "--opt",
                "o=size=128m,uid=10001,gid=10001,mode=0700",
                name,
            )
        self.run(
            self.store,
            IMAGE,
            "-v",
            self.volumes[0] + ":/data",
            "-v",
            self.volumes[1] + ":/run/codex-transport",
        )
        docker("cp", str(Path(__file__).resolve()), self.store + ":/tmp/live.py")
        proxy = self.prefix + "-egress"
        self.run(
            proxy,
            IMAGE,
            "-p",
            "127.0.0.1::8081",
            "-e",
            "LIVE_ALLOW_EGRESS=" + str(self.allow_egress).lower(),
            network="bridge",
        )
        docker("network", "connect", "--alias", "egress", self.network, proxy)
        self.port = int(docker("port", proxy, "8081/tcp").strip().rsplit(":", 1)[1])
        docker("cp", str(Path(__file__).resolve()), proxy + ":/tmp/live.py")
        docker("exec", "-d", proxy, "python3", "/tmp/live.py", "--proxy")
        side = self.prefix + "-sidecar"
        self.containers.append(side)
        docker(
            "run",
            "-d",
            "--name",
            side,
            "--platform",
            "linux/arm64",
            "--log-driver",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            self.network,
            "-v",
            self.volumes[1] + ":/run/codex-transport",
            *PROXY_ENV,
            self.sidecar_image,
        )
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                docker("exec", side, "codex-transport", "health")
                break
            except Failure:
                time.sleep(0.1)
        else:
            raise Failure("sidecar_health")
        self.start()

    def start(self):
        docker("rm", "-f", self.app, check=False)
        if self.app not in self.containers:
            self.containers.append(self.app)
        options = [
            "-e",
            "SQLITE_PATH=/data/live.db",
            "-e",
            "CODEX_TRANSPORT_ENABLED=true",
            "-e",
            "CODEX_TRANSPORT_SOCKET=/run/codex-transport/transport.sock",
            "-e",
            "CountToken=false",
            "-e",
            "BATCH_UPDATE_ENABLED=false",
            "-e",
            "MEMORY_CACHE_ENABLED=false",
            "-e",
            "SHUTDOWN_TIMEOUT_SECONDS=20",
        ]
        docker(
            "run",
            "-d",
            "--name",
            self.app,
            "--platform",
            "linux/arm64",
            "--log-driver",
            "none",
            "--user",
            "10001:10001",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--network",
            self.network,
            "--network-alias",
            "app",
            "--mount",
            "type=volume,src=" + self.volumes[0] + ",dst=/data,volume-nocopy",
            "-v",
            self.volumes[1] + ":/run/codex-transport:ro",
            *options,
            *PROXY_ENV,
            self.app_image,
        )
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                self.api("GET", "/api/status")
                return
            except (OSError, http.client.HTTPException, Failure):
                time.sleep(0.1)
        raise Failure("app_health")

    def stop(self):
        docker("stop", "--time", "30", self.app)

    def db(self, mode, value=None):
        raw = docker(
            "exec",
            "-i",
            "--user",
            "10001:10001",
            self.store,
            "python3",
            "/tmp/live.py",
            "--helper",
            mode,
            input_data=json.dumps(value).encode() if value is not None else None,
        )
        return json.loads(raw) if raw.strip() else None

    def api(self, method, path, value=None, token=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=45)
        try:
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = "Bearer " + token
            connection.request(
                method,
                path,
                json.dumps(value).encode() if value is not None else None,
                headers,
            )
            response = connection.getresponse()
            raw = response.read(1048577)
            if response.status != 200 or len(raw) > 1048576:
                raise Failure("management_http", management_diagnostics(path, response.status, {}))
            result = json.loads(raw)
            if not result.get("success"):
                raise Failure("management_result", management_diagnostics(path, response.status, result))
            return result.get("data")
        finally:
            connection.close()

    def settle(self, generations):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            snapshot = self.db("accounting")
            try:
                return verify_accounting(snapshot, generations)
            except Failure:
                time.sleep(0.1)
        raise Failure("accounting_not_settled")


def run_live(args, credential):
    deployment = Deployment(args.app_image, args.sidecar_image)
    report = {
        "scope": "live Go gateway -> Rust sidecar -> official upstream",
        "generations": [],
        "cleanup_resource_prefix": deployment.prefix,
        "verification_expression": EXPRESSION,
        "pricing_note": "isolated validation rate, not a claim of provider retail cost",
        "official_endpoint": "https://chatgpt.com/backend-api/codex",
        "custom_ca": False,
        "proxy": "isolated allowlist CONNECT; only chatgpt.com:443",
    }
    try:
        report["app_image_id"] = json.loads(docker("image", "inspect", args.app_image))[
            0
        ]["Id"]
        report["sidecar_image_id"] = json.loads(
            docker("image", "inspect", args.sidecar_image)
        )[0]["Id"]
        if report["app_image_id"] != args.expected_app_id:
            raise Failure("app_image_not_approved")
        if report["sidecar_image_id"] != args.expected_sidecar_id:
            raise Failure("sidecar_image_not_approved")
        deployment.app_image = report["app_image_id"]
        deployment.sidecar_image = report["sidecar_image_id"]
        print(json.dumps({"cleanup_resource_prefix": deployment.prefix}), file=sys.stderr, flush=True)
        deployment.initialize()
        password = secrets.token_urlsafe(24)
        api_token = secrets.token_hex(24)
        deployment.api(
            "POST",
            "/api/setup",
            {
                "username": "liveadmin",
                "password": password,
                "confirmPassword": password,
            },
        )
        deployment.stop()
        deployment.db("seed", {"credential": credential, "api_token": api_token})
        deployment.start()
        login = deployment.api(
            "POST", "/api/user/login", {"username": "liveadmin", "password": password}
        )
        management_token = login["access_token"]
        models = deployment.api(
            "GET", "/api/channel/fetch_models/9001", token=management_token
        )
        if not isinstance(models, list) or not all(isinstance(m, str) for m in models):
            raise Failure("model_discovery_shape")
        preferences = [
            "gpt-6-luna",
            "gpt-5.4-mini",
            "gpt-5.1-codex-mini",
            "gpt-5-mini",
            "gpt-5.4",
            "gpt-5.3-codex",
        ]
        selected = next((m for m in preferences if m in models), None)
        if not selected:
            raise Failure("no_known_low_cost_model")
        report["model_discovery"] = {
            "count": len(models),
            "selected": selected,
            "management_path": "/api/channel/fetch_models/9001",
        }
        deployment.stop()
        deployment.db("model", {"model": selected})
        deployment.start()
        request = {
            "model": "live-validation-model",
            "instructions": "Reply with OK only. Do not call tools.",
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": "Say OK."}]}
            ],
            "stream": True,
            "store": False,
            "max_output_tokens": 64,
        }
        connection = http.client.HTTPConnection(
            "127.0.0.1", deployment.port, timeout=90
        )
        try:
            connection.request(
                "POST",
                "/v1/responses",
                json.dumps(request),
                {
                    "Authorization": "Bearer sk-" + api_token,
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            if response.status != 200:
                raise Failure("inference_http_status")
            completed = None
            total = 0
            while True:
                line = response.readline(1048577)
                total += len(line)
                if len(line) > 1048576 or total > 4194304:
                    raise Failure("inference_response_limit")
                if not line:
                    break
                if line.startswith(b"data: ") and line.strip() != b"data: [DONE]":
                    event = json.loads(line[6:])
                    if event.get("type") == "response.completed":
                        completed = event
                    if event.get("type") in ("error", "response.failed"):
                        raise Failure("inference_error")
            if completed is None:
                raise Failure("inference_incomplete")
            report["generations"].append(usage_summary(completed))
            report["http_status"] = 200
        finally:
            connection.close()
        report["accounting"] = deployment.settle(report["generations"])
        # Reuse only framing helpers; no synthetic upstream or CA setup is invoked.
        spec = importlib.util.spec_from_file_location(
            "deployment_framing", Path(__file__).with_name("test-deployment.py")
        )
        framing = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(framing)
        sock = socket.create_connection(("127.0.0.1", deployment.port), timeout=90)
        stream = sock.makefile("rb")
        try:
            key = base64.b64encode(secrets.token_bytes(16)).decode()
            sock.sendall(
                (
                    "GET /v1/responses?model=live-validation-model HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer sk-"
                    + api_token
                    + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: "
                    + key
                    + "\r\n\r\n"
                ).encode()
            )
            if not stream.readline().startswith(b"HTTP/1.1 101 "):
                raise Failure("ws_handshake")
            for _ in range(100):
                line = stream.readline(8193)
                if line == b"\r\n":
                    break
                if not line or len(line) > 8192:
                    raise Failure("ws_handshake_headers")
            else:
                raise Failure("ws_handshake_header_count")
            previous = None
            for turn in range(2):
                create = dict(request, type="response.create")
                create.pop("stream")
                if previous:
                    create["previous_response_id"] = previous
                framing.ws_send(sock, json.dumps(create), mask=True)
                for _ in range(1000):
                    opcode, payload = framing.ws_read(stream)
                    if opcode == 9:
                        framing.ws_send(sock, payload, mask=True, opcode=10)
                        continue
                    if opcode != 1:
                        raise Failure("ws_unexpected_frame")
                    event = json.loads(payload)
                    if event.get("type") in ("error", "response.failed"):
                        raise Failure("ws_inference_error")
                    if event.get("type") == "response.completed":
                        break
                else:
                    raise Failure("ws_event_limit")
                previous = event["response"]["id"]
                report["generations"].append(usage_summary(event))
                report["accounting"] = deployment.settle(report["generations"])
            framing.ws_send(sock, b"\x03\xe8", mask=True, opcode=8)
        finally:
            stream.close()
            sock.close()
        report["ws_status"] = 101
        report["ws_generations"] = 2
        report["complete"] = True
        return report
    finally:
        deployment.cleanup()


def dry_run():
    # No Docker/network or actual credential read. Exercises only a fake canary.
    canary = "synthetic-secret-" + secrets.token_hex(8)
    with tempfile.TemporaryDirectory(prefix="codex-live-dry-") as directory:
        path = Path(directory) / "credential"
        path.write_text(
            json.dumps(
                {
                    "access_token": canary,
                    "account_id": "synthetic",
                    "expired": "2099-01-01T00:00:00Z",
                    "refresh_token": canary + "refresh",
                }
            )
        )
        path.chmod(0o600)
        credential = read_credentials(path)
        assert (
            credential["access_token"] == canary and "refresh_token" not in credential
        )
    assert not Path(directory).exists()
    return {
        "dry_run": True,
        "credential_source": "synthetic canary only",
        "cleanup": True,
        "live_executed": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credential-file", type=Path)
    parser.add_argument("--app-image")
    parser.add_argument("--expected-app-id")
    parser.add_argument("--expected-sidecar-id")
    parser.add_argument("--sidecar-image", default="codex-transport:openssl364")
    parser.add_argument(
        "--output", type=Path, default=Path("/tmp/codex-live-sanitized.json")
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    def terminated(signum, frame):
        raise Failure("terminated")
    previous = {sig: signal.signal(sig, terminated) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        if args.dry_run:
            report = dry_run()
        else:
            if not args.app_image or not args.expected_app_id or not args.expected_sidecar_id:
                raise Failure("approved_app_image_required")
            report = run_live(args, read_credentials(args.credential_file))
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
        return 0
    except Exception as error:
        # Never stringify third-party/HTTP/JSON errors; they may contain secrets.
        stage = str(error) if isinstance(error, Failure) else "unexpected_failure"
        failure_report = {"complete": False, "stage": stage}
        if isinstance(error, Failure):
            failure_report.update(error.diagnostics)
        args.output.write_text(json.dumps(failure_report, indent=2) + "\n")
        print(json.dumps(failure_report))
        return 1
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--helper"]:
        helper(sys.argv[2])
    elif sys.argv[1:] == ["--proxy"]:
        frontend = socketserver.ThreadingTCPServer(("0.0.0.0", 8081), GatewayForwarder)
        frontend.daemon_threads = True
        threading.Thread(target=frontend.serve_forever, daemon=True).start()
        http.server.ThreadingHTTPServer(("0.0.0.0", 8080), Egress).serve_forever()
    else:
        sys.exit(main())
