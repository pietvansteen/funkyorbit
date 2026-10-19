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

  // Sync pattern: juggler A | juggler B, throws like "4p" in one box.
  function syncPattern(a, b, size, colors) {
    const ta = a.toLowerCase().match(SYNC_THROW) || [a];
    const tb = (b || "").toLowerCase().match(SYNC_THROW) || [];
    return `<span class="ss sync ${size}" aria-label="sync ${esc(a)} ${esc(b)}"><span class="jug">${boxes(ta, colors && colors[0])}</span>` +
      (tb.length ? `<span class="jug"><i class="sep" aria-hidden="true"></i>${boxes(tb, colors && colors[1])}</span>` : "") + `</span>`;
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

  window.FO = { esc, fmt, CLUB, siteswap, syncPattern, cyclicIncludes, updated };
})();
