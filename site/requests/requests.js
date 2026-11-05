/* Funky Orbit — read the feature requests (hidden page, needs the admin password). */
(function () {
  "use strict";

  const { esc, day } = window.FO;
  const $ = (sel) => document.querySelector(sel);
  const KEY = "fo_admin";
  const STATUSES = ["new", "planned", "done", "no"];

  let token = "";
  try { token = localStorage.getItem(KEY) || ""; } catch (e) {}
  const auth = () => ({ Authorization: `Bearer ${token}` });

  function showLogin(message) {
    $("#admin").hidden = true;
    $("#login").hidden = false;
    $("#login-msg").textContent = message || "";
    $("#login-msg").hidden = !message;
    $("#pw").focus();
  }

  // The newest 3, so Most wished stays close; the rest behind Show all (remembered until the page is closed)
  const FIRST = 3;
  let showAll = false;
  function render(list, newCount) {
    $("#req-count").textContent = `${list.length} request${list.length === 1 ? "" : "s"} · ${newCount} new`;
    const shown = showAll ? list : list.slice(0, FIRST);
    const more = list.length > FIRST
      ? `<p class="load-more"><button type="button" class="chip" id="req-more">${showAll ? "Show fewer" : `Show all ${list.length} requests`}</button></p>` : "";
    $("#req-list").innerHTML = (list.length ? shown.map((r) => {
      const d = new Date(r.created * 1000);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      // Done and No fold up to one line (tap to open), so the open requests stay easy to scan.
      const folded = r.status === "done" || r.status === "no";
      return `<${folded ? "details" : "article"} class="req ${esc(r.status)}">
        ${folded ? `<summary><b>${esc(r.name)}</b><span class="req-line">${esc(r.request.split("\n")[0])}</span><span class="req-status">${esc(r.status)}</span></summary>` : ""}
        <header>
          <b>${esc(r.name)}</b>
          ${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : "<span>no email</span>"}
          <time>${esc(day(d))} · ${time}</time>
        </header>
        <p>${esc(r.request).replace(/\n/g, "<br>")}</p>
        <div class="seg small" role="group" aria-label="Status" data-id="${r.id}">
          ${STATUSES.map((s) => `<button type="button" data-status="${s}" aria-pressed="${s === r.status}">${s}</button>`).join("")}
        </div>
      </${folded ? "details" : "article"}>`;
    }).join("") : `<p class="empty">No requests yet.</p>`) + more;
  }

  async function load() {
    const r = await fetch("/api/requests", { headers: auth(), cache: "no-store" });
    if (r.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} return showLogin(token ? "Wrong password." : ""); }
    if (!r.ok) return showLogin("The requests could not be loaded (the server has no admin password yet?).");
    const j = await r.json();
    $("#login").hidden = true;
    $("#admin").hidden = false;
    render(j.requests, j.new);
    loadWished();
  }

  // the patterns visitors wish for (Wish Tricks), most wished first
  async function loadWished() {
    const r = await fetch("/api/wishes", { headers: auth(), cache: "no-store" }).catch(() => null);
    const list = r && r.ok ? (await r.json()).wishes : [];
    $("#wished").hidden = !list.length;
    $("#wished-count").textContent = `${list.reduce((n, w) => n + w.count, 0)} open wishes`;
    $("#wished-list").innerHTML = list.map((w) => `<li><b>${esc(w.title)}</b> <span>${w.count} wish${w.count === 1 ? "" : "es"} · ${w.push} push · ${w.email} email${w.names ? ` · ${esc(w.names)}` : ""}</span>${(w.remarks || []).length
      ? `<ul class="wish-remarks">${w.remarks.map((r) => `<li><b>${esc(r.name || "Someone")}:</b> ${esc(r.remark)}</li>`).join("")}</ul>` : ""}</li>`).join("");
  }

  $("#login").addEventListener("submit", (ev) => {
    ev.preventDefault();
    token = $("#pw").value.trim();
    try { localStorage.setItem(KEY, token); } catch (e) {}
    load();
  });

  $("#logout").addEventListener("click", () => {
    token = "";
    try { localStorage.removeItem(KEY); } catch (e) {}
    showLogin("");
  });

  $("#csv").addEventListener("click", async () => {
    const r = await fetch("/api/requests.csv", { headers: auth(), cache: "no-store" });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "funkyorbit-requests.csv" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("#req-more")) {
      showAll = !showAll;
      load();
      if (!showAll) $("#req-list").scrollIntoView({ block: "start" });
      return;
    }
    const b = ev.target.closest("[data-status]");
    if (!b) return;
    const id = b.parentElement.dataset.id;
    const r = await fetch(`/api/requests/${id}/status`, {
      method: "POST", headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: b.dataset.status }),
    });
    if (r.ok) load();
  });

  token ? load() : showLogin("");
})();
