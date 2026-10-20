#!/usr/bin/env python3
"""
Funky Orbit sync: fetches the "Done" and "Progress" tabs from the Google Sheet
and writes a single data.json for the website. Runs every hour by default.

Standard library only, no pip needed.

Settings via environment variables (see docker-compose.yml):
  SHEET_ID        ID of the Google Sheet
  DONE_GID        gid of the "Done" tab
  PROGRESS_GID    gid of the "Progress" tab
  COLORS_GID      gid of the "Kleuren" tab (club colour code per siteswap)
  FAMILIES_GID    gid of the "Families" tab (every pattern with its family, in Sheet order)
  SYNC_COLORS_GID gid of the "Kleuren sync" tab (colour code per sync pattern)
  DIFFICULTY_GID  gid of the "Moeilijkheid" tab (difficulty score and stars per pattern)
  OUT_FILE        output path (default /data/data.json)
  INTERVAL        seconds between two syncs (default 3600); 0 = run once
  DONE_CSV / PROGRESS_CSV / COLORS_CSV / FAMILIES_CSV / SYNC_COLORS_CSV / DIFFICULTY_CSV   optional: local CSV files instead of Google (for testing)
"""

import csv
import io
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

SHEET_ID = os.environ.get("SHEET_ID", "1Qh2r1bgPZL8WfaWprVyHBpKyWuStGIyXX4Bdi4UFS1A")
DONE_GID = os.environ.get("DONE_GID", "2105998367")
PROGRESS_GID = os.environ.get("PROGRESS_GID", "537922909")
COLORS_GID = os.environ.get("COLORS_GID", "7701")
FAMILIES_GID = os.environ.get("FAMILIES_GID", "777000111")
SYNC_COLORS_GID = os.environ.get("SYNC_COLORS_GID", "7703")
DIFFICULTY_GID = os.environ.get("DIFFICULTY_GID", "7710")
OUT_FILE = os.environ.get("OUT_FILE", "/data/data.json")
INTERVAL = int(os.environ.get("INTERVAL", "3600"))

EXPORT_URL = "https://docs.google.com/spreadsheets/d/{sheet}/export?format=csv&gid={gid}"


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- fetching

def fetch_csv(gid, local_file=None):
    if local_file:
        with open(local_file, encoding="utf-8") as f:
            return list(csv.reader(f))
    url = EXPORT_URL.format(sheet=SHEET_ID, gid=gid)
    req = urllib.request.Request(url, headers={"User-Agent": "funkyorbit-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8")
    if text.lstrip().lower().startswith("<!doctype html") or "<html" in text[:200].lower():
        raise RuntimeError(
            "Google returned an HTML page instead of CSV. "
            "Is the Sheet shared as 'Anyone with the link can view'?"
        )
    return list(csv.reader(io.StringIO(text)))


# ---------------------------------------------------------------- helpers

def cell(row, i):
    return row[i].strip() if i is not None and i < len(row) else ""


def to_number(s):
    s = (s or "").strip().replace(",", ".").rstrip("%")
    try:
        return float(s)
    except ValueError:
        return None


YT_PATTERNS = [
    re.compile(r"youtube\.com/shorts/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})"),
    re.compile(r"youtu\.be/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/embed/([A-Za-z0-9_-]{11})"),
    re.compile(r"youtube\.com/live/([A-Za-z0-9_-]{11})"),
]


def youtube_id(url):
    for p in YT_PATTERNS:
        m = p.search(url or "")
        if m:
            return m.group(1)
    return None


FILE_TS = re.compile(r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})")


def parse_datetime(date_str, file_name):
    """Date from the 'date' column (dd/mm/yyyy), time from the DJI file name."""
    date_iso, time_str = None, None
    m = FILE_TS.search(file_name or "")
    if m:
        y, mo, d, h, mi, s = m.groups()
        date_iso = f"{y}-{mo}-{d}"
        time_str = f"{h}:{mi}"
    dm = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", date_str or "")
    if dm:
        d, mo, y = dm.groups()
        date_iso = f"{y}-{int(mo):02d}-{int(d):02d}"  # the 'date' column takes precedence
    return date_iso, time_str


# ---------------------------------------------------------------- parsing the tabs

def parse_done(rows):
    if not rows:
        return []
    header = [h.strip().lower() for h in rows[0]]

    def col(*names):
        for n in names:
            for i, h in enumerate(header):
                if h.startswith(n):
                    return i
        return None

    c_nr = col("nr")
    c_date = col("date", "datum")
    c_pat = col("pattern", "siteswap")
    c_name = col("known name", "name", "naam")
    c_fam = col("family", "familie")
    c_rating = col("rating")
    c_yt = col("youtube", "video")
    c_file = col("file name", "file", "bestand")

    # Column names are matched by prefix; Dutch names are accepted as well.
    patterns = []
    for row in rows[1:]:
        siteswap = cell(row, c_pat)
        if not siteswap:
            continue
        file_name = cell(row, c_file)
        date_iso, time_str = parse_datetime(cell(row, c_date), file_name)
        rating = to_number(cell(row, c_rating))
        yt_url = cell(row, c_yt)
        patterns.append({
            "nr": cell(row, c_nr),
            "key": pattern_key(siteswap),
            "siteswap": siteswap,
            "name": cell(row, c_name),
            "family": cell(row, c_fam),
            "date": date_iso,
            "time": time_str,
            "rating": rating,
            "youtubeId": youtube_id(yt_url),
            "isShort": "/shorts/" in yt_url,
        })
    # newest first
    patterns.sort(key=lambda p: ((p["date"] or ""), (p["time"] or ""), int(p["nr"]) if p["nr"].isdigit() else 0), reverse=True)
    return patterns


def parse_progress(rows):
    """A group starts at a row with 'Total' and 'Done' in columns B and C.
    Every following row with a name and a number is a category."""
    groups, current = [], None
    for row in rows:
        a, b, c = cell(row, 0), cell(row, 1), cell(row, 2)
        if b.lower() == "total" and c.lower() == "done":
            current = {"name": a, "categories": []}
            groups.append(current)
            continue
        if current is None or not a:
            continue
        total, done = to_number(b), to_number(c)
        if total is None:
            continue
        current["categories"].append({"name": a, "total": int(total), "done": int(done or 0)})
    for g in groups:
        g["total"] = sum(c["total"] for c in g["categories"])
        g["done"] = sum(c["done"] for c in g["categories"])
    return [g for g in groups if g["categories"]]


def rotations(seq):
    return [(i, seq[i:] + seq[:i]) for i in range(len(seq))] or [(0, seq)]


def color_for(colors, ss):
    """Colour code for a siteswap, also when the Kleuren tab writes it in another rotation."""
    ss = ss.lower()
    if ss in colors:
        return colors[ss]
    for written, code in colors.get(("rot", min_rotation(ss)), []):
        for i, rot in rotations(written):
            if rot == ss:
                return code[i:] + code[:i]
    return None


def parse_colors(rows):
    """Siteswap -> club colour code (W/B/O/R, one letter per throw) from the "Kleuren" tab."""
    if not rows:
        return {}
    header = [h.strip().lower() for h in rows[0]]
    try:
        c_ss, c_code = header.index("siteswap"), header.index("kleurcode")
    except ValueError:
        return {}
    colors = {}
    for row in rows[1:]:
        ss, code = cell(row, c_ss).lower(), cell(row, c_code).upper()
        if ss and len(code) == len(ss) and set(code) <= set("WBOR"):
            colors[ss] = code
            colors.setdefault(("rot", min_rotation(ss)), []).append((ss, code))
    return colors


def header_index(row, *names):
    header = [h.strip().lower() for h in row]
    for n in names:
        for i, h in enumerate(header):
            if h.startswith(n):
                return i
    return None


def min_rotation(ss):
    """Canonical form of a vanilla siteswap: its smallest rotation (as the Sheet's match keys)."""
    ss = ss.lower()
    return min(ss[i:] + ss[:i] for i in range(len(ss))) if ss else ss


SYNC_THROW = re.compile(r"[0-9a-oq-z]p?")


def sync_key(a, b):
    return f"{a.strip().lower()} {b.strip().lower()}"


def sync_variants(a, b):
    """Every way to write the same sync pattern: rotate both jugglers together, or swap them.
    Yields (a, b, offset, swapped)."""
    ta, tb = SYNC_THROW.findall(a.lower()), SYNC_THROW.findall(b.lower())
    if len(ta) != len(tb):
        yield "".join(ta), "".join(tb), 0, False
        return
    for swapped, (x, y) in ((False, (ta, tb)), (True, (tb, ta))):
        for i in range(len(x)):
            yield "".join(x[i:] + x[:i]), "".join(y[i:] + y[:i]), i, swapped


def sync_canon(a, b):
    return min(sync_key(x, y) for x, y, _, _ in sync_variants(a, b))


def sync_lookup(table, a, b):
    """Entry for a sync pattern in a table keyed by sync_canon, with its colours turned to match."""
    entry = table.get(sync_canon(a, b))
    if not entry:
        return None
    want = sync_key(a, b)
    for x, y, i, swapped in sync_variants(entry["a"], entry["b"]):
        if sync_key(x, y) == want:
            out = dict(entry)
            if entry.get("colors"):
                ca, cb = entry["colors"][::-1] if swapped else entry["colors"]
                out["colors"] = [ca[i:] + ca[:i], cb[i:] + cb[:i]]
            return out
    return entry


def parse_sync_colors(rows):
    """'Kleuren sync': juggler A, juggler B and a code like 'BOB OOO' (one letter per throw)."""
    out = {}
    if not rows:
        return out
    h = rows[0]
    c_type, c_a, c_b, c_code = (header_index(h, n) for n in ("type", "jongleur a", "jongleur b", "kleurcode"))
    for row in rows[1:]:
        a, b, code = cell(row, c_a), cell(row, c_b), cell(row, c_code).upper()
        if not (a and b):
            continue
        parts = code.split()
        ok = (len(parts) == 2 and len(parts[0]) == len(SYNC_THROW.findall(a.lower()))
              and len(parts[1]) == len(SYNC_THROW.findall(b.lower())))
        out[sync_canon(a, b)] = {"a": a, "b": b, "type": cell(row, c_type),
                                 "colors": [parts[0], parts[1]] if ok else None}
    return out


def parse_difficulty(rows):
    """'Moeilijkheid': score and stars, keyed by min rotation (siteswaps) or 'a b' (sync)."""
    out = {}
    if not rows:
        return out
    h = rows[0]
    c_pat, c_score, c_stars = (header_index(h, n) for n in ("patroon", "score", "sterren"))
    for row in rows[1:]:
        pat = cell(row, c_pat)
        score, stars = to_number(cell(row, c_score)), to_number(cell(row, c_stars))
        if not pat or score is None:
            continue
        if "|" in pat:
            a, b = pat.split("|", 1)
            key = sync_canon(a, b)
        else:
            key = min_rotation(pat)
        out[key] = {"score": score, "stars": stars}
    return out


def pattern_key(pat):
    """Unique key as in the Families tab: smallest rotation; sync over rotations and both jugglers."""
    pat = pat.strip()
    if "(" in pat:
        return pat.lower()
    if "|" in pat or " " in pat:
        a, b = re.split(r"\s*\|\s*|\s+", pat, maxsplit=1)
        return sync_canon(a, b)
    return min_rotation(pat)


def parse_done_keys(rows, patterns):
    """Keys of everything in 'Done': computed from the patterns, plus the Sheet's 'Match keys (auto)' helper column."""
    keys = {p["key"] for p in patterns}
    if rows:
        c = header_index(rows[0], "match key")
        keys |= {cell(r, c).lower() for r in rows[1:] if cell(r, c)}
    return keys


def popcorn_count(notation):
    """'(6x,a)(6,6)*' -> 4 count: two beats per bracket."""
    return 2 * notation.count("(")


def parse_all_patterns(fam_rows, colors, sync_colors, difficulty, done_keys):
    """Every pattern from the Families tab (columns E:I), in Sheet order.
    Patterns in two families appear twice, like in the Sheet."""
    if not fam_rows:
        return []
    h = fam_rows[0]
    c_pat, c_fam, c_key = (header_index(h, n) for n in ("pattern (auto)", "family (auto)", "unique key"))
    c_named, c_name = header_index(h, "named siteswap"), header_index(h, "name")
    if c_named is not None and c_name == c_named:
        c_name = c_named + 1
    names = {}
    for row in fam_rows[1:]:
        ss, name = cell(row, c_named), cell(row, c_name)
        if ss and name and "(" not in ss:
            names.setdefault(min_rotation(ss), []).append(name)
    popcorns = [v for v in sync_colors.values() if v["type"].lower().startswith("popcorn")]

    out = []
    for row in fam_rows[1:]:
        pat, fam, key = cell(row, c_pat), cell(row, c_fam), cell(row, c_key).lower()
        if not pat or not fam:
            continue
        fl = fam.lower()
        kind = "Sync" if "sync" in fl else "Zaps" if "zaps" in fl else "Standard"
        item = {"family": fam, "kind": kind, "key": key, "done": key in done_keys}
        if "(" in pat:
            # sync popcorn in (x,y) notation: shown as juggler A | B from 'Kleuren sync'
            n = popcorn_count(pat)
            cands = [v for v in popcorns if len(SYNC_THROW.findall(v["a"].lower())) == n]
            if len(cands) > 1:
                cands = [v for v in cands if ("a" in pat.lower()) == ("5" in v["a"] + v["b"])] or cands
            sc = cands[0] if cands else None
            item.update(alt=pat)
            if sc:
                item.update(a=sc["a"], b=sc["b"], colors=sc["colors"])
                item.update(difficulty.get(sync_canon(sc["a"], sc["b"]), {}))
            else:
                item.update(a=pat, b="", colors=None)
        elif " " in pat:
            a, b = pat.split(None, 1)
            sc = sync_lookup(sync_colors, a, b) or {}
            item.update(a=a, b=b, colors=sc.get("colors"))
            item.update(difficulty.get(sync_canon(a, b), {}))
        else:
            mr = min_rotation(pat)
            item.update(ss=pat, period=len(pat), colors=color_for(colors, pat),
                        name="; ".join(names.get(mr, [])) or None)
            item.update(difficulty.get(mr, {}))
        out.append(item)
    return out


def parse_summary(rows):
    """Period 3 / 5 / 7 and Sync from the 'Statistics' block (columns G:I of Progress)."""
    summary = []
    for row in rows:
        key = cell(row, 6)
        if re.fullmatch(r"Period \d+|Sync", key):
            total, done = to_number(cell(row, 7)), to_number(cell(row, 8))
            if total:
                summary.append({"name": key, "total": int(total), "done": int(done or 0)})
    return summary


def parse_stat_blocks(rows):
    """The whole 'Statistics' area of Progress (columns G onwards) as blocks.
    A block starts with a header row (title + column names) and ends at an empty row,
    so stats added to the Sheet later show up on the site by themselves."""
    blocks, current = [], None
    for row in rows:
        vals = [cell(row, i) for i in range(6, max(len(row), 7))]
        while vals and not vals[-1]:
            vals.pop()
        if not vals or not vals[0]:
            current = None
            continue
        if current is None:
            current = {"title": vals[0], "columns": vals[1:], "rows": []}
            blocks.append(current)
        else:
            current["rows"].append(vals)
    return [b for b in blocks if b["rows"]]


def parse_sheet_stats(rows):
    """The 'Statistics' block in columns G:H of Progress, as name -> value."""
    stats = {}
    for row in rows:
        key, val = cell(row, 6), cell(row, 7)
        if key and val:
            stats[key] = val
    return stats


def build(done_rows, progress_rows, color_rows=None, fam_rows=None, sync_color_rows=None, difficulty_rows=None):
    patterns = parse_done(done_rows)
    colors = parse_colors(color_rows)
    for p in patterns:
        p["colors"] = color_for(colors, p["siteswap"])
    groups = parse_progress(progress_rows)
    sheet_stats = parse_sheet_stats(progress_rows)
    overview = parse_all_patterns(fam_rows, colors, parse_sync_colors(sync_color_rows),
                                      parse_difficulty(difficulty_rows), parse_done_keys(done_rows, patterns))
    rated = [p["rating"] for p in patterns if p["rating"] is not None]
    days = sorted({p["date"] for p in patterns if p["date"]})
    # The 'All patterns' total takes precedence: some patterns count in more
    # than one category, so the sum of the categories is slightly higher.
    all_patterns = to_number(sheet_stats.get("All patterns", ""))
    return {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": int(all_patterns) if all_patterns else sum(g["total"] for g in groups),
        "done": len({p["siteswap"] for p in patterns}),
        "summary": parse_summary(progress_rows),
        "statBlocks": parse_stat_blocks(progress_rows),
        "all": overview,
        "groups": groups,
        "patterns": patterns,
        "stats": {
            "patternsThrown": len(patterns),
            "uniquePatterns": len({p["siteswap"] for p in patterns}),
            "videos": sum(1 for p in patterns if p["youtubeId"]),
            "recordingDays": len(days),
            "firstDate": days[0] if days else None,
            "lastDate": days[-1] if days else None,
            "averageRating": round(sum(rated) / len(rated), 1) if rated else None,
        },
    }


def write_atomic(data, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def sync_once():
    done_rows = fetch_csv(DONE_GID, os.environ.get("DONE_CSV"))
    progress_rows = fetch_csv(PROGRESS_GID, os.environ.get("PROGRESS_CSV"))
    optional = {}
    # the other tabs are optional: without them the site falls back to plain boxes / no overview
    for name, gid in (("COLORS", COLORS_GID), ("FAMILIES", FAMILIES_GID),
                      ("SYNC_COLORS", SYNC_COLORS_GID), ("DIFFICULTY", DIFFICULTY_GID)):
        try:
            optional[name] = fetch_csv(gid, os.environ.get(f"{name}_CSV"))
        except Exception as e:
            log(f"WARNING: could not read {name.lower()} tab: {e}")
            optional[name] = None
    data = build(done_rows, progress_rows, optional["COLORS"], optional["FAMILIES"],
                 optional["SYNC_COLORS"], optional["DIFFICULTY"])
    if not data["groups"]:
        raise RuntimeError("No categories found in the Progress tab; keeping the old data.")
    write_atomic(data, OUT_FILE)
    log(f"OK: {data['done']}/{data['total']} patterns, {data['stats']['videos']} videos, "
        f"{len(data['all'])} in overview -> {OUT_FILE}")


def main():
    while True:
        try:
            sync_once()
        except Exception as e:  # the old data.json stays in place
            log(f"ERROR: {e}")
            if INTERVAL == 0:
                sys.exit(1)
        if INTERVAL == 0:
            break
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
