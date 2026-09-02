import contextlib
import importlib.util
import io
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "load_test.py"
SPEC = importlib.util.spec_from_file_location("quartsys_load_test", SCRIPT_PATH)
load_test = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = load_test
SPEC.loader.exec_module(load_test)


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/health/live":
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, _format, *_args):
        return


class LoadTestToolTests(unittest.TestCase):
    def test_percentile_interpolates_ordered_values(self):
        self.assertEqual(load_test._percentile([40, 10, 20, 30], 0.5), 25.0)
        self.assertEqual(load_test._percentile([], 0.95), None)

    def test_main_rejects_non_health_endpoint_by_default(self):
        with contextlib.redirect_stderr(io.StringIO()):
            exit_code = load_test.main(
                ["--url", "http://127.0.0.1:1/api/pay", "--requests", "1"]
            )
        self.assertEqual(exit_code, 2)

    def test_main_probes_local_health_endpoint_and_reports_json(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _HealthHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                exit_code = load_test.main(
                    [
                        "--url",
                        f"http://127.0.0.1:{server.server_port}/api/health/live",
                        "--requests",
                        "20",
                        "--concurrency",
                        "4",
                        "--rps",
                        "0",
                        "--json",
                        "--fail-on-errors",
                    ]
                )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        payload = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["requests"], 20)
        self.assertEqual(payload["success_count"], 20)
        self.assertEqual(payload["error_count"], 0)
        self.assertEqual(payload["status_counts"], {"200": 20})


if __name__ == "__main__":
    unittest.main()
