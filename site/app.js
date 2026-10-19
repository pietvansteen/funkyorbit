/* Funky Orbit — reads data.json (refreshed hourly by the sync) and the likes API. */
(function () {
  "use strict";

  const PREVIEW = !!window.FUNKY_PREVIEW; // no YouTube embeds and no API in the preview
  const $ = (sel, el = document) => el.querySelector(sel);
  const { esc, fmt, siteswap, cyclicIncludes } = window.FO;

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
      <span class="label">Project Funky Orbit by Piet &amp; Mees</span>
      <h1 class="num">${fmt.format(d.done)}<span class="of">of ${fmt.format(d.total)} patterns · ${pct.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%</span></h1>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${d.total}" aria-valuenow="${d.done}" aria-label="Total progress"><i style="width:${pct}%"></i></div>
      <div class="hero-body">
      <p>We are passing all ${fmt.format(d.total)} club patterns from James Francis' <a href="https://docs.google.com/spreadsheets/d/1NpMVAcPrU1GTDfDsnxD0ERQxB7KFjGT_iaI7GU5Sw_Q/edit?usp=sharing" target="_blank" rel="noopener">list</a>, which many jugglers did before us (Brook almost finished it!). Our goal: every pattern for at least 2 rounds (3 for period 3), recorded on video. Follow along and cheer us on!</p>
      <dl class="facts">
        <div><dt>videos</dt><dd>${d.stats.videos}</dd></div>
        <div><dt>practice days</dt><dd>${d.stats.recordingDays}</dd></div>
        <div><dt>avg. rating</dt><dd>${d.stats.averageRating != null ? d.stats.averageRating + " ★" : "–"}</dd></div>
        <div><dt>last session</dt><dd>${d.stats.lastDate ? new Date(d.stats.lastDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–"}</dd></div>
      </dl>
      </div>`;
  }

  // Top level: Period 3 / 5 / 7 and Sync (from the Statistics block), each opening its groups.
  let openTile = null;

  function tileOf(groupName) {
    if (groupName === "Sync" || groupName.startsWith("Sync ")) return "Sync";
    const m = splitGroup(groupName)[1].match(/^Period \d+$/);
    return m ? m[0] : "Other periods";
  }

  function tiles(d) {
    const out = (d.summary || []).map((t) => ({ ...t }));
    const names = new Set(out.map((t) => t.name));
    for (const g of d.groups) {
      const name = tileOf(g.name);
      if (names.has(name)) continue;
      let t = out.find((x) => x.name === name && x.fromGroups);
      if (!t) { t = { name, total: 0, done: 0, fromGroups: true }; out.push(t); }
      t.total += g.total; t.done += g.done;
    }
    return out;
  }

  function renderGroups(d) {
    $("#tiles").innerHTML = tiles(d).map((t) => {
      const p = t.total ? (t.done / t.total) * 100 : 0;
      const open = openTile === t.name;
      return `<button type="button" class="tile" data-tile="${esc(t.name)}" aria-expanded="${open}" aria-controls="detail">
        <span class="t-name">${esc(t.name)}</span>
        <span class="t-count"><b>${fmt.format(t.done)}</b> / ${fmt.format(t.total)}</span>
        <span class="bar sm"><i class="${t.done ? "some" : ""}" style="width:${p}%"></i></span>
        <svg class="chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>`;
    }).join("");

    const detail = $("#detail");
    detail.hidden = !openTile;
    if (!openTile) { detail.innerHTML = ""; return; }
    const shown = d.groups.filter((g) => tileOf(g.name) === openTile);
    const blocks = shown.map((g) => {
      const [fam, sub] = splitGroup(g.name);
      const title = shown.length > 1 || sub ? fam : g.name;
      const cats = g.categories.map((c) => {
        const p = c.total ? (c.done / c.total) * 100 : 0;
        return `<div class="cat"><span>${esc(c.name)}</span>
          <div class="bar sm"><i class="${c.done ? "some" : ""}" style="width:${p}%"></i></div>
          <span class="n"><b>${c.done}</b>/${c.total}</span></div>`;
      }).join("");
      return `<div class="block"><h3>${esc(title)} <span>${g.done} / ${g.total}</span></h3>${cats}</div>`;
    }).join("");
    const catSum = d.groups.reduce((n, g) => n + g.total, 0);
    const extra = catSum - d.total;
    const note = extra > 0
      ? `<p class="note">${extra} patterns fit in two categories, so they are counted twice in the category lists. In total there are ${fmt.format(d.total)} unique patterns.</p>`
      : "";
    detail.innerHTML = blocks + note;
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

  // ---------- search ----------
  let query = "";

  function matches(p, q) {
    if (!q) return true;
    // A siteswap is cyclic, so 6966 also finds 9666: search in the pattern written twice.
    if (cyclicIncludes(p.siteswap, q.replace(/\s+/g, ""))) return true;
    return (p.name || "").toLowerCase().includes(q);
  }

  function renderFeed(d) {
    const q = query.trim().toLowerCase();
    const allVids = d.patterns.filter((p) => p.youtubeId);
    const vids = allVids.filter((p) => matches(p, q));
    const plural = (n) => `${n} video${n === 1 ? "" : "s"}`;
    $("#feed-count").textContent = q
      ? `${vids.length} of ${plural(allVids.length)} match`
      : `${plural(allVids.length)}, newest first`;
    const restMatch = d.patterns.some((p) => !p.youtubeId && matches(p, q));
    const none = q
      ? `<p class="empty">No video matches “${esc(query.trim())}”${restMatch ? " yet, but it has been thrown: see the list below." : "."}</p>`
      : `<p class="empty">No videos yet. Check back soon!</p>`;
    $("#feed").innerHTML = vids.length ? vids.map((p) => `
      <article class="card">
        ${player(p)}
        <div class="meta">
          <div class="meta-top">
            <div class="title">${siteswap(p.siteswap, "lg", p.colors)}${p.name ? `<span class="pname">${esc(p.name)}</span>` : ""}</div>
            ${likeButton(p.youtubeId)}
          </div>
          <span class="fam">${esc(p.family)}</span>
          <div class="meta-bottom">${stars(p.rating)}<span class="when">${esc(when(p))}</span></div>
        </div>
      </article>`).join("") : none;

    const rest = d.patterns.filter((p) => !p.youtubeId && matches(p, q));
    $("#rest-wrap").hidden = !rest.length;
    $("#rest").innerHTML = rest.map((p) => `<tr>
      <td>${siteswap(p.siteswap, "sm", p.colors)}</td><td>${esc(p.name)}</td><td>${esc(p.family)}</td>
      <td>${stars(p.rating)}</td><td class="num">${esc(when(p))}</td></tr>`).join("");
  }

  // ---------- funny stats (every block of the Statistics area in the Sheet) ----------
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };

  function niceValue(v) {
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/yyyy from the Sheet
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return v;
  }

  function statBlock(b, d) {
    const cols = b.columns.map((c) => c.toLowerCase());
    const iTotal = cols.indexOf("total"), iDone = cols.indexOf("done");
    if (iTotal >= 0 && iDone >= 0) {
      // progress-like rows; the ones already shown as tiles at the top are left out
      const skip = new Set(["all patterns", ...(d.summary || []).map((t) => t.name.toLowerCase())]);
      const rows = b.rows.filter((r) => !skip.has(r[0].toLowerCase()));
      if (!rows.length) return "";
      return `<div class="stat-card"><h3>Patterns with…</h3>${rows.map((r) => {
        const total = num(r[iTotal + 1]) || 0, done = num(r[iDone + 1]) || 0;
        const p = total ? (done / total) * 100 : 0;
        return `<div class="cat"><span>${esc(r[0].replace(/^patterns with /i, ""))}</span>
          <div class="bar sm"><i class="${done ? "some" : ""}" style="width:${p}%"></i></div>
          <span class="n"><b>${done}</b>/${total}</span></div>`;
      }).join("")}</div>`;
    }
    const numeric = b.rows.filter((r) => num(r[1]) !== null);
    if (cols[0] !== "value" && numeric.length >= 2) {
      // a small bar chart, e.g. videos per weekday; text rows become a highlight line
      const max = Math.max(1, ...numeric.map((r) => num(r[1])));
      const notes = b.rows.filter((r) => num(r[1]) === null);
      return `<div class="stat-card"><h3>${esc(b.title)}</h3>${numeric.map((r) =>
        `<div class="hbar"><span>${esc(r[0])}</span><span class="track"><i style="width:${(num(r[1]) / max) * 100}%"></i></span><b>${esc(r[1])}</b></div>`).join("")}
        ${notes.map((r) => `<p class="stat-note">${esc(r[0])}: <b>${esc(r[1])}</b></p>`).join("")}</div>`;
    }
    return `<div class="stat-card wide"><h3>${esc(b.title)}</h3><dl class="stat-grid">${b.rows.map((r) =>
      `<div><dt>${esc(r[0])}</dt><dd>${esc(niceValue(r[1] ?? ""))}</dd></div>`).join("")}</dl></div>`;
  }

  function renderStats(d) {
    const parts = (d.statBlocks || []).map((b) => statBlock(b, d)).filter(Boolean);
    // the block with key figures first, the smaller cards side by side below it
    const html = [...parts.filter((h) => h.includes("stat-card wide")), ...parts.filter((h) => !h.includes("stat-card wide"))].join("");
    $("#stats-wrap").hidden = !html;
    $("#stats").innerHTML = html;
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
  $("#search").addEventListener("input", (ev) => {
    query = ev.target.value;
    try {
      const url = new URL(location.href);
      query.trim() ? url.searchParams.set("q", query.trim()) : url.searchParams.delete("q");
      history.replaceState(null, "", url);
    } catch (e) {}
    if (DATA) renderFeed(DATA);
  });

  document.addEventListener("click", (ev) => {
    const tile = ev.target.closest("[data-tile]");
    if (tile) {
      const name = tile.dataset.tile;
      openTile = openTile === name ? null : name;
      renderGroups(DATA);
      const again = document.querySelector(`[data-tile="${CSS.escape(name)}"]`);
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
      $("#updated").textContent = window.FO.updated(DATA.updated);
    }
    query = new URLSearchParams(location.search).get("q") || "";
    $("#search").value = query;
    renderHero(DATA);
    renderGroups(DATA);
    renderStats(DATA);
    await loadLikes();
    renderFeed(DATA);
  }
  start();
})();
