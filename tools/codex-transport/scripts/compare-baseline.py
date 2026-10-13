#!/usr/bin/env python3
"""Reproduce the synthetic official/sidecar protocol matrix in an offline ARM64 container.

External artifacts are verified before execution. Docker receives no host HOME,
credentials, network, or repository mount. Only fake OAuth values are generated.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33"
REQUIRED = [
    "native",
    "rustls",
    "native-resume",
    "rustls-resume",
    "h2",
    "ws",
    "ws-resume",
] + [
    "proxy-" + scheme + "-" + route
    for scheme in ("http", "https", "socks5", "socks5h")
    for route in ("http", "ws")
]


def command(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inference(captures):
    return [
        c
        for c in captures
        if any(r["path"].endswith("/responses") for r in c["requests"])
    ]


def websocket_evidence(requests):
    """Record exact upstream message bytes and offered extension values in order."""
    return [
        {
            "messages": [
                {
                    "length": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "message_type": json.loads(payload).get("type"),
                    "generate_present": "generate" in json.loads(payload),
                    "generate": json.loads(payload).get("generate"),
                }
                for payload in (
                    base64.b64decode(encoded, validate=True)
                    for encoded in request["ws_payloads_b64"]
                )
            ],
            "extension_offers": [
                value
                for name, value in request["headers"]
                if name.lower() == "sec-websocket-extensions"
            ],
        }
        for request in requests
    ]


def compare_websocket_requests(expected, actual):
    expected_evidence, actual_evidence = websocket_evidence(
        expected
    ), websocket_evidence(actual)
    errors = []
    if not expected_evidence or any(not item["messages"] for item in expected_evidence):
        errors.append("Missing exact WS payload evidence")
    if [item["messages"] for item in expected_evidence] != [
        item["messages"] for item in actual_evidence
    ]:
        errors.append("WS message length/SHA256 mismatch")
    if any(not item["extension_offers"] for item in expected_evidence):
        errors.append("Missing WS extension offer evidence")
    if [item["extension_offers"] for item in expected_evidence] != [
        item["extension_offers"] for item in actual_evidence
    ]:
        errors.append("WS extension offer value mismatch")
    return {"expected": expected_evidence, "actual": actual_evidence, "errors": errors}


def summarize(data):
    result = {
        "scope": "synthetic only; live accounting is a separate required gate",
        "cases": {},
        "missing": sorted(set(REQUIRED) - data.keys()),
    }
    for name in REQUIRED:
        if name not in data:
            continue
        case = data[name]
        a, b = inference(case["official"]), inference(case.get("sidecar", []))
        errors = list(case["errors"]) + case.get("sidecar_errors", [])
        unsupported = case.get("official_unsupported")
        expected_unsupported = name in (
            "proxy-socks5-http",
            "proxy-socks5h-http",
            "proxy-https-ws",
        )
        if unsupported and not expected_unsupported:
            errors.append("Unexpected unsupported classification")
        if (not a and not unsupported) or not b:
            errors.append("missing actual Responses traffic")
        if case["official_process"]["exit_code"] != 0 and not unsupported:
            errors.append("official CLI failed")
        row = {
            "official_connections": len(a),
            "sidecar_connections": len(b),
            "official_resumed": [c["resumed"] for c in a],
            "sidecar_resumed": [c["resumed"] for c in b],
            "errors": errors,
        }
        row["official_unsupported"] = unsupported
        if unsupported:
            actual_requests = [r for c in b for r in c["requests"]]
            actual = [
                {
                    "body_sha256": hashlib.sha256(r["body"].encode()).hexdigest(),
                    "ws_creates": len(r.get("ws_messages", [])),
                }
                for r in actual_requests
            ]
            row["sidecar_extension_verified"] = actual == case[
                "expected_requests"
            ] and bool(actual)
            if not row["sidecar_extension_verified"]:
                errors.append("Sidecar explicit proxy extension failed")
        if a and b and not unsupported:
            keys = (
                "version",
                "record_version",
                "session_id_length",
                "ciphers",
                "compression",
                "extensions",
                "alpn",
            )
            row["first_client_hello"] = {
                key: {
                    "official": a[0][key],
                    "sidecar": b[0][key],
                    "equal": a[0][key] == b[0][key],
                }
                for key in keys
            }
            row["request_counts"] = [
                sum(len(c["requests"]) for c in group) for group in (a, b)
            ]
            requests = [[r for c in group for r in c["requests"]] for group in (a, b)]
            row["body_sha256"] = [
                [hashlib.sha256(r["body"].encode()).hexdigest() for r in group]
                for group in requests
            ]
            if row["body_sha256"][0] != row["body_sha256"][1]:
                errors.append("request bytes changed or missing")
            row["resumed_client_hello"] = [
                [{key: c[key] for key in keys} for c in group if c["resumed"]]
                for group in (a, b)
            ]
            if name == "rustls-resume" and not all(row["resumed_client_hello"]):
                errors.append("missing actual rustls resumed handshake")
            row["peer_eof"] = [
                [c.get("peer_eof", False) for c in group] for group in (a, b)
            ]
            row["headers"] = [
                [[k for k, v in r["headers"]] for c in group for r in c["requests"]]
                for group in (a, b)
            ]
            if name == "h2":
                row["frames"] = [[c["frames"] for c in group] for group in (a, b)]
                first_headers = [
                    next(
                        (f for c in group for f in c["frames"] if f["type"] == 1), None
                    )
                    for group in (a, b)
                ]
                row["first_headers_hpack_exact"] = first_headers[0] == first_headers[1]
                row["pseudo_headers"] = [
                    [[k, v] for k, v in group[0]["headers"] if k.startswith(":")]
                    for group in requests
                ]
                if not all(c["alpn"] == "h2" for c in a + b):
                    errors.append("actual Responses h2 not negotiated")
                if any(
                    sum(r["method"] == "POST" for c in group for r in c["requests"]) < 2
                    for group in (a, b)
                ):
                    errors.append("missing second H2 generation")
            if name.endswith("ws") or name in ("ws", "ws-resume"):
                row["ws_creates"] = [
                    [
                        len(r.get("ws_messages", []))
                        for c in group
                        for r in c["requests"]
                    ]
                    for group in (a, b)
                ]
                if any(not counts or sum(counts) < 3 for counts in row["ws_creates"]):
                    errors.append("missing prewarm plus two actual WS generations")
        if name.endswith("ws") or name in ("ws", "ws-resume"):
            expected_ws = (
                case["expected_ws_requests"]
                if unsupported
                else [r for c in a for r in c["requests"]]
            )
            actual_ws = [r for c in b for r in c["requests"]]
            row["ws_template_source"] = (
                "direct official ws" if unsupported else "same-case official WS"
            )
            row["ws_byte_and_extension_comparison"] = compare_websocket_requests(
                expected_ws, actual_ws
            )
            errors.extend(row["ws_byte_and_extension_comparison"]["errors"])
            messages = [
                message
                for connection in row["ws_byte_and_extension_comparison"]["expected"]
                for message in connection["messages"]
            ]
            if (
                not messages
                or any(
                    message["message_type"] != "response.create" for message in messages
                )
                or messages[0]["generate"] is not False
                or sum(message["generate"] is not False for message in messages) != 2
            ):
                errors.append(
                    "Missing prewarm generate=false plus two response.create generations"
                )
        if "proxy" in case:
            row["proxy"] = case["proxy"]
            if not case["proxy"]["requests"] or case["proxy"]["errors"]:
                errors.append("proxy matrix incomplete")
        result["cases"][name] = row
    result["complete"] = not result["missing"] and all(
        not row["errors"] for row in result["cases"].values()
    )
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--profile", required=True, choices=["0.162.1"])
    p.add_argument("--platform", required=True, choices=["linux-arm64"])
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--synthetic", action="store_true")
    mode.add_argument("--live", action="store_true")
    p.add_argument(
        "--official",
        type=Path,
        default=Path("/tmp/new-api-codex-guidance/codex-linux-arm64"),
    )
    p.add_argument(
        "--sidecar",
        type=Path,
        default=Path("/tmp/codex-transport-openssl364-image-linux-arm64"),
    )
    p.add_argument(
        "--output", type=Path, default=Path("/tmp/codex-protocol-result.json")
    )
    p.add_argument(
        "--analyze",
        type=Path,
        help="Analyze an existing synthetic sample; does not constitute fresh execution",
    )
    p.add_argument("--credential-file", type=Path)
    p.add_argument("--app-image")
    p.add_argument("--expected-app-id")
    p.add_argument("--expected-sidecar-id")
    p.add_argument("--sidecar-image", default="codex-transport:openssl364")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    if args.live:
        spec = importlib.util.spec_from_file_location(
            "codex_live", Path(__file__).with_name("live-verification.py")
        )
        live = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(live)
        forwarded = [
            "--output",
            str(args.output),
            "--sidecar-image",
            args.sidecar_image,
        ]
        for key in ("credential_file", "app_image", "expected_app_id", "expected_sidecar_id"):
            value = getattr(args, key)
            if value is not None:
                forwarded.extend(["--" + key.replace("_", "-"), str(value)])
        if args.dry_run:
            forwarded.append("--dry-run")
        return live.main(forwarded)
    if args.dry_run or args.credential_file or args.app_image or args.expected_app_id or args.expected_sidecar_id:
        p.error("Live-only arguments require --live")
    if args.analyze:
        result = summarize(json.loads(args.analyze.read_text()))
    else:
        baseline = json.loads((ROOT / "baseline.json").read_text())
        official_hash = hashlib.sha256(args.official.read_bytes()).hexdigest()
        if official_hash != baseline["official"]["binary_sha256"]:
            p.error("Official binary hash mismatch")
        sidecar_hash = hashlib.sha256(args.sidecar.read_bytes()).hexdigest()
        name = "codex-protocol-" + uuid.uuid4().hex[:12]
        with tempfile.TemporaryDirectory(prefix="codex-protocol-run-") as tmp:
            tmp = Path(tmp)
            wheels = tmp / "wheels"
            wheels.mkdir()
            # Download fixture-only pure Python packages before the network-none container exists.
            command(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "download",
                    "--only-binary=:all:",
                    "--dest",
                    str(wheels),
                    "h2==4.3.0",
                    "hpack==4.1.0",
                    "hyperframe==6.1.0",
                ],
                stdout=subprocess.DEVNULL,
            )
            command(
                [
                    "docker",
                    "create",
                    "--name",
                    name,
                    "--platform",
                    "linux/arm64",
                    "--network",
                    "none",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges",
                    IMAGE,
                    "sleep",
                    "infinity",
                ],
                stdout=subprocess.DEVNULL,
            )
            try:
                for source, target in [
                    (args.official, "/tmp/codex"),
                    (args.sidecar, "/tmp/sidecar"),
                    (wheels, "/tmp/wheels"),
                    (ROOT / "fixtures/protocol/sample.py", "/tmp/sample.py"),
                ]:
                    command(["docker", "cp", str(source), name + ":" + target])
                command(["docker", "start", name], stdout=subprocess.DEVNULL)
                version = subprocess.check_output(
                    ["docker", "exec", name, "/tmp/codex", "--version"], text=True
                ).strip()
                if version != "codex-cli 0.162.1":
                    raise RuntimeError("Official executable version mismatch")
                command(
                    [
                        "docker",
                        "exec",
                        name,
                        "python3",
                        "-c",
                        'import zipfile,pathlib; [zipfile.ZipFile(p).extractall("/tmp/python") for p in pathlib.Path("/tmp/wheels").glob("*.whl")]',
                    ]
                )
                command(
                    [
                        "docker",
                        "exec",
                        "-e",
                        "PYTHONPATH=/tmp/python",
                        name,
                        "python3",
                        "/tmp/sample.py",
                    ]
                )
                command(
                    [
                        "docker",
                        "cp",
                        name + ":/tmp/protocol-output/sample.json",
                        str(tmp / "sample.json"),
                    ]
                )
                result = summarize(json.loads((tmp / "sample.json").read_text()))
                result["artifacts"] = {
                    "official_sha256": official_hash,
                    "sidecar_sha256": sidecar_hash,
                    "image": IMAGE,
                    "python_packages": {
                        "h2": "4.3.0",
                        "hpack": "4.1.0",
                        "hyperframe": "6.1.0",
                    },
                }
            finally:
                subprocess.run(
                    ["docker", "rm", "-f", name], check=False, stdout=subprocess.DEVNULL
                )
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {
                "complete": result["complete"],
                "missing": result["missing"],
                "case_errors": {
                    k: v["errors"] for k, v in result["cases"].items() if v["errors"]
                },
                "output": str(args.output),
            },
            indent=2,
        )
    )
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
