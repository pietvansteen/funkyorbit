# Funky Orbit — funkyorbit.nl

Follow our progress through 913 club passing patterns, with a video of every pattern we land. Progress and videos come straight from our practice spreadsheet (Google Sheets) and are refreshed once a day, and right away when we log a new pattern.

## How it works

```
Google Sheet ──(daily, or at once)──> sync ──> data/data.json ──┐
     ^                                                         ├──> web (nginx) ──> funkyorbit.nl
     └── Apps Script <── /add/ <── likes API ──> data/*.db ─────┘
```

| Folder | What |
|---|---|
| `site/` | The website: `index.html` + `app.js` (progress and videos), `patterns/` (all patterns), `stats/` (funny stats), `gen/` (pattern generator, installable as an app and usable offline), `changes/` (release notes), `shared.js`, `style.css`, icons |
| `sync/sync.py` | Fetches the Sheet tabs as CSV and writes `data/data.json` |
| `likes/likes.py` | Small API: likes (one per visitor per video, via a cookie) and feature requests, both in SQLite, and logging a pattern we juggled (via the Apps Script) |
| `apps-script/FunkyOrbit.gs` | Apps Script bound to the Sheet: writes a logged pattern as a new row in *Done* |
| `web/nginx.conf` | Serves the site and `data.json`, and forwards `/api/` to the likes API |
| `tools/release.py` | Puts the newest version from `site/changelog.json` in the footer, the asset links and the service worker |
| `docker-compose.yml` | Runs everything with Docker Compose, plus a Cloudflare Tunnel |

No pip packages needed: everything runs on standard Python.

## What is read from the Sheet

- **Done**: one row per pattern thrown. Columns are matched by name: `date`, `pattern` (siteswap), `known name`, `family`, `rating`, `youtube`, `file name`. The time comes from the camera file name. Rows with a YouTube link appear in the video feed.
- **Progress**: the categories and their totals. The *Statistics* block provides the overall total and the Period 3 / 5 / 7 and Sync tiles, and the figures on the Funny stats page.
- **Kleuren** / **Kleuren sync**: the club colour per throw (`W`/`B`/`O`/`R` = white, blue, orange, pink), used to colour the digits. Written in another rotation is fine.
- **Families**: every pattern with its family, in Sheet order (columns *Pattern / Family / Unique key (auto)*), plus the known names. This feeds the *All patterns* page; a pattern counts as done when its unique key is among the *Match keys* in *Done*.
- **Moeilijkheid**: difficulty score and stars per pattern, used by the generator's difficulty filter and the pattern pop-up.

The Sheet must be shared as *Anyone with the link can view*.

## Running it

```sh
git clone https://github.com/pietvansteen/funkyorbit.git
cd funkyorbit
echo "TUNNEL_TOKEN=<cloudflare-tunnel-token>" > .env
echo "ADMIN_TOKEN=<password for /requests/ and /add/>" >> .env
echo "SHEET_WRITE_URL=<Apps Script web app /exec URL>" >> .env
echo "SHEET_WRITE_SECRET=<the SECRET script property>" >> .env
docker compose up -d
```

The site is then available on port 8088. In the Cloudflare Tunnel, point the public hostname to `http://web:80`. After `git pull`, changes in `site/` are live right away; restart the containers after changes to `sync.py` or `likes.py`.

## Feature requests

Visitors send ideas via **Request a feature** in the footer (`/request/`): name, email and request. They are stored on the server in `data/requests.db`, never on the public site. Spam is kept out with a hidden honeypot field, a limit of 3 requests per visitor per hour and maximum field lengths.

Reading them: the hidden page `/requests/` (not in the menu, `noindex`, disallowed in `robots.txt`) asks for the password set as `ADMIN_TOKEN` in `.env`. There you can give each request a status (new, planned, done, no) and download all of them as CSV. A device that is logged in also shows the number of new requests in the footer.

## Logging a pattern (Add page)

The hidden page `/add/` (not in the menu for visitors, `noindex`, disallowed in `robots.txt`) asks for the same password as `/requests/`, once per device. After that the menu shows **Add**. Type the siteswap (suggestions appear while typing, in any rotation, sync too), pick the date (today by default) and a rating in half stars (how much fun it is), and save.

The likes API checks the password and passes the pattern to the Apps Script, which writes date, pattern and rating in the first empty row of *Done* (`nr` is filled in already; `known name` and `family` are formulas). Then the sync runs at once, so the site has the new pattern within seconds. Otherwise the sync runs once a day.

Setting up the Apps Script (once):

1. In the Sheet: *Extensions > Apps Script*, add a script file `FunkyOrbit` (*+ > Script*) and paste `apps-script/FunkyOrbit.gs` in it. Existing files such as `Code.gs` stay; the project must have no other `doPost`.
2. *Project Settings > Script properties*: add `SECRET` with a long random value.
3. *Deploy > New deployment*, type *Web app*, execute as *Me*, access *Anyone*. Allow the access it asks for and copy the `/exec` URL.
4. Put `SHEET_WRITE_URL` (the URL) and `SHEET_WRITE_SECRET` (the same secret) in `.env` and run `docker compose up -d`.

After saving, a pop-up shows a random GIF from `site/gifs/` (never the same one twice in a row). To add one, put the file (`.gif`, `.webp`, `.png`, `.jpg`, `.mp4` or `.webm`) in `site/gifs/` and run `python3 tools/release.py`, which lists it in `site/gifs/gifs.json`. The four `funky-*.gif` files are our own, made with `python3 tools/make_gifs.py`; the `.mp4` files are well-known reaction GIFs from GIPHY (giphy.com), as MP4 because that is far smaller.

After a change to `FunkyOrbit.gs`: *Deploy > Manage deployments*, edit, *New version*; the URL stays the same.

## Versions and release notes

The footer of every page shows the live version with a link to **What's new** (`/changes/`). The only source is `site/changelog.json`: newest version first, each with a date and a short list of changes in English.

Numbering is `MAJOR.MINOR.PATCH`:

- **MAJOR**: a milestone, a big set of new pages or features that changes the site substantially. Everything before the complete site (overview, stats and generator) was 0.x; the complete site is 1.0.0.
- **MINOR**: new features or visible changes, bundled per work session (commits without a long pause in between).
- **PATCH**: bug fixes and small text or style corrections.
- Work that is not about the website (such as the Premiere template) does not go in the release notes.

**One version per release.** A release is what goes live together: everything changed during a work session, until the next `git pull` on the server. Changes made while the current version is not live yet are added to that version's list in the changelog; once it is live (the footer on funkyorbit.nl shows it), the next change starts a new version.

For every change to the site:

1. In `site/changelog.json`: add a line to the newest version if that version is not live yet, otherwise add a new version at the top. The date of a version is the day it goes live; update it when the release goes out on a later day.
2. Run `python3 tools/release.py`. It puts the version in the footer of every page, and `?v=<version>-<code>` on the css/js/svg links and in the cache name of the generator's service worker. The code is a short hash of those files, so browsers and Cloudflare fetch the new files after every change, also when the version number stays the same.
3. Commit and push, then `git pull` on the server.

## Testing locally without Google

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv COLORS_CSV=testdata/colors.csv \
  FAMILIES_CSV=testdata/families.csv SYNC_COLORS_CSV=testdata/sync_colors.csv DIFFICULTY_CSV=testdata/difficulty.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```
