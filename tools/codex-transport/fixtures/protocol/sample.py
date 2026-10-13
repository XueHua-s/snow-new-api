"""Synthetic-only Linux fixture. No host credentials, no Internet, no captured secrets."""

import base64
import datetime
import hashlib
import http.client
import json
import os
import select
from pathlib import Path
import socket
import ssl
import struct
import subprocess
import tempfile
import threading
import time


def exact(s, n):
    out = b""
    while len(out) < n:
        chunk = s.recv(n - len(out))
        if not chunk:
            raise EOFError("truncated frame")
        out += chunk
    return out


class Cursor:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, n):
        if self.pos + n > len(self.data):
            raise ValueError("truncated vector")
        r = self.data[self.pos : self.pos + n]
        self.pos += n
        return r

    def number(self, n):
        return int.from_bytes(self.take(n), "big")

    def vector(self, n):
        return self.take(self.number(n))

    def done(self):
        if self.pos != len(self.data):
            raise ValueError("trailing vector data")


def hello(data):
    c = Cursor(data)
    if c.number(1) != 1:
        raise ValueError("not ClientHello")
    b = Cursor(c.vector(3))
    c.done()
    result = {"version": b.number(2)}
    b.take(32)  # RFC8446 ClientHello.random: freshly generated random bytes.
    result["session_id_length"] = len(b.vector(1))  # compatibility random ID.
    result["ciphers"] = b.vector(2).hex()
    result["compression"] = b.vector(1).hex()
    extensions = Cursor(b.vector(2))
    b.done()
    result["extensions"] = []
    while extensions.pos < len(extensions.data):
        kind = extensions.number(2)
        payload = extensions.vector(2)
        value = payload.hex()
        if kind == 51:
            v = Cursor(payload)
            shares = Cursor(v.vector(2))
            v.done()
            value = []
            while shares.pos < len(shares.data):
                group = shares.number(2)
                key = shares.vector(2)
                value.append([group, len(key)])  # ephemeral public key only.
        elif kind == 41:
            v = Cursor(payload)
            identities = Cursor(v.vector(2))
            binders = Cursor(v.vector(2))
            v.done()
            ids, bs = [], []
            while identities.pos < len(identities.data):
                ids.append([len(identities.vector(2)), "ticket_age"])
                identities.take(4)
            while binders.pos < len(binders.data):
                bs.append(len(binders.vector(1)))
            value = {"ticket_identity_lengths": ids, "binder_lengths": bs}
        result["extensions"].append([kind, value])
    return result


def response(turn):
    rid = "resp_synthetic_" + str(turn)
    output = []
    if turn == 1:
        output = [
            {
                "id": "fc_synthetic",
                "type": "function_call",
                "call_id": "call_synthetic",
                "name": "shell",
                "arguments": '{"command":["/bin/true"],"timeout_ms":1000}',
            }
        ]
    else:
        output = [
            {
                "id": "msg_synthetic",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {"type": "output_text", "text": "synthetic OK", "annotations": []}
                ],
            }
        ]
    r = {
        "id": rid,
        "object": "response",
        "status": "completed",
        "model": "gpt-5.4",
        "output": output,
        "usage": {"input_tokens": 17, "output_tokens": 3, "total_tokens": 20},
    }
    events = [
        {
            "type": "response.created",
            "response": dict(r, status="in_progress", output=[]),
            "sequence_number": 0,
        }
    ]
    for i, item in enumerate(output):
        events += [
            {
                "type": "response.output_item.added",
                "output_index": i,
                "item": item,
                "sequence_number": 1,
            },
            {
                "type": "response.output_item.done",
                "output_index": i,
                "item": item,
                "sequence_number": 2,
            },
        ]
    events.append({"type": "response.completed", "response": r, "sequence_number": 3})
    return events


def ws_send(s, payload, opcode=1):
    size = len(payload)
    head = bytes([0x80 | opcode])
    head += (
        bytes([size])
        if size < 126
        else (
            b"\x7e" + struct.pack("!H", size)
            if size < 65536
            else b"\x7f" + struct.pack("!Q", size)
        )
    )
    s.sendall(head + payload)


def ws_read(s):
    a, b = exact(s, 2)
    n = b & 127
    if n == 126:
        n = int.from_bytes(exact(s, 2), "big")
    if n == 127:
        n = int.from_bytes(exact(s, 8), "big")
    if n > 134217728:
        raise ValueError("frame too large")
    mask = exact(s, 4) if b & 128 else None
    data = exact(s, n)
    if mask:
        data = bytes(v ^ mask[i % 4] for i, v in enumerate(data))
    return a & 15, data


class Server:
    def __init__(self, cert, key, h2_enabled=False, close=False):
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.load_cert_chain(cert, key)
        self.context.set_alpn_protocols(
            ["h2", "http/1.1"] if h2_enabled else ["http/1.1"]
        )
        self.listener = socket.socket()
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen()
        self.port = self.listener.getsockname()[1]
        self.close = close
        self.captures = []
        self.requests = []
        self.errors = []
        self.condition = threading.Condition()
        threading.Thread(target=self.accept, daemon=True).start()

    def accept(self):
        while True:
            try:
                raw, _ = self.listener.accept()
            except OSError:
                return
            threading.Thread(target=self.serve, args=(raw,), daemon=True).start()

    def serve(self, raw):
        raw.settimeout(20)
        try:
            # MSG_PEEK leaves original ordered ClientHello untouched for TLS.
            head = raw.recv(5, socket.MSG_PEEK | socket.MSG_WAITALL)
            n = int.from_bytes(head[3:5], "big")
            record = raw.recv(5 + n, socket.MSG_PEEK | socket.MSG_WAITALL)
            profile = hello(record[5:])
            profile["record_version"] = head[1:3].hex()
            s = self.context.wrap_socket(raw, server_side=True)
            profile.update(
                resumed=s.session_reused,
                alpn=s.selected_alpn_protocol(),
                frames=[],
                requests=[],
            )
            with self.condition:
                profile["connection"] = len(self.captures)
                self.captures.append(profile)
                self.condition.notify_all()
            if profile["alpn"] == "h2":
                self.http2(s, profile)
            else:
                self.http1(s, profile)
            s.close()
        except (EOFError, ConnectionError):
            pass
        except Exception as e:
            self.errors.append(type(e).__name__ + ": " + str(e))
        finally:
            raw.close()

    def add_request(self, p, method, path, headers, body):
        r = {
            "method": method,
            "path": path,
            "headers": headers,
            "body": body.decode(),
            "connection": p["connection"],
        }
        with self.condition:
            self.requests.append(r)
            p["requests"].append(r)
            self.condition.notify_all()
        return r

    def http1(self, s, p):
        f = s.makefile("rb")
        while True:
            line = f.readline()
            if not line:
                p["peer_eof"] = True
                return
            method, path, _ = line.decode().strip().split(" ")
            headers = []
            while True:
                line = f.readline()
                if line == b"\r\n":
                    break
                k, v = line.decode().split(":", 1)
                headers.append([k.lower(), v.strip()])
            h = dict(headers)
            body = f.read(int(h.get("content-length", "0")))
            if h.get("transfer-encoding") == "chunked":
                while True:
                    n = int(f.readline().strip(), 16)
                    if n == 0:
                        f.readline()
                        break
                    body += f.read(n)
                    f.read(2)
            r = self.add_request(p, method, path, headers, body)
            if h.get("upgrade", "").lower() == "websocket":
                accept = base64.b64encode(
                    hashlib.sha1(
                        (
                            h["sec-websocket-key"]
                            + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
                        ).encode()
                    ).digest()
                ).decode()
                s.sendall(
                    (
                        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: "
                        + accept
                        + "\r\n\r\n"
                    ).encode()
                )
                r["ws_messages"] = []
                r["ws_payloads_b64"] = []
                while True:
                    op, data = ws_read(s)
                    if op == 8:
                        ws_send(s, data, 8)
                        return
                    if op == 9:
                        ws_send(s, data, 10)
                        continue
                    if op != 1:
                        continue
                    msg = json.loads(data)
                    r["ws_messages"].append(msg)
                    r["ws_payloads_b64"].append(base64.b64encode(data).decode())
                    if msg.get("type") == "response.create":
                        turn = sum(
                            m.get("generate") is not False
                            for request in self.requests
                            for m in request.get("ws_messages", [])
                        )
                        events = (
                            response(turn)
                            if msg.get("generate") is not False
                            else [
                                {
                                    "type": "response.created",
                                    "response": {
                                        "id": "resp_prewarm",
                                        "status": "in_progress",
                                    },
                                },
                                {
                                    "type": "response.completed",
                                    "response": {
                                        "id": "resp_prewarm",
                                        "status": "completed",
                                        "output": [],
                                        "usage": {
                                            "input_tokens": 0,
                                            "output_tokens": 0,
                                            "total_tokens": 0,
                                        },
                                    },
                                },
                            ]
                        )
                        for e in events:
                            ws_send(s, json.dumps(e).encode())
                        if (
                            self.close
                            and turn == 1
                            and msg.get("generate") is not False
                        ):
                            ws_send(s, struct.pack("!H", 1000), 8)
                            p["server_close"] = "explicit clean WS reconnect fixture"
                            return
                return
            if (
                self.close
                and method == "POST"
                and sum(x["method"] == "POST" for x in self.requests) == 1
            ):
                s.sendall(
                    b"HTTP/1.1 503 Synthetic retry fixture\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                p["server_close"] = "503 retry fixture"
                return
            events = response(sum(x["method"] == "POST" for x in self.requests))
            out = b"".join(
                ("event: " + e["type"] + "\ndata: " + json.dumps(e) + "\n\n").encode()
                for e in events
            )
            if "/models" in path:
                out = b'{"models":[]}'
            s.sendall(
                (
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: "
                    + str(len(out))
                    + "\r\n"
                    + ("Connection: close\r\n" if self.close else "")
                    + "\r\n"
                ).encode()
                + out
            )
            if self.close:
                p["server_close"] = "explicit fixture Connection: close"
                return

    def http2(self, s, p):
        import h2.config
        import h2.connection
        import h2.events

        protocol = h2.connection.H2Connection(
            config=h2.config.H2Configuration(client_side=False, header_encoding="utf-8")
        )
        protocol.initiate_connection()
        s.sendall(protocol.data_to_send())
        pending = b""
        preface = False
        streams = {}
        while True:
            chunk = s.recv(65536)
            if not chunk:
                p["peer_eof"] = True
                return
            pending += chunk
            if not preface and len(pending) >= 24:
                assert pending[:24] == b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
                pending = pending[24:]
                preface = True
            while preface and len(pending) >= 9:
                n = int.from_bytes(pending[:3], "big")
                if len(pending) < 9 + n:
                    break
                kind, flags = pending[3:5]
                stream = int.from_bytes(pending[5:9], "big")
                payload = pending[9 : 9 + n]
                pending = pending[9 + n :]
                frame = {"type": kind, "flags": flags, "stream": stream, "length": n}
                if kind == 4:
                    frame["settings"] = [
                        list(struct.unpack("!HI", payload[i : i + 6]))
                        for i in range(0, n, 6)
                    ]
                if kind == 8:
                    frame["increment"] = int.from_bytes(payload, "big")
                if kind in (1, 9):
                    frame["hpack"] = payload.hex()
                if kind == 7:
                    frame["goaway"] = payload.hex()
                p["frames"].append(frame)
            for e in protocol.receive_data(chunk):
                if isinstance(e, h2.events.RequestReceived):
                    streams[e.stream_id] = [e.headers, b""]
                if isinstance(e, h2.events.DataReceived):
                    streams[e.stream_id][1] += e.data
                    protocol.acknowledge_received_data(
                        e.flow_controlled_length, e.stream_id
                    )
                if isinstance(e, h2.events.StreamEnded):
                    headers, body = streams[e.stream_id]
                    h = dict(headers)
                    self.add_request(p, h[":method"], h[":path"], headers, body)
                    out = b"".join(
                        (
                            "event: " + x["type"] + "\ndata: " + json.dumps(x) + "\n\n"
                        ).encode()
                        for x in response(
                            sum(r["method"] == "POST" for r in self.requests)
                        )
                    )
                    protocol.send_headers(
                        e.stream_id,
                        [
                            (":status", "200"),
                            ("content-type", "text/event-stream"),
                            ("content-length", str(len(out))),
                        ],
                    )
                    protocol.send_data(e.stream_id, out, end_stream=True)
            s.sendall(protocol.data_to_send())


class Proxy:
    def __init__(self, scheme, context, target_port):
        self.scheme, self.context, self.target_port = scheme, context, target_port
        self.requests = []
        self.errors = []
        self.denied = []
        self.listener = socket.socket()
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen()
        self.url = scheme + "://127.0.0.1:" + str(self.listener.getsockname()[1])
        threading.Thread(target=self.accept, daemon=True).start()

    def accept(self):
        while True:
            try:
                s, _ = self.listener.accept()
            except OSError:
                return
            threading.Thread(target=self.tunnel, args=(s,), daemon=True).start()

    def tunnel(self, s):
        remote = None
        try:
            s.settimeout(20)
            if self.scheme == "https":
                s = self.context.wrap_socket(s, server_side=True)
            if self.scheme in ("http", "https"):
                head = b""
                while not head.endswith(b"\r\n\r\n"):
                    head += exact(s, 1)
                method, target, _ = head.split(b"\r\n", 1)[0].decode().split(" ")
                if method != "CONNECT" or target != "localhost:" + str(
                    self.target_port
                ):
                    self.denied.append({"method": method, "target": target})
                    s.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                    return
                self.requests.append({"method": method, "target": target})
                remote = socket.create_connection(("127.0.0.1", self.target_port))
                s.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:
                version, n = exact(s, 2)
                assert version == 5
                methods = exact(s, n)
                assert 0 in methods
                s.sendall(b"\x05\x00")
                version, command, reserved, kind = exact(s, 4)
                assert command == 1
                if kind == 1:
                    host = socket.inet_ntop(socket.AF_INET, exact(s, 4))
                elif kind == 4:
                    host = socket.inet_ntop(socket.AF_INET6, exact(s, 16))
                elif kind == 3:
                    host = exact(s, exact(s, 1)[0]).decode()
                else:
                    raise ValueError("SOCKS address type")
                port = int.from_bytes(exact(s, 2), "big")
                assert port == self.target_port and host in (
                    "localhost",
                    "127.0.0.1",
                    "::1",
                )
                self.requests.append(
                    {"address_type": kind, "target": host, "port": port}
                )
                remote = socket.create_connection(("127.0.0.1", port))
                s.sendall(b"\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00")
            while True:
                ready = (
                    [s]
                    if isinstance(s, ssl.SSLSocket) and s.pending()
                    else select.select([s, remote], [], [], 20)[0]
                )
                if not ready:
                    return
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (remote if source is s else s).sendall(data)
        except (EOFError, ConnectionError):
            pass
        except Exception as e:
            self.errors.append(type(e).__name__)
        finally:
            s.close()
            if remote:
                remote.close()


def environment(home):
    return {
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME": str(home),
        "CODEX_HOME": str(home),
        "LANG": "C.UTF-8",
        "RUST_LOG": "off",
    }


def official(server, mode, ca, root, websocket=False):
    home = root / "home"
    home.mkdir(exist_ok=True)
    encode = (
        lambda v: base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip("=")
    )
    claims = {
        "exp": int(time.time()) + 3600,
        "email": "synthetic@example.test",
        "sub": "synthetic-user",
        "https://api.openai.com/auth": {
            "chatgpt_account_id": "synthetic-account",
            "chatgpt_plan_type": "pro",
            "chatgpt_user_id": "synthetic-user",
        },
    }
    token = (
        encode({"alg": "RS256", "typ": "JWT"}) + "." + encode(claims) + ".c3ludGhldGlj"
    )
    (home / "auth.json").write_text(
        json.dumps(
            {
                "auth_mode": "chatgpt",
                "tokens": {
                    "id_token": token,
                    "access_token": token,
                    "refresh_token": "synthetic-never-refresh",
                    "account_id": "synthetic-account",
                },
                "last_refresh": datetime.datetime.now(
                    datetime.timezone.utc
                ).isoformat(),
            }
        )
    )
    (home / "auth.json").chmod(0o600)
    env = environment(home)
    if mode == "rustls":
        env["CODEX_CA_CERTIFICATE"] = str(ca)
    if getattr(server, "proxy", None):
        env["HTTPS_PROXY"] = server.proxy.url
    cfg = (
        'model_providers.synthetic={name="Isolated synthetic",base_url="https://localhost:'
        + str(server.port)
        + '/backend-api/codex",wire_api="responses",requires_openai_auth=true,supports_websockets='
        + str(websocket).lower()
        + ",request_max_retries="
        + str(1 if server.close else 0)
        + ",stream_max_retries=0}"
    )
    cmd = [
        "/tmp/codex",
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--json",
        "--sandbox",
        "read-only",
        "-m",
        "gpt-5.4",
        "-c",
        'model_provider="synthetic"',
        "-c",
        'cli_auth_credentials_store="file"',
        "-c",
        "features.apps=false",
        "-c",
        cfg,
        "Run /bin/true once then reply synthetic OK.",
    ]
    p = subprocess.Popen(
        cmd,
        cwd=root,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        stdout, stderr = p.communicate(timeout=30)
    except subprocess.TimeoutExpired:
        p.kill()
        stdout, stderr = p.communicate()
    return {
        "exit_code": p.returncode,
        "stdout": stdout.decode(errors="replace"),
        "stderr": stderr.decode(errors="replace"),
    }


class UDS(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("codex-transport", timeout=20)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(20)
        self.sock.connect(str(self.path))


def sidecar(server, mode, ca, root, templates):
    path = root / "sidecar.sock"
    env = environment(root)
    env["CODEX_TRANSPORT_SOCKET"] = str(path)
    p = subprocess.Popen(
        ["/tmp/sidecar"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        for _ in range(100):
            if p.poll() is not None:
                raise RuntimeError("sidecar startup failed")
            if path.exists():
                break
            threading.Event().wait(0.02)
        health_client = UDS(path)
        health_client.request("GET", "/v1/health")
        health_response = health_client.getresponse()
        health = json.loads(health_response.read())
        health_client.close()
        if (
            health_response.status != 200
            or health.get("profile") != "0.162.1"
            or health.get("platform") != "linux-arm64"
            or health.get("production") is not True
        ):
            raise RuntimeError("Sidecar artifact health/platform mismatch")
        results = []
        for i, t in enumerate(templates):
            body = t["body"].encode()
            headers = [
                [k, base64.b64encode(v.encode()).decode()]
                for k, v in t["headers"]
                if not k.startswith(":")
                and k
                not in (
                    "host",
                    "content-length",
                    "connection",
                    "transfer-encoding",
                    "upgrade",
                    "sec-websocket-key",
                    "sec-websocket-version",
                    "sec-websocket-extensions",
                )
            ]
            meta = {
                "version": 1,
                "request_id": "synthetic-" + str(i),
                "profile": "0.162.1",
                "purpose": "api",
                "method": t["method"],
                "url": "https://localhost:" + str(server.port) + t["path"],
                "headers": headers,
                "content_length": len(body),
                "proxy_url": (
                    server.proxy.url if getattr(server, "proxy", None) else None
                ),
                "http_protocol": "auto",
                "shards": 1,
                "idle_timeout_ms": 90000,
                "max_idle_connections": 500,
                "max_idle_per_host": 100,
                "ca_pem_b64": (
                    base64.b64encode(ca.read_bytes()).decode()
                    if mode == "rustls"
                    else None
                ),
                "connect_timeout_ms": 5000,
                "header_timeout_ms": 10000,
                "total_timeout_ms": 20000,
                "max_request_bytes": 134217728,
                "max_ws_message_bytes": 134217728,
            }
            if "ws_messages" in t:
                meta.update(
                    url=meta["url"].replace("https:", "wss:"),
                    content_length=0,
                    total_timeout_ms=0,
                    header_timeout_ms=45000,
                )
                c = UDS(path)
                c.connect()
                sock = c.sock
                local_key = base64.b64encode(b"synthetic-ws-key").decode()
                # RFC6455 requires a 16-byte nonce.
                local_key = base64.b64encode(b"synthetic-ws-key").decode()
                wire = (
                    "GET /v1/ws HTTP/1.1\r\nHost: codex-transport\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: "
                    + local_key
                    + "\r\nX-Codex-Transport-Meta: "
                    + base64.b64encode(json.dumps(meta).encode()).decode()
                    + "\r\n\r\n"
                ).encode()
                sock.sendall(wire)
                reply = b""
                while not reply.endswith(b"\r\n\r\n"):
                    reply += exact(sock, 1)
                if not reply.startswith(b"HTTP/1.1 101"):
                    raise RuntimeError(
                        "sidecar WS handshake rejected: " + reply[:100].decode()
                    )
                for encoded_payload in t["ws_payloads_b64"]:
                    data = base64.b64decode(encoded_payload, validate=True)
                    n = len(data)
                    mask = b"fake"
                    head = b"\x81" + (
                        bytes([0x80 | n])
                        if n < 126
                        else (
                            b"\xfe" + struct.pack("!H", n)
                            if n < 65536
                            else b"\xff" + struct.pack("!Q", n)
                        )
                    )
                    sock.sendall(
                        head + mask + bytes(v ^ mask[j % 4] for j, v in enumerate(data))
                    )
                    while True:
                        op, data = ws_read(sock)
                        if (
                            op == 1
                            and json.loads(data).get("type") == "response.completed"
                        ):
                            break
                if server.close and i == 0:
                    opcode, close_payload = ws_read(sock)
                    if opcode != 8 or close_payload[:2] != struct.pack("!H", 1000):
                        raise RuntimeError(
                            "Expected clean upstream WS reconnect boundary"
                        )
                else:
                    sock.sendall(b"\x88\x80fake")
                    ws_read(sock)
                c.close()
                results.append({"status": 101, "creates": len(t["ws_messages"])})
                continue
            c = UDS(path)
            c.request(
                "POST",
                "/v1/http",
                body,
                {
                    "X-Codex-Transport-Meta": base64.b64encode(
                        json.dumps(meta).encode()
                    ).decode(),
                    "TE": "trailers",
                },
            )
            r = c.getresponse()
            data = r.read()
            results.append(
                {
                    "status": r.status,
                    "headers": r.getheaders(),
                    "body_length": len(data),
                    "body_sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            c.close()
        return results
    finally:
        p.terminate()
        p.communicate(timeout=10)


def main():
    out = Path("/tmp/protocol-output")
    out.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="codex-protocol-") as tmp:
        root = Path(tmp)
        root.chmod(0o700)
        ca = root / "ca.pem"
        key = root / "key.pem"
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-keyout",
                str(key),
                "-out",
                str(ca),
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost",
                "-addext",
                "basicConstraints=critical,CA:TRUE",
            ],
            check=True,
            capture_output=True,
        )
        leaf = root / "leaf.pem"
        leafkey = root / "leafkey.pem"
        csr = root / "leaf.csr"
        ext = root / "leaf.cnf"
        ext.write_text(
            "basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n"
        )
        subprocess.run(
            [
                "openssl",
                "req",
                "-new",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                str(leafkey),
                "-out",
                str(csr),
                "-subj",
                "/CN=localhost",
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "openssl",
                "x509",
                "-req",
                "-in",
                str(csr),
                "-CA",
                str(ca),
                "-CAkey",
                str(key),
                "-CAcreateserial",
                "-out",
                str(leaf),
                "-days",
                "1",
                "-extfile",
                str(ext),
            ],
            check=True,
            capture_output=True,
        )
        trust = Path("/usr/local/share/ca-certificates/codex-s09.crt")
        trust.write_bytes(ca.read_bytes())
        subprocess.run(["update-ca-certificates"], check=True, capture_output=True)
        report = {}
        reference_requests = {}
        try:
            cases = [
                ("native", "native", False, False, False),
                ("rustls", "rustls", False, False, False),
                ("native-resume", "native", False, True, False),
                ("rustls-resume", "rustls", False, True, False),
                ("h2", "rustls", True, False, False),
                ("ws", "rustls", False, False, True),
                ("ws-resume", "rustls", False, True, True),
            ]
            cases += [
                (
                    "proxy-" + scheme + ("-ws" if ws else "-http"),
                    "rustls",
                    False,
                    False,
                    ws,
                )
                for scheme in ("http", "https", "socks5", "socks5h")
                for ws in (False, True)
            ]
            for name, mode, h2_on, close, ws in cases:
                server = Server(leaf, leafkey, h2_on, close)
                if name.startswith("proxy-"):
                    server.proxy = Proxy(
                        name.split("-")[1], server.context, server.port
                    )
                run = official(server, mode, ca, root, ws)
                report[name] = {
                    "official": server.captures,
                    "official_process": run,
                    "errors": server.errors,
                }
                templates = [
                    r
                    for r in server.requests
                    if r["path"].endswith("/responses")
                    and (r["method"] == "POST" or "ws_messages" in r)
                ]
                if name in ("native", "ws"):
                    reference_requests["ws" if ws else "http"] = templates
                if name in ("proxy-socks5-http", "proxy-socks5h-http"):
                    if templates or "waiting for network" not in run["stdout"]:
                        raise RuntimeError(
                            "Unexpected official SOCKS HTTP outcome; reassess capability"
                        )
                    report[name][
                        "official_unsupported"
                    ] = "reqwest SOCKS feature absent; no fixture connection; CLI waiting for network"
                    templates = reference_requests["http"]
                if name == "proxy-https-ws":
                    if "Proxy URL scheme not supported" not in run["stdout"]:
                        raise RuntimeError(
                            "Unexpected official HTTPS WS outcome; reassess capability"
                        )
                    report[name][
                        "official_unsupported"
                    ] = "TransportDefault fork dialer rejects HTTPS proxy, CLI falls back to HTTPS"
                    templates = reference_requests["ws"]
                report[name]["expected_requests"] = [
                    {
                        "body_sha256": hashlib.sha256(r["body"].encode()).hexdigest(),
                        "ws_creates": len(r.get("ws_messages", [])),
                    }
                    for r in templates
                ]
                report[name]["expected_ws_requests"] = [
                    {"ws_payloads_b64": r["ws_payloads_b64"], "headers": r["headers"]}
                    for r in templates
                    if "ws_payloads_b64" in r
                ]
                server.captures = []
                server.requests = []
                server.errors = []
                other = server
                report[name]["sidecar_results"] = sidecar(
                    other, mode, ca, root, templates
                )
                report[name]["sidecar"] = other.captures
                report[name]["sidecar_errors"] = other.errors
                if getattr(server, "proxy", None):
                    report[name]["proxy"] = {
                        "requests": server.proxy.requests,
                        "errors": server.proxy.errors,
                        "denied_nonfixture_targets": server.proxy.denied,
                    }
                print(name, len(server.requests), run["exit_code"], flush=True)
                (out / "sample.json").write_text(json.dumps(report, indent=2))
        finally:
            trust.unlink(missing_ok=True)
            subprocess.run(
                ["update-ca-certificates", "--fresh"], check=True, capture_output=True
            )


if __name__ == "__main__":
    main()
