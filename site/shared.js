/* Funky Orbit — helpers shared by all pages (window.FO). */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = new Intl.NumberFormat("en-GB");
  const CLUB = { W: ["w", "white"], B: ["b", "blue"], O: ["o", "orange"], R: ["r", "pink"] };
  const SYNC_THROW = /[0-9a-oq-z]p?/g;

  function boxes(throws, colors) {
    // Each throw gets the colour of the club it throws, from the "Kleuren" tabs of the Sheet.
    return throws.map((t, i) => {
      const c = colors && CLUB[colors[i]];
      return `<b class="${c ? "c-" + c[0] : ""}"${c ? ` title="${c[1]} club"` : ""}>${esc(t)}</b>`;
    }).join("");
  }

  function siteswap(ss, size, colors) {
    return `<span class="ss ${size}" aria-label="siteswap ${esc(ss)}">${boxes([...ss], colors)}</span>`;
  }

  // Who throws which part of a sync pattern: juggler A is on the left in our videos, B on the right.
  const JUGGLERS = ["Mees · left", "Piet · right"];

  // Sync pattern: juggler A | juggler B, throws like "4p" in one box. With `named`, each part gets its juggler.
  function syncPattern(a, b, size, colors, named) {
    const ta = a.toLowerCase().match(SYNC_THROW) || [a];
    const tb = (b || "").toLowerCase().match(SYNC_THROW) || [];
    const part = (t, c, i) => {
      const body = `${i ? '<i class="sep" aria-hidden="true"></i>' : ""}${boxes(t, c)}`;
      return named
        ? `<span class="jug named"><span class="jug-throws">${body}</span><small>${JUGGLERS[i]}</small></span>`
        : `<span class="jug">${body}</span>`;
    };
    return `<span class="ss sync ${size}" aria-label="sync ${esc(a)} ${esc(b)}">${part(ta, colors && colors[0], 0)}` +
      (tb.length ? part(tb, colors && colors[1], 1) : "") + `</span>`;
  }


  // A siteswap is cyclic, so 6966 also finds 9666: search in the pattern written twice.
  function cyclicIncludes(ss, q) {
    ss = (ss || "").toLowerCase();
    return !!q && q.length <= ss.length && (ss + ss).includes(q);
  }

  function updated(iso) {
    if (!iso) return "";
    return "Updated " + new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // ---------- rating, date, video player ----------
  const PREVIEW = !!window.FUNKY_PREVIEW; // no YouTube embeds and no API in the preview

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

  // ---------- likes: one per visitor (cookie + localStorage), counted by the likes API ----------
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
  let state = { counts: {}, liked: new Set() };
  const heart = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.4 3.5 4.1 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" stroke-linejoin="round"/></svg>`;

  const likes = {
    button(id) {
      const on = state.liked.has(id);
      return `<button type="button" class="like" data-like="${id}" aria-pressed="${on}" aria-label="${on ? "Remove like" : "Like this video"}">${heart}<span>${state.counts[id] || 0}</span></button>`;
    },
    async load() {
      if (PREVIEW) {
        try { state.liked = new Set(JSON.parse(localStorage.getItem("fo_liked") || "[]")); } catch (e) {}
        state.liked.forEach((id) => (state.counts[id] = 1));
        return;
      }
      try {
        const r = await fetch(`/api/likes?visitor=${encodeURIComponent(VISITOR)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        state = { counts: j.counts || {}, liked: new Set(j.liked || []) };
      } catch (e) { /* without the API, just no counters */ }
    },
    async toggle(id) {
      const on = !state.liked.has(id);
      // update right away (every button for this video), then confirm with the server
      on ? state.liked.add(id) : state.liked.delete(id);
      state.counts[id] = Math.max(0, (state.counts[id] || 0) + (on ? 1 : -1));
      const redraw = () => document.querySelectorAll(`[data-like="${id}"]`).forEach((b) => (b.outerHTML = likes.button(id)));
      redraw();
      if (PREVIEW) {
        try { localStorage.setItem("fo_liked", JSON.stringify([...state.liked])); } catch (e) {}
        return;
      }
      try {
        const r = await fetch("/api/like", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video: id, visitor: VISITOR, liked: on }),
        });
        if (r.ok) { state.counts[id] = (await r.json()).count; redraw(); }
      } catch (e) {}
    },
  };

  document.addEventListener("click", (ev) => {
    const like = ev.target.closest("[data-like]");
    if (like) { likes.toggle(like.dataset.like); return; }
    const play = ev.target.closest("[data-play]");
    if (play) {
      play.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${play.dataset.play}?autoplay=1&playsinline=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  });

  window.FO = { esc, fmt, CLUB, siteswap, syncPattern, cyclicIncludes, updated, stars, when, player, likes };
})();
