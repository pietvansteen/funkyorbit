/* Funky Orbit — release notes from /changelog.json (newest first). */
(function () {
  "use strict";

  const { esc } = window.FO;
  const box = document.getElementById("changes");

  const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  fetch("/changelog.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((versions) => {
      box.innerHTML = versions.map((v, i) => `
        <article class="release${i === 0 ? " latest" : ""}">
          <header><h2>v${esc(v.version)}</h2><time datetime="${esc(v.date)}">${esc(day(v.date))}</time>${i === 0 ? '<span class="now">live now</span>' : ""}</header>
          <ul>${v.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </article>`).join("");
    })
    .catch(() => { box.innerHTML = `<p class="empty">The release notes could not be loaded. Please try again in a few minutes.</p>`; });
})();
