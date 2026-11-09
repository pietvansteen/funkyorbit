# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

funkyorbit.nl, "Project Funky Orbit by Piet & Mees": tracks their progress through 913 club passing patterns (James Francis' list) with videos, stats, an all-patterns overview and a pattern generator. All data comes from a public Google Sheet. The site is **English only** (the owner often writes in Dutch) and **always dark**.

No build step and no dependencies: vanilla JS/CSS/HTML in `site/`, Python standard library only (no pip), Docker Compose for hosting.

## Commands

Build `data/data.json` from the CSV snapshots in `testdata/` (one-shot with `INTERVAL=0`; without the `*_CSV` vars it downloads the live Sheet):

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv COLORS_CSV=testdata/colors.csv \
  FAMILIES_CSV=testdata/families.csv SYNC_COLORS_CSV=testdata/sync_colors.csv DIFFICULTY_CSV=testdata/difficulty.csv NAMES_CSV=testdata/names.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
```

Run the likes/requests API locally (`ADMIN_TOKEN` is any test value):

```sh
DB_FILE=data/likes.db REQUESTS_DB=data/requests.db SWIPES_DB=data/swipes.db WISHES_DB=data/wishes.db SAVED_DB=data/saved.db DATA_FILE=data/data.json ADMIN_TOKEN=test SWIPE_TOKENS=Hanna=swipe,Uwe=uwe,Wiebke=wiebke,Markus=markus PORT=8000 python3 likes/likes.py
```

Serving the site locally: `python3 tools/dev.py` (or the `funkyorbit` entry in `.claude/launch.json`) serves http://localhost:8090 like nginx does (`/data.json`, `/api/` proxied), and starts the likes API and the sync against the live Sheet (`CSV=1` for `testdata/`). It reads `.env` (gitignored); without `ADMIN_TOKEN` the password is `test`, without `SWIPE_TOKENS` the Catch or Drop passwords are `swipe` (Hanna), `uwe` (Uwe), `wiebke` (Wiebke) and `markus` (Markus), without `SHEET_WRITE_URL`/`SHEET_WRITE_SECRET` the Add page cannot save, without `VAPID_PRIVATE_KEY`/`RESEND_API_KEY` Wish Tricks offers no push/email.

After **every** change under `site/`:

```sh
python3 tools/release.py
```

When a colour or difficulty rule changes: `python3 tools/check_rules.py [folder with the CSVs]` compares `site/rules/engine.js` with the Sheet for all 913 patterns (Mac only, JavaScriptCore).

There are no other tests or linters. Verify in a browser; the service worker cannot run in the app's in-app browser, so test it in headless Chrome.

Production: `docker compose up -d` (services `web` nginx on port 8088, `sync`, `likes`, `umami` + `umami-db` (visitor statistics, dashboard on port 3088), `tunnel` cloudflared). Secrets `TUNNEL_TOKEN`, `ADMIN_TOKEN`, `SWIPE_TOKENS`, `SHEET_WRITE_URL`, `SHEET_WRITE_SECRET`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`, `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` live in `.env` on the server only. `apps-script/FunkyOrbit.gs` is pasted into the Sheet's Apps Script by hand and deployed as a web app (see README). Deploy = push to GitHub, then the owner runs `git pull` on the server: `site/` changes are live at once; changes to `sync.py`, `likes.py` or `nginx.conf` need those containers restarted (`sudo docker compose restart likes sync web`; `up -d` alone does not restart for changed mounted files), changes to `docker-compose.yml` need `sudo docker compose up -d`. The Sheet's time zone must be Europe/Amsterdam (`TODAY()` and the times in Done column B depend on it).

## Architecture

```
Google Sheet ──CSV──> sync/sync.py (daily, or at once on data/sync-now) ──> data/data.json ──> nginx ──> site/ pages
     ^                                                                          ├──> likes/likes.py (/api/, SQLite)
     │                                                                          └──> umami (/u/script.js, /u/api/send; dashboard :3088)
     └── apps-script/FunkyOrbit.gs (web app) <── POST /api/done (likes.py, writes data/sync-now)
data.json ──> likes.py (wish_loop) ──> push services and Resend (Wish Tricks)
```

- **sync/sync.py** fetches the Sheet tabs by gid (defaults in `sync.py`, overridable via `docker-compose.yml`; `<NAME>_CSV` env vars read a local file instead): Done, Progress (Statistics block in columns G+ → total, tiles, funny stats), Kleuren (siteswap → colour code W/B/O/R), Kleuren sync, Families, Moeilijkheid (score; stars are the formula in column J), Namen (the stories on Behind the Name). Optional tabs only log a WARNING when missing. Writes `data.json` atomically with keys `updated, total, done, summary, statBlocks, groups, all, patterns, locations, names, stats`. `all` is every pattern on the list (family, kind Standard/Zaps/Sync, key, done, colours, score, stars); `patterns` is the Done rows, newest first, with YouTube id, date, rating, key, `felt` (Done column "difficulty felt": our own stars, to compare with the generated ones later) and `firstTry` (Done column "first try"), `location` (Done column "location", also the Add page's list of locations). The Apps Script finds these columns, "nice video / location" and "gps" by header. `locations` has one point per location name: the average of its GPS points, rounded to 3 decimals, with the `nrs` of its patterns; a location without any GPS point is left off with a WARNING. The raw `gps` never goes into `data.json`. `names` is the Namen rows with a story. A video that cannot be watched (private or gone, by YouTube's oEmbed, no key needed) gets `youtubeId: null`, as if there is no video yet; unlisted counts as watchable. `data/videos.json` remembers the status per id (never serve it: it holds private ids). Public ones are looked at again after a week, all others on every sync, and at 12:05 and 12:15 the sync looks only at those (our videos go public at 12:00) and syncs when one is public. Without an answer from YouTube the last known state stays.
- **likes/likes.py**: `GET /api/likes`, `POST /api/like`, `/api/health`, and feature requests (`POST /api/requests` with a honeypot field and 3/hour per IP). The Catch or Drop page has `GET /api/swipes`, `POST` and `DELETE /api/swipe` (SQLite `SWIPES_DB`, `PEOPLE` in `likes.py`), which take `ADMIN_TOKEN` or a personal password from `SWIPE_TOKENS` (`Hanna=...,Uwe=...,Wiebke=...,Markus=...`; an old single `SWIPE_TOKEN` counts as Hanna's). A personal password opens nothing else and can only swipe as that person. `GET`/`POST`/`DELETE /api/swipe/alerts` (same passwords, table `swipe_alerts` in `SWIPES_DB`): a push or mail each time 5 new cards have come in since the person was last told (`tell_swipers`, in the same thread as `wish_loop`; the push text comes from `/api/wishes/news` as `{cards: n}`); no confirmation mail, because only logged-in people can set it. Wish Tricks: `GET /api/wishes/counts`, `POST /api/wishes`, `/api/wishes/remove`, `/api/wishes/news` (what the service worker shows after a push), `GET /api/wishes/confirm` and `/api/wishes/stop` (links in mails, answer with a small HTML page), all in SQLite `WISHES_DB`. A thread (`wish_loop`) looks every minute for open wishes whose key now has a video, and sends the push (`likes/webpush.py`, standard library only, no payload; it only posts to the browsers' own push hosts) and the mail (Resend, one HTTPS call). An address is deleted once told. Practised, not filmed yet: `GET`/`POST`/`DELETE /api/saved` (admin, SQLite `SAVED_DB`), saved from the Generator and the All patterns pop-up (`FO.saved` in `shared.js`), shown in the Generator and as shortcuts on the Add page; `GET` drops what is in Done by now. Admin endpoints (`GET /api/requests`, `/api/requests/count`, `/api/requests.csv`, `POST /api/requests/<id>/status`, `GET /api/auth`, `POST /api/done`, `GET /api/wishes`) need `Authorization: Bearer <ADMIN_TOKEN>`. `POST /api/done` passes the pattern to the Apps Script (`SHEET_WRITE_URL` + `SHEET_WRITE_SECRET`), which fills date, pattern and rating in the first empty row of Done, then writes `data/sync-now` so the sync runs at once (it retries until the new `nr` is in Google's CSV export).
- **site/shared.js** (`window.FO`) holds everything shared between pages: siteswap/sync rendering in club colours, stars/difficulty, dates, the video player, the pattern pop-up (`initPopup`, `openPattern`), likes, `startHands`/`startHtml`, and visitor statistics (loads the Umami tracker when `UMAMI_ID` is set, not on admin devices or localhost; `FO.track(name, data)` for custom events, `FO.trackSearch(q)` debounced; the events are listed in the README). Each page has its own folder and script: `/` (`app.js`, progress, latest patterns and a grid of latest videos), `/stats/` (also the map, `site/map/`, loaded when its card comes on screen: Leaflet, own clustering, OpenStreetMap tiles darkened with a CSS filter), `/patterns/` (families, search and the Filter & sort panel, with everything in the URL), `/gen/` (generator, options in `localStorage fo_gen`), `/names/` (Behind the Name, "Stories" in the phone menu; `FO.nameLinks` links a name elsewhere to its story, only when there is one), `/wish/` (Wish Tricks: search patterns not thrown yet, top 10 (top 5 on Progress), My wishes; the wishing itself, the dialog and the next-visit banner are `FO.wishes` in `shared.js`, own wishes in `localStorage fo_wishes`), `/rules/` (How it works: `engine.js` has the colour and difficulty rules, `rules.js` the flowcharts as inline SVG and Try a siteswap, `?try=` in the URL; in the footer, not in `.nav`), `/changes/` (renders `changelog.json`), `/request/`, `/requests/`, `/add/`, `/catch/` (Catch or Drop, called swipe in the code, the API and `SWIPE_TOKENS`) and `/login/` (noindex). The footer's "Log in" link goes to `/login/`, the way in for the installed app, which has no address bar; it saves the password in `localStorage` (`fo_admin` or `fo_swipe`). `shared.js` then adds the extra pages to the menu: "Add" with `fo_admin`, "Catch or Drop" with either, and in the phone's More also "Requests" with `fo_admin`.

The menu: the links in `.nav` in every page's header on wide screens; at 760px or less `shared.js` adds a tab bar at the bottom: `TABS` and Stories for visitors; on logged-in devices More takes Stories' place and holds Stories and the extra pages. A new public page goes in `.nav` on every page, in the menu code in `shared.js`, and in `PAGES`/`FILES` in `sw.js`; Wish Tricks and How it works are deliberately not in the tab bar. The whole site is one PWA: `site/manifest.webmanifest` (scope `/`, opens on `/`; its `id` stays `/gen/`, so an installed app stays the same app) and `site/sw.js` (scope `/`, registered from `shared.js`; pages and data network-first, assets cache-first, so every page works offline).

## Domain rules (easy to get wrong)

- **Pattern key**: vanilla siteswaps use the smallest rotation (`min_rotation`); sync patterns use `sync_canon` (minimum over rotations of both jugglers and swapping A/B); popcorn notation like `(6x,a)(6,6)*` is its own key. These match the Families tab's "Unique key (auto)". The Done tab's "Match keys (auto)" column is a list of rotations, **not** a per-row key. JS has a `minRotation` fallback.
- **Local siteswap** (`FO.localSiteswap`, #52): every second throw of an odd period, for search only; sync and popcorn have none. It is not a pattern of its own, and on Progress a result found only that way gets a "local" label. *All patterns* has a choice instead (Search in: Global / Local, `m=local` in the URL, #58).
- **Colours are rotation-aware**: the colour code rotates along with the pattern (`color_for`, `sync_lookup`).
- **Sync throws** are tokens `[0-9a-oq-z]p?` and match vanilla throws by spin: 3p≈7, 4p≈9, 5p≈b, 3≈6, 4≈8, 5≈a, 1≈2.
- **Start positions**: a club starts in the hand that throws it first. Non-sync: Piet is juggler 1, throws on even beats and starts with his right hand; Mees on odd beats. Sync: both throw every beat starting right; part A = Mees, part B = Piet (issue #41). Display is always **Mees left, Piet right** (as in the videos), with a "starts" badge after Piet for non-sync only. Don't show "Juggler 1/2", and don't show names under sync patterns.
- **Success GIFs** (Add page): any file in `site/gifs/` is listed in `site/gifs/gifs.json` by `tools/release.py`; the `funky-*.gif` starter set is generated by `tools/make_gifs.py` (standard library only). A file whose name starts with a milestone id from `site/add/milestones.js` (`birthday-…`) is shown only for that milestone (`first-try-…` for the First try checkbox, `difficult-…` = 5 difficulty stars, `hard-…` = 4–4½, used when the top milestone has none of its own; `wow-…` and `again-…` are groups only reached through `ALIASES`); the rest are random, each shown once before any repeats (`localStorage fo_gifs_seen`).
- **Time of a pattern**: the Add page writes date and time into Done column B (`dd/mm/yyyy hh:mm`); the sync takes the time from there, else from the DJI file name in column H. The Progress formulas that count days use `INT()` on column B, so keep that if you change them.
- **Milestones** (`site/add/milestones.js`, #44) compare the state before a save with the state after it (`add.js` keeps it up to date between saves, before the sync has run). Zaps are 5s, triples a and b, clubs = throw sum / period (matches every family name). Per-pattern dragons (9 then 5 two beats later) are counted there because the Sheet only has the total; that count gives the Sheet's 149, so keep the two in step.
- **The rules in JS** (`site/rules/engine.js`) are a copy of the Sheet tabs Kleurregels and Moeilijkheidsregels, which the site does not read: a rule change means changing the engine, the flowchart box in `rules.js`, and running `tools/check_rules.py`. A pattern on the list always shows the Sheet's colours and score from `data.json`; the engine only explains them, and is the source for patterns not on the list.
- **Wish button**: only for patterns on the list we have not thrown yet (a row in Done, even without a video, is not wishable: `likes.py` refuses it too). Not in the Generator (people should look a pattern up, not wish for a random draw). A wish needs a name, and the names of open wishes are public (`names` in `/api/wishes/counts`); the optional remark is private (only in the admin `GET /api/wishes`).
- **Dragons** (9_5: a 9 and a 5 by the same juggler, one throw apart, cyclic): the total on Stats comes only from the Sheet's "Patterns with dragons (95)" row; don't recompute it. Per pattern, `FO.dragonsOf` (the dragon filter on All patterns) and the milestones count 9 then 5 two beats later, which adds up to that total.

## Releases and caching

`site/changelog.json` is the single source for the version. `tools/release.py` writes the footer `vX.Y.Z · What's new`, the `?v=<version>-<hash>` on every css/js/svg link in `site/**/*.html`, and the service-worker cache name `fo-site-<version>-<hash>` and the precached `?v=` links in `site/sw.js`. Cloudflare caches css/js/svg for hours, so never hand-edit these or skip the script.

- One version per release, and a release is whatever goes live with the owner's next `git pull`. Before editing the changelog, check the live footer: `curl -4 -s https://funkyorbit.nl/ | grep 'class="version"'`. If the top version in `changelog.json` is already live, start a new one; otherwise add lines to it.
- Add a changelog line for every visible change; the version's date is the day it goes live.
- Numbering (see README): MAJOR for a milestone that changes the site substantially (1.0.0 = the complete site), MINOR for new features or visible changes bundled per work session, PATCH for bug fixes and small text or style corrections. Work that is not about the website (such as `premiere/`) stays out of the release notes.

## Other notes

- Keep the public README and this file free of host details (server model, paths, IPs, tokens). Private setup notes go in `*.local.md`, which is gitignored.
- Work comes from GitHub issues on `pietvansteen/funkyorbit`; reference them with `Closes #n` in commits.
- `premiere/` is a separate Premiere Pro motion-graphics template generator (`python3 premiere/make_mogrt.py`, needs After Effects). It is not part of the website or its release notes.
