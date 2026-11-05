#!/usr/bin/env python3
"""
Funky Orbit likes API. Small, standard library only, stores likes in SQLite.

  GET  /api/likes?visitor=<id>   -> {"counts": {videoId: n}, "liked": [videoId, ...]}
  POST /api/like                 body {"video": id, "visitor": id, "liked": true|false}
                                 -> {"video": id, "count": n, "liked": bool}

One like per visitor ID (cookie) per video. Not watertight, but fair enough.
Only likes for videos listed in data.json are accepted.

Feature requests (stored in REQUESTS_DB, never shown publicly):

  POST  /api/requests               body {"name", "email", "request", "website", "mees"}  (website = honeypot, must be empty; mees = true: no email needed)
  GET   /api/requests               admin: {"requests": [...], "new": n}
  GET   /api/requests/count         admin: {"new": n}
  POST  /api/requests/<id>/status   admin: body {"status": "new" | "planned" | "done" | "no"}
  GET   /api/requests.csv           admin: all requests as CSV

Logging a pattern we juggled (hidden Add page, admin only):

  GET   /api/auth                   admin: {"ok": true} when the password is right
  POST  /api/done                   admin: body {"id", "pattern", "date": "YYYY-MM-DD", "time": "HH:MM" | null, "rating": 0.5..5 | null,
                                    "felt": 0.5..5 | null, "firstTry": true | false, "niceVideo": true | false,
                                    "location": text | null, "gps": "lat,lng" | null}
                                    -> {"ok": true, "nr", "name", "family"}
                                    Written to the Done tab by the Sheet's Apps Script (SHEET_WRITE_URL, SHEET_WRITE_SECRET),
                                    then the sync is asked to run right away (the file sync-now next to data.json).
  POST  /api/sync                   admin: ask the sync to run right away (after a row in Done was changed or deleted)

Rating patterns for a show (hidden Catch or Drop page; ADMIN_TOKEN, or a person's password from SWIPE_TOKENS, which opens nothing else):

  GET    /api/swipes                {"people": [...], "swipes": [{"person", "key", "choice", "at"}, ...], "admin": bool,
                                     "person": the person a personal password belongs to, else null}
  POST   /api/swipe                 body {"person", "key", "choice": "right" | "left"}
  DELETE /api/swipe                 body {"person", "key"}: undo
                                    A personal password can only swipe as that person.

Wish Tricks (#61): visitors wish for a pattern without a video, and hear from us when its video is online (stored in WISHES_DB):

  GET    /api/wishes/counts         {"counts": {key: open wishes}, "push": VAPID public key or null, "email": bool}
  POST   /api/wishes                body {"key", "visitor", "email"?, "push"?: endpoint, "website"}  (website = honeypot, must be empty)
                                    -> {"ok": true, "token", "count", "email": "sent" | "confirmed" | null}
  POST   /api/wishes/remove         body {"token"}: take a wish back
  POST   /api/wishes/news           body {"endpoint"} (a POST, so the address stays out of access logs): what the service worker shows after a push (a push has no content, see webpush.py)
  GET    /api/wishes/confirm?t=...  the link in the confirmation mail (a small HTML page)
  GET    /api/wishes/stop?t=...     the unsubscribe link in every mail: removes the address and its wishes (a small HTML page)
  GET    /api/wishes                admin: open wishes per pattern, most wished first
  A wish needs a name; the names of open wishes are public ("names" in /api/wishes/counts).
  An optional "remark" (300 characters) is only for us: it is only in the admin list.

Practised, not filmed yet (admin only, the Generator and the Add page; stored in SAVED_DB):

  GET    /api/saved                 {"saved": [{"key", "at"}, ...]}, without the patterns that are in Done by now
  POST   /api/saved                 body {"key"}
  DELETE /api/saved                 body {"key"}

A thread looks every minute for open wishes whose pattern now has a video in data.json, also right after a restart.

Admin calls need the header  Authorization: Bearer <ADMIN_TOKEN>  (ADMIN_TOKEN from the environment).
"""

import csv
import html
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import webpush

DB_FILE = os.environ.get("DB_FILE", "/data/likes.db")
DATA_FILE = os.environ.get("DATA_FILE", "/data/data.json")
PORT = int(os.environ.get("PORT", "8000"))
REQUESTS_DB = os.environ.get("REQUESTS_DB", "/data/requests.db")
SWIPES_DB = os.environ.get("SWIPES_DB", "/data/swipes.db")
WISHES_DB = os.environ.get("WISHES_DB", "/data/wishes.db")
SAVED_DB = os.environ.get("SAVED_DB", "/data/saved.db")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")  # tools/make_vapid.py; without it no push
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")  # the mail service (resend.com); without it no email
MAIL_FROM = os.environ.get("MAIL_FROM", "Funky Orbit <wishes@mail.funkyorbit.nl>")
SITE_URL = os.environ.get("SITE_URL", "https://funkyorbit.nl").rstrip("/")
WISH_LOOP = int(os.environ.get("WISH_LOOP", "60"))  # seconds between looks at data.json
PEOPLE = ["Piet", "Mees", "Hanna", "Uwe"]  # who can swipe on the Catch or Drop page


def swipe_tokens():
    """Personal passwords from SWIPE_TOKENS ("Hanna=...,Uwe=..."), as password -> person.
    The old single SWIPE_TOKEN still counts as Hanna's."""
    tokens = {}
    for part in os.environ.get("SWIPE_TOKENS", "").split(","):
        person, _, token = part.partition("=")
        person, token = person.strip(), token.strip()
        if person in PEOPLE and token:
            tokens[token] = person
        elif part.strip():
            print(f"SWIPE_TOKENS: ignored an entry for '{person}'", flush=True)
    old = os.environ.get("SWIPE_TOKEN", "")
    if old:
        tokens.setdefault(old, "Hanna")
    return tokens


SWIPE_TOKENS = swipe_tokens()
SHEET_WRITE_URL = os.environ.get("SHEET_WRITE_URL", "")  # the Apps Script web app (apps-script/FunkyOrbit.gs)
SHEET_WRITE_SECRET = os.environ.get("SHEET_WRITE_SECRET", "")
SYNC_FLAG = os.path.join(os.path.dirname(os.path.abspath(DATA_FILE)), "sync-now")

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
STATUSES = ("new", "planned", "done", "no")
LIMITS = {"name": 80, "email": 120, "request": 2000}
PER_HOUR = 3  # requests per visitor per hour
_recent = {}  # visitor -> timestamps of their last requests (in memory only)
WISHES_PER_HOUR = 20  # wishes per visitor per hour: choosing several patterns is normal
MAILS_PER_DAY = 3  # confirmation mails per address per day, so we can't be used to bother someone
_wish_recent = {}
_mail_recent = {}

# vanilla "8556666", sync "33p3 4p44" (as the Done tab writes it) or popcorn "(6x,a)(6,6)*"
PATTERN_RE = re.compile(r"^(?:[0-9a-z]{1,15}|[0-9a-oq-z]p?(?:[0-9a-oq-z]p?){0,14} [0-9a-oq-z]p?(?:[0-9a-oq-z]p?){0,14}|[0-9a-z(),x*]{3,40})$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GPS_RE = re.compile(r"-?\d{1,2}\.\d{1,7},-?\d{1,3}\.\d{1,7}")
ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

VIDEO_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
VISITOR_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

lock = threading.Lock()
_known = {"mtime": 0, "ids": set(), "keys": set(), "videos": {}, "list": {}}


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


def swipes_db():
    con = sqlite3.connect(SWIPES_DB)
    con.execute(
        "CREATE TABLE IF NOT EXISTS swipes ("
        " person TEXT NOT NULL, key TEXT NOT NULL, choice TEXT NOT NULL, at INTEGER NOT NULL,"
        " PRIMARY KEY (person, key))"
    )
    return con


def wishes_db():
    con = sqlite3.connect(WISHES_DB)
    # One row per wish. email is emptied once the wish mail has gone out; endpoint is the browser's push subscription.
    # notified: the video is online and everyone was told, so the wish no longer counts.
    con.execute(
        "CREATE TABLE IF NOT EXISTS wishes ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, created INTEGER NOT NULL, visitor TEXT NOT NULL,"
        " token TEXT NOT NULL UNIQUE, endpoint TEXT, email TEXT, email_confirmed INTEGER NOT NULL DEFAULT 0,"
        " pushed INTEGER NOT NULL DEFAULT 0, news_read INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0,"
        " notified INTEGER NOT NULL DEFAULT 0, UNIQUE (key, visitor))"
    )
    cols = [r[1] for r in con.execute("PRAGMA table_info(wishes)")]
    if "name" not in cols:  # added in 3.2.0
        con.execute("ALTER TABLE wishes ADD COLUMN name TEXT")
    if "remark" not in cols:  # added in 3.2.2
        con.execute("ALTER TABLE wishes ADD COLUMN remark TEXT")
    return con


def saved_db():
    con = sqlite3.connect(SAVED_DB)
    con.execute("CREATE TABLE IF NOT EXISTS saved (key TEXT PRIMARY KEY, at INTEGER NOT NULL)")
    return con


def too_many(visitor, recent=None, limit=PER_HOUR, window=3600):
    """At most `limit` requests per visitor per `window` seconds."""
    recent = _recent if recent is None else recent
    now = time.time()
    stamps = [t for t in recent.get(visitor, []) if now - t < window]
    recent[visitor] = stamps
    if len(stamps) >= limit:
        return True
    stamps.append(now)
    return False


def load_known():
    """Video IDs and pattern keys from data.json, reloaded when the file changes."""
    try:
        mtime = os.path.getmtime(DATA_FILE)
        if mtime != _known["mtime"]:
            with open(DATA_FILE, encoding="utf-8") as f:
                data = json.load(f)
            _known["ids"] = {p["youtubeId"] for p in data.get("patterns", []) if p.get("youtubeId")}
            _known["keys"] = {p["key"] for p in data.get("patterns", [])}
            _known["videos"] = {p["key"]: p for p in data.get("patterns", []) if p.get("youtubeId")}
            _known["list"] = {p["key"]: p.get("ss") or f'{p.get("a")} | {p.get("b")}' for p in data.get("all", [])}
            _known["mtime"] = mtime
    except (OSError, ValueError):
        pass
    return _known


def known_videos():
    return load_known()["ids"]


def known_keys():
    return load_known()["keys"]


def ask_sync(flag):
    """Write data/sync-now: the sync checks for it every few seconds and then runs at once.
    With {"nr": n} it tries again until that row is in Google's CSV export."""
    try:
        with open(SYNC_FLAG, "w", encoding="utf-8") as f:
            json.dump(flag, f)
        return True
    except OSError as e:
        print(f"could not ask for a sync: {e}", flush=True)
        return False


# ---------- Wish Tricks: telling people the video is online ----------
def send_mail(to, subject, lines, stop_token):
    """One HTTPS call to the mail service. Every mail ends with the unsubscribe link. True when it was accepted."""
    stop = f"{SITE_URL}/api/wishes/stop?t={stop_token}"
    text = "\n\n".join(lines) + f"\n\n--\nFunky Orbit, by Piet & Mees. Don't want this? Unsubscribe: {stop}\n"
    linked = [re.sub(r"(https://\S+)", r'<a href="\1">\1</a>', html.escape(line, quote=False)) for line in lines]
    body = "".join(f"<p>{line}</p>" for line in linked) + f'<p style="color:#777;font-size:13px">Funky Orbit, by Piet &amp; Mees. <a href="{stop}">Unsubscribe</a></p>'
    payload = {"from": MAIL_FROM, "to": [to], "subject": subject, "text": text, "html": body,
               "headers": {"List-Unsubscribe": f"<{stop}>"}}
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(payload).encode(), method="POST", headers={
        "Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json", "User-Agent": "funkyorbit-wishes"})
    try:
        with urllib.request.urlopen(req, timeout=20):
            return True
    except (urllib.error.URLError, OSError) as e:
        print(f"mail: not sent: {e}", flush=True)  # no address in the logs
        return False


def wish_title(key):
    known = load_known()
    video = known["videos"].get(key)
    return (video or {}).get("siteswap") or known["list"].get(key) or key


def send_confirmation(email, key, token):
    return send_mail(email, f"Confirm your wish: {wish_title(key)}", [
        f"You wished for {wish_title(key)} on funkyorbit.nl. We'll mail you when its video is online.",
        f"Please confirm your address: {SITE_URL}/api/wishes/confirm?t={token}",
        "Not you? Then just ignore this mail: without a confirmation we won't mail you again.",
    ], token)


def tell_wishers():
    """Tell everyone whose pattern now has a video, then forget the address. Keeps trying what did not work, for a while."""
    videos = load_known()["videos"]
    if not videos:
        return
    with lock, wishes_db() as con:
        rows = con.execute("SELECT id, key, token, endpoint, email, email_confirmed, pushed, tries FROM wishes WHERE notified = 0").fetchall()
    for wid, key, token, endpoint, email, confirmed, pushed, tries in rows:
        if key not in videos:
            continue
        retry = False
        if endpoint and not pushed and VAPID_PRIVATE_KEY:
            result = webpush.send(endpoint, VAPID_PRIVATE_KEY, SITE_URL)
            if result == "gone":
                with lock, wishes_db() as con:  # the browser dropped it: this also goes for the visitor's other wishes
                    con.execute("UPDATE wishes SET endpoint = NULL WHERE endpoint = ?", (endpoint,))
            elif result == "ok":
                pushed = 1
            else:
                retry = True
        mail_done = False
        if email and confirmed and RESEND_API_KEY:
            mail_done = send_mail(email, f"Your wish trick {wish_title(key)} is online!", [
                f"Your wish came true: the video of {wish_title(key)} is online.",
                f"Watch it here: {SITE_URL}/wish/?open={urllib.parse.quote(key, safe='')}",
                "Thanks for wishing! We have now removed your address for this wish.",
            ], token)
            retry = retry or not mail_done
        tries += 1
        give_up = tries >= 60  # one attempt a minute: about an hour
        with lock, wishes_db() as con:
            con.execute("UPDATE wishes SET pushed = ?, tries = ?, notified = ?, email = CASE WHEN ? THEN NULL ELSE email END WHERE id = ?",
                        (pushed, tries, 0 if retry and not give_up else 1, 1 if (mail_done or give_up or not retry or not confirmed) else 0, wid))
        if give_up and retry:
            print(f"wishes: gave up telling a wisher about {key}", flush=True)


def wish_loop():
    while True:
        try:
            tell_wishers()
        except Exception as e:  # a bad moment must never stop the loop
            print(f"wishes: {e}", flush=True)
        time.sleep(WISH_LOOP)


def answer_page(title, text):
    return ("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width, initial-scale=1'>"
            "<meta name=robots content=noindex>"
            f"<title>{html.escape(title)} · Funky Orbit</title><body style='background:#0d1322;color:#e8ecf5;font:17px/1.5 system-ui,sans-serif;"
            f"max-width:520px;margin:15vh auto;padding:0 20px'><h1 style='font-size:26px'>{html.escape(title)}</h1><p>{html.escape(text)}</p>"
            "<p><a href='/wish/' style='color:#3dd6c4'>To Wish Tricks</a></p></body></html>")


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

    def _send_html(self, status, title, text):
        body = answer_page(title, text).encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _wish_counts(self):
        with lock, wishes_db() as con:
            counts = dict(con.execute("SELECT key, COUNT(*) FROM wishes WHERE notified = 0 GROUP BY key"))
            names = {}
            for key, name in con.execute("SELECT key, name FROM wishes WHERE notified = 0 AND name IS NOT NULL ORDER BY created"):
                if name not in names.setdefault(key, []):
                    names[key].append(name)
        self._send(200, {"counts": counts, "names": names, "push": webpush.public_key(VAPID_PRIVATE_KEY) if VAPID_PRIVATE_KEY else None,
                         "email": bool(RESEND_API_KEY)})

    def _wish_post(self):
        body = self._body(4096)
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        if str(body.get("website") or "").strip():
            return self._send(201, {"ok": True, "token": secrets.token_urlsafe(24), "count": 0, "email": None})  # honeypot: a bot; pretend it worked
        key, visitor = body.get("key"), body.get("visitor")
        email = str(body.get("email") or "").strip().lower()
        name = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f<>]", "", str(body.get("name") or ""))).strip()
        remark = re.sub(r"[ \t]+", " ", re.sub(r"[\x00-\x09\x0b-\x1f\x7f]", "", str(body.get("remark") or ""))).strip()
        endpoint = body.get("push") or None
        if not (isinstance(visitor, str) and VISITOR_RE.match(visitor)):
            return self._send(400, {"error": "Something went wrong. Please reload the page and try again."})
        if not name:
            return self._send(400, {"error": "Please fill in your name."})
        if len(name) > 40:
            return self._send(400, {"error": "Your name can be 40 characters at most."})
        if len(remark) > 300:
            return self._send(400, {"error": "Your remark can be 300 characters at most."})
        known = load_known()
        if not isinstance(key, str) or key not in known["list"]:
            return self._send(400, {"error": "That pattern is not on our list."})
        if key in known["videos"]:
            return self._send(409, {"error": "This pattern already has a video!"})
        if key in known["keys"]:  # thrown: the video is always online soon, so there is nothing to wish for
            return self._send(409, {"error": "We already threw this pattern: the video is coming soon!"})
        if email and (len(email) > 120 or not EMAIL_RE.match(email)):
            return self._send(400, {"error": "Please enter a valid email address."})
        if email and not RESEND_API_KEY:
            return self._send(503, {"error": "Email is not available yet. Your wish can be saved without it."})
        if endpoint and not (VAPID_PRIVATE_KEY and webpush.allowed_endpoint(endpoint)):
            return self._send(400, {"error": "Push notifications do not work in this browser. Please try email."})
        if too_many(self._visitor(), _wish_recent, WISHES_PER_HOUR):
            return self._send(429, {"error": "That's a lot of wishes! Please try again later."})
        with lock, wishes_db() as con:
            old = con.execute("SELECT token, endpoint, email, email_confirmed FROM wishes WHERE key = ? AND visitor = ?", (key, visitor)).fetchone()
            token = old[0] if old else secrets.token_urlsafe(24)
            # an address that is already confirmed needs no new mail
            confirmed = 1 if email and con.execute("SELECT 1 FROM wishes WHERE email = ? AND email_confirmed = 1", (email,)).fetchone() else 0
            if old:
                same = old[2] == email
                con.execute("UPDATE wishes SET endpoint = COALESCE(?, endpoint), email = COALESCE(?, email), email_confirmed = ?, name = ?, remark = COALESCE(?, remark) WHERE token = ?",
                            (endpoint, email or None, (old[3] if same else confirmed) if email else old[3], name, remark or None, token))
            else:
                con.execute("INSERT INTO wishes (key, created, visitor, token, endpoint, email, email_confirmed, name, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (key, int(time.time()), visitor, token, endpoint, email or None, confirmed, name, remark or None))
            count = con.execute("SELECT COUNT(*) FROM wishes WHERE key = ? AND notified = 0", (key,)).fetchone()[0]
            confirmed_now = con.execute("SELECT email_confirmed FROM wishes WHERE token = ?", (token,)).fetchone()[0]
        mail = None
        if email:
            mail = "confirmed"
            if not confirmed_now:
                mail = "sent"
                if not too_many(email, _mail_recent, MAILS_PER_DAY, 86400) and not send_confirmation(email, key, token):
                    return self._send(502, {"ok": True, "token": token, "count": count, "email": "failed",
                                            "error": "Your wish is saved, but the confirmation mail could not be sent."})
        self._send(201, {"ok": True, "token": token, "count": count, "email": mail})

    def _wish_remove(self):
        token = str((self._body(512) or {}).get("token") or "")
        with lock, wishes_db() as con:
            con.execute("DELETE FROM wishes WHERE token = ?", (token,))
            self._send(200, {"ok": True})

    def _wish_news(self):
        endpoint = str((self._body(2048) or {}).get("endpoint") or "")
        with lock, wishes_db() as con:
            # by video, not by "pushed": the service worker can ask before tell_wishers has noted that the push went out
            videos = load_known()["videos"]
            rows = con.execute("SELECT key, id FROM wishes WHERE endpoint = ? AND news_read = 0", (endpoint,)).fetchall() if endpoint else []
            rows = [r for r in rows if r[0] in videos]
            con.executemany("UPDATE wishes SET news_read = 1 WHERE id = ?", [(r[1],) for r in rows])
        self._send(200, {"news": [{"key": r[0], "title": wish_title(r[0])} for r in rows]})

    def _wish_link(self, path, query):
        token = (parse_qs(query).get("t") or [""])[0]
        with lock, wishes_db() as con:
            row = con.execute("SELECT id, email FROM wishes WHERE token = ?", (token,)).fetchone()
            if path.endswith("/confirm"):
                if not row or not row[1]:
                    return self._send_html(404, "This link no longer works", "This wish was removed or has already come true.")
                con.execute("UPDATE wishes SET email_confirmed = 1 WHERE email = ?", (row[1],))
                return self._send_html(200, "Your wish is confirmed!", "We'll mail you when the video is online, so keep an eye on your spam folder too. After that we delete your address.")
            if row and row[1]:  # the address goes, with its wishes; a wish that also has a push subscription stays for that
                con.execute("DELETE FROM wishes WHERE email = ? AND endpoint IS NULL", (row[1],))
                con.execute("UPDATE wishes SET email = NULL, email_confirmed = 0 WHERE email = ?", (row[1],))
            return self._send_html(200, "You are unsubscribed", "We removed your address and its wishes. You won't get mail from us again.")

    def _wishes_admin(self):
        if not self._admin():
            return
        with lock, wishes_db() as con:
            rows = con.execute(
                "SELECT key, COUNT(*), SUM(endpoint IS NOT NULL), SUM(email IS NOT NULL AND email_confirmed = 1),"
                " GROUP_CONCAT(name, ', ') FROM wishes"
                " WHERE notified = 0 GROUP BY key ORDER BY COUNT(*) DESC, MIN(created)").fetchall()
            remarks = {}
            for key, name, remark in con.execute(
                    "SELECT key, name, remark FROM wishes WHERE notified = 0 AND remark IS NOT NULL AND remark != '' ORDER BY created"):
                remarks.setdefault(key, []).append({"name": name or "", "remark": remark})
        self._send(200, {"wishes": [{"key": r[0], "title": wish_title(r[0]), "count": r[1], "push": r[2], "email": r[3],
                                     "names": r[4] or "", "remarks": remarks.get(r[0], [])} for r in rows]})

    def _saved(self, method):
        """Practised, not filmed yet: a pattern stays on the list until it is in Done."""
        if not self._admin():
            return
        if method == "GET":
            done = load_known()["keys"]
            with lock, saved_db() as con:
                if done:
                    con.executemany("DELETE FROM saved WHERE key = ?", [(k,) for k in done])
                rows = con.execute("SELECT key, at FROM saved ORDER BY at DESC").fetchall()
            return self._send(200, {"saved": [{"key": r[0], "at": r[1]} for r in rows]})
        key = (self._body(512) or {}).get("key")
        if not isinstance(key, str) or key not in load_known()["list"]:
            return self._send(400, {"error": "That pattern is not on our list."})
        with lock, saved_db() as con:
            if method == "POST":
                con.execute("INSERT OR REPLACE INTO saved VALUES (?, ?)", (key, int(time.time())))
            else:
                con.execute("DELETE FROM saved WHERE key = ?", (key,))
        self._send(200, {"ok": True})

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

    def _swiper(self):
        """The Catch or Drop page: {"admin": bool, "person": name or None} for a correct password; sends the error itself otherwise."""
        if not (ADMIN_TOKEN or SWIPE_TOKENS):
            self._send(503, {"error": "no password set (SWIPE_TOKENS)"})
            return None
        got = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip().encode()
        # every password always compared; an empty one in the environment never matches
        admin = bool(ADMIN_TOKEN) & hmac.compare_digest(got, ADMIN_TOKEN.encode())
        person = None
        for token, name in SWIPE_TOKENS.items():
            if hmac.compare_digest(got, token.encode()):
                person = name
        if admin or person:
            return {"admin": admin, "person": None if admin else person}
        time.sleep(1)  # slows down guessing
        self._send(401, {"error": "wrong password"})
        return None

    def _swipes_get(self):
        who = self._swiper()
        if not who:
            return
        with lock, swipes_db() as con:
            rows = con.execute("SELECT person, key, choice, at FROM swipes ORDER BY at").fetchall()
        self._send(200, {"people": PEOPLE, "admin": who["admin"], "person": who["person"], "swipes": [
            {"person": r[0], "key": r[1], "choice": r[2], "at": r[3]} for r in rows]})

    def _swipe_write(self, delete):
        who = self._swiper()
        if not who:
            return
        body = self._body(512)
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        person, key, choice = body.get("person"), body.get("key"), body.get("choice")
        if person not in PEOPLE:
            return self._send(400, {"error": "unknown person"})
        if who["person"] and person != who["person"]:
            return self._send(403, {"error": "this password can only swipe as " + who["person"]})
        keys = known_keys()
        if not isinstance(key, str) or not key or len(key) > 80 or (keys and key not in keys):
            return self._send(400, {"error": "unknown pattern"})
        if delete:
            with lock, swipes_db() as con:
                con.execute("DELETE FROM swipes WHERE person = ? AND key = ?", (person, key))
            return self._send(200, {"ok": True})
        if choice not in ("right", "left"):
            return self._send(400, {"error": "invalid choice"})
        with lock, swipes_db() as con:
            con.execute("INSERT OR REPLACE INTO swipes VALUES (?, ?, ?, ?)", (person, key, choice, int(time.time())))
        self._send(200, {"ok": True})

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
        if body.get("mees") is True:  # the checkbox "I'm Mees": no email
            fields["email"] = ""
        elif not EMAIL_RE.match(fields["email"]):
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
        date, rating, felt = str(body.get("date") or ""), body.get("rating"), body.get("felt")
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
        half_stars = lambda v: isinstance(v, (int, float)) and 0.5 <= v <= 5 and v * 2 == int(v * 2)
        if rating is not None and not half_stars(rating):
            return self._send(400, {"error": "The rating goes from ½ to 5 stars."})
        if felt is not None and not half_stars(felt):
            return self._send(400, {"error": "The difficulty goes from ½ to 5 stars."})
        where = re.sub(r"\s+", " ", str(body.get("location") or "")).strip()
        if len(where) > 80:
            return self._send(400, {"error": "The location can be 80 characters at most."})
        gps = str(body.get("gps") or "")
        if gps and not GPS_RE.fullmatch(gps):
            return self._send(400, {"error": "That does not look like a GPS position."})
        if not (SHEET_WRITE_URL and SHEET_WRITE_SECRET):
            return self._send(503, {"error": "Saving to the Sheet is not set up yet (SHEET_WRITE_URL)."})
        req_id = str(body.get("id") or "")
        payload = {"secret": SHEET_WRITE_SECRET, "id": req_id if ID_RE.match(req_id) else "",
                   "pattern": pattern, "date": date, "time": clock, "rating": rating,
                   "felt": felt, "firstTry": body.get("firstTry") is True, "niceVideo": body.get("niceVideo") is True,
                   "location": where, "gps": gps}
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
        ask_sync({"nr": result.get("nr")})
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
        if path == "/api/swipes":
            return self._swipes_get()
        if path == "/api/wishes":
            return self._wishes_admin()
        if path == "/api/saved":
            return self._saved("GET")
        if path == "/api/wishes/counts":
            return self._wish_counts()
        if path in ("/api/wishes/confirm", "/api/wishes/stop"):
            return self._wish_link(path, url.query)
        if path != "/api/likes":
            return self._send(404, {"error": "not found"})
        visitor = (parse_qs(url.query).get("visitor") or [""])[0]
        with lock, db() as con:
            counts = dict(con.execute("SELECT video, COUNT(*) FROM likes GROUP BY video"))
            liked = []
            if VISITOR_RE.match(visitor):
                liked = [r[0] for r in con.execute("SELECT video FROM likes WHERE visitor = ?", (visitor,))]
        self._send(200, {"counts": counts, "liked": liked})

    def _sync_post(self):
        if not self._admin():
            return
        if not ask_sync({}):
            return self._send(500, {"error": "The sync could not be asked to run."})
        self._send(202, {"ok": True})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/sync":
            return self._sync_post()
        if path == "/api/requests" or path.startswith("/api/requests/"):
            return self._requests_post(path)
        if path == "/api/done":
            return self._done_post()
        if path == "/api/swipe":
            return self._swipe_write(False)
        if path == "/api/saved":
            return self._saved("POST")
        if path == "/api/wishes":
            return self._wish_post()
        if path == "/api/wishes/remove":
            return self._wish_remove()
        if path == "/api/wishes/news":
            return self._wish_news()
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

    def do_DELETE(self):
        if urlparse(self.path).path.rstrip("/") == "/api/swipe":
            return self._swipe_write(True)
        if urlparse(self.path).path.rstrip("/") == "/api/saved":
            return self._saved("DELETE")
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass  # no IP addresses in the logs


if __name__ == "__main__":
    os.makedirs(os.path.dirname(os.path.abspath(DB_FILE)), exist_ok=True)
    db().close()
    requests_db().close()
    swipes_db().close()
    wishes_db().close()
    saved_db().close()
    threading.Thread(target=wish_loop, daemon=True).start()
    print(f"likes API listening on port {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
