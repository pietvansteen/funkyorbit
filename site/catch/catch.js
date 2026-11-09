/* Funky Orbit — Catch or Drop: rate filmed patterns for a show (hidden page, #57; ADMIN_TOKEN or a personal password from SWIPE_TOKENS; /api/swipes). */
(function () {
  "use strict";

  const { esc, stars, player, track, initPopup, openPattern, doneRow, patternHtml, familiesOf, likes, notify } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  const PERSON = "fo_person";
  const WORDS = ["", "One person", "Two people", "Three people", "Four people", "Five people", "Six people"];
  const STACK = 3; // cards in the DOM: the top one and the two behind it
  const ITEMS = new Map(); // key -> the pattern on the list, for its difficulty
  let locked = null, token = "", person = "", people = [], swipes = [], cards = [], queue = [], last = null, overMode = "match";

  const stored = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const store = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
  const api = (method, path, body) => fetch(path, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  // ---------- login, who are you ----------
  function showOnly(id) {
    for (const x of ["login", "who", "deck"]) $("#" + x).hidden = x !== id;
  }
  function loginMsg(text) {
    $("#login-msg").textContent = text;
    $("#login-msg").hidden = !text;
  }
  function logout(text) {
    token = "";
    store("fo_swipe", "");
    showOnly("login");
    loginMsg(text || "");
  }

  $("#login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    token = $("#pw").value.trim();
    loginMsg("");
    let r = null;
    try { r = await api("GET", "/api/swipes"); } catch (e) {}
    if (!r || !r.ok) { const wrong = r && r.status === 401; token = ""; return loginMsg(wrong ? "Wrong password." : "The server cannot be reached right now. Please try again in a moment."); }
    store((await r.json()).admin ? "fo_admin" : "fo_swipe", token);
    location.reload(); // so the menu has the new links
  });

  function choose() {
    $("#people").innerHTML = people.map((p) => `<button type="button" class="chip" data-person="${esc(p)}">${esc(p)}</button>`).join("");
    showOnly("who");
  }
  $("#people").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-person]");
    if (!b) return;
    person = b.dataset.person;
    store(PERSON, person);
    deal();
  });
  $("#switch").addEventListener("click", choose);
  $("#logout").addEventListener("click", () => { store("fo_admin", ""); logout(); });

  // ---------- the stack ----------
  // Skipped cards, per person on this device: not a choice, so nothing goes to the server
  const skippedKeys = () => { try { return new Set(JSON.parse(stored(`fo_skipped_${person}`) || "[]")); } catch (e) { return new Set(); } };
  const setSkipped = (key, on) => {
    const keys = skippedKeys();
    on ? keys.add(key) : keys.delete(key);
    store(`fo_skipped_${person}`, keys.size ? JSON.stringify([...keys]) : "");
  };

  function deal() {
    const mine = new Set(swipes.filter((s) => s.person === person).map((s) => s.key));
    queue = cards.filter((k) => !mine.has(k));
    for (let i = queue.length - 1; i > 0; i--) { // random order
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    // cards skipped before come after the others (a sort keeps the random order within both)
    const skipped = skippedKeys();
    queue.sort((a, b) => skipped.has(a) - skipped.has(b));
    last = null;
    $("#stack").innerHTML = "";
    $("#as").textContent = `Playing as ${person}`;
    showOnly("deck");
    render();
    loadAlerts();
  }

  const rate = (label, value, empty) => `<span class="swipe-rate"><small>${label}</small>${value == null ? `<span class="unrated">${empty}</span>` : stars(value)}</span>`;

  // Fits the screen: the video, and below it only what we need to decide; the rest is behind More info (the pop-up)
  function cardEl(key) {
    const row = doneRow(key), item = ITEMS.get(key) || {};
    const el = document.createElement("article");
    el.className = "card swipe-card";
    el.dataset.key = key;
    el.innerHTML = `${player(row)}
      <div class="swipe-info">
        <div class="swipe-info-top">${patternHtml(key, "sm")}</div>
        <div class="swipe-info-rates">${rate("Fun", row.rating, "not rated")}${rate("Difficulty", item.stars, "–")}</div>
        <div class="swipe-info-sub"><span>${[row.name, ...familiesOf(key)].filter(Boolean).map(esc).join(" · ")}</span><button type="button" class="reset" data-more>More info</button></div>
      </div>
      <span class="swipe-hint yes" aria-hidden="true">✓</span><span class="swipe-hint no" aria-hidden="true">✗</span>`;
    return el;
  }

  // Keeps the cards that stay, so a playing video goes on; the top card is the only one to touch
  function render() {
    const stack = $("#stack");
    const want = queue.slice(0, STACK);
    for (const el of [...stack.children]) if (!el.classList.contains("gone") && !want.includes(el.dataset.key)) el.remove();
    want.forEach((key, pos) => {
      let el = [...stack.children].find((x) => x.dataset.key === key && !x.classList.contains("gone"));
      if (!el) { el = cardEl(key); stack.appendChild(el); }
      el.dataset.pos = pos;
      el.inert = pos > 0;
      if (pos === 0 && !el.classList.contains("dragging")) el.style.transform = "";
    });
    $("#left").textContent = `${queue.length} left`;
    $("#all-done").hidden = queue.length > 0 || !cards.length;
    $("#play").classList.toggle("empty-stack", !queue.length);
    $("#no").disabled = $("#yes").disabled = !queue.length;
    $("#skip").disabled = queue.length < 2; // the last card has nothing to go behind
    $("#undo").disabled = !last;
    renderOverview();
  }

  function message(text) {
    $("#swipe-msg").textContent = text;
    $("#swipe-msg").hidden = !text;
  }

  function flyOff(el, dir, dy = 0) {
    el.classList.remove("dragging");
    el.classList.add("gone");
    el.inert = true;
    el.style.zIndex = 5;
    el.style.transition = "transform .32s ease-in";
    el.style.transform = dir ? `translate(${dir * 130}vw, ${dy}px) rotate(${dir * 28}deg)` : "translateY(-130vh)"; // no direction: skipped, up and away
    setTimeout(() => el.remove(), 340);
  }

  async function swipe(choice, dy) {
    const key = queue[0];
    if (!key) return;
    message("");
    flyOff($(`#stack .swipe-card[data-pos="0"]:not(.gone)`), choice === "right" ? 1 : -1, dy);
    queue.shift();
    setSkipped(key, false);
    const row = { person, key, choice, at: Math.floor(Date.now() / 1000) };
    swipes = swipes.filter((s) => !(s.person === person && s.key === key)).concat(row);
    last = row;
    render();
    let r = null;
    try { r = await api("POST", "/api/swipe", { person, key, choice }); } catch (e) {}
    if (r && r.status === 401) return logout("Wrong password.");
    if (!r || !r.ok) { // not saved: the card comes back
      if (last === row) last = null;
      putBack(key);
      message("That swipe could not be saved. Please try again in a moment.");
    }
  }

  function putBack(key, fromRight) {
    swipes = swipes.filter((s) => !(s.person === person && s.key === key));
    queue.unshift(key);
    const stack = $("#stack");
    const el = cardEl(key);
    el.dataset.pos = 0;
    el.style.transition = "none";
    el.style.transform = `translate(${fromRight ? 130 : -130}vw, 0) rotate(${fromRight ? 28 : -28}deg)`;
    stack.appendChild(el);
    el.getBoundingClientRect(); // start from there
    el.style.transition = "";
    render();
  }

  // In doubt: to the back of the stack, for later. Undo stays for the last real swipe.
  function skip() {
    if (queue.length < 2) return;
    message("");
    flyOff($(`#stack .swipe-card[data-pos="0"]:not(.gone)`), 0);
    const key = queue.shift();
    queue.push(key);
    setSkipped(key, true);
    render();
  }

  $("#skip").addEventListener("click", skip);
  $("#no").addEventListener("click", () => swipe("left"));
  $("#yes").addEventListener("click", () => swipe("right"));
  $("#undo").addEventListener("click", async () => {
    if (!last) return;
    const { key, choice } = last;
    last = null;
    message("");
    putBack(key, choice === "right");
    let r = null;
    try { r = await api("DELETE", "/api/swipe", { person, key }); } catch (e) {}
    if (!r || !r.ok) message("The undo could not be saved. Please try again in a moment.");
  });
  document.addEventListener("keydown", (ev) => {
    if ($("#deck").hidden || document.querySelector("dialog[open]") || ev.target.closest("input, textarea")) return;
    if (ev.key === "ArrowLeft") { ev.preventDefault(); swipe("left"); }
    if (ev.key === "ArrowRight") { ev.preventDefault(); swipe("right"); }
    if (ev.key === "ArrowDown") { ev.preventDefault(); skip(); }
  });

  // ---------- dragging ----------
  let drag = null, dragged = false;
  const threshold = (el) => Math.min(130, el.offsetWidth * 0.3);
  function dragTo(el, dx, dy) {
    el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 18}deg)`;
    const p = Math.min(1, Math.abs(dx) / threshold(el));
    $(".swipe-hint.yes", el).style.opacity = dx > 0 ? p : 0;
    $(".swipe-hint.no", el).style.opacity = dx < 0 ? p : 0;
  }
  $("#stack").addEventListener("pointerdown", (ev) => {
    const el = ev.target.closest('.swipe-card[data-pos="0"]:not(.gone)');
    if (el && ev.button === 0) drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, el, active: false, dx: 0, dy: 0 };
  });
  window.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // scrolling the card
      drag.active = true;
      drag.el.classList.add("dragging");
      try { drag.el.setPointerCapture(ev.pointerId); } catch (e) {}
    }
    drag.dx = dx; drag.dy = dy;
    dragTo(drag.el, dx, dy);
  });
  function endDrag(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const { el, active, dx, dy } = drag;
    drag = null;
    if (!active) return;
    dragged = true; // the click after a drag does not start the video
    setTimeout(() => { dragged = false; }, 60);
    if (ev.type === "pointerup" && Math.abs(dx) > threshold(el)) return swipe(dx > 0 ? "right" : "left", dy * 0.25);
    el.classList.remove("dragging");
    el.style.transform = "";
    el.querySelectorAll(".swipe-hint").forEach((h) => { h.style.opacity = 0; });
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  $("#stack").addEventListener("click", (ev) => {
    if (dragged) { ev.stopPropagation(); ev.preventDefault(); dragged = false; return; }
    const play = ev.target.closest("[data-play]");
    if (play) { ev.stopPropagation(); startVideo(play); } // not the normal player of shared.js
  }, true);
  $("#stack").addEventListener("click", (ev) => {
    const card = ev.target.closest(".swipe-card");
    if (ev.target.closest(".swipe-tap")) togglePlay(card.querySelector("iframe"));
    else if (ev.target.closest("[data-more]")) {
      const frame = card.querySelector("iframe");
      if (frame && frame.dataset.paused !== "true") togglePlay(frame); // only one video at a time
      openPattern(card.dataset.key);
    }
  });
  $("#stack").addEventListener("dragstart", (ev) => ev.preventDefault());

  // ---------- the video: a clear layer over it takes every touch, or YouTube's frame would ----------
  // A drag on the layer is a swipe, a tap pauses or plays. No YouTube controls, they could not be reached anyway.
  const tellPlayer = (frame, message) => frame.contentWindow.postMessage(JSON.stringify(message), "*");
  function tapLabel(frame) {
    frame.nextElementSibling.setAttribute("aria-label", frame.dataset.paused === "true" ? "Play video" : "Pause video");
  }

  function startVideo(play) {
    track("Play video", { siteswap: play.dataset.ss || play.dataset.play, video: play.dataset.play });
    const params = `autoplay=1&playsinline=1&rel=0&controls=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    play.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${play.dataset.play}?${params}" title="YouTube video" allow="autoplay; encrypted-media"></iframe>
      <button type="button" class="swipe-tap" aria-label="Pause video"></button>`;
  }

  function togglePlay(frame) {
    const paused = frame.dataset.paused === "true";
    tellPlayer(frame, { event: "command", func: paused ? "playVideo" : "pauseVideo", args: [] });
    frame.dataset.paused = String(!paused);
    tapLabel(frame);
  }

  // Ask the player to report its state, so a tap does the right thing after the video ended or autoplay was blocked
  $("#stack").addEventListener("load", (ev) => {
    if (ev.target.matches("iframe")) tellPlayer(ev.target, { event: "listening", id: 1, channel: "widget" });
  }, true);
  window.addEventListener("message", (ev) => {
    if (!/youtube/.test(ev.origin)) return;
    const frame = [...document.querySelectorAll("#stack iframe")].find((f) => f.contentWindow === ev.source);
    if (!frame) return;
    let state;
    try { state = JSON.parse(ev.data).info?.playerState; } catch (e) { return; }
    if (typeof state !== "number") return;
    frame.dataset.paused = String(state !== 1 && state !== 3); // 1 playing, 3 buffering
    tapLabel(frame);
  });

  // ---------- overview ----------
  // Opens for good once you have had every card one time (a card you skipped counts), remembered on this device.
  // It only shows cards you have judged yourself, so it never influences a card you still have to decide on.
  // Before that: only the patterns everyone has judged.
  function renderOverview() {
    const box = $("#overview");
    const skipped = skippedKeys();
    if (cards.length && queue.every((k) => skipped.has(k))) store(`fo_seen_all_${person}`, "1");
    const seenAll = !!stored(`fo_seen_all_${person}`);
    const mine = new Set(swipes.filter((s) => s.person === person).map((s) => s.key));
    const swipedBy = new Map(); // key -> how many of the people have judged it
    for (const s of swipes) if (people.includes(s.person)) swipedBy.set(s.key, (swipedBy.get(s.key) || 0) + 1);
    const inView = (key) => mine.has(key) && (seenAll || swipedBy.get(key) === people.length);
    box.hidden = !seenAll && ![...mine].some(inView);
    $("#over-note").hidden = box.hidden || !queue.length;
    $("#over-note").textContent = seenAll
      ? "The cards you have judged. The ones you still have left join in once you have judged them."
      : "The patterns all of you have judged. Go through your remaining cards once to see everyone's catches.";
    if (box.hidden) return;
    document.querySelectorAll("#over-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === overMode)));
    const who = new Map(); // key -> who swiped right, in the order of the list of people
    for (const s of swipes) {
      if (s.choice === "right" && doneRow(s.key) && inView(s.key)) who.set(s.key, [...(who.get(s.key) || []), s.person]);
    }
    for (const list of who.values()) list.sort((a, b) => people.indexOf(a) - people.indexOf(b));
    const row = (key) => {
      const names = who.get(key);
      return `<li class="row" data-open="${esc(key)}" role="button" tabindex="0" aria-label="${esc(doneRow(key).siteswap)}: show details">
        <span class="row-pat">${patternHtml(key, "sm")}<span class="row-name">${familiesOf(key).map(esc).join(" · ")}</span></span>
        <span class="swipe-who-chips">${names.map((n) => `<span>${esc(n)}</span>`).join("")}</span></li>`;
    };
    const group = (title, keys) => `<h3>${esc(title)}</h3><ul class="rows">${keys.map(row).join("")}</ul>`;
    const keys = [...who.keys()];
    let html = "";
    if (overMode === "family") {
      const fams = new Map();
      for (const key of keys) for (const f of familiesOf(key)) fams.set(f, [...(fams.get(f) || []), key]);
      html = [...fams.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([f, list]) => group(f, list)).join("");
    } else {
      for (let n = people.length; n > 0; n--) {
        const list = keys.filter((k) => who.get(k).length === n);
        const title = n === people.length ? `Match: all ${(WORDS[n] || "").split(" ")[0].toLowerCase()}` : WORDS[n] || `${n} people`;
        if (list.length) html += group(title, list);
      }
    }
    $("#over-list").innerHTML = html || `<p class="empty">No right swipes yet.</p>`;
  }
  $("#over-mode").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) { overMode = b.dataset.v; renderOverview(); }
  });
  $("#over-list").addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-open]");
    if (el) openPattern(el.dataset.open);
  });
  $("#over-list").addEventListener("keydown", (ev) => {
    const el = ev.target.closest("[data-open]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openPattern(el.dataset.open); }
  });

  // ---------- tell me about new cards: a push or a mail, per person ----------
  let alerts = { email: null, endpoints: [] }, myPush = "";
  function alertMsg(text) {
    $("#alert-msg").textContent = text;
    $("#alert-msg").hidden = !text;
  }
  async function loadAlerts() {
    const who = person;
    await notify.load();
    let r = null;
    try { r = await api("GET", `/api/swipe/alerts?person=${encodeURIComponent(who)}`); } catch (e) {}
    if (!r || !r.ok || who !== person) return;
    alerts = await r.json();
    myPush = notify.push() ? await notify.current() : "";
    if (who === person) paintAlerts();
  }
  function paintAlerts() {
    const push = notify.push(), mail = notify.email();
    $("#alert").hidden = !push && !mail;
    $("#alert-push-row").hidden = !push;
    $("#alert-push").checked = !!myPush && alerts.endpoints.includes(myPush);
    $("#alert-ios").hidden = !notify.homeScreenFirst();
    $("#alert-mail").hidden = !mail || !!alerts.email;
    $("#alert-mail-on").hidden = !mail || !alerts.email;
    $("#alert-mail-to").textContent = alerts.email ? `Mails go to ${alerts.email}` : "";
  }
  // true when the server took it; says what went wrong otherwise
  async function saveAlert(method, body) {
    alertMsg("");
    let r = null;
    try { r = await api(method, "/api/swipe/alerts", { person, ...body }); } catch (e) {}
    if (r && r.ok) return true;
    const j = r ? await r.json().catch(() => ({})) : {};
    alertMsg(j.error || "That could not be saved. Please try again in a moment.");
    return false;
  }
  $("#alert-push").addEventListener("change", async (ev) => {
    const box = ev.target, on = box.checked;
    box.disabled = true;
    try {
      if (on) {
        myPush = await notify.endpoint();
        if (await saveAlert("POST", { push: myPush })) alerts.endpoints.push(myPush);
      } else if (await saveAlert("DELETE", { push: myPush })) {
        alerts.endpoints = alerts.endpoints.filter((e) => e !== myPush);
      }
    } catch (e) {
      alertMsg(/blocked/.test(e.message) ? e.message : "Push notifications could not be switched on here. You can use email instead.");
    }
    box.disabled = false;
    paintAlerts();
  });
  $("#alert-mail").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#alert-email").value.trim().toLowerCase();
    if (await saveAlert("POST", { email })) {
      alerts.email = email;
      $("#alert-email").value = "";
      paintAlerts();
    }
  });
  $("#alert-mail-off").addEventListener("click", async () => {
    if (await saveAlert("DELETE", { email: true })) {
      alerts.email = null;
      paintAlerts();
    }
  });

  // ---------- start ----------
  async function start() {
    token = stored("fo_admin") || stored("fo_swipe");
    if (!token) return showOnly("login");
    let r = null;
    try { r = await api("GET", "/api/swipes"); } catch (e) {}
    if (r && r.status === 401) { store("fo_admin", ""); return logout("Wrong password."); } // also an old admin password, which would come first again
    if (!r || !r.ok) return (showOnly("login"), loginMsg("The server cannot be reached right now. Please try again in a moment."));
    const j = await r.json();
    people = j.people;
    swipes = j.swipes;
    locked = j.person; // a personal password: always this person, no choosing
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      return (showOnly("login"), loginMsg("The patterns could not be loaded. Please try again in a moment."));
    }
    initPopup(data);
    likes.load();
    for (const p of data.all || []) if (!ITEMS.has(p.key)) ITEMS.set(p.key, p);
    cards = [...new Set((data.patterns || []).filter((p) => p.youtubeId).map((p) => p.key))];
    const saved = locked || stored(PERSON);
    $("#switch").hidden = !!locked;
    if (people.includes(saved)) { person = saved; store(PERSON, saved); deal(); } else choose();
  }
  start();
})();
