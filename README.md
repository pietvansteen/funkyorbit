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
| `site/` | The website: `index.html` + `app.js` (progress and videos), `patterns/` (all patterns), `stats/` (funny stats and the map of filming locations), `gen/` (pattern generator), `map/` (the map on the Stats page, with Leaflet), `names/` (Behind the Name), `wish/` (Wish Tricks), `rules/` (How it works; `rules/engine.js` holds the colour and difficulty rules in JS), `catch/` and `login/` (both hidden), `changes/` (release notes), `shared.js`, `style.css`, icons |
| `sync/sync.py` | Fetches the Sheet tabs as CSV and writes `data/data.json` |
| `likes/likes.py` | Small API: likes (one per visitor per video, via a cookie) and feature requests, both in SQLite, and logging a pattern we juggled (via the Apps Script) |
| `apps-script/FunkyOrbit.gs` | Apps Script bound to the Sheet: writes a logged pattern as a new row in *Done* |
| `web/nginx.conf` | Serves the site and `data.json`, forwards `/api/` to the likes API and `/u/` (tracker only) to Umami |
| `likes/webpush.py` | Web Push with the standard library only: signs the VAPID token and sends a push without a payload |
| `tools/check_rules.py` | Compares `site/rules/engine.js` with the Sheet for every pattern |
| `tools/make_vapid.py` | Makes the key for push notifications |
| `tools/release.py` | Puts the newest version from `site/changelog.json` in the footer, the asset links and the service worker |
| `docker-compose.yml` | Runs everything with Docker Compose, plus Umami (visitor statistics) and a Cloudflare Tunnel |

No pip packages needed: everything runs on standard Python.

## What is read from the Sheet

- **Done**: one row per pattern thrown. Columns are matched by name: `date`, `pattern` (siteswap), `known name`, `family`, `rating`, `youtube`, `file name`, `difficulty felt` (our own ½ to 5 stars when we threw it), `first try` (`TRUE` when it worked the first time after we started filming), `nice video / location` (`TRUE` for a video or a place we like), `location` (the name of the place) and `gps` (`lat,lng` of the phone, only for a pattern logged on the day itself). Like the rest of the Sheet these are public; the exact `gps` does not go into `data.json`, only one point per location name (the average, rounded to 3 decimals, about 100 m), for the map on the Stats page. A location without any GPS point is left off the map and logged as a WARNING until it has one. The time comes from the camera file name. Rows with a YouTube link appear in the video feed.
- **Progress**: the categories and their totals. The *Statistics* block provides the overall total and the Period 3 / 5 / 7 and Sync tiles, and the figures on the Funny stats page.
- **Kleuren** / **Kleuren sync**: the club colour per throw (`W`/`B`/`O`/`R` = white, blue, orange, pink), used to colour the digits. Written in another rotation is fine.
- **Families**: every pattern with its family, in Sheet order (columns *Pattern / Family / Unique key (auto)*), plus the known names. This feeds the *All patterns* page; a pattern counts as done when its unique key is among the *Match keys* in *Done*.
- **Moeilijkheid**: difficulty score and stars per pattern, used by the generator's difficulty filter and the pattern pop-up.

- **Namen** (optional): the stories on *Behind the Name*. Columns `Name`, `Siteswap(s)` (separated by `;`, `,` or a new line), `Story`, `Told by`, `Photo` (a direct `https://` image link, or a file name in `site/names/photos/`), `Source` and `Date added` (dd/mm/yyyy). Rows without a story are ignored. A name elsewhere on the site links to its story when `Name` matches it exactly (upper or lower case does not matter). Write people as name + city ("Uwe from Oldenburg") or first name + last initial ("Uwe S."), and ask permission before publishing someone's story or photo.

The Sheet must be shared as *Anyone with the link can view*.

## Running it

```sh
git clone https://github.com/pietvansteen/funkyorbit.git
cd funkyorbit
echo "TUNNEL_TOKEN=<cloudflare-tunnel-token>" > .env
sudo docker network create tunnel   # once; the tunnel shares it with puzzullu.funkyorbit.nl
echo "ADMIN_TOKEN=<password for /requests/ and /add/>" >> .env
echo "SWIPE_TOKENS=Hanna=<password>,Uwe=<password>,Wiebke=<password>,Markus=<password>" >> .env   # personal passwords for /catch/ only
echo "SHEET_WRITE_URL=<Apps Script web app /exec URL>" >> .env
echo "SHEET_WRITE_SECRET=<the SECRET script property>" >> .env
echo "VAPID_PRIVATE_KEY=<from python3 tools/make_vapid.py>" >> .env   # push notifications for Wish Tricks
echo "RESEND_API_KEY=<API key of the mail service>" >> .env            # email for Wish Tricks
echo "UMAMI_DB_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "UMAMI_APP_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

The site is then available on port 8088. In the Cloudflare Tunnel, point the public hostname to `http://web:80`. The same tunnel serves `puzzullu.funkyorbit.nl` (→ `http://puzzullu-web:80`, from the separate puzzullu repo) through the shared Docker network `tunnel`. After `git pull`, changes in `site/` are live right away. After changes to `sync.py`, `likes.py` or `web/nginx.conf`, restart those containers with `docker compose restart likes sync web` (`up -d` does not restart a container when only its mounted files changed); after changes to `docker-compose.yml`, run `docker compose up -d`. The Sheet's time zone (*File > Settings*) must be Europe/Amsterdam.

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
| `Open pattern` | `siteswap`, `family`, `done` | a pattern pop-up opens (Progress and All patterns) |
| `Open location` | `location` | a club on the map is opened (Stats) |
| `Search` | `query`, `page` | someone stops typing in a search box for 2 seconds |
| `Colour filter` | `colour`, `list` | a colour filter is switched on (All patterns) |
| `Pattern filter` | `filter`, `value` | another filter is chosen in Filter & sort (All patterns) |
| `Sort patterns` | `sort` | the sort order is chosen (All patterns) |
| `Date filter` | `range` | the date filter changes (home) |
| `Open group` | `group` | a progress tile opens (home) |
| `Draw pattern` | `period`, `stars`, `hide`, `found` | the generator draws a pattern |
| `Send request` | | a feature request is sent |
| `Wish` | `key`, `push`, `email` | someone wishes for a pattern |
| `Wish online seen` | `key` | the banner says that a wish came true |
| `Try a siteswap` | `siteswap`, `listed` | someone submits or picks a pattern on How it works |
| `Outbound link` | `to` | the YouTube channel or James Francis' list is opened |
| `Install app` | | the site is installed as an app (not every browser reports this) |

Our own devices (with the admin password saved) are not counted, and neither are the preview and localhost. Searching changes the address with every letter; that is not counted as a new page view.

To see visitors from Instagram even when the app hides the referrer, link to `https://funkyorbit.nl/?utm_source=instagram` in the bio (likewise `utm_source=youtube` in video descriptions); Umami shows these under *UTM*.

## Feature requests

Visitors send ideas via **Request a feature** in the footer (`/request/`): name, email and request (a checkbox for Mees replaces the email). They are stored on the server in `data/requests.db`, never on the public site. Spam is kept out with a hidden honeypot field, a limit of 3 requests per visitor per hour and maximum field lengths.

Reading them: the hidden page `/requests/` (not in the menu, `noindex`, disallowed in `robots.txt`) asks for the password set as `ADMIN_TOKEN` in `.env`. There you can give each request a status (new, planned, done, no) and download all of them as CSV. A device that is logged in also shows the number of new requests in the footer.

## Wish Tricks

On `/wish/` visitors pick a pattern we haven't thrown yet and wish for it with their name, which is shown with the pattern, and an optional remark that only we see on `/requests/` (a thrown pattern always gets its video soon, so the API refuses it). The Wish button is also in the pattern pop-up (not in the generator). Wishes are in `data/wishes.db`, one per visitor per pattern. Visitors see the number of wishes per pattern and a top 10 (top 5 on Progress); `/requests/` shows us the *Most wished* list. All three lists use the same order: most wishes first; with as many wishes, the other patterns before sync ones, and then the newest wish first. Spam is kept out with a honeypot field, 20 wishes per visitor per hour, and 3 confirmation mails per address per day.

When a pattern gets a video in `data.json`, `likes.py` tells the wishers (it looks every minute, so also right after a restart, and tries what failed again for about an hour). There are three ways, and only the first needs nothing on the server:

1. **Next visit**: the wish is kept on the device (`localStorage fo_wishes`), and any page shows a banner, once per wish.
2. **Push notification**, offered when `VAPID_PRIVATE_KEY` is set. Make the key once with `python3 tools/make_vapid.py`, and keep it: a new key ends all existing subscriptions. The push has no content, so nothing has to be encrypted; the service worker then asks `POST /api/wishes/news` what to show. On iPhone and iPad push only works once the site is on the home screen, and the page says so. Subscriptions that no longer exist (404/410) are removed.
3. **Email**, offered when `RESEND_API_KEY` is set. Mail goes out through [Resend](https://resend.com) with one HTTPS call, there is no mail server. Setting it up: make an account, add the domain `mail.funkyorbit.nl`, put the DNS records it asks for (SPF, DKIM) in Cloudflare, make an API key with sending access and put it in `.env`. The default sender is `Funky Orbit <wishes@mail.funkyorbit.nl>` (`MAIL_FROM`): it has to be on the domain that is verified in Resend, because the DKIM signature has to match it for DMARC. An address gets a confirmation mail first and nothing else until it is confirmed. Every mail has an unsubscribe link, and an address is deleted once the wish mail has gone out. The domain has one DMARC record, `_dmarc` in Cloudflare, with `p=reject`; a second record would invalidate it. Use relaxed alignment there (`adkim=r; aspf=r`), so both the DKIM signature and the SPF return path (`send.mail.funkyorbit.nl`) count.

After setting either key: `docker compose up -d`.

## Practised, not filmed yet

On our own devices (admin password) the generator has **Practised, save for later** under a drawn pattern, for a pattern we threw but still have to film. The list is on the generator page and as shortcuts above the siteswap field on the Add page. A pattern leaves the list by itself once it is in Done, or with ×. Stored in `data/saved.db` (`/api/saved`).

## How it works page (the rules)

`/rules/` explains the colour and difficulty rules with flowcharts, and *Try a siteswap* (`/rules/?try=756`) shows them step by step. A pattern on our list uses the colours and score from `data.json`; any other valid pattern is worked out by `site/rules/engine.js`.

The page does not read the Sheet tabs *Kleurregels* and *Moeilijkheidsregels*: **when a rule changes there, also change `engine.js` and the box in the flowchart (`site/rules/rules.js`)**. Then compare with the Sheet, using fresh CSV files of *Kleuren*, *Kleuren sync* and *Moeilijkheid* in `testdata/`:

```sh
python3 tools/check_rules.py
```

It needs a Mac (JavaScriptCore). It should say 0 differences. The colours match for all 913 patterns; 28 scores are 0.1 off by rounding, and 3 of those sit on the edge of a star (a858272, a859262, a5a8592), where the site uses the Sheet's value. Those are listed as rounding, because the Sheet's layer 2 column does not always equal the sum of its own breakdown (`a5a8522`: 8.0 and 8.1). Since November 2026 a 5 next to a triple counts 3 instead of 5, and the stars follow a new scale (Moeilijkheidsregels B50:C59: ½ ★ below 4, 5 ★ from 18.5). The scores in *Moeilijkheid* are values, not formulas: a rule change means writing new scores there too (the stars and minutes follow by formula). Three rules were not in the rules tab and were read from the Sheet's numbers: pass/self switches count `changes − 2`, a repeated 5/a penalty halves the largest first, and with two dragons back to back (9595) the step 5-9 does not count as alternating passes.

## Logging a pattern (Add page)

The hidden page `/add/` (not in the menu for visitors, `noindex`, disallowed in `robots.txt`) asks for the same password as `/requests/`, once per device (or use **Log in** in the footer, the way in for the installed app). After that the menu shows **Add**, on phones under **More**. Type the siteswap (suggestions appear while typing, in any rotation, sync too), pick the date and time (now by default) and a rating in half stars (how much fun it is), and save.

The likes API checks the password and passes the pattern to the Apps Script, which writes date and time (in one cell, `dd/mm/yyyy hh:mm`), pattern, rating, difficulty felt, first try, nice video / location, location and GPS position in the first empty row of *Done* (`nr` is filled in already; `known name` and `family` are formulas). Then the sync runs at once, so the site has the new pattern within seconds. Otherwise the sync runs once a day. After changing or deleting a row in *Done* by hand, press **Update the site from the Sheet** at the bottom of the Add page (`POST /api/sync`), so the site follows within a minute instead of the next day.

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

## Rating patterns for a show (Catch or Drop)

The hidden page `/catch/` (`noindex`, disallowed in `robots.txt`) is where Piet, Mees, Hanna, Uwe, Wiebke and Markus rate the filmed patterns for a show: swipe right to catch it (nice and doable on stage), left to drop it. Log in once per device with **Log in** in the footer (`/login/`, also the way in for the installed app, which has no address bar), using a personal password from `SWIPE_TOKENS` in `.env` (`Hanna=...,Uwe=...,Wiebke=...,Markus=...`, letters and digits only) or `ADMIN_TOKEN`. The menu then shows **Catch or Drop**, on phones under **More**. A personal password opens nothing else and keeps you under your own name: no choosing a name, and the API refuses swipes as anyone else. The admin password chooses a name, as Piet and Mees do. Give each person their own password.

Everyone judges each pattern with a video once. A card always fits the screen and shows how much fun we rated a pattern and its difficulty, with the rest of the details behind **More info** (not the start position, which does not matter for a show). A clear layer over a playing video takes the touches: a horizontal drag swipes and a tap pauses or plays (through the YouTube IFrame API), so YouTube's own controls are not used on this page. **Skip** puts a card at the back of the stack for later; that is remembered on the device, not on the server. The overview shows the catches by match (all six, five, four, three, two, one) or by family. It opens for good once you have had every card one time (a skipped card counts, remembered on the device), also when new videos add new cards later, and it only shows cards you have judged yourself. Before that, it shows only the patterns everyone has judged. Swipes are stored in `data/swipes.db` (`GET /api/swipes`, `POST /api/swipe` and `DELETE /api/swipe`). To add a person, extend `PEOPLE` in `likes/likes.py` and give them a password in `SWIPE_TOKENS`.

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
  FAMILIES_CSV=testdata/families.csv SYNC_COLORS_CSV=testdata/sync_colors.csv DIFFICULTY_CSV=testdata/difficulty.csv NAMES_CSV=testdata/names.csv \
  OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```
