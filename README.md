# Funky Orbit — funkyorbit.nl

Follow our progress through 911 club passing patterns, with a video of every pattern we land. Progress and videos come straight from our practice spreadsheet (Google Sheets) and are refreshed every hour.

## How it works

```
Google Sheet ──(hourly)──> sync ──> data/data.json ──┐
                                                    ├──> web (nginx) ──> funkyorbit.nl
visitors ──like──> likes API ──> data/likes.db ─────┘
```

| Folder | What |
|---|---|
| `site/` | The website: `index.html`, `style.css`, `app.js`, `favicon.svg` |
| `sync/sync.py` | Fetches the *Done*, *Progress* and *Kleuren* tabs as CSV and writes `data/data.json` |
| `likes/likes.py` | Small API that stores likes in SQLite (one like per visitor per video, via a cookie) |
| `web/nginx.conf` | Serves the site and `data.json`, and forwards `/api/` to the likes API |
| `docker-compose.yml` | Runs everything with Docker Compose, plus a Cloudflare Tunnel |

No pip packages needed: everything runs on standard Python.

## What is read from the Sheet

- **Done**: one row per pattern thrown. Columns are matched by name: `date`, `pattern` (siteswap), `known name`, `family`, `rating`, `youtube`, `file name`. The time comes from the camera file name. Rows with a YouTube link appear in the video feed.
- **Progress**: the categories and their totals. The *Statistics* block provides the overall total and the Period 3 / 5 / 7 and Sync tiles.
- **Kleuren**: the club colour per throw (`W`/`B`/`O`/`R` = white, blue, orange, pink), used to colour the siteswap digits.

The Sheet must be shared as *Anyone with the link can view*.

## Running it

```sh
git clone https://github.com/pietvansteen/funkyorbit.git
cd funkyorbit
echo "TUNNEL_TOKEN=<cloudflare-tunnel-token>" > .env
docker compose up -d
```

The site is then available on port 8088. In the Cloudflare Tunnel, point the public hostname to `http://web:80`. After `git pull`, changes in `site/` are live right away; restart the containers after changes to `sync.py` or `likes.py`.

## Testing locally without Google

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv COLORS_CSV=testdata/colors.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```
