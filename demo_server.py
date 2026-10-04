"""Serve the saved Python demo report without installing project packages."""

import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "demo"


class DemoHandler(SimpleHTTPRequestHandler):
    def api_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/demo":
            self.api_response(200, json.loads((ROOT / "report.json").read_text()))
        elif self.path.startswith("/api/"):
            self.api_response(
                503,
                {
                    "detail": "This is the saved demo. Start the development frontend and Python backend for uploads."
                },
            )
        else:
            super().do_GET()

    def do_POST(self):
        self.api_response(
            503,
            {
                "detail": "This is the saved demo. Start the development frontend and Python backend for uploads."
            },
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5173)
    options = parser.parse_args()
    print(f"Cadence demo: http://127.0.0.1:{options.port}", flush=True)
    ThreadingHTTPServer(
        ("127.0.0.1", options.port), partial(DemoHandler, directory=str(ROOT))
    ).serve_forever()
