"""Tiny local server: serves icon.html and writes POSTed PNGs into public/.

Usage: python -I scripts/icon/save_server.py   then open http://127.0.0.1:8765/icon.html
"""
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / "public"
ALLOWED = re.compile(r"^[a-z0-9\-]+\.png$")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "POST")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") in ("", "/icon.html"):
            body = (HERE / "icon.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        name = self.path.lstrip("/")
        if not ALLOWED.match(name):
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        data = self.rfile.read(int(self.headers["Content-Length"]))
        (PUBLIC / name).write_bytes(data)
        self.send_response(201)
        self._cors()
        self.end_headers()


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
