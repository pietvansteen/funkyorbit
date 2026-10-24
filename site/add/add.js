/* Funky Orbit — log a pattern we juggled (hidden page, needs the admin password; POST /api/done). */
(function () {
  "use strict";

  const { esc, siteswap, syncPattern, cyclicIncludes, difficulty, day } = window.FO;
  const $ = (sel) => document.querySelector(sel);
  const KEY = "fo_admin"; // the same password as the requests page
  const MAX_SUGGEST = 8;
  const SYNC_THROW = /[0-9a-oq-z]p?/g;

  let token = "";
  try { token = localStorage.getItem(KEY) || ""; } catch (e) {}
  const auth = () => ({ Authorization: `Bearer ${token}` });

  // ---------- pattern keys, the same as sync.py's pattern_key ----------
  // "33p3 | 4p44", "33p3  4p44" -> "33p3 4p44"
  const normalize = (s) => String(s || "").trim().toLowerCase().replace(/\s*\|\s*|\s+/g, " ");
  const minRotation = (ss) => { let m = ss; for (let i = 1; i < ss.length; i++) { const r = ss.slice(i) + ss.slice(0, i); if (r < m) m = r; } return m; };
  function syncCanon(a, b) {
    const ta = a.match(SYNC_THROW) || [], tb = b.match(SYNC_THROW) || [];
    if (ta.length !== tb.length) return `${a} ${b}`;
    let best = null;
    for (const [x, y] of [[ta, tb], [tb, ta]]) {
      for (let i = 0; i < x.length; i++) {
        const k = `${[...x.slice(i), ...x.slice(0, i)].join("")} ${[...y.slice(i), ...y.slice(0, i)].join("")}`;
        if (best === null || k < best) best = k;
      }
    }
    return best;
  }
  function keyOf(q) {
    q = normalize(q);
    if (q.includes("(")) return q.replace(/ /g, "");
    if (q.includes(" ")) { const [a, b] = q.split(" "); return syncCanon(a, b || ""); }
    return minRotation(q);
  }

  // ---------- the list: data.json "all", once per pattern (a pattern can be in more than one family) ----------
  let ITEMS = [], BY_KEY = new Map(), MAX_SCORE = 0;
  const DONE_DATES = new Map(); // key -> dates we did it, newest first
  // for the milestones: what was done before the next save (kept up to date after each save, also before the sync)
  const STATE = { done: new Set(), rows: [] };

  async function loadData() {
    const data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    for (const p of data.all || []) {
      if (!BY_KEY.has(p.key)) BY_KEY.set(p.key, { ...p, families: [] });
      BY_KEY.get(p.key).families.push(p.family);
    }
    ITEMS = [...BY_KEY.values()];
    MAX_SCORE = Math.max(0, ...ITEMS.map((p) => p.score || 0));
    for (const p of data.patterns || []) {
      if (!DONE_DATES.has(p.key)) DONE_DATES.set(p.key, []);
      if (p.date) DONE_DATES.get(p.key).push(p.date);
    }
    ITEMS.forEach((p) => p.done && STATE.done.add(p.key));
    STATE.rows = (data.patterns || []).filter((p) => p.date).reverse() // oldest first
      .map((p) => ({ key: p.key, date: p.date, time: p.time || "", rating: p.rating ?? null }));
  }

  const pattern = (p, size) => (p.ss ? siteswap(p.ss, size, p.colors) : syncPattern(p.a, p.b, size, p.colors));
  const written = (p) => p.ss || p.alt || `${p.a} ${p.b}`; // how the Done tab writes it

  // Does the typed text find this pattern? Siteswaps are cyclic, so any rotation works (5568666 finds 8556666).
  function matches(p, q) {
    if (q.length >= 3 && (p.name || "").toLowerCase().includes(q)) return true;
    if (p.alt) return p.alt.includes(q.replace(/ /g, ""));
    if (p.ss) return !q.includes(" ") && cyclicIncludes(p.ss, q);
    const a = p.a.toLowerCase(), b = p.b.toLowerCase();
    if (!q.includes(" ")) return cyclicIncludes(a, q) || cyclicIncludes(b, q);
    const [x, y] = q.split(" ");
    return (cyclicIncludes(a, x) && (!y || cyclicIncludes(b, y))) || (cyclicIncludes(b, x) && (!y || cyclicIncludes(a, y)));
  }

  function search(text) {
    const q = normalize(text);
    if (!q) return [];
    const key = keyOf(q);
    const rank = (p) => (p.key === key ? 0 : written(p).startsWith(q) ? 1 : 2);
    return ITEMS.filter((p) => matches(p, q))
      .sort((a, b) => rank(a) - rank(b) || a.done - b.done || (a.score || 0) - (b.score || 0))
      .slice(0, MAX_SUGGEST);
  }

  // ---------- siteswap field with suggestions (#11) ----------
  const input = $("#ss"), list = $("#suggest");
  let shown = [], active = -1;

  function renderSuggest() {
    shown = search(input.value);
    active = -1;
    list.hidden = !shown.length || document.activeElement !== input;
    input.setAttribute("aria-expanded", String(!list.hidden));
    input.removeAttribute("aria-activedescendant");
    list.innerHTML = shown.map((p, i) => `<li id="sug-${i}" role="option" aria-selected="false" data-i="${i}">
      ${pattern(p, "sm")}
      <span class="sug-text"><b>${esc(p.name || "")}</b><small>${esc(p.families.join(" · "))}</small></span>
      ${p.done ? '<span class="sug-done">done</span>' : ""}
    </li>`).join("");
  }

  function setActive(i) {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i >= 0) { input.setAttribute("aria-activedescendant", `sug-${i}`); list.children[i].scrollIntoView({ block: "nearest" }); }
  }

  function choose(p) {
    // keep the rotation we typed when it is the whole pattern (the rotation we filmed); otherwise the list's
    input.value = keyOf(input.value) === p.key && !p.alt ? normalize(input.value) : written(p);
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    showPicked();
  }

  // What we are about to save: the pattern from the list, or a warning when it is not on it.
  function showPicked() {
    const q = normalize(input.value);
    const p = q && BY_KEY.get(keyOf(q));
    const box = $("#picked");
    if (!q) { box.innerHTML = ""; return; }
    if (!p) {
      // not while we are still typing and the suggestions are open
      box.innerHTML = q.length >= 3 && ITEMS.length && list.hidden
        ? `<p class="add-warn">This is not one of the ${BY_KEY.size} patterns on the list. Check for a typo; you can still save it.</p>` : "";
      return;
    }
    const dates = DONE_DATES.get(p.key) || [];
    box.innerHTML = `<div class="picked-card">
      ${pattern(p, "lg")}
      <div class="picked-info">
        ${p.name ? `<b>${esc(p.name)}</b>` : ""}
        <span>${esc(p.families.join(" · "))}</span>
        ${p.stars != null ? `<span class="picked-diff">${difficulty(p, MAX_SCORE, false)}</span>` : ""}
        ${dates.length ? `<span class="picked-done">Done before: ${dates.map((d) => esc(day(d))).join(", ")}</span>` : ""}
      </div>
    </div>`;
  }

  input.addEventListener("input", () => { renderSuggest(); showPicked(); });
  input.addEventListener("focus", () => {
    renderSuggest();
    // on a phone the keyboard takes half the screen: put the field at the top, so the suggestions stay in view
    if (matchMedia("(max-width: 640px)").matches) setTimeout(() => $(".ss-field").scrollIntoView({ block: "start", behavior: "smooth" }), 250);
  });
  input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; input.setAttribute("aria-expanded", "false"); showPicked(); }, 150));
  input.addEventListener("keydown", (ev) => {
    if (list.hidden || !shown.length) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((active + 1) % shown.length); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive(active <= 0 ? shown.length - 1 : active - 1); }
    else if (ev.key === "Enter") { ev.preventDefault(); choose(shown[active >= 0 ? active : 0]); }
    else if (ev.key === "Escape") { list.hidden = true; input.setAttribute("aria-expanded", "false"); showPicked(); }
  });
  // pointerdown instead of click: it comes before the field's blur
  list.addEventListener("pointerdown", (ev) => {
    const li = ev.target.closest("[data-i]");
    if (li) { ev.preventDefault(); choose(shown[+li.dataset.i]); }
  });

  // ---------- rating: half stars, tap or drag over the stars, arrow keys ----------
  const rate = $("#rate");
  let rating = 0; // 0 = not rated
  const half = (n) => (n % 1 ? `${Math.floor(n) || ""}½` : String(n));

  function setRating(r) {
    rating = Math.max(0, Math.min(5, Math.round(r * 2) / 2));
    const text = rating ? `${half(rating)} / 5` : "not rated";
    rate.querySelector(".stars").style.setProperty("--pct", `${rating * 20}%`);
    rate.setAttribute("aria-valuenow", String(rating));
    rate.setAttribute("aria-valuetext", rating ? `${rating} out of 5 stars` : "not rated");
    $("#rate-value").textContent = text;
    $("#rate-clear").hidden = !rating;
  }
  function rateAt(ev) {
    const box = rate.querySelector(".stars").getBoundingClientRect();
    setRating(Math.max(0.5, Math.ceil(((ev.clientX - box.left) / box.width) * 10) / 2));
  }
  rate.addEventListener("pointerdown", (ev) => { rate.setPointerCapture(ev.pointerId); rateAt(ev); });
  rate.addEventListener("pointermove", (ev) => { if (rate.hasPointerCapture(ev.pointerId)) rateAt(ev); });
  rate.addEventListener("keydown", (ev) => {
    const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[ev.key];
    if (step) { ev.preventDefault(); setRating(Math.max(rating ? 0.5 : 0, rating + step)); }
    else if (ev.key === "Home") { ev.preventDefault(); setRating(0.5); }
    else if (ev.key === "End") { ev.preventDefault(); setRating(5); }
  });
  $("#rate-clear").addEventListener("click", () => setRating(0));

  // ---------- date: today by default ----------
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  function resetForm(ss) {
    input.value = ss || "";
    $("#date").value = $("#date").max = today();
    setRating(0);
    showPicked();
  }

  // ---------- success pop-up: a GIF from site/gifs/ (#12) with our milestones (#44) ----------
  // The list comes from site/gifs/gifs.json, written by tools/release.py: a new GIF there joins in by itself.
  // A GIF named after a milestone ("birthday-cake.mp4" for the milestone "birthday") is only shown for that
  // milestone; the others are shown at random, never the same one twice in a row. Stays until we tap it away.
  const CHEERS = ["Nailed it!", "Clubs caught!", "Another one down!", "Pass it on!", "Smooth!", "Orbit reached!", "That's a keeper!"];
  const MS = window.FO_MILESTONES;
  let gifs = [];
  const pick = (list, not) => { const pool = list.length > 1 ? list.filter((x) => x !== not) : list; return pool[Math.floor(Math.random() * pool.length)]; };
  const isVideo = (f) => /\.(mp4|webm)$/i.test(f);
  const base = (f) => f.replace(/\.[^.]+$/, "");
  // the milestone a GIF belongs to: the longest id its name starts with ("rating-max-…" is rating-max, not rating)
  const gifMilestone = (f) => MS.ids.filter((id) => base(f) === id || base(f).startsWith(id + "-")).sort((a, b) => b.length - a.length)[0] || "";
  const preload = (f) => (isVideo(f) ? fetch(`/gifs/${encodeURIComponent(f)}`).catch(() => {}) : (new Image().src = `/gifs/${encodeURIComponent(f)}`));

  function gifFor(id) {
    let last = "";
    try { last = localStorage.getItem("fo_gif_last") || ""; } catch (e) {}
    const own = gifs.filter((f) => id && gifMilestone(f) === id);
    // an alias is a GIF's name without extension, or another milestone (then its GIFs)
    const alias = gifs.filter((f) => id && (MS.ALIASES[id] || []).some((a) => base(f) === a || gifMilestone(f) === a));
    const generic = gifs.filter((f) => !gifMilestone(f));
    const list = own.length ? own : alias.length ? alias : generic;
    return list.length ? pick(list, last) : "";
  }

  async function loadGifs() {
    try {
      const list = await (await fetch("/gifs/gifs.json", { cache: "no-cache" })).json();
      gifs = Array.isArray(list) ? list.filter((f) => typeof f === "string") : [];
    } catch (e) { gifs = []; }
    gifs.filter((f) => !gifMilestone(f)).slice(0, 3).forEach(preload); // a few, so the first one shows at once
  }

  // milestones: most special first; the first gives the title and the GIF, a few more are listed below
  function celebrate({ milestones = [], saved = "", estimate = "" } = {}) {
    document.querySelector(".celebrate")?.remove();
    const [top, ...more] = [...milestones].sort((a, b) => b.prio - a.prio);
    const gif = gifFor(top && top.id);
    try { if (gif) localStorage.setItem("fo_gif_last", gif); } catch (e) {}
    const src = `/gifs/${encodeURIComponent(gif)}`;
    const media = !gif ? "" : isVideo(gif)
      ? `<video src="${src}" autoplay muted loop playsinline aria-hidden="true"></video>`
      : `<img src="${src}" alt="">`;
    const extra = more.filter((m) => m.prio >= 30).slice(0, 4);
    const box = document.createElement("div");
    box.className = "celebrate";
    box.setAttribute("role", "status");
    box.innerHTML = `<div class="celebrate-card">${media}
      <b class="celebrate-title">${esc(top ? top.title : pick(CHEERS))}</b>
      ${top && top.text ? `<p>${esc(top.text)}</p>` : ""}
      ${extra.length ? `<ul class="celebrate-more">${extra.map((m) => `<li><b>${esc(m.title)}</b> ${esc(m.text)}</li>`).join("")}</ul>` : ""}
      ${saved ? `<p class="celebrate-saved">${esc(saved)}</p>` : ""}
      ${estimate && !milestones.some((m) => m.id === "percent") ? `<p class="celebrate-saved">Expected project completion date: ${esc(estimate)}</p>` : ""}
      <small>Tap to close</small></div>`;
    const close = () => { document.removeEventListener("keydown", onKey); box.remove(); };
    const onKey = (ev) => { if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); close(); } };
    box.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
  }

  // ---------- saving ----------
  const msg = $("#add-msg"), send = $("#add-send");
  let saveId = "", saveFor = "";
  function pendingId() {
    const what = [normalize(input.value), $("#date").value, rating].join("|");
    if (!saveId || saveFor !== what) {
      saveId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      saveFor = what;
    }
    return saveId;
  }
  const say = (text, ok = false) => { msg.textContent = text; msg.hidden = !text; msg.classList.toggle("ok", ok); };

  $("#add").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    // the same id when we try again after an error, so the Sheet never gets the same pattern twice
    const body = { id: pendingId(), pattern: normalize(input.value), date: $("#date").value, rating: rating || null };
    if (!body.pattern) { say("Please fill in the siteswap."); return input.focus(); }
    if (!body.date) return say("Please choose a date.");
    say("");
    send.disabled = true;
    send.textContent = "Saving…";
    try {
      const r = await fetch("/api/done", { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return logout("Wrong password.");
      if (!r.ok) throw new Error(j.error || "");
      saveId = "";
      const key = keyOf(body.pattern);
      // the time only when we log it on the day itself (for the night owl milestones)
      const now = new Date();
      const time = body.date === today() ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "";
      let ms = { list: [], estimate: "" };
      try {
        ms = MS.check({ item: BY_KEY.get(key) || null, key, rating: body.rating, date: body.date, time, before: STATE, list: BY_KEY, total: BY_KEY.size });
      } catch (e) { /* no milestones, still a GIF */ }
      if (BY_KEY.has(key)) STATE.done.add(key);
      STATE.rows.push({ key, date: body.date, time, rating: body.rating });
      if (!DONE_DATES.has(key)) DONE_DATES.set(key, []);
      DONE_DATES.get(key).unshift(body.date);
      resetForm("");
      say(`Saved as nr ${j.nr}: ${body.pattern}${j.family ? ` (${j.family})` : ""}. The site has it in a few seconds.`, true);
      input.blur(); // the phone keyboard out of the way of the pop-up
      celebrate({ milestones: ms.list, estimate: ms.estimate, saved: [`nr ${j.nr}`, body.pattern, j.name || j.family].filter(Boolean).join(" · ") });
    } catch (e) {
      say(e.message || "Saving did not work. Please try again in a moment.");
    } finally {
      send.disabled = false;
      send.textContent = "Save pattern";
    }
  });

  // ---------- logging in (once per device, remembered) ----------
  function showLogin(message) {
    $("#add").hidden = true;
    $("#login").hidden = false;
    $("#login-msg").textContent = message || "";
    $("#login-msg").hidden = !message;
    $("#pw").focus();
  }

  function logout(message) {
    token = "";
    try { localStorage.removeItem(KEY); } catch (e) {}
    showLogin(message || "");
  }

  async function open() {
    let r = null;
    try { r = await fetch("/api/auth", { headers: auth(), cache: "no-store" }); } catch (e) { /* offline: trust the saved password */ }
    if (r && r.status === 401) return logout("Wrong password.");
    if (r && !r.ok) return showLogin("The password could not be checked (the server has no admin password yet?).");
    try { localStorage.setItem(KEY, token); } catch (e) {}
    $("#login").hidden = true;
    $("#add").hidden = false;
    // the Add item in the menu, now that we know we are logged in
    if (!document.querySelector('.nav a[href="/add/"]')) document.querySelector(".nav").insertAdjacentHTML("beforeend", '<a href="/add/" aria-current="page">Add</a>');
    loadGifs();
    try { await loadData(); } catch (e) { /* without data.json: no suggestions, saving still works */ }
    resetForm(new URLSearchParams(location.search).get("ss") || "");
  }

  $("#login").addEventListener("submit", (ev) => {
    ev.preventDefault();
    token = $("#pw").value.trim();
    open();
  });
  $("#logout").addEventListener("click", () => logout(""));

  token ? open() : showLogin("");
})();
