# Funky Orbit — funkyorbit.nl

A website that shows how far along we are with Project Funky Orbit. Progress and videos come automatically from the Google Sheet **Project Funky Orbit** (tabs *Done* and *Progress*).

## How it works

```
Google Sheet ──(hourly)──> sync  ──> data/data.json ──┐
                                                     ├──> web (nginx) ──> funkyorbit.nl
visitors ──like──> likes API ──> data/likes.db ──────┘
```

| Folder | What |
|---|---|
| `site/` | The website: `index.html`, `style.css`, `app.js` |
| `sync/sync.py` | Fetches *Done* and *Progress* as CSV every hour and writes `data/data.json` |
| `likes/likes.py` | Small API that stores likes in SQLite (one like per visitor per video, via a cookie) |
| `web/nginx.conf` | Web server: serves the site and `data.json`, and forwards `/api/` to the likes API |
| `docker-compose.yml` | Everything together for the Synology (Container Manager) |
| `data/` | Filled on the NAS; its contents are not in git |

No pip packages needed: everything runs on standard Python.

## What is read from the Sheet

**Done** (columns are matched by name, order doesn't matter):
`nr`, `date` (dd/mm/yyyy), `pattern` (siteswap), `known name`, `family`, `rating 1 to 5` (half stars allowed), `youtube` (link), `file name`.
The **time** is taken from the DJI file name (`DJI_20260926131333...` → 13:13). Only rows with a YouTube link appear in the video feed; the rest are listed under "Thrown, video coming soon".

**Progress**: every row with `Total | Done` in columns B and C starts a group (e.g. *Zaps - Period 7*); the rows below it are the categories. Adding groups or categories works automatically. The total at the top comes from *All patterns* in the Statistics block (columns G:H).

## One-time setup in Google Sheets

The Sheet must be readable via its link: **Share → General access → Anyone with the link → Viewer**. The owner of the Sheet (or someone with edit rights) has to do this.

## Installing on the Synology DS1621+

1. Install **Container Manager** and **Git Server** (for the `git` command over SSH) from the Package Center.
2. Clone this repo into the `docker` shared folder (on PieNas that is `/volume2/docker/funkyorbit`). The repo is public, so no token is needed:
   ```sh
   cd /volume2/docker
   git clone https://github.com/pietvansteen/funkyorbit.git
   ```
3. Container Manager → **Project → Create** → choose the folder `/volume2/docker/funkyorbit` → it finds `docker-compose.yml` → skip the Web Station portal → **Start**.
4. Open `http://<nas-ip>:8088`. After the first sync (within a few seconds) the progress shows up.
5. Logs: Container Manager → Project → funkyorbit → sync. Every hour you'll see a line like `OK: 15/911 patterns, 2 videos`.

### Updating after a code change
```sh
cd /volume2/docker/funkyorbit && git pull
```
Changes in `site/` are visible right away. After a change in `sync.py` or `likes.py`: restart the project in Container Manager.

## Making funkyorbit.nl reachable (Cloudflare Tunnel)

This way you don't have to open any ports on your router, and your home IP stays hidden.

1. Put funkyorbit.nl on Cloudflare (free plan): add the domain and change the nameservers at your registrar.
2. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create tunnel** (type *Cloudflared*). Copy the token.
3. In the project folder on the NAS, create a `.env` file containing `TUNNEL_TOKEN=<token>` and restart the project. The tunnel now shows as *Connected* in Cloudflare.
4. In the tunnel: **Public hostname** `funkyorbit.nl` (and `www`) → type HTTP, URL `web:80`.

## Testing locally without Google

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```

## To add later
- Search/filter by siteswap (the list of all patterns is already in `data.json`).
