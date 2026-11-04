/* Funky Orbit — map of the places where we filmed our patterns, on the Stats page (#56; data.json -> "locations"). */
(function () {
  "use strict";

  const { esc, fmt, stars, when, likes, initPopup, openPattern, patternHtml, clubIcon, videoIcon, track } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const MIN_PIN = 44, MAX_PIN = 96, MERGE_PX = 72; // height of a pin in pixels; closer together than MERGE_PX: one pin
  let map, places = [], maxCount = 1, pins = [];

  // Pin size follows the square root of the count, so 4× as many patterns gives a pin about 2× as big
  const pinHeight = (n) => Math.round(Math.min(MAX_PIN * 1.2, Math.max(MIN_PIN, MAX_PIN * Math.sqrt(n / maxCount))));

  function pinIcon(n) {
    const h = pinHeight(n), w = Math.max(28, Math.round(h * 0.42));
    return L.divIcon({
      className: "club-pin", iconSize: [w, h], iconAnchor: [w / 2, h],
      html: `${clubIcon("W")}<b style="--pin-font:${Math.max(12, Math.round(h / 7))}px">${n}</b>`,
    });
  }

  // Greedy: the biggest locations first, each joins the first pin close enough at this zoom. Never one pin per pattern.
  function clusters() {
    const zoom = map.getZoom(), out = [];
    for (const place of [...places].sort((a, b) => b.rows.length - a.rows.length)) {
      const at = map.project([place.lat, place.lng], zoom);
      const near = out.find((c) => c.at.distanceTo(at) < MERGE_PX);
      if (near) near.places.push(place);
      else out.push({ at, places: [place] });
    }
    return out;
  }

  function draw() {
    pins.forEach((m) => m.remove());
    pins = clusters().map((c) => {
      const n = c.places.reduce((sum, p) => sum + p.rows.length, 0);
      const latlng = [
        c.places.reduce((sum, p) => sum + p.lat * p.rows.length, 0) / n,
        c.places.reduce((sum, p) => sum + p.lng * p.rows.length, 0) / n,
      ];
      const title = c.places.length > 1 ? `${c.places.length} places, ${n} patterns` : `${c.places[0].name}, ${n} pattern${n === 1 ? "" : "s"}`;
      return L.marker(latlng, { icon: pinIcon(n), title, alt: title, riseOnHover: true, zIndexOffset: n }).on("click", () => clickPin(c.places)).addTo(map);
    });
  }

  // One location: its list. More: zoom in until they split, or the list of all when zooming in cannot split them.
  function clickPin(group) {
    if (group.length > 1) {
      const bounds = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
      if (!bounds.getNorthEast().equals(bounds.getSouthWest()) && map.getZoom() < map.getMaxZoom()) {
        closeList();
        map.flyToBounds(bounds, { padding: [90, 90], maxZoom: map.getMaxZoom(), duration: 0.6 });
        return;
      }
    }
    openList(group);
  }

  function openList(group) {
    const box = $("#map-list");
    const n = group.reduce((sum, p) => sum + p.rows.length, 0);
    const list = (p) => `<ul class="rows">${p.rows.map((r) => `<li class="row" data-nr="${esc(r.nr)}" data-key="${esc(r.key)}" role="button" tabindex="0" aria-label="${esc(r.siteswap)}: show details">
        <span class="row-pat">${patternHtml(r.key, "sm", r.siteswap)}</span>
        <span class="row-sub">${stars(r.rating)}<span class="when">${esc(when(r))}</span></span>
        ${videoIcon(r)}</li>`).join("")}</ul>`;
    box.innerHTML = `<header><h2>${esc(group.length > 1 ? `${group.length} places` : group[0].name)}<br><small class="label">${n} pattern${n === 1 ? "" : "s"}</small></h2>
      <button type="button" class="close" aria-label="Close the list">✕</button></header>
      ${group.map((p) => (group.length > 1 ? `<h3>${esc(p.name)}</h3>` : "") + list(p)).join("")}`;
    box.hidden = false;
    box.scrollTop = 0;
    track("Open location", { location: group.map((p) => p.name).join(", ") });
  }
  function closeList() { $("#map-list").hidden = true; }

  function rowFrom(el) {
    for (const place of places) {
      const row = place.rows.find((r) => r.nr === el.dataset.nr);
      if (row) return row;
    }
    return null;
  }
  $("#map-list").addEventListener("click", (ev) => {
    if (ev.target.closest(".close")) return closeList();
    const el = ev.target.closest("[data-nr]");
    if (el) openPattern(el.dataset.key, { row: rowFrom(el) });
  });
  $("#map-list").addEventListener("keydown", (ev) => {
    const el = ev.target.closest("[data-nr]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openPattern(el.dataset.key, { row: rowFrom(el) }); }
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !document.querySelector("dialog[open]")) closeList(); });

  function note(text) {
    $("#map-note").textContent = text;
    $("#map-note").hidden = !text;
  }

  // stats.js calls this with the data it already has
  window.FO.startMap = function (data) {
    initPopup(data);
    likes.load();
    places = (data.locations || []).map((l) => {
      const nrs = new Set(l.nrs);
      return { ...l, rows: (data.patterns || []).filter((p) => nrs.has(p.nr)) }; // Done is newest first
    }).filter((p) => p.rows.length);
    const total = places.reduce((sum, p) => sum + p.rows.length, 0);
    maxCount = Math.max(1, ...places.map((p) => p.rows.length));
    $("#map-count").textContent = `${fmt.format(places.length)} place${places.length === 1 ? "" : "s"} · ${fmt.format(total)} pattern${total === 1 ? "" : "s"}`;

    map = L.map("map", { worldCopyJump: true, zoomSnap: 0.5 });
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Offline (the web app in a sports hall): the pins and lists still work, only the map itself is missing
    tiles.on("tileerror", () => note("The map itself cannot be loaded right now (are you offline?). The clubs and their patterns still work."));
    tiles.on("tileload", () => note(""));
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    if (places.length) map.fitBounds(places.map((p) => [p.lat, p.lng]), { padding: [60, 60], maxZoom: 14 });
    else map.setView([51.5, 6], 5);
    map.on("zoomend", draw);
    draw();
  };
})();
