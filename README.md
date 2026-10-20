# Funky Orbit — funkyorbit.nl

Follow our progress through 913 club passing patterns, with a video of every pattern we land. Progress and videos come straight from our practice spreadsheet (Google Sheets) and are refreshed every hour.

## How it works

```
Google Sheet ──(hourly)──> sync ──> data/data.json ──┐
                                                    ├──> web (nginx) ──> funkyorbit.nl
visitors ──like──> likes API ──> data/likes.db ─────┘
```

| Folder | What |
|---|---|
| `site/` | The website: `index.html` + `app.js` (progress and videos), `patterns/` (all patterns), `stats/` (funny stats), `gen/` (pattern generator, installable as an app and usable offline), `changes/` (release notes), `shared.js`, `style.css`, icons |
| `sync/sync.py` | Fetches the Sheet tabs as CSV and writes `data/data.json` |
| `likes/likes.py` | Small API that stores likes in SQLite (one like per visitor per video, via a cookie) |
| `web/nginx.conf` | Serves the site and `data.json`, and forwards `/api/` to the likes API |
| `tools/release.py` | Puts the newest version from `site/changelog.json` in the footer, the asset links and the service worker |
| `docker-compose.yml` | Runs everything with Docker Compose, plus a Cloudflare Tunnel |

No pip packages needed: everything runs on standard Python.

## What is read from the Sheet

- **Done**: one row per pattern thrown. Columns are matched by name: `date`, `pattern` (siteswap), `known name`, `family`, `rating`, `youtube`, `file name`. The time comes from the camera file name. Rows with a YouTube link appear in the video feed.
- **Progress**: the categories and their totals. The *Statistics* block provides the overall total and the Period 3 / 5 / 7 and Sync tiles, and the figures on the Funny stats page.
- **Kleuren** / **Kleuren sync**: the club colour per throw (`W`/`B`/`O`/`R` = white, blue, orange, pink), used to colour the digits. Written in another rotation is fine.
- **Families**: every pattern with its family, in Sheet order (columns *Pattern / Family / Unique key (auto)*), plus the known names. This feeds the *All patterns* page; a pattern counts as done when its unique key is among the *Match keys* in *Done*.
- **Moeilijkheid**: difficulty score, stars and estimated minutes per pattern, used by the generator's difficulty filter and the pattern pop-up.

The Sheet must be shared as *Anyone with the link can view*.

## Running it

```sh
git clone https://github.com/pietvansteen/funkyorbit.git
cd funkyorbit
echo "TUNNEL_TOKEN=<cloudflare-tunnel-token>" > .env
docker compose up -d
```

The site is then available on port 8088. In the Cloudflare Tunnel, point the public hostname to `http://web:80`. After `git pull`, changes in `site/` are live right away; restart the containers after changes to `sync.py` or `likes.py`.

## Versions and release notes

The footer of every page shows the live version with a link to **What's new** (`/changes/`). The only source is `site/changelog.json`: newest version first, each with a date and a short list of changes in English.

Numbering is `MAJOR.MINOR.PATCH`:

- **MAJOR**: a milestone, a big set of new pages or features that changes the site substantially. Everything before the complete site (overview, stats and generator) was 0.x; the complete site is 1.0.0.
- **MINOR**: new features or visible changes, bundled per work session (commits without a long pause in between).
- **PATCH**: bug fixes and small text or style corrections.
- Work that is not about the website (such as the Premiere template) does not go in the release notes.

**One version per release.** A release is what goes live together: everything changed during a work session, until the next `git pull` on the server. Changes made while the current version is not live yet are added to that version's list in the changelog; once it is live (the footer on funkyorbit.nl shows it), the next change starts a new version.

For every change to the site:

1. In `site/changelog.json`: add a line to the newest version if that version is not live yet, otherwise add a new version at the top.
2. Run `python3 tools/release.py`. It puts the version in the footer of every page, and `?v=<version>-<code>` on the css/js/svg links and in the cache name of the generator's service worker. The code is a short hash of those files, so browsers and Cloudflare fetch the new files after every change, also when the version number stays the same.
3. Commit and push, then `git pull` on the server.

## Testing locally without Google

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv COLORS_CSV=testdata/colors.csv \
  FAMILIES_CSV=testdata/families.csv SYNC_COLORS_CSV=testdata/sync_colors.csv DIFFICULTY_CSV=testdata/difficulty.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```
