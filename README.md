# Funky Orbit — funkyorbit.nl

Website die laat zien hoe ver we zijn met Project Funky Orbit. De voortgang en de video's komen automatisch uit de Google Sheet **Project Funky Orbit** (tabbladen *Done* en *Progress*).

## Hoe het werkt

```
Google Sheet ──(elk uur)──> sync  ──> data/data.json ──┐
                                                      ├──> web (nginx) ──> funkyorbit.nl
bezoekers ──like──> likes-API ──> data/likes.db ──────┘
```

| Map | Wat |
|---|---|
| `site/` | De website: `index.html`, `style.css`, `app.js` |
| `sync/sync.py` | Haalt elk uur *Done* en *Progress* op als CSV en schrijft `data/data.json` |
| `likes/likes.py` | Kleine API die likes bewaart in SQLite (één like per bezoeker per video, via cookie) |
| `web/nginx.conf` | Webserver: serveert de site, `data.json` en stuurt `/api/` door naar de likes-API |
| `docker-compose.yml` | Alles samen voor de Synology (Container Manager) |
| `data/` | Wordt aangemaakt op de NAS; staat niet in git |

Geen pip-packages nodig: alles draait op standaard Python.

## Wat er uit de Sheet wordt gelezen

**Done** (kolommen op naam herkend, volgorde maakt niet uit):
`nr`, `date` (dd/mm/jjjj), `pattern` (siteswap), `known name`, `family`, `rating 1 tot 5` (halve sterren mogen), `youtube` (link), `file name`.
De **tijd** wordt uit de DJI-bestandsnaam gehaald (`DJI_20260926131333...` → 13:13). Alleen regels met een YouTube-link komen in de videofeed; de rest staat in de lijst "Gegooid, video volgt".

**Progress**: elke rij met `Total | Done` in kolom B en C begint een groep (bijv. *Zaps - Period 7*); de rijen eronder zijn de categorieën. Groepen of categorieën toevoegen werkt dus vanzelf. Het totaal bovenaan komt uit *All patterns* in het Statistics-blok (kolom G:H).

## Eenmalig in Google Sheets

De Sheet moet leesbaar zijn via de link: **Delen → Algemene toegang → Iedereen met de link → Lezer**. Dit moet de eigenaar van de Sheet doen (of iemand met bewerkrechten).

## Installeren op de Synology DS1621+

1. Installeer **Container Manager** en **Git Server** (of gebruik SSH met `git`) via het Package Center.
2. Clone deze repo naar bijvoorbeeld `/volume1/docker/funkyorbit`:
   ```sh
   cd /volume1/docker
   git clone https://github.com/pietvansteen/funkyorbit.git
   ```
3. Container Manager → **Project → Maken** → kies de map `/volume1/docker/funkyorbit` → hij vindt `docker-compose.yml` → **Starten**.
4. Kijk op `http://<ip-van-de-nas>:8088`. Na de eerste sync (binnen een paar seconden) staat de voortgang erop.
5. Logs bekijken: Container Manager → Project → funkyorbit → sync. Je ziet daar elk uur `OK: 15/911 patronen, 2 video's`.

### Bijwerken na een wijziging in de code
```sh
cd /volume1/docker/funkyorbit && git pull
```
Wijzigingen in `site/` zijn direct zichtbaar. Na een wijziging in `sync.py` of `likes.py`: herstart het project in Container Manager.

## funkyorbit.nl bereikbaar maken (Cloudflare Tunnel)

Zo hoef je geen poorten open te zetten in je router en blijft je thuis-IP verborgen.

1. Zet funkyorbit.nl op Cloudflare (gratis plan): voeg het domein toe en verander de nameservers bij je registrar.
2. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create tunnel** (type *Cloudflared*). Kopieer het token.
3. Maak in de projectmap een bestand `.env` met `TUNNEL_TOKEN=<token>`.
4. Haal in `docker-compose.yml` de `#` weg bij de `tunnel`-service en herstart het project.
5. In de tunnel: **Public hostname** `funkyorbit.nl` → service `http://web:80`.

## Lokaal testen zonder Google

```sh
DONE_CSV=testdata/done.csv PROGRESS_CSV=testdata/progress.csv OUT_FILE=data/data.json INTERVAL=0 python3 sync/sync.py
DB_FILE=data/likes.db DATA_FILE=data/data.json PORT=8000 python3 likes/likes.py
```

## Later toevoegen
- Zoeken/filteren op siteswap (de lijst met alle patronen staat al in `data.json`).
