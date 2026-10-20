#!/usr/bin/env python3
"""
Put the newest version from site/changelog.json everywhere it is used:
  - the footer link on every page:  vX.Y.Z · What's new
  - the cache-busting ?v= on css/js/svg links
  - the cache name of the generator's service worker

Run after adding a new version at the top of site/changelog.json:
  python3 tools/release.py
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

FOOTER = re.compile(r'<a class="version" href="/changes/">[^<]*</a>')
ASSET_V = re.compile(r"\?v=(?:\d{8}[a-z]|\d+\.\d+\.\d+)")  # old date codes or a version; icons keep their own ?v=
SW_CACHE = re.compile(r'"fo-gen-[0-9a-z.]+"')


def main():
    changelog = json.loads((SITE / "changelog.json").read_text(encoding="utf-8"))
    version = changelog[0]["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit(f"Not a MAJOR.MINOR.PATCH version: {version}")

    changed = []
    for path in sorted(SITE.rglob("*.html")) + [SITE / "gen" / "sw.js"]:
        text = path.read_text(encoding="utf-8")
        new = FOOTER.sub(f'<a class="version" href="/changes/">v{version} · What\'s new</a>', text)
        new = ASSET_V.sub(f"?v={version}", new)
        new = SW_CACHE.sub(f'"fo-gen-{version}"', new)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    print(f"v{version}: updated {len(changed)} file(s)")
    for c in changed:
        print("  " + c)


if __name__ == "__main__":
    main()
