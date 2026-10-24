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
| `web/nginx.conf` | Serves the site and `data.json`, forwards `/api/` to the likes API and `/u/` (tracker only) to Umami |
| `tools/release.py` | Puts the newest version from `site/changelog.json` in the footer, the asset links and the service worker |
| `docker-compose.yml` | Runs everything with Docker Compose, plus Umami (visitor statistics) and a Cloudflare Tunnel |

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
echo "UMAMI_DB_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "UMAMI_APP_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

The site is then available on port 8088. In the Cloudflare Tunnel, point the public hostname to `http://web:80`. After `git pull`, changes in `site/` are live right away; restart the containers after changes to `sync.py` or `likes.py`.

## Visitor statistics (Umami)

[Umami](https://umami.is) runs next to the site (`umami` and `umami-db` in `docker-compose.yml`). It uses no cookies and stores no IP addresses, so no cookie banner is needed. Visitors load the tracker from `/u/script.js` on funkyorbit.nl itself and send to `/u/api/send`; nginx passes only those two to Umami, so the dashboard is not public.

Setting it up (once):

1. Put `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` in `.env` (see above) and run `docker compose up -d`.
2. Open the dashboard on `http://<host>:3088`, log in as `admin` / `umami` and change that password right away (*Settings > Profile*).
3. *Settings > Websites > Add website*: name *Funky Orbit*, domain `funkyorbit.nl`. Copy its *Website ID* into `UMAMI_ID` in `site/shared.js`, run `python3 tools/release.py`, commit and pull.

Optionally, to see the dashboard from anywhere: add a public hostname such as `stats.funkyorbit.nl` → `http://umami:3000` to the Cloudflare Tunnel.

Umami shows page views, visitors, bounce rate and visit duration per day, week or month, the most viewed pages, referrers (Google, Instagram, YouTube, forums), countries, devices and browsers, and page speed. Visits from the installed web app have the tag `app`. The site also sends these events (*Events* in the dashboard, with their properties):

| Event | Properties | When |
|---|---|---|
| `Play video` | `siteswap`, `video` | a video is started on the site |
| `Like` / `Unlike` | `video` | a heart is clicked |
| `Open pattern` | `siteswap`, `family`, `done` | a pattern pop-up opens on All patterns |
| `Search` | `query`, `page` | someone stops typing in a search box for 2 seconds |
| `Colour filter` | `colour` | a colour filter is switched on (All patterns) |
| `Date filter` | `range` | the date filter changes (home) |
| `Open group` | `group` | a progress tile opens (home) |
| `Draw pattern` | `period`, `stars`, `hide`, `found` | the generator draws a pattern |
| `Send request` | | a feature request is sent |
| `Outbound link` | `to` | the YouTube channel or James Francis' list is opened |
| `Install app` | | the site is installed as an app (not every browser reports this) |

Our own devices (with the admin password saved) are not counted, and neither are the preview and localhost. Searching changes the address with every letter; that is not counted as a new page view.

To see visitors from Instagram even when the app hides the referrer, link to `https://funkyorbit.nl/?utm_source=instagram` in the bio (likewise `utm_source=youtube` in video descriptions); Umami shows these under *UTM*.

## Feature requests

Visitors send ideas via **Request a feature** in the footer (`/request/`): name, email and request. They are stored on the server in `data/requests.db`, never on the public site. Spam is kept out with a hidden honeypot field, a limit of 3 requests per visitor per hour and maximum field lengths.

Reading them: the hidden page `/requests/` (not in the menu, `noindex`, disallowed in `robots.txt`) asks for the password set as `ADMIN_TOKEN` in `.env`. There you can give each request a status (new, planned, done, no) and download all of them as CSV. A device that is logged in also shows the number of new requests in the footer.

## Logging a pattern (Add page)

The hidden page `/add/` (not in the menu for visitors, `noindex`, disallowed in `robots.txt`) asks for the same password as `/requests/`, once per device. After that the menu shows **Add**. Type the siteswap (suggestions appear while typing, in any rotation, sync too), pick the date and time (now by default) and a rating in half stars (how much fun it is), and save.

The likes API checks the password and passes the pattern to the Apps Script, which writes date and time (in one cell, `dd/mm/yyyy hh:mm`), pattern and rating in the first empty row of *Done* (`nr` is filled in already; `known name` and `family` are formulas). Then the sync runs at once, so the site has the new pattern within seconds. Otherwise the sync runs once a day.

Setting up the Apps Script (once):

1. In the Sheet: *Extensions > Apps Script*, add a script file `FunkyOrbit` (*+ > Script*) and paste `apps-script/FunkyOrbit.gs` in it. Existing files such as `Code.gs` stay; the project must have no other `doPost`.
2. *Project Settings > Script properties*: add `SECRET` with a long random value.
3. *Deploy > New deployment*, type *Web app*, execute as *Me*, access *Anyone*. Allow the access it asks for and copy the `/exec` URL.
4. Put `SHEET_WRITE_URL` (the URL) and `SHEET_WRITE_SECRET` (the same secret) in `.env` and run `docker compose up -d`.

After saving, a pop-up shows a random GIF from `site/gifs/`; a GIF comes back only after all the others that fit were shown (remembered per device). To add one, put the file (`.gif`, `.webp`, `.png`, `.jpg`, `.mp4` or `.webm`) in `site/gifs/` and run `python3 tools/release.py`, which lists it in `site/gifs/gifs.json`. The four `funky-*.gif` files are our own, made with `python3 tools/make_gifs.py`; the `.mp4` files are well-known reaction GIFs from GIPHY (giphy.com), as MP4 because that is far smaller.

### Milestones

The pop-up also celebrates milestones (`site/add/milestones.js`): the last patterns (countdown, the final one), every new whole percent with the expected completion date, every 25th and 100th pattern, a complete family, the first and last sync pattern, the first pattern with 5, 6, 7, 8 or 9 clubs, dragons (a 9 and a 5 one throw apart, as the Sheet counts them), the most zaps, triples or dragons, colours (all four, no orange, the last all-orange one), the hardest pattern so far, a new favourite or lowest rating, streaks, daily records, a new day of the week, a comeback after two weeks, the time of day and more. The most special one gives the title and the GIF, a few others are listed below it. They are worked out against what was done before, so logging a pattern again never repeats a progress milestone.

A GIF named after a milestone id (such as `birthday-cake.mp4` for `birthday`, `countdown-…` or `three-am-…`) is used only for that milestone; the ids are in `RULES` in `milestones.js`. `difficult-…` GIFs are for patterns with 5 difficulty stars and `hard-…` for 4 to 4½ stars; they are used when the most special milestone has no GIF of its own. `rating-high-…` is for a rating of 4 to 4½, `rating-low-…` for 2 or less, `again-…` (keep going, let's go) for another pattern right after a hard one, and `wow-…` faces go with surprises that have no GIF of their own (`GROUPS` and `ALIASES`). Every other name is a random "well done" GIF. Birthdays are in `BIRTHDAYS`; still to fill in is `SPECIAL` (Brook's first, last and favourite pattern, James's favourite and the patterns Brook has done). "A pattern that took a long time to get right" needs data we don't have yet.

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
