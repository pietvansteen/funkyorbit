#!/usr/bin/env python3
"""
Make the key for push notifications (Wish Tricks), once:

  python3 tools/make_vapid.py

Put the line it prints in .env on the server (never in git). The public key is worked out from it, and the browser gets
it from /api/wishes/counts. A new key means that every existing push subscription stops working, so keep this one.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "likes"))
import webpush  # noqa: E402

print(f"VAPID_PRIVATE_KEY={webpush.new_private_key()}")
