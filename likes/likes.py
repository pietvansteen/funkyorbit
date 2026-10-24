#!/usr/bin/env python3
"""
Funky Orbit likes API. Small, standard library only, stores likes in SQLite.

  GET  /api/likes?visitor=<id>   -> {"counts": {videoId: n}, "liked": [videoId, ...]}
  POST /api/like                 body {"video": id, "visitor": id, "liked": true|false}
                                 -> {"video": id, "count": n, "liked": bool}

One like per visitor ID (cookie) per video. Not watertight, but fair enough.
Only likes for videos listed in data.json are accepted.

Feature requests (stored in REQUESTS_DB, never shown publicly):

  POST  /api/requests               body {"name", "email", "request", "website"}  (website = honeypot, must be empty)
  GET   /api/requests               admin: {"requests": [...], "new": n}
  GET   /api/requests/count         admin: {"new": n}
  POST  /api/requests/<id>/status   admin: body {"status": "new" | "planned" | "done" | "no"}
  GET   /api/requests.csv           admin: all requests as CSV

Logging a pattern we juggled (hidden Add page, admin only):

  GET   /api/auth                   admin: {"ok": true} when the password is right
  POST  /api/done                   admin: body {"id", "pattern", "date": "YYYY-MM-DD", "time": "HH:MM" | null, "rating": 0.5..5 | null}
                                    -> {"ok": true, "nr", "name", "family"}
                                    Written to the Done tab by the Sheet's Apps Script (SHEET_WRITE_URL, SHEET_WRITE_SECRET),
                                    then the sync is asked to run right away (the file sync-now next to data.json).

Admin calls need the header  Authorization: Bearer <ADMIN_TOKEN>  (ADMIN_TOKEN from the environment).
"""

import csv
import hmac
import io
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB_FILE = os.environ.get("DB_FILE", "/data/likes.db")
DATA_FILE = os.environ.get("DATA_FILE", "/data/data.json")
PORT = int(os.environ.get("PORT", "8000"))
REQUESTS_DB = os.environ.get("REQUESTS_DB", "/data/requests.db")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
SHEET_WRITE_URL = os.environ.get("SHEET_WRITE_URL", "")  # the Apps Script web app (apps-script/FunkyOrbit.gs)
SHEET_WRITE_SECRET = os.environ.get("SHEET_WRITE_SECRET", "")
SYNC_FLAG = os.path.join(os.path.dirname(os.path.abspath(DATA_FILE)), "sync-now")

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
STATUSES = ("new", "planned", "done", "no")
LIMITS = {"name": 80, "email": 120, "request": 2000}
PER_HOUR = 3  # requests per visitor per hour
_recent = {}  # visitor -> timestamps of their last requests (in memory only)

# vanilla "8556666", sync "33p3 4p44" (as the Done tab writes it) or popcorn "(6x,a)(6,6)*"
PATTERN_RE = re.compile(r"^(?:[0-9a-z]{1,15}|[0-9a-oq-z]p?(?:[0-9a-oq-z]p?){0,14} [0-9a-oq-z]p?(?:[0-9a-oq-z]p?){0,14}|[0-9a-z(),x*]{3,40})$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

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


def requests_db():
    con = sqlite3.connect(REQUESTS_DB)
    con.execute(
        "CREATE TABLE IF NOT EXISTS requests ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL,"
        " name TEXT NOT NULL, email TEXT NOT NULL, request TEXT NOT NULL,"
        " status TEXT NOT NULL DEFAULT 'new')"
    )
    return con


def too_many(visitor):
    """At most PER_HOUR requests per visitor per hour."""
    now = time.time()
    stamps = [t for t in _recent.get(visitor, []) if now - t < 3600]
    _recent[visitor] = stamps
    if len(stamps) >= PER_HOUR:
        return True
    stamps.append(now)
    return False


def known_videos():
    """Video IDs from data.json, reloaded when the file changes."""
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

    def _visitor(self):
        # behind Cloudflare and nginx: the visitor's address, only kept in memory for the hourly limit
        return (self.headers.get("CF-Connecting-IP") or self.headers.get("X-Real-IP")
                or (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or self.client_address[0])

    def _admin(self):
        """True for a correct Authorization: Bearer <ADMIN_TOKEN>; sends the error itself otherwise."""
        if not ADMIN_TOKEN:
            self._send(503, {"error": "no admin password set (ADMIN_TOKEN)"})
            return False
        got = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(got.encode(), ADMIN_TOKEN.encode()):
            time.sleep(1)  # slows down guessing
            self._send(401, {"error": "wrong password"})
            return False
        return True

    def _body(self, limit):
        try:
            length = min(int(self.headers.get("Content-Length", 0)), limit)
            body = json.loads(self.rfile.read(length) or b"{}")
            return body if isinstance(body, dict) else None
        except (ValueError, TypeError):
            return None

    def _requests_get(self, path):
        if not self._admin():
            return
        with lock, requests_db() as con:
            rows = con.execute("SELECT id, created, name, email, request, status FROM requests ORDER BY id DESC").fetchall()
        new = sum(1 for r in rows if r[5] == "new")
        if path == "/api/requests/count":
            return self._send(200, {"new": new})
        if path == "/api/requests.csv":
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(["id", "date", "name", "email", "request", "status"])
            for r in rows:
                w.writerow([r[0], time.strftime("%Y-%m-%d %H:%M", time.localtime(r[1])), r[2], r[3], r[4], r[5]])
            body = out.getvalue().encode("utf-8-sig")  # with BOM, so Excel reads the accents right
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="funkyorbit-requests.csv"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._send(200, {"new": new, "requests": [
            {"id": r[0], "created": r[1], "name": r[2], "email": r[3], "request": r[4], "status": r[5]} for r in rows]})

    def _requests_post(self, path):
        m = re.fullmatch(r"/api/requests/(\d+)/status", path)
        if m:
            if not self._admin():
                return
            body = self._body(256)
            status = (body or {}).get("status")
            if status not in STATUSES:
                return self._send(400, {"error": "invalid status"})
            with lock, requests_db() as con:
                done = con.execute("UPDATE requests SET status = ? WHERE id = ?", (status, int(m.group(1)))).rowcount
            return self._send(200 if done else 404, {"id": int(m.group(1)), "status": status} if done else {"error": "not found"})

        body = self._body(8192)
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        if str(body.get("website") or "").strip():
            return self._send(200, {"ok": True})  # honeypot filled in: a bot; pretend it worked
        fields = {k: str(body.get(k) or "").strip() for k in LIMITS}
        if not fields["name"] or not fields["request"]:
            return self._send(400, {"error": "Please fill in your name and your request."})
        if not EMAIL_RE.match(fields["email"]):
            return self._send(400, {"error": "Please enter a valid email address."})
        if any(len(fields[k]) > n for k, n in LIMITS.items()):
            return self._send(400, {"error": "Your request is too long."})
        if too_many(self._visitor()):
            return self._send(429, {"error": "Thanks! You have sent a few requests already. Please try again later."})
        with lock, requests_db() as con:
            con.execute("INSERT INTO requests (created, name, email, request) VALUES (?, ?, ?, ?)",
                        (int(time.time()), fields["name"], fields["email"], fields["request"]))
        self._send(201, {"ok": True})

    def _done_post(self):
        if not self._admin():
            return
        body = self._body(1024)
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        pattern = re.sub(r"\s*\|\s*|\s+", " ", str(body.get("pattern") or "").strip().lower())
        date, rating = str(body.get("date") or ""), body.get("rating")
        clock = str(body.get("time") or "")
        if not PATTERN_RE.match(pattern):
            return self._send(400, {"error": "That does not look like a siteswap."})
        try:
            if not DATE_RE.match(date):
                raise ValueError
            time.strptime(date, "%Y-%m-%d")
        except ValueError:
            return self._send(400, {"error": "Please choose a date."})
        if clock and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", clock):
            return self._send(400, {"error": "Please choose a valid time."})
        if rating is not None and not (isinstance(rating, (int, float)) and 0.5 <= rating <= 5 and rating * 2 == int(rating * 2)):
            return self._send(400, {"error": "The rating goes from ½ to 5 stars."})
        if not (SHEET_WRITE_URL and SHEET_WRITE_SECRET):
            return self._send(503, {"error": "Saving to the Sheet is not set up yet (SHEET_WRITE_URL)."})
        req_id = str(body.get("id") or "")
        payload = {"secret": SHEET_WRITE_SECRET, "id": req_id if ID_RE.match(req_id) else "",
                   "pattern": pattern, "date": date, "time": clock, "rating": rating}
        try:
            # Apps Script answers with a redirect to the result, which urllib follows as a GET
            req = urllib.request.Request(SHEET_WRITE_URL, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"done: the Sheet could not be reached: {e}", flush=True)
            return self._send(502, {"error": "The Sheet could not be reached. Please try again in a moment."})
        if not isinstance(result, dict) or not result.get("ok"):
            print(f"done: the Sheet said: {result}", flush=True)
            return self._send(502, {"error": f"The Sheet said: {(result or {}).get('error', 'no answer')}"})
        # ask the sync to run now (it checks every few seconds), so the site has the new pattern at once
        try:
            with open(SYNC_FLAG, "w", encoding="utf-8") as f:
                json.dump({"nr": result.get("nr")}, f)
        except OSError as e:
            print(f"done: could not ask for a sync: {e}", flush=True)
        self._send(201, {k: result.get(k) for k in ("ok", "nr", "name", "family")})

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path.rstrip("/")
        if path == "/api/health":
            return self._send(200, {"ok": True})
        if path == "/api/auth":
            return self._admin() and self._send(200, {"ok": True})
        if path in ("/api/requests", "/api/requests/count", "/api/requests.csv"):
            return self._requests_get(path)
        if path != "/api/likes":
            return self._send(404, {"error": "not found"})
        visitor = (parse_qs(url.query).get("visitor") or [""])[0]
        with lock, db() as con:
            counts = dict(con.execute("SELECT video, COUNT(*) FROM likes GROUP BY video"))
            liked = []
            if VISITOR_RE.match(visitor):
                liked = [r[0] for r in con.execute("SELECT video FROM likes WHERE visitor = ?", (visitor,))]
        self._send(200, {"counts": counts, "liked": liked})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/requests" or path.startswith("/api/requests/"):
            return self._requests_post(path)
        if path == "/api/done":
            return self._done_post()
        if path != "/api/like":
            return self._send(404, {"error": "not found"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 1024)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            return self._send(400, {"error": "invalid JSON"})
        video, visitor, liked = body.get("video", ""), body.get("visitor", ""), bool(body.get("liked", True))
        if not (isinstance(video, str) and VIDEO_RE.match(video)):
            return self._send(400, {"error": "invalid video"})
        if not (isinstance(visitor, str) and VISITOR_RE.match(visitor)):
            return self._send(400, {"error": "invalid visitor"})
        ids = known_videos()
        if ids and video not in ids:
            return self._send(404, {"error": "unknown video"})
        with lock, db() as con:
            if liked:
                con.execute("INSERT OR IGNORE INTO likes VALUES (?, ?, ?)", (video, visitor, int(time.time())))
            else:
                con.execute("DELETE FROM likes WHERE video = ? AND visitor = ?", (video, visitor))
            count = con.execute("SELECT COUNT(*) FROM likes WHERE video = ?", (video,)).fetchone()[0]
        self._send(200, {"video": video, "count": count, "liked": liked})

    def log_message(self, fmt, *args):
        pass  # no IP addresses in the logs


if __name__ == "__main__":
    os.makedirs(os.path.dirname(os.path.abspath(DB_FILE)), exist_ok=True)
    db().close()
    requests_db().close()
    print(f"likes API listening on port {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
