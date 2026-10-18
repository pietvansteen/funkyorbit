#!/usr/bin/env python3
"""
Funky Orbit likes-API. Klein, alleen standaard-bibliotheek, bewaart likes in SQLite.

  GET  /api/likes?visitor=<id>   -> {"counts": {videoId: n}, "liked": [videoId, ...]}
  POST /api/like                 body {"video": id, "visitor": id, "liked": true|false}
                                 -> {"video": id, "count": n, "liked": bool}

Eén like per bezoeker-ID (cookie) per video. Niet waterdicht, wel eerlijk genoeg.
Er worden alleen likes geaccepteerd voor video's die in data.json staan.
"""

import json
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB_FILE = os.environ.get("DB_FILE", "/data/likes.db")
DATA_FILE = os.environ.get("DATA_FILE", "/data/data.json")
PORT = int(os.environ.get("PORT", "8000"))

VIDEO_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
VISITOR_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

lock = threading.Lock()
_known = {"mtime": 0, "ids": set()}


def db():
    con = sqlite3.connect(DB_FILE)
    con.execute(
        "CREATE TABLE IF NOT EXISTS likes ("
        " video TEXT NOT NULL, visitor TEXT NOT NULL, created INTEGER NOT NULL,"
        " PRIMARY KEY (video, visitor))"
    )
    return con


def known_videos():
    """Video-ID's uit data.json, opnieuw ingelezen als het bestand verandert."""
    try:
        mtime = os.path.getmtime(DATA_FILE)
        if mtime != _known["mtime"]:
            with open(DATA_FILE, encoding="utf-8") as f:
                data = json.load(f)
            _known["ids"] = {p["youtubeId"] for p in data.get("patterns", []) if p.get("youtubeId")}
            _known["mtime"] = mtime
    except (OSError, ValueError):
        pass
    return _known["ids"]


class Handler(BaseHTTPRequestHandler):
    server_version = "funkyorbit-likes"

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.rstrip("/") == "/api/health":
            return self._send(200, {"ok": True})
        if url.path.rstrip("/") != "/api/likes":
            return self._send(404, {"error": "not found"})
        visitor = (parse_qs(url.query).get("visitor") or [""])[0]
        with lock, db() as con:
            counts = dict(con.execute("SELECT video, COUNT(*) FROM likes GROUP BY video"))
            liked = []
            if VISITOR_RE.match(visitor):
                liked = [r[0] for r in con.execute("SELECT video FROM likes WHERE visitor = ?", (visitor,))]
        self._send(200, {"counts": counts, "liked": liked})

    def do_POST(self):
        if urlparse(self.path).path.rstrip("/") != "/api/like":
            return self._send(404, {"error": "not found"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 1024)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            return self._send(400, {"error": "ongeldige JSON"})
        video, visitor, liked = body.get("video", ""), body.get("visitor", ""), bool(body.get("liked", True))
        if not (isinstance(video, str) and VIDEO_RE.match(video)):
            return self._send(400, {"error": "ongeldige video"})
        if not (isinstance(visitor, str) and VISITOR_RE.match(visitor)):
            return self._send(400, {"error": "ongeldige bezoeker"})
        ids = known_videos()
        if ids and video not in ids:
            return self._send(404, {"error": "onbekende video"})
        with lock, db() as con:
            if liked:
                con.execute("INSERT OR IGNORE INTO likes VALUES (?, ?, ?)", (video, visitor, int(time.time())))
            else:
                con.execute("DELETE FROM likes WHERE video = ? AND visitor = ?", (video, visitor))
            count = con.execute("SELECT COUNT(*) FROM likes WHERE video = ?", (video,)).fetchone()[0]
        self._send(200, {"video": video, "count": count, "liked": liked})

    def log_message(self, fmt, *args):
        pass  # geen IP-adressen in de logs


if __name__ == "__main__":
    os.makedirs(os.path.dirname(os.path.abspath(DB_FILE)), exist_ok=True)
    db().close()
    print(f"likes-API luistert op poort {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
