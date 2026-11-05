"""
Web Push without a library: VAPID needs an ES256 signature (P-256 with SHA-256), which the standard library does not have.
The push itself has no payload, so nothing has to be encrypted: the service worker fetches its news from /api/wishes/news.

The maths is the textbook curve arithmetic, with a deterministic nonce (RFC 6979). It signs a token that says
"this push comes from funkyorbit.nl"; it is not constant time, which is fine for a key that only signs on our own schedule.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
A = P - 3
G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
     0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)

# Where a browser can have its subscription. likes.py posts to this address on a visitor's say-so, so never anywhere else.
PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com")
PUSH_SUFFIXES = (".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com")


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _add(p, q):
    if p is None:
        return q
    if q is None:
        return p
    if p[0] == q[0]:
        if (p[1] + q[1]) % P == 0:
            return None
        m = (3 * p[0] * p[0] + A) * pow(2 * p[1], -1, P) % P
    else:
        m = (q[1] - p[1]) * pow(q[0] - p[0], -1, P) % P
    x = (m * m - p[0] - q[0]) % P
    return x, (m * (p[0] - x) - p[1]) % P


def _mul(k, point=G):
    result = None
    while k:
        if k & 1:
            result = _add(result, point)
        point = _add(point, point)
        k >>= 1
    return result


def _nonce(d, digest):
    """RFC 6979: the same message and key always give the same nonce, so a weak random number can never leak the key."""
    x, h = d.to_bytes(32, "big"), (int.from_bytes(digest, "big") % N).to_bytes(32, "big")
    v, k = b"\x01" * 32, b"\x00" * 32
    k = hmac.new(k, v + b"\x00" + x + h, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    k = hmac.new(k, v + b"\x01" + x + h, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    while True:
        v = hmac.new(k, v, hashlib.sha256).digest()
        candidate = int.from_bytes(v, "big")
        if 1 <= candidate < N:
            return candidate
        k = hmac.new(k, v + b"\x00", hashlib.sha256).digest()
        v = hmac.new(k, v, hashlib.sha256).digest()


def sign(d, message):
    """ES256: r and s, 32 bytes each."""
    digest = hashlib.sha256(message).digest()
    z = int.from_bytes(digest, "big") % N
    while True:
        k = _nonce(d, digest)
        r = _mul(k)[0] % N
        s = pow(k, -1, N) * (z + r * d) % N
        if r and s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def public_key(private_b64):
    """The public key as the browser wants it (applicationServerKey): 65 bytes, base64url."""
    x, y = _mul(int.from_bytes(unb64url(private_b64), "big"))
    return b64url(b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big"))


def new_private_key():
    return b64url((secrets.randbelow(N - 1) + 1).to_bytes(32, "big"))


def vapid_token(private_b64, audience, subject, now=None):
    head = b64url(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    body = b64url(json.dumps({"aud": audience, "exp": int(now or time.time()) + 12 * 3600, "sub": subject}, separators=(",", ":")).encode())
    signed = f"{head}.{body}"
    return f"{signed}.{b64url(sign(int.from_bytes(unb64url(private_b64), 'big'), signed.encode()))}"


def allowed_endpoint(url):
    """Only https addresses of the browsers' own push services."""
    if not isinstance(url, str) or len(url) > 1000:
        return False
    u = urlparse(url)
    host = (u.hostname or "").lower()
    return u.scheme == "https" and not u.username and u.port in (None, 443) and (host in PUSH_HOSTS or host.endswith(PUSH_SUFFIXES))


def send(endpoint, private_b64, subject, ttl=7 * 86400):
    """Sends one push without a payload. Answers "ok", "gone" (the subscription no longer exists) or "retry"."""
    if not allowed_endpoint(endpoint):
        return "gone"
    u = urlparse(endpoint)
    token = vapid_token(private_b64, f"{u.scheme}://{u.hostname}", subject)
    req = urllib.request.Request(endpoint, data=b"", method="POST", headers={
        "Authorization": f"vapid t={token}, k={public_key(private_b64)}", "TTL": str(ttl), "Urgency": "normal"})
    try:
        with urllib.request.urlopen(req, timeout=20):
            return "ok"
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return "gone"
        print(f"push: {u.hostname} answered {e.code}", flush=True)
    except OSError as e:
        print(f"push: {u.hostname} could not be reached: {e}", flush=True)
    return "retry"
