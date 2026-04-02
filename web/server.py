"""
server.py — AML ActOne Local Dev Server
========================================
Serves the web app + the live XLSX data over HTTP so the browser
can auto-refresh without any manual file uploads.

Usage:
    python server.py

Then open:  http://localhost:8765

The server watches DATA_FILE for changes (mtime). When the A2A pipeline
writes a new version, the browser picks it up on the next poll (≤5 s).

Folder layout expected (all in the same directory as this script):
    server.py
    index.html              ← web app
    open_alerts_data.xlsx   ← written by Agent 3 after each pipeline run
    alerts_data.xlsx        ← historical training data (optional fallback)
"""

import hashlib
import json
import mimetypes
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────
HOST       = "localhost"
PORT       = 8765
BASE_DIR   = Path(__file__).parent.resolve()
DATA_FILE  = BASE_DIR / "open_alerts_data.xlsx"   # Agent 3 writes here
FALLBACK   = BASE_DIR / "alerts_data.xlsx"        # used if open_alerts not found
WEBAPP     = BASE_DIR / "index.html"
POLL_MS    = 4000   # browser polls every N ms for file changes

# ── File-change fingerprint ────────────────────────────────────────────────────
def file_fingerprint(path: Path) -> str:
    """Returns mtime+size string — cheap change detection without hashing."""
    try:
        st = path.stat()
        return f"{st.st_mtime_ns}-{st.st_size}"
    except FileNotFoundError:
        return "missing"

# ── Request Handler ────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Suppress noisy poll requests; show everything else
        if "/api/poll" not in (args[0] if args else ""):
            print(f"  {self.address_string()}  {fmt % args}")

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")

        if path == "" or path == "/":
            self._serve_file(WEBAPP, "text/html; charset=utf-8")

        elif path == "/api/data":
            # Serve the live XLSX file as binary
            target = DATA_FILE if DATA_FILE.exists() else FALLBACK
            if not target.exists():
                self._json(404, {"error": "No data file found.",
                                 "tried": [str(DATA_FILE), str(FALLBACK)]})
                return
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type",
                             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition",
                             f'inline; filename="{target.name}"')
            self._cors()
            self.end_headers()
            self.wfile.write(data)

        elif path == "/api/poll":
            # Returns the current file fingerprint + metadata.
            # Browser compares against its stored fingerprint to detect changes.
            target = DATA_FILE if DATA_FILE.exists() else FALLBACK
            fp     = file_fingerprint(target)
            mtime  = target.stat().st_mtime if target.exists() else 0
            self._json(200, {
                "fingerprint":  fp,
                "file":         target.name,
                "last_modified": time.strftime(
                    "%Y-%m-%d %H:%M:%S UTC", time.gmtime(mtime)
                ) if mtime else "—",
                "exists": target.exists(),
                "poll_ms": POLL_MS,
            })

        elif path == "/api/status":
            self._json(200, {
                "server":   "AML ActOne Local Server",
                "data_file": str(DATA_FILE),
                "data_exists": DATA_FILE.exists(),
                "fallback":  str(FALLBACK),
                "fallback_exists": FALLBACK.exists(),
            })

        else:
            self._json(404, {"error": f"Unknown route: {path}"})

    def _serve_file(self, path: Path, content_type: str):
        if not path.exists():
            self._json(404, {"error": f"File not found: {path.name}"})
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    print(f"""
╔══════════════════════════════════════════════════════════╗
║         AML ActOne  ·  Local Server  ·  v1.0            ║
╠══════════════════════════════════════════════════════════╣
║  App URL  :  http://{HOST}:{PORT:<5}                        ║
║  Data API :  http://{HOST}:{PORT}/api/data                 ║
║  Poll API :  http://{HOST}:{PORT}/api/poll                 ║
╠══════════════════════════════════════════════════════════╣
║  Watching :  {str(DATA_FILE)[:50]:<50}  ║
╠══════════════════════════════════════════════════════════╣
║  Workflow :                                              ║
║    1. Run the A2A pipeline  (python main.py)            ║
║    2. Agent 3 writes open_alerts_data.xlsx here         ║
║    3. Browser auto-refreshes within {POLL_MS//1000} seconds            ║
╚══════════════════════════════════════════════════════════╝
""")

    if not WEBAPP.exists():
        print(f"  ⚠  WARNING: {WEBAPP} not found — place index.html next to server.py")

    server = HTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
