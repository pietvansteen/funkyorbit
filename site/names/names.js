/* Funky Orbit — Behind the Name: the stories behind pattern names (#55; data.json -> "names"). */
(function () {
  "use strict";

  const { esc, day, initPopup, openPattern, patternHtml, isKnown, storySlug, likes, updated, trackSearch } = window.FO;
  const $ = (sel, el = document) => el.querySelector(sel);

  let STORIES = [], query = "", sort = "az", loaded = false;

  function storyHtml(s) {
    const pats = s.patterns.map((p) => (isKnown(p.key)
      ? `<button type="button" data-open="${esc(p.key)}" aria-label="${esc(p.siteswap)}: show details">${patternHtml(p.key, "sm", p.siteswap)}</button>`
      : patternHtml(p.key, "sm", p.siteswap))).join("");
    const facts = [s.toldBy && `Told by ${esc(s.toldBy)}`, s.source && esc(s.source), s.added && `Added ${esc(day(s.added))}`].filter(Boolean).join(" · ");
    return `<article class="story" id="${esc(s.id)}">
      <h2>${esc(s.name)}</h2>
      ${pats ? `<div class="story-pats">${pats}</div>` : ""}
      ${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : ""}
      ${s.story.split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("")}
      ${facts ? `<footer>${facts}</footer>` : ""}
    </article>`;
  }

  function render() {
    const q = query.trim().toLowerCase();
    const shown = STORIES.filter((s) => s.name.toLowerCase().includes(q)).sort(sort === "new"
      ? (a, b) => (b.added || "").localeCompare(a.added || "") || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
    $("#stories").innerHTML = shown.length ? shown.map(storyHtml).join("")
      : `<p class="empty">${STORIES.length ? `No story behind a name with “${esc(query.trim())}”.` : "The first stories are coming soon."}</p>`;
    document.querySelectorAll("#sort button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === sort)));
    try {
      const url = new URL(location.href);
      q ? url.searchParams.set("q", query.trim()) : url.searchParams.delete("q");
      sort === "new" ? url.searchParams.set("sort", "new") : url.searchParams.delete("sort");
      history.replaceState(null, "", url);
    } catch (e) {}
  }

  // /names/#<name> goes straight to that story
  function toHash() {
    if (!loaded || !location.hash) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) el.scrollIntoView();
  }
  window.addEventListener("hashchange", toHash);

  $("#q").addEventListener("input", (ev) => { query = ev.target.value; trackSearch(query); render(); });
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("#sort button");
    if (b) { sort = b.dataset.v; render(); return; }
    const pat = ev.target.closest("[data-open]");
    if (pat) openPattern(pat.dataset.open);
  });

  async function start() {
    let data;
    try {
      data = await (await fetch("/data.json", { cache: "no-cache" })).json();
    } catch (e) {
      $("#stories").innerHTML = `<p class="empty">The stories could not be loaded. Please try again in a few minutes.</p>`;
      return;
    }
    initPopup(data);
    likes.load();
    const el = $("#updated");
    if (el) el.textContent = updated(data.updated);
    const ids = new Set();
    STORIES = (data.names || []).map((s) => {
      let id = storySlug(s.name);
      if (ids.has(id)) id = "";
      ids.add(id);
      return { ...s, id };
    });
    const params = new URLSearchParams(location.search);
    query = params.get("q") || "";
    $("#q").value = query;
    if (params.get("sort") === "new") sort = "new";
    loaded = true;
    render();
    toHash();
  }
  document.querySelectorAll("#sort button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === sort)));
  start();
})();
