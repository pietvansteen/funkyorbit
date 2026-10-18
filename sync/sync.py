#!/usr/bin/env python3
"""
Funky Orbit sync: haalt de tabbladen "Done" en "Progress" uit de Google Sheet
en schrijft één data.json voor de website. Draait standaard elk uur.

Alleen standaard-bibliotheek, geen pip nodig.

Instellingen via environment variables (zie docker-compose.yml):
  SHEET_ID        ID van de Google Sheet
  DONE_GID        gid van het tabblad "Done"
  PROGRESS_GID    gid van het tabblad "Progress"
  OUT_FILE        pad van de uitvoer (standaard /data/data.json)
  INTERVAL        seconden tussen twee syncs (standaard 3600); 0 = één keer
  DONE_CSV / PROGRESS_CSV   optioneel: lokale CSV-bestanden i.p.v. Google (om te testen)
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
OUT_FILE = os.environ.get("OUT_FILE", "/data/data.json")
INTERVAL = int(os.environ.get("INTERVAL", "3600"))

EXPORT_URL = "https://docs.google.com/spreadsheets/d/{sheet}/export?format=csv&gid={gid}"


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- ophalen

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
            "Google gaf een HTML-pagina terug in plaats van CSV. "
            "Staat de Sheet op 'Iedereen met de link mag bekijken'?"
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
    """Datum uit kolom 'date' (dd/mm/jjjj), tijd uit de DJI-bestandsnaam."""
    date_iso, time_str = None, None
    m = FILE_TS.search(file_name or "")
    if m:
        y, mo, d, h, mi, s = m.groups()
        date_iso = f"{y}-{mo}-{d}"
        time_str = f"{h}:{mi}"
    dm = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", date_str or "")
    if dm:
        d, mo, y = dm.groups()
        date_iso = f"{y}-{int(mo):02d}-{int(d):02d}"  # kolom 'date' is leidend
    return date_iso, time_str


# ---------------------------------------------------------------- tabbladen verwerken

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
            "siteswap": siteswap,
            "name": cell(row, c_name),
            "family": cell(row, c_fam),
            "date": date_iso,
            "time": time_str,
            "rating": rating,
            "youtubeId": youtube_id(yt_url),
            "isShort": "/shorts/" in yt_url,
        })
    # nieuwste eerst
    patterns.sort(key=lambda p: ((p["date"] or ""), (p["time"] or ""), int(p["nr"]) if p["nr"].isdigit() else 0), reverse=True)
    return patterns


def parse_progress(rows):
    """Een groep begint bij een rij met 'Total' en 'Done' in kolom B en C.
    Daarna volgt elke rij met een naam en een getal een categorie."""
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


def parse_sheet_stats(rows):
    """Het blok 'Statistics' in kolom G:H van Progress, als naam -> waarde."""
    stats = {}
    for row in rows:
        key, val = cell(row, 6), cell(row, 7)
        if key and val:
            stats[key] = val
    return stats


def build(done_rows, progress_rows):
    patterns = parse_done(done_rows)
    groups = parse_progress(progress_rows)
    sheet_stats = parse_sheet_stats(progress_rows)
    rated = [p["rating"] for p in patterns if p["rating"] is not None]
    days = sorted({p["date"] for p in patterns if p["date"]})
    # Het totaal uit 'All patterns' is leidend: sommige patronen tellen in
    # meerdere categorieën mee, dus de som van de categorieën is iets hoger.
    all_patterns = to_number(sheet_stats.get("All patterns", ""))
    return {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": int(all_patterns) if all_patterns else sum(g["total"] for g in groups),
        "done": len({p["siteswap"] for p in patterns}),
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
    data = build(done_rows, progress_rows)
    if not data["groups"]:
        raise RuntimeError("Geen categorieën gevonden in het tabblad Progress; oude data blijft staan.")
    write_atomic(data, OUT_FILE)
    log(f"OK: {data['done']}/{data['total']} patronen, {data['stats']['videos']} video's -> {OUT_FILE}")


def main():
    while True:
        try:
            sync_once()
        except Exception as e:  # oude data.json blijft gewoon staan
            log(f"FOUT: {e}")
            if INTERVAL == 0:
                sys.exit(1)
        if INTERVAL == 0:
            break
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
