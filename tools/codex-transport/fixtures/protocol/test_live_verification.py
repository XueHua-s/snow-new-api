"""No network or real credentials: live-runner privacy and cleanup regression gates."""

import contextlib
import importlib.util
import io
import json
import os
import signal
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

path = Path(__file__).parents[2] / "scripts/live-verification.py"
spec = importlib.util.spec_from_file_location("live_verification", path)
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)
CANARY = "synthetic-never-live-secret"
CREDENTIAL = {
    "access_token": CANARY,
    "account_id": "synthetic-account",
    "expired": "2099-01-01T00:00:00Z",
    "refresh_token": CANARY + "-refresh",
}


class LiveRunnerTests(unittest.TestCase):
    def test_stdin_drops_unneeded_refresh_token(self):
        actual = live.read_credentials(
            stream=io.BytesIO(json.dumps(CREDENTIAL).encode())
        )
        self.assertEqual(actual["access_token"], CANARY)
        self.assertNotIn("refresh_token", actual)

    def test_rejects_shared_file_and_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "credential"
            path.write_text(json.dumps(CREDENTIAL))
            path.chmod(0o644)
            with self.assertRaises(live.Failure):
                live.read_credentials(path)
            path.chmod(0o600)
            self.assertEqual(live.read_credentials(path)["access_token"], CANARY)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(OSError):
                live.read_credentials(link)

    def test_docker_passes_secret_only_on_stdin_and_redacts_errors(self):
        class Result:
            returncode = 1
            stdout = b""
            stderr = CANARY.encode()

        with patch.object(live.subprocess, "run", return_value=Result()) as run:
            with self.assertRaises(live.Failure) as error:
                live.docker(
                    "exec",
                    "-i",
                    "fixture",
                    "python3",
                    "/tmp/live.py",
                    "--helper",
                    "seed",
                    input_data=CANARY.encode(),
                )
        self.assertNotIn(CANARY, str(run.call_args.args))
        self.assertEqual(run.call_args.kwargs["input"], CANARY.encode())
        self.assertNotIn(CANARY, str(error.exception))

    def test_cleanup_runs_when_deployment_fails(self):
        with patch.object(
            live, "docker", return_value='[{"Id":"sha256:approved"}]'
        ), patch.object(
            live.Deployment, "initialize", side_effect=RuntimeError(CANARY)
        ), patch.object(
            live.Deployment, "cleanup"
        ) as cleanup:
            args = type(
                "Args",
                (),
                {
                    "app_image": "fixture",
                    "sidecar_image": "fixture-sidecar",
                    "expected_app_id": "sha256:approved",
                    "expected_sidecar_id": "sha256:approved",
                },
            )()
            with self.assertRaises(RuntimeError):
                live.run_live(args, CREDENTIAL)
            cleanup.assert_called_once()

    def test_public_error_output_never_includes_secret(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(
            live, "read_credentials", return_value=CREDENTIAL
        ), patch.object(live, "run_live", side_effect=RuntimeError(CANARY)):
            self.assertEqual(
                live.main(
                    ["--app-image", "fixture", "--expected-app-id", "sha256:fixture", "--expected-sidecar-id", "sha256:fixture"]
                ),
                1,
            )
        self.assertNotIn(CANARY, output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["stage"], "unexpected_failure")

    def test_exact_accounting_mismatch_is_rejected(self):
        usage = {"input_tokens": 7, "output_tokens": 3, "total_tokens": 10}
        log = {
            "id": 1,
            "quota": 10,
            "prompt_tokens": 7,
            "completion_tokens": 3,
            "request_id": "synthetic-request",
            "channel_id": 9001,
            "token_id": 9001,
        }
        snapshot = {
            "user": [live.INITIAL - 10, 10, 1],
            "token": [live.INITIAL - 10, 10],
            "channel": 10,
            "logs": [log],
        }
        self.assertEqual(live.verify_accounting(snapshot, [usage]), snapshot)
        snapshot["channel"] = 9
        with self.assertRaises(live.Failure):
            live.verify_accounting(snapshot, [usage])

    def test_image_ids_pinned_before_initialize(self):
        seen = []
        def initialize(deployment):
            seen.extend([deployment.app_image, deployment.sidecar_image])
            raise RuntimeError("stop")
        args = type("Args", (), dict(app_image="mutable", sidecar_image="mutable-side", expected_app_id="sha256:app", expected_sidecar_id="sha256:side"))()
        with patch.object(live, "docker", side_effect=['[{"Id":"sha256:app"}]', '[{"Id":"sha256:side"}]']), patch.object(live.Deployment, "initialize", initialize), patch.object(live.Deployment, "cleanup"):
            with self.assertRaises(RuntimeError):
                live.run_live(args, CREDENTIAL)
        self.assertEqual(seen, ["sha256:app", "sha256:side"])

    def test_sigterm_enters_cleanup(self):
        def initialize(deployment):
            os.kill(os.getpid(), signal.SIGTERM)
        with patch.object(live, "read_credentials", return_value=CREDENTIAL), patch.object(live, "docker", return_value='[{"Id":"sha256:approved"}]'), patch.object(live.Deployment, "initialize", initialize), patch.object(live.Deployment, "cleanup") as cleanup, contextlib.redirect_stdout(io.StringIO()):
            result = live.main(["--app-image", "fixture", "--expected-app-id", "sha256:approved", "--expected-sidecar-id", "sha256:approved"])
        self.assertEqual(result, 1)
        cleanup.assert_called_once()

    def test_cleanup_detects_resource_leftovers(self):
        for kind in ("container", "volume", "network"):
            deployment = live.Deployment("app", "side")
            deployment.containers = ["fixture-container"]
            deployment.volumes = ["fixture-volume"]
            deployment.network = "fixture-network"
            def inventory(*args, **kwargs):
                return "fixture-" + kind if args[:2] == (kind, "ls") else ""
            with patch.object(live, "docker", side_effect=inventory):
                with self.assertRaisesRegex(live.Failure, "ephemeral_cleanup_failed"):
                    deployment.cleanup()

    def test_cleanup_daemon_failure_is_unverified(self):
        deployment = live.Deployment("app", "side")
        deployment.containers = ["fixture-container"]
        def unavailable(*args, **kwargs):
            if "ls" in args:
                raise live.Failure("docker_operation")
            return ""
        with patch.object(live, "docker", side_effect=unavailable):
            with self.assertRaisesRegex(live.Failure, "ephemeral_cleanup_unverified"):
                deployment.cleanup()

    def test_seed_base_url_builds_official_discovery_and_inference_routes(self):
        database = MagicMock()
        source = io.StringIO(json.dumps({"credential": CREDENTIAL, "api_token": "synthetic"}))
        with patch.object(live.sqlite3, "connect", return_value=database), patch.object(live.sys, "stdin", source):
            live.helper("seed")
        channel_insert = next(call for call in database.execute.call_args_list if call.args[0].startswith('INSERT INTO "channels"'))
        columns = channel_insert.args[0].split("(", 1)[1].split(")", 1)[0].replace('"', '').split(",")
        row = dict(zip(columns, channel_insert.args[1]))
        # The gateway appends these full protocol paths to the configured origin.
        self.assertEqual(row["base_url"] + "/backend-api/codex/models", "https://chatgpt.com/backend-api/codex/models")
        self.assertEqual(row["base_url"] + "/backend-api/codex/responses", "https://chatgpt.com/backend-api/codex/responses")

    def test_management_diagnostics_allowlist_and_redaction(self):
        for message, expected in [
            (CANARY + " upstream status: 403 " + CANARY, {"upstream_status": 403}),
            (CANARY + " codex transport: tls (upstream_connect) " + CANARY, {"transport_code": "tls", "transport_phase": "upstream_connect"}),
            (CANARY + " codex transport: secret (unknown)", {}),
            ({"secret": CANARY}, {}),
        ]:
            result = live.management_diagnostics("/api/channel/fetch_models/9001", 200, {"message": message})
            self.assertEqual(result, dict(management_phase="model_discovery", http_status=200, **expected))
            self.assertNotIn(CANARY, json.dumps(result))

    def test_dry_mode_never_starts_docker(self):
        with patch.object(
            live, "docker", side_effect=AssertionError("Docker forbidden")
        ):
            report = live.dry_run()
        self.assertTrue(report["cleanup"])
        self.assertFalse(report["live_executed"])


if __name__ == "__main__":
    unittest.main()
