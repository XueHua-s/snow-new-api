"""Parser failures and acceptance omissions must fail closed."""

import importlib.util
import base64
import copy
import json
from pathlib import Path
import unittest


def load(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sample = load(Path(__file__).with_name("sample.py"))
compare = load(Path(__file__).parents[2] / "scripts/compare-baseline.py")


def client_hello(extensions, random=b"R" * 32):
    payload = (
        b"\x03\x03"
        + random
        + b"\x00\x00\x02\x13\x01\x01\x00"
        + len(extensions).to_bytes(2, "big")
        + extensions
    )
    return b"\x01" + len(payload).to_bytes(3, "big") + payload


class SamplingTests(unittest.TestCase):
    def test_extension_order_is_preserved(self):
        extensions = b"\x00\x17\x00\x00\x00\x23\x00\x00"
        self.assertEqual(
            sample.hello(client_hello(extensions))["extensions"], [[23, ""], [35, ""]]
        )
        reversed_extensions = b"\x00\x23\x00\x00\x00\x17\x00\x00"
        self.assertNotEqual(
            sample.hello(client_hello(extensions)),
            sample.hello(client_hello(reversed_extensions)),
        )

    def test_only_random_content_is_ignored(self):
        self.assertEqual(
            sample.hello(client_hello(b"", b"A" * 32)),
            sample.hello(client_hello(b"", b"B" * 32)),
        )

    def test_truncated_vectors_are_rejected(self):
        value = client_hello(b"\x00\x17\x00\x00")
        for end in (0, 1, 3, 5, len(value) - 1):
            with self.subTest(end=end), self.assertRaises(ValueError):
                sample.hello(value[:end])

    def test_trailing_bytes_are_rejected(self):
        with self.assertRaises(ValueError):
            sample.hello(client_hello(b"") + b"extra")

    def test_ephemeral_key_length_is_not_ignored(self):
        def key(size):
            share = b"\x00\x1d" + size.to_bytes(2, "big") + b"K" * size
            body = len(share).to_bytes(2, "big") + share
            return b"\x00\x33" + len(body).to_bytes(2, "big") + body

        self.assertNotEqual(
            sample.hello(client_hello(key(32))), sample.hello(client_hello(key(33)))
        )

    def test_changed_ws_payload_same_length_and_count_fails(self):
        expected = [
            {
                "ws_payloads_b64": [
                    base64.b64encode(b'{"type":"response.create","input":"A"}').decode()
                ],
                "headers": [
                    [
                        "sec-websocket-extensions",
                        "permessage-deflate; client_max_window_bits",
                    ]
                ],
            }
        ]
        self.assertEqual(
            compare.compare_websocket_requests(expected, expected)["errors"], []
        )
        actual = copy.deepcopy(expected)
        actual[0]["ws_payloads_b64"] = [
            base64.b64encode(b'{"type":"response.create","input":"B"}').decode()
        ]
        self.assertIn(
            "WS message length/SHA256 mismatch",
            compare.compare_websocket_requests(expected, actual)["errors"],
        )

    def test_changed_deflate_offer_same_header_name_fails(self):
        expected = [
            {
                "ws_payloads_b64": [base64.b64encode(b"{}").decode()],
                "headers": [
                    [
                        "sec-websocket-extensions",
                        "permessage-deflate; client_max_window_bits",
                    ]
                ],
            }
        ]
        actual = copy.deepcopy(expected)
        actual[0]["headers"][0][1] = "permessage-deflate"
        self.assertIn(
            "WS extension offer value mismatch",
            compare.compare_websocket_requests(expected, actual)["errors"],
        )

    def test_summary_propagates_payload_and_offer_failures(self):
        messages = [
            {"type": "response.create", "generate": False},
            {"type": "response.create", "input": "A"},
            {"type": "response.create", "input": "B"},
        ]
        request = {
            "method": "GET",
            "path": "/responses",
            "body": "",
            "headers": [
                [
                    "sec-websocket-extensions",
                    "permessage-deflate; client_max_window_bits",
                ]
            ],
            "ws_messages": messages,
            "ws_payloads_b64": [
                base64.b64encode(json.dumps(message).encode()).decode()
                for message in messages
            ],
        }
        connection = {
            "requests": [request],
            "resumed": False,
            "version": 771,
            "record_version": "0301",
            "session_id_length": 32,
            "ciphers": "1301",
            "compression": "00",
            "extensions": [],
            "alpn": None,
        }
        observation = {
            "official": [connection],
            "sidecar": [copy.deepcopy(connection)],
            "errors": [],
            "sidecar_errors": [],
            "official_process": {"exit_code": 0},
        }
        self.assertEqual(
            compare.summarize({"ws": observation})["cases"]["ws"]["errors"], []
        )
        for change, expected_error in [
            ("payload", "WS message length/SHA256 mismatch"),
            ("offer", "WS extension offer value mismatch"),
        ]:
            with self.subTest(change=change):
                altered = copy.deepcopy(observation)
                actual = altered["sidecar"][0]["requests"][0]
                if change == "payload":
                    original = base64.b64decode(actual["ws_payloads_b64"][1])
                    replaced = original.replace(b'"A"', b'"C"')
                    self.assertEqual(len(original), len(replaced))
                    actual["ws_payloads_b64"][1] = base64.b64encode(replaced).decode()
                else:
                    actual["headers"][0][1] = "permessage-deflate"
                self.assertIn(
                    expected_error,
                    compare.summarize({"ws": altered})["cases"]["ws"]["errors"],
                )

    def test_missing_matrix_cannot_pass(self):
        result = compare.summarize({})
        self.assertFalse(result["complete"])
        self.assertEqual(set(result["missing"]), set(compare.REQUIRED))


if __name__ == "__main__":
    unittest.main()
