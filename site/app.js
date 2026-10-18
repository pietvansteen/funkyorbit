/* Funky Orbit — reads data.json (refreshed hourly by the sync) and the likes API. */
(function () {
  "use strict";

  const PREVIEW = !!window.FUNKY_PREVIEW; // no YouTube embeds and no API in the preview
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = new Intl.NumberFormat("en-GB");

  // ---------- visitor ID (cookie + localStorage), for "one like per visitor" ----------
  function visitorId() {
    let id = null;
    const m = document.cookie.match(/(?:^|;\s*)fo_visitor=([A-Za-z0-9-]{8,64})/);
    if (m) id = m[1];
    if (!id) { try { id = localStorage.getItem("fo_visitor"); } catch (e) {} }
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
    }
    try { localStorage.setItem("fo_visitor", id); } catch (e) {}
    try { document.cookie = `fo_visitor=${id}; max-age=${60 * 60 * 24 * 400}; path=/; samesite=lax`; } catch (e) {}
    return id;
  }
  const VISITOR = visitorId();

  // ---------- formatting helpers ----------
  function siteswap(ss, size) {
    // When passing with 2 jugglers (global notation), odd throws are passes.
    const cells = [...ss].map((ch) => {
      const v = parseInt(ch, 36);
      const pass = !isNaN(v) && v % 2 === 1;
      return `<b class="${pass ? "p" : ""}" title="${pass ? "pass" : "self"} (${isNaN(v) ? ch : v})">${esc(ch)}</b>`;
    });
    return `<span class="ss ${size}" aria-label="siteswap ${esc(ss)}">${cells.join("")}</span>`;
  }

  function stars(r) {
    if (r == null) return `<span class="unrated">not rated yet</span>`;
    const pct = Math.max(0, Math.min(100, (r / 5) * 100));
    return `<span class="stars" style="--pct:${pct}%" role="img" aria-label="${r} out of 5 stars" title="${r} / 5"></span>`;
  }

  function when(p) {
    if (!p.date) return "";
    const d = new Date(p.date + "T12:00:00");
    const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return p.time ? `${day} · ${p.time}` : day;
  }

  function splitGroup(name) {
    const i = name.indexOf(" - ");
    return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, ""];
  }

  // ---------- progress ----------
  function renderHero(d) {
    const pct = d.total ? (d.done / d.total) * 100 : 0;
    $("#hero").innerHTML = `
      <span class="label">Project Funky Orbit · passing patterns</span>
      <h1 class="num">${fmt.format(d.done)}<span class="of">of ${fmt.format(d.total)} patterns</span></h1>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.done}" aria-label="Total progress"><i style="width:${pct}%"></i></div>
      <p><strong>${pct.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%</strong> thrown. We are working our way through a list of ${fmt.format(d.total)} club passing patterns for two jugglers: zaps, standard patterns and sync. Every pattern we land goes on the list, and as many as possible on video too.</p>
      <dl class="facts">
        <div><dt>videos</dt><dd>${d.stats.videos}</dd></div>
        <div><dt>practice days</dt><dd>${d.stats.recordingDays}</dd></div>
        <div><dt>avg. rating</dt><dd>${d.stats.averageRating != null ? d.stats.averageRating + " ★" : "–"}</dd></div>
        <div><dt>last session</dt><dd>${d.stats.lastDate ? new Date(d.stats.lastDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–"}</dd></div>
      </dl>`;
  }

  let groupFilter = "All";
  const openGroups = new Set();

  function renderGroups(d) {
    const families = ["All", ...new Set(d.groups.map((g) => splitGroup(g.name)[0]))];
    $("#chips").innerHTML = families.map((f) =>
      `<button type="button" class="chip" aria-pressed="${f === groupFilter}" data-f="${esc(f)}">${esc(f)}</button>`).join("");

    const shown = d.groups.filter((g) => groupFilter === "All" || splitGroup(g.name)[0] === groupFilter);
    $("#groups").innerHTML = shown.map((g) => {
      const [fam, sub] = splitGroup(g.name);
      const open = openGroups.has(g.name);
      const dots = Array.from({ length: g.total }, (_, i) => `<i class="${i < g.done ? "on" : ""}"></i>`).join("");
      const cats = g.categories.map((c) => {
        const p = c.total ? (c.done / c.total) * 100 : 0;
        return `<div class="cat"><span>${esc(c.name)}</span>
          <div class="bar sm"><i class="${c.done ? "some" : ""}" style="width:${p}%"></i></div>
          <span class="n"><b>${c.done}</b>/${c.total}</span></div>`;
      }).join("");
      const id = "g-" + g.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      return `<div class="group" open-state="${open ? 1 : 0}">
        <button type="button" aria-expanded="${open}" aria-controls="${id}" data-g="${esc(g.name)}">
          <span class="g-name">${esc(fam)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
          <span class="g-count">${g.done} <span>/ ${g.total}</span>
            <svg class="chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          <span class="dots" aria-hidden="true">${dots}</span>
        </button>
        <div class="cats" id="${id}" ${open ? "" : "hidden"}>${cats}</div>
      </div>`;
    }).join("");

    const catSum = d.groups.reduce((n, g) => n + g.total, 0);
    const extra = catSum - d.total;
    $("#groups-note").hidden = extra <= 0;
    $("#groups-note").textContent = extra > 0
      ? `${extra} patterns fit in two categories, so they are counted twice in this overview. In total there are ${fmt.format(d.total)} unique patterns.`
      : "";
  }

  // ---------- video feed ----------
  let likes = { counts: {}, liked: new Set() };

  function heart() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.4 3.5 4.1 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" stroke-linejoin="round"/></svg>`;
  }

  function likeButton(id) {
    const on = likes.liked.has(id);
    const n = likes.counts[id] || 0;
    return `<button type="button" class="like" data-like="${id}" aria-pressed="${on}" aria-label="${on ? "Remove like" : "Like this video"}">${heart()}<span>${n}</span></button>`;
  }

  function player(p) {
    const url = p.isShort ? `https://www.youtube.com/shorts/${p.youtubeId}` : `https://www.youtube.com/watch?v=${p.youtubeId}`;
    const play = `<span><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>`;
    const poster = `<div class="poster">${esc(p.siteswap)}<small>${esc(p.name || p.family)}</small></div>`;
    const img = PREVIEW ? "" : `<img src="https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">`;
    const btn = PREVIEW
      ? `<a class="play" href="${url}" target="_blank" rel="noopener" aria-label="Watch ${esc(p.siteswap)} on YouTube">${play}</a>`
      : `<button type="button" class="play" data-play="${p.youtubeId}" aria-label="Play video of ${esc(p.siteswap)}">${play}</button>`;
    return `<div class="player ${p.isShort ? "" : "wide"}">${poster}${img}${btn}</div>`;
  }

  function renderFeed(d) {
    const vids = d.patterns.filter((p) => p.youtubeId);
    $("#feed-count").textContent = `${vids.length} video${vids.length === 1 ? "" : "s"}, newest first`;
    $("#feed").innerHTML = vids.length ? vids.map((p) => `
      <article class="card">
        ${player(p)}
        <div class="meta">
          <div class="meta-top">
            <div class="title">${siteswap(p.siteswap, "lg")}${p.name ? `<span class="pname">${esc(p.name)}</span>` : ""}</div>
            ${likeButton(p.youtubeId)}
          </div>
          <span class="fam">${esc(p.family)}</span>
          <div class="meta-bottom">${stars(p.rating)}<span class="when">${esc(when(p))}</span></div>
        </div>
      </article>`).join("") : `<p class="empty">No videos yet. Check back soon!</p>`;

    const rest = d.patterns.filter((p) => !p.youtubeId);
    $("#rest-wrap").hidden = !rest.length;
    $("#rest").innerHTML = rest.map((p) => `<tr>
      <td>${siteswap(p.siteswap, "sm")}</td><td>${esc(p.name)}</td><td>${esc(p.family)}</td>
      <td>${stars(p.rating)}</td><td class="num">${esc(when(p))}</td></tr>`).join("");
  }

  // ---------- likes ----------
  async function loadLikes() {
    if (PREVIEW) {
      try { likes.liked = new Set(JSON.parse(localStorage.getItem("fo_liked") || "[]")); } catch (e) {}
      likes.liked.forEach((id) => (likes.counts[id] = 1));
      return;
    }
    try {
      const r = await fetch(`api/likes?visitor=${encodeURIComponent(VISITOR)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      likes = { counts: j.counts || {}, liked: new Set(j.liked || []) };
    } catch (e) { /* without the API, just no counters */ }
  }

  async function toggleLike(btn) {
    const id = btn.dataset.like;
    const on = !likes.liked.has(id);
    // update right away, then confirm with the server
    on ? likes.liked.add(id) : likes.liked.delete(id);
    likes.counts[id] = Math.max(0, (likes.counts[id] || 0) + (on ? 1 : -1));
    btn.outerHTML = likeButton(id);
    if (PREVIEW) {
      try { localStorage.setItem("fo_liked", JSON.stringify([...likes.liked])); } catch (e) {}
      return;
    }
    try {
      const r = await fetch("api/like", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: id, visitor: VISITOR, liked: on }),
      });
      if (r.ok) {
        const j = await r.json();
        likes.counts[id] = j.count;
        const b = document.querySelector(`[data-like="${id}"]`);
        if (b) b.outerHTML = likeButton(id);
      }
    } catch (e) {}
  }

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-f]");
    if (chip) { groupFilter = chip.dataset.f; renderGroups(DATA); return; }
    const g = ev.target.closest("[data-g]");
    if (g) {
      const name = g.dataset.g;
      openGroups.has(name) ? openGroups.delete(name) : openGroups.add(name);
      renderGroups(DATA);
      const again = document.querySelector(`[data-g="${CSS.escape(name)}"]`);
      if (again) again.focus();
      return;
    }
    const like = ev.target.closest("[data-like]");
    if (like) { toggleLike(like); return; }
    const play = ev.target.closest("[data-play]");
    if (play) {
      const id = play.dataset.play;
      const box = play.parentElement;
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  });

  // ---------- start ----------
  let DATA = null;

  async function start() {
    try {
      DATA = window.FUNKY_DATA || (await (await fetch("data.json", { cache: "no-cache" })).json());
    } catch (e) {
      $("#hero").innerHTML = `<p class="empty">Progress could not be loaded. Please try again in a few minutes.</p>`;
      return;
    }
    if (DATA.updated) {
      const u = new Date(DATA.updated);
      $("#updated").textContent = "Updated " + u.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    renderHero(DATA);
    renderGroups(DATA);
    await loadLikes();
    renderFeed(DATA);
  }
  start();
})();
