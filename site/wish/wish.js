/* Funky Orbit — Wish Tricks (#61): wish for a pattern without a video. The wishing itself is in shared.js (FO.wishes). */
(function () {
  "use strict";

  const { esc, siteswap, syncPattern, cyclicIncludes, localSiteswap, nameLinks, difficulty, initPopup, openPattern, doneRow, likes, trackSearch, wishes, updated } = window.FO;
  const $ = (sel) => document.querySelector(sel);
  const STEP = 60;

  let ITEMS = [], FILMED = [], query = "", shown = STEP, maxScore = 0;

  const label = (p) => p.ss || `${p.a} | ${p.b}`;
  const patHtml = (p) => (p.ss ? siteswap(p.ss, "sm", p.colors) : syncPattern(p.a, p.b, "sm", p.colors));

  // the same search as All patterns: siteswap in any rotation, local siteswap, family, name
  function found(p, q) {
    if (!q) return true;
    const qs = q.replace(/\s+/g, "");
    if (p.ss ? cyclicIncludes(p.ss, qs) || cyclicIncludes(localSiteswap(p.ss), qs)
      : [p.a, p.b, p.a + p.b, p.alt].some((s) => s && s.toLowerCase().replace(/\s+/g, "").includes(qs))) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.family || "").toLowerCase().includes(q);
  }

  function row(p) {
    const n = wishes.count(p.key), mine = wishes.has(p.key);
    return `<li class="wish-row">
      <button type="button" class="wish-open" data-open="${esc(p.key)}" aria-label="${esc(label(p))}: show details">
        ${patHtml(p)}
        <small>${p.name ? `${esc(p.name)} · ` : ""}${esc(p.family)}</small>
      </button>
      <div class="wish-meta cols">
        <span class="wish-stars">${p.stars != null ? difficulty(p, maxScore, false) : ""}</span>
        <span class="wish-n" title="${n ? wishes.by(p.key).replace(/"/g, "&quot;") : ""}">${n ? wishes.word(n) : ""}</span>
        <button type="button" class="wish-go" data-wish="${esc(p.key)}"${mine ? " disabled" : ""}>${mine ? "Wished ✨" : "Wish ✨"}</button>
      </div></li>`;
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const list = ITEMS.filter((p) => found(p, q))
      .sort((a, b) => wishes.order(a.key, b.key)); // as Most wished; the rest keeps the order of the list
    $("#count").textContent = `${list.length} not thrown yet`;
    $("#list").innerHTML = list.length ? list.slice(0, shown).map(row).join("")
      : `<li class="wish-row">No pattern we still have to throw matches “${esc(query.trim())}”.</li>`;
    $("#more").hidden = list.length <= shown;
    // already thrown: no wish needed, just a link to the video, or the news that it is coming
    const filmed = q ? FILMED.filter((p) => found(p, q)).slice(0, 5) : [];
    $("#filmed").innerHTML = filmed.length ? `<ul class="wish-list">${filmed.map((p) => `<li class="wish-row">
      <button type="button" class="wish-open" data-open="${esc(p.key)}" aria-label="${esc(label(p))}: show details">${patHtml(p)}<small>${esc(p.family)}</small></button>
      <div class="wish-meta">${doneRow(p.key).youtubeId
        ? `<span>Already filmed!</span><button type="button" class="wish-go quiet" data-open="${esc(p.key)}">Watch the video</button>`
        : `<span class="wish-soon">Thrown, video coming soon</span>`}</div></li>`).join("")}</ul>` : "";
    try {
      const url = new URL(location.href);
      query.trim() ? url.searchParams.set("q", query.trim()) : url.searchParams.delete("q");
      url.searchParams.delete("open");
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  function renderMine(byKey) {
    const mine = wishes.list().slice().reverse();
    $("#mine-section").hidden = !mine.length;
    $("#mine").innerHTML = mine.map((w) => {
      const p = byKey.get(w.key), done = doneRow(w.key);
      if (!p) return "";
      const status = done && done.youtubeId ? "Video online!" : done ? "Thrown, video coming soon" : "Waiting";
      const via = (w.via || []).join(" and ");
      return `<li class="wish-row">
        <button type="button" class="wish-open" data-open="${esc(w.key)}" aria-label="${esc(label(p))}: show details">${patHtml(p)}<small>${esc(p.family)}</small></button>
        <div class="wish-meta"><span${done ? ' class="wish-soon"' : ""}>${status}</span>${via ? `<span>by ${esc(via)}</span>` : ""}
          <button type="button" class="wish-go quiet" data-remove="${esc(w.key)}">Remove</button></div></li>`;
    }).join("");
  }

  function renderTop() {
    const html = wishes.topHtml(10);
    $("#top-section").hidden = !html;
    $("#top").innerHTML = html;
  }

  $("#q").addEventListener("input", (ev) => { query = ev.target.value; shown = STEP; trackSearch(query); renderList(); });
  $("#more").addEventListener("click", () => { shown += STEP; renderList(); });
  document.addEventListener("click", (ev) => {
    const rm = ev.target.closest("[data-remove]");
    if (rm) { wishes.remove(rm.dataset.remove); return; }
    if (ev.target.closest("[data-wish]") || ev.target.closest("a")) return;
    const open = ev.target.closest("[data-open]");
    if (open) openPattern(open.dataset.open);
  });

  (async function init() {
    let d;
    try {
      d = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#list").innerHTML = `<li class="wish-row">The patterns could not be loaded. Please try again in a moment.</li>`;
      return;
    }
    const upd = document.getElementById("updated");
    if (upd) upd.textContent = updated(d.updated);
    initPopup(d);
    await likes.load();
    const seen = new Set(), byKey = new Map();
    for (const p of d.all || []) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      byKey.set(p.key, p);
      maxScore = Math.max(maxScore, p.score || 0);
      const row0 = doneRow(p.key); // thrown: not wishable, also without a video yet
      (row0 ? FILMED : ITEMS).push(p);
    }
    const params = new URLSearchParams(location.search);
    query = params.get("q") || "";
    $("#q").value = query;
    const paint = () => { renderTop(); renderMine(byKey); renderList(); };
    const openKey = params.get("open");
    document.addEventListener("fo-wishes", paint);
    paint();
    if (openKey && byKey.has(openKey)) openPattern(openKey);
  })();
})();
