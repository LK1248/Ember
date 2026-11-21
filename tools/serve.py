"""Local dev server for Ember (no caching).  python tools/serve.py [port]"""
import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5341
print(f"Ember on http://localhost:{port}")
http.server.ThreadingHTTPServer(("", port), partial(NoCache, directory=str(ROOT))).serve_forever()
