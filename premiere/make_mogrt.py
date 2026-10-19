#!/usr/bin/env python3
"""Builds "Funky Orbit siteswap.mogrt" for Premiere Pro with the club colours from the Sheet.

Downloads the "Kleuren" and "Kleuren sync" tabs, fills them into siteswap_mogrt.jsx and runs that in
After Effects. Run it again whenever colours in the Sheet change:  python3 premiere/make_mogrt.py
"""
import csv
import io
import os
import re
import subprocess
import sys
import time
import urllib.request

SHEET = os.environ.get("SHEET_ID", "1Qh2r1bgPZL8WfaWprVyHBpKyWuStGIyXX4Bdi4UFS1A")
COLORS_GID = os.environ.get("COLORS_GID", "7701")
SYNC_COLORS_GID = os.environ.get("SYNC_COLORS_GID", "7703")
AE = os.environ.get("AE_APP", "Adobe After Effects 2026")
HERE = os.path.dirname(os.path.abspath(__file__))
THROW = re.compile(r"[0-9a-z]p?")


def tab(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}"
    with urllib.request.urlopen(url) as r:
        rows = list(csv.reader(io.StringIO(r.read().decode("utf-8"))))
    head = [h.strip().lower() for h in rows[0]]
    return [dict(zip(head, (c.strip() for c in row))) for row in rows[1:]]


def main():
    table, longest = [], 0
    for r in tab(COLORS_GID):
        ss, code = r.get("siteswap", "").lower(), r.get("kleurcode", "").upper()
        if ss and re.fullmatch(r"[WBOR]+", code) and len(code) == len(ss):
            table.append(f"{ss}:{code}")
            longest = max(longest, len(ss))

    sync = []
    for r in tab(SYNC_COLORS_GID):
        a, b = r.get("jongleur a", "").lower(), r.get("jongleur b", "").lower()
        code = r.get("kleurcode", "").upper().split()
        if not (a and b and len(code) == 2):
            continue
        ta, tb = THROW.findall(a), THROW.findall(b)
        if len(ta) == len(code[0]) and len(tb) == len(code[1]):
            sync.append(f"{a}/{b}:{code[0]}/{code[1]}")
            longest = max(longest, len(ta) + len(tb))

    out_dir = os.path.join(HERE, "build")
    os.makedirs(out_dir, exist_ok=True)
    mogrt = os.path.join(out_dir, "Funky Orbit siteswap.mogrt")
    aep = os.path.join(out_dir, "Funky Orbit siteswap.aep")
    log = aep[:-4] + ".log"
    for old in (log, mogrt):
        if os.path.isdir(old):
            import shutil; shutil.rmtree(old)
        elif os.path.exists(old):
            os.remove(old)

    with open(os.path.join(HERE, "siteswap_mogrt.jsx"), encoding="utf-8") as f:
        jsx = f.read()
    jsx = (jsx.replace("__TABLE__", ",".join(table)).replace("__SYNC__", ";".join(sync))
              .replace("__MAX__", str(max(longest, 12))).replace("__OUT_MOGRT__", out_dir).replace("__OUT_AEP__", aep))
    script = os.path.join(out_dir, "build.jsx")
    with open(script, "w", encoding="utf-8") as f:
        f.write(jsx)

    print(f"{len(table)} siteswaps, {len(sync)} sync patterns, {max(longest, 12)} boxes; building in {AE}…")
    subprocess.run(["osascript", "-e", f'with timeout of 600 seconds\ntell application "{AE}" to DoScriptFile "{script}"\nend timeout'], check=True)
    for _ in range(120):
        if os.path.exists(log):
            break
        time.sleep(1)
    else:
        sys.exit("After Effects did not finish (no log file).")
    print(open(log).read().strip())
    print(mogrt)


if __name__ == "__main__":
    main()
