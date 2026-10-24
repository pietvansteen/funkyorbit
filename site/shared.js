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

  // Who throws which part of a sync pattern: the first part is juggler 1, the second juggler 2.
  const JUGGLERS = ["Juggler 1", "Juggler 2"];

  // Sync pattern: juggler A | juggler B, throws like "4p" in one box. With `named`, each part gets its juggler:
  // true for "Juggler 1" / "Juggler 2", or a pair of names.
  function syncPattern(a, b, size, colors, named) {
    const names = Array.isArray(named) ? named : JUGGLERS;
    const ta = a.toLowerCase().match(SYNC_THROW) || [a];
    const tb = (b || "").toLowerCase().match(SYNC_THROW) || [];
    const part = (t, c, i) => {
      const body = `${i ? '<i class="sep" aria-hidden="true"></i>' : ""}${boxes(t, c)}`;
      return named
        ? `<span class="jug named"><span class="jug-throws">${body}</span><small>${esc(names[i])}</small></span>`
        : `<span class="jug">${body}</span>`;
    };
    return `<span class="ss sync ${size}" aria-label="sync ${esc(a)} ${esc(b)}">${part(ta, colors && colors[0], 0)}` +
      (tb.length ? part(tb, colors && colors[1], 1) : "") + `</span>`;
  }


  // ---------- start position: how many clubs, in which colours, in each of the four hands ----------
  // A club starts in the hand that throws it first: the throw at beat t >= 0 whose club was thrown before beat 0.
  // Not sync: juggler 1 (Piet) starts, throws on the even beats and starts with the right hand; juggler 2 (Mees) on the odd beats.
  // Sync: both throw on every beat, both starting right; the first part is Mees's, the second Piet's.
  const CLUB_FILL = { W: "#eeeff2", B: "#1f4fd1", O: "#ee5a2c", R: "#e6386a" };
  const val = (c) => parseInt(c, 36);

  // Every club as { c: colour letter, i: index of the digit that throws it first }, per juggler and hand.
  // Juggler 1 is listed first (shown on the left).
  function startHands(p) {
    const hands = [{ L: [], R: [] }, { L: [], R: [] }]; // [juggler 1, juggler 2]
    const beats = 48;
    if (p.ss) {
      const ss = p.ss.toLowerCase(), n = ss.length;
      for (let t = 0; t < beats; t++) {
        for (let s = t - 12; s < t; s++) {
          if (s + val(ss[((s % n) + n) % n]) !== t) continue;
          if (s < 0) hands[t % 2][Math.floor(t / 2) % 2 ? "L" : "R"].push({ c: p.colors ? p.colors[t % n] : "", i: t % n });
          break;
        }
      }
      return hands;
    }
    const throws = [(p.a || "").toLowerCase().match(SYNC_THROW) || [], (p.b || "").toLowerCase().match(SYNC_THROW) || []];
    const n = throws[0].length;
    if (!n || throws[1].length !== n) return null;
    for (let t = 0; t < beats; t++) {
      for (const j of [0, 1]) {
        let first = Infinity;
        for (let s = t - 12; s < t; s++) for (const k of [0, 1]) {
          const tok = throws[k][((s % n) + n) % n];
          const dest = tok.endsWith("p") ? 1 - k : k;
          if (dest === j && s + val(tok[0]) === t) first = Math.min(first, s);
        }
        if (first < 0) hands[j][t % 2 ? "L" : "R"].push({ c: p.colors && p.colors[j] ? p.colors[j][t % n] : "", i: j * n + (t % n) });
      }
    }
    return hands;
  }

  // The club as in our logo: pink end cap, slim body, white tape, turquoise handle, pink knob
  const clubIcon = (c) => `<svg class="club-ic" viewBox="-13 -2 26 147" aria-hidden="true"><path d="M-4 78H4L3 135.5H-3Z" fill="#2bb5aa"/><rect x="-5" y="135" width="10" height="7.6" rx="3" fill="#d93a78"/><path d="M-6.4 3.4C-9.6 12-11.6 24-11.6 33C-11.6 45-6.4 60-4.8 74H4.8C6.4 60 11.6 45 11.6 33C11.6 24 9.6 12 6.4 3.4Z" fill="${CLUB_FILL[c] || "#5a6683"}"/><rect x="-5.2" y="73.6" width="10.4" height="4.6" rx="0.6" fill="#f4f5f7"/><rect x="-6.6" y="-1.2" width="13.2" height="4.4" rx="1.6" fill="#d93a78"/></svg>`;
  const NAMES = { W: "white", B: "blue", O: "orange", R: "pink" };

  // As in our videos: Mees on the left, Piet on the right; Piet (juggler 1) starts. Per hand the clubs in
  // the order they are thrown. `shown(i)` says whether the colour of digit i may be shown (for "Hide colours").
  function startHtml(p, shown = () => true) {
    const hands = startHands(p);
    if (!hands) return "";
    // Not sync: Piet is juggler 1. Sync: part A is Mees's, part B Piet's.
    const piet = p.ss ? 0 : 1;
    const jugglers = [
      { name: "Mees", h: hands[1 - piet] },
      { name: "Piet", h: hands[piet], starts: !!p.ss }, // in sync patterns both start together
    ];
    const hand = (side, list) => {
      const cs = list.map((x) => (shown(x.i) ? x.c : ""));
      const label = `${side === "L" ? "left" : "right"} hand: ${list.length} club${list.length === 1 ? "" : "s"}` +
        (cs.some(Boolean) ? ` (${cs.map((c) => NAMES[c] || "hidden").join(", ")})` : "");
      return `<div class="hand" aria-label="${label}"><span class="hl"><span>${side}</span><b>${list.length}</b></span><span class="clubs">${cs.map(clubIcon).join("")}</span></div>`;
    };
    return `<div class="start" role="group" aria-label="Start position">${jugglers.map((j) =>
      `<div class="jug-start"><span class="jn">${j.name}${j.starts ? ' <em class="starts">starts</em>' : ""}</span><div class="hands">${hand("L", j.h.L)}${hand("R", j.h.R)}</div></div>`).join("")}</div>`;
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

  // One date format everywhere: "Sat 26 Sep 2026" (the browser would write "Sept")
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function day(d) {
    if (typeof d === "string") d = new Date(d + "T12:00:00");
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  // "today", "yesterday", "3 days ago"
  function ago(d) {
    if (typeof d === "string") d = new Date(d + "T12:00:00");
    const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const n = Math.round((midnight(new Date()) - midnight(d)) / 864e5);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  }

  function when(p) {
    if (!p.date) return "";
    return p.time ? `${day(p.date)} · ${p.time}` : day(p.date);
  }

  function player(p) {
    const url = p.isShort ? `https://www.youtube.com/shorts/${p.youtubeId}` : `https://www.youtube.com/watch?v=${p.youtubeId}`;
    const play = `<span><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>`;
    const poster = `<div class="poster">${esc(p.siteswap)}<small>${esc(p.name || p.family)}</small></div>`;
    // Sharp thumbnails: in hqdefault (480×360) a short is only 202×360 pixels. hq720 has the short as 405×720 in its
    // middle, oardefault (shorts only) the whole 1080×1920 frame; `w` counts the part we show, so sharp screens get the big one.
    // object-fit: cover crops each to the video's shape. If a size is missing, hqdefault, else just the poster.
    // A missing thumbnail comes with YouTube's small grey placeholder (a 404 that still loads), so check the size too.
    const yt = `https://i.ytimg.com/vi_webp/${p.youtubeId}/`;
    const srcset = p.isShort ? `${yt}hq720.webp 405w, ${yt}oardefault.webp 1080w` : `${yt}hq720.webp 1280w`;
    const img = PREVIEW ? "" : `<img src="https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg" srcset="${srcset}" sizes="(max-width: 640px) 100vw, 400px" alt="" loading="lazy" onload="if(this.naturalWidth<200)this.onerror()" onerror="if(this.srcset){this.removeAttribute('srcset')}else{this.remove()}">`;
    const btn = PREVIEW
      ? `<a class="play" href="${url}" target="_blank" rel="noopener" aria-label="Watch ${esc(p.siteswap)} on YouTube">${play}</a>`
      : `<button type="button" class="play" data-play="${p.youtubeId}" data-ss="${esc(p.siteswap)}" aria-label="Play video of ${esc(p.siteswap)}">${play}</button>`;
    return `<div class="player ${p.isShort ? "" : "wide"}">${poster}${img}${btn}</div>`;
  }

  // ---------- difficulty: half stars + the score, with a short explanation on hover (or tap on a phone) ----------
  const half = (n) => (n % 1 ? `${Math.floor(n) || ""}½` : String(n));

  // `explain` false: just the stars and the score, without the explanation (e.g. in a small pop-up)
  function difficulty(p, maxScore, explain = true) {
    const pct = Math.max(0, Math.min(100, (p.stars / 5) * 100));
    const starsHtml = `<span class="stars" style="--pct:${pct}%" role="img" aria-label="${p.stars} out of 5 stars"></span>`;
    if (!explain) return `${starsHtml} <span class="score">${half(p.stars)} ★ · ${p.score}</span>`;
    return `${starsHtml}
      <span class="score tip" tabindex="0" aria-describedby="score-tip">${half(p.stars)} ★ · ${p.score}
      <span class="tip-text" id="score-tip" role="tooltip"><b>Difficulty score ${p.score}</b>
        It adds up how hard the throws are (more spins and more passes are harder; selfs and zips give a moment of rest)
        plus extra points for tricky combinations, such as a dragon (9_5), a 5 next to a triple, or two triples in a row.
        Our patterns go from about 1 (easiest) to ${Math.ceil(maxScore)} (hardest).
        ½ ★ is a score below 4.5, 5 ★ is 17 or more, and in between every 1.5 points adds half a star.</span></span>`;
  }

  // ---------- visitor statistics (Umami, self-hosted: web/nginx.conf passes /u/ on to it) ----------
  // Page views, referrers, countries, devices and visit times come with the tracker; track() adds our own events.
  // Not on our own devices (admin password saved), not in the preview and not on localhost.
  const UMAMI_ID = ""; // the website ID from the Umami dashboard; empty = no statistics
  let ADMIN = false;
  try { ADMIN = !!localStorage.getItem("fo_admin"); } catch (e) {}
  const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (UMAMI_ID && !ADMIN && !PREVIEW && /(^|\.)funkyorbit\.nl$/.test(location.hostname)) {
    // Searching changes ?q= in the address with every letter: count that as a page view only when the page itself changes.
    let lastPath = null;
    window.foBeforeSend = (type, payload) => {
      if (type !== "event" || payload.name) return payload;
      const path = new URL(payload.url, location.href).pathname;
      if (path === lastPath) return null;
      lastPath = path;
      return payload;
    };
    const s = document.createElement("script");
    s.defer = true;
    s.src = "/u/script.js";
    s.dataset.websiteId = UMAMI_ID;
    s.dataset.beforeSend = "foBeforeSend";
    s.dataset.performance = "true"; // page speed (Web Vitals)
    if (STANDALONE) s.dataset.tag = "app"; // visits from the installed web app
    document.head.appendChild(s);
  }
  function track(name, data) {
    try { if (window.umami) window.umami.track(name, data); } catch (e) {}
  }
  // A search is counted once the visitor stops typing for 2 seconds, not with every letter
  let searchTimer = null;
  function trackSearch(q) {
    clearTimeout(searchTimer);
    q = String(q || "").trim().toLowerCase().slice(0, 50);
    if (q) searchTimer = setTimeout(() => track("Search", { query: q, page: location.pathname }), 2000);
  }
  window.addEventListener("appinstalled", () => track("Install app"));

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
      track(on ? "Like" : "Unlike", { video: id });
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
      track("Play video", { siteswap: play.dataset.ss || play.dataset.play, video: play.dataset.play });
      play.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${play.dataset.play}?autoplay=1&playsinline=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  });

  // On our own (logged-in) devices only: "Add" in the menu (to log a pattern we juggled),
  // and the number of new feature requests in the footer
  (function adminCount() {
    let token = "";
    try { token = localStorage.getItem("fo_admin") || ""; } catch (e) {}
    const nav = document.querySelector(".nav");
    if (token && nav && !nav.querySelector('a[href="/add/"]')) {
      nav.insertAdjacentHTML("beforeend", `<a href="/add/"${location.pathname.startsWith("/add") ? ' aria-current="page"' : ""}>Add</a>`);
    }
    const links = document.querySelector("footer .foot-links");
    if (!token || !links || location.pathname.startsWith("/requests")) return;
    fetch("/api/requests/count", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.new) links.insertAdjacentHTML("beforeend", ` · <a class="admin-count" href="/requests/">${j.new} new request${j.new === 1 ? "" : "s"}</a>`);
      })
      .catch(() => {});
  })();

  // ---------- web app: one service worker for the whole site, so every page works offline ----------
  // The generator used to have its own (/gen/sw.js, scope /gen/); it would keep the generator, so remove it.
  if ("serviceWorker" in navigator && !PREVIEW) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.filter((r) => new URL(r.scope).pathname === "/gen/").forEach((r) => r.unregister()))
      .catch(() => {});
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }

  window.FO = { esc, fmt, CLUB, siteswap, syncPattern, cyclicIncludes, updated, stars, difficulty, startHtml, day, ago, when, player, likes, track, trackSearch };
})();
