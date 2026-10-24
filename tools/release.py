#!/usr/bin/env python3
"""
Put the newest version from site/changelog.json everywhere it is used:
  - the footer link on every page:  vX.Y.Z · What's new
  - the cache-busting ?v= on css/js/svg links:  X.Y.Z-<code>
  - the cache name of the service worker (site/sw.js)
  - site/gifs/gifs.json: every GIF (or image / short video) in site/gifs/, for the success pop-up

The <code> is a short hash of the site's files, so it changes with every change,
also while the version number stays the same during a work session.

Run after every change to the site (and after adding a version to the changelog):
  python3 tools/release.py
"""

import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

FOOTER = re.compile(r'<a class="version" href="/changes/">[^<]*</a>')
ASSET_V = re.compile(r"\?v=(?:\d{8}[a-z]|\d+\.\d+\.\d+(?:-[0-9a-f]+)?)")  # date codes or version(-code); icons keep their own ?v=
SW_CACHE = re.compile(r'"fo-site-[0-9a-z.\-]+"')
GIF_TYPES = (".gif", ".webp", ".png", ".jpg", ".jpeg", ".mp4", ".webm")
CODE_OF = ("*.css", "*.js", "*.svg", "*.png", "*.webmanifest", "changelog.json")  # the files that ?v= points at


def content_code():
    """Short hash of the files the pages link to (not the pages themselves, which hold the code)."""
    h = hashlib.sha256()
    files = sorted({f for pattern in CODE_OF for f in SITE.rglob(pattern)} - {SITE / "sw.js"})
    for f in files:
        h.update(str(f.relative_to(SITE)).encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:6]


def write_gifs():
    """site/gifs/gifs.json: the file names in site/gifs/, so a new GIF joins in by just putting it there."""
    folder = SITE / "gifs"
    names = sorted(f.name for f in folder.iterdir() if f.suffix.lower() in GIF_TYPES) if folder.is_dir() else []
    text = json.dumps(names, indent=1, ensure_ascii=False) + "\n"
    path = folder / "gifs.json"
    if names and (not path.exists() or path.read_text(encoding="utf-8") != text):
        path.write_text(text, encoding="utf-8")
        print(f"site/gifs/gifs.json: {len(names)} file(s)")


def main():
    write_gifs()
    changelog = json.loads((SITE / "changelog.json").read_text(encoding="utf-8"))
    version = changelog[0]["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit(f"Not a MAJOR.MINOR.PATCH version: {version}")

    build = f"{version}-{content_code()}"
    changed = []
    for path in sorted(SITE.rglob("*.html")) + [SITE / "sw.js"]:
        text = path.read_text(encoding="utf-8")
        new = FOOTER.sub(f'<a class="version" href="/changes/">v{version} · What\'s new</a>', text)
        new = ASSET_V.sub(f"?v={build}", new)
        new = SW_CACHE.sub(f'"fo-site-{build}"', new)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    print(f"v{version} (assets ?v={build}): updated {len(changed)} file(s)")
    for c in changed:
        print("  " + c)


if __name__ == "__main__":
    main()
