# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

funkyorbit.nl, "Project Funky Orbit by Piet & Mees": tracks their progress through 913 club passing patterns (James Francis' list) with videos, stats, an all-patterns overview and a pattern generator. All data comes from a public Google Sheet. The site is **English only** (the owner often writes in Dutch) and **always dark**.

No build step and no dependencies: vanilla JS/CSS/HTML in `site/`, Python standard library only (no pip), Docker Compose for hosting.

## Commands

Build `data/data.json` from the CSV snapshots in `testdata/` (one-shot with `INTERVAL=0`; without the `*_CSV` vars it downloads the live Sheet):

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv COLORS_CSV=testdata/colors.csv \
  FAMILIES_CSV=testdata/families.csv SYNC_COLORS_CSV=testdata/sync_colors.csv DIFFICULTY_CSV=testdata/difficulty.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
```

Run the likes/requests API locally (`ADMIN_TOKEN` is any test value):

```sh
DB_FILE=data/likes.db REQUESTS_DB=data/requests.db DATA_FILE=data/data.json ADMIN_TOKEN=test PORT=8000 python3 likes/likes.py
```

Serving the site locally: `python3 tools/dev.py` (or the `funkyorbit` entry in `.claude/launch.json`) serves http://localhost:8090 like nginx does (`/data.json`, `/api/` proxied), and starts the likes API and the sync against the live Sheet (`CSV=1` for `testdata/`). It reads `.env` (gitignored); without `ADMIN_TOKEN` the password is `test`, without `SHEET_WRITE_URL`/`SHEET_WRITE_SECRET` the Add page cannot save.

After **every** change under `site/`:

```sh
python3 tools/release.py
```

There are no tests or linters. Verify in a browser; the service worker cannot run in the app's in-app browser, so test it in headless Chrome.

Production: `docker compose up -d` (services `web` nginx on port 8088, `sync`, `likes`, `umami` + `umami-db` (visitor statistics, dashboard on port 3088), `tunnel` cloudflared). Secrets `TUNNEL_TOKEN`, `ADMIN_TOKEN`, `SHEET_WRITE_URL`, `SHEET_WRITE_SECRET`, `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` live in `.env` on the server only. `apps-script/FunkyOrbit.gs` is pasted into the Sheet's Apps Script by hand and deployed as a web app (see README). Deploy = push to GitHub, then the owner runs `git pull` on the server: `site/` changes are live at once; changes to `sync.py`, `likes.py`, `docker-compose.yml` or `nginx.conf` need the containers restarted (`docker compose up -d`).

## Architecture

```
Google Sheet ──CSV──> sync/sync.py (daily, or at once on data/sync-now) ──> data/data.json ──> nginx ──> site/ pages
     ^                                                                          ├──> likes/likes.py (/api/, SQLite)
     │                                                                          └──> umami (/u/script.js, /u/api/send; dashboard :3088)
     └── apps-script/FunkyOrbit.gs (web app) <── POST /api/done (likes.py, writes data/sync-now)
```

- **sync/sync.py** fetches the Sheet tabs by gid (defaults in `sync.py`, overridable via `docker-compose.yml`; `<NAME>_CSV` env vars read a local file instead): Done, Progress (Statistics block in columns G+ → total, tiles, funny stats), Kleuren (siteswap → colour code W/B/O/R), Kleuren sync, Families, Moeilijkheid (score; stars are the formula in column J). Optional tabs only log a WARNING when missing. Writes `data.json` atomically with keys `updated, total, done, summary, statBlocks, groups, all, patterns, stats`. `all` is every pattern on the list (family, kind Standard/Zaps/Sync, key, done, colours, score, stars); `patterns` is the Done rows, newest first, with YouTube id, date, rating and key.
- **likes/likes.py**: `GET /api/likes`, `POST /api/like`, `/api/health`, and feature requests (`POST /api/requests` with a honeypot field and 3/hour per IP). Admin endpoints (`GET /api/requests`, `/api/requests/count`, `/api/requests.csv`, `POST /api/requests/<id>/status`, `GET /api/auth`, `POST /api/done`) need `Authorization: Bearer <ADMIN_TOKEN>`. `POST /api/done` passes the pattern to the Apps Script (`SHEET_WRITE_URL` + `SHEET_WRITE_SECRET`), which fills date, pattern and rating in the first empty row of Done, then writes `data/sync-now` so the sync runs at once (it retries until the new `nr` is in Google's CSV export).
- **site/shared.js** (`window.FO`) holds everything shared between pages: siteswap/sync rendering in club colours, stars/difficulty, dates, the video player, likes, `startHands`/`startHtml`, and visitor statistics (loads the Umami tracker when `UMAMI_ID` is set, not on admin devices or localhost; `FO.track(name, data)` for custom events, `FO.trackSearch(q)` debounced; the events are listed in the README). Each page has its own folder and script: `/` (`app.js`, progress feed), `/stats/`, `/patterns/` (families + pattern pop-up), `/gen/` (generator, options in `localStorage fo_gen`), `/changes/` (renders `changelog.json`), `/request/`, `/requests/` and `/add/` (admin, noindex; "Add" is put in the menu by `shared.js` only on devices with the admin password in `localStorage fo_admin`). The whole site is one PWA: `site/manifest.webmanifest` (scope `/`, opens on `/gen/`) and `site/sw.js` (scope `/`, registered from `shared.js`; pages and data network-first, assets cache-first, so every page works offline).

## Domain rules (easy to get wrong)

- **Pattern key**: vanilla siteswaps use the smallest rotation (`min_rotation`); sync patterns use `sync_canon` (minimum over rotations of both jugglers and swapping A/B); popcorn notation like `(6x,a)(6,6)*` is its own key. These match the Families tab's "Unique key (auto)". The Done tab's "Match keys (auto)" column is a list of rotations, **not** a per-row key. JS has a `minRotation` fallback.
- **Colours are rotation-aware**: the colour code rotates along with the pattern (`color_for`, `sync_lookup`).
- **Sync throws** are tokens `[0-9a-oq-z]p?` and match vanilla throws by spin: 3p≈7, 4p≈9, 5p≈b, 3≈6, 4≈8, 5≈a, 1≈2.
- **Start positions**: a club starts in the hand that throws it first. Non-sync: Piet is juggler 1, throws on even beats and starts with his right hand; Mees on odd beats. Sync: both throw every beat starting right; part A = Mees, part B = Piet (issue #41). Display is always **Mees left, Piet right** (as in the videos), with a "starts" badge after Piet for non-sync only. Don't show "Juggler 1/2", and don't show names under sync patterns.
- **Success GIFs** (Add page): any file in `site/gifs/` is listed in `site/gifs/gifs.json` by `tools/release.py`; the `funky-*.gif` starter set is generated by `tools/make_gifs.py` (standard library only). A file whose name starts with a milestone id from `site/add/milestones.js` (`birthday-…`) is shown only for that milestone; the rest are random.
- **Milestones** (`site/add/milestones.js`, #44) compare the state before a save with the state after it (`add.js` keeps it up to date between saves, before the sync has run). Zaps are 5s, triples a and b, clubs = throw sum / period (matches every family name). Per-pattern dragons (9 then 5 two beats later) are counted there because the Sheet only has the total; that count gives the Sheet's 149, so keep the two in step.
- **Dragons** (9_5: a 9 and a 5 by the same juggler, one throw apart, cyclic) come only from the Sheet's "Patterns with dragons (95)" row; don't recompute them.

## Releases and caching

`site/changelog.json` is the single source for the version. `tools/release.py` writes the footer `vX.Y.Z · What's new`, the `?v=<version>-<hash>` on every css/js/svg link in `site/**/*.html`, and the service-worker cache name `fo-site-<version>-<hash>` and the precached `?v=` links in `site/sw.js`. Cloudflare caches css/js/svg for hours, so never hand-edit these or skip the script.

- One version per release, and a release is whatever goes live with the owner's next `git pull`. Before editing the changelog, check the live footer: `curl -4 -s https://funkyorbit.nl/ | grep 'class="version"'`. If the top version in `changelog.json` is already live, start a new one; otherwise add lines to it.
- Add a changelog line for every visible change; the version's date is the day it goes live.
- Numbering (see README): MAJOR for a milestone that changes the site substantially (1.0.0 = the complete site), MINOR for new features or visible changes bundled per work session, PATCH for bug fixes and small text or style corrections. Work that is not about the website (such as `premiere/`) stays out of the release notes.

## Other notes

- Keep the public README and this file free of host details (server model, paths, IPs, tokens). Private setup notes go in `*.local.md`, which is gitignored.
- Work comes from GitHub issues on `pietvansteen/funkyorbit`; reference them with `Closes #n` in commits.
- `premiere/` is a separate Premiere Pro motion-graphics template generator (`python3 premiere/make_mogrt.py`, needs After Effects). It is not part of the website or its release notes.
