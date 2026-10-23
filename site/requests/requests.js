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

  function render(list, newCount) {
    $("#req-count").textContent = `${list.length} request${list.length === 1 ? "" : "s"} · ${newCount} new`;
    $("#req-list").innerHTML = list.length ? list.map((r) => {
      const d = new Date(r.created * 1000);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      // Done and No fold up to one line (tap to open), so the open requests stay easy to scan.
      const folded = r.status === "done" || r.status === "no";
      return `<${folded ? "details" : "article"} class="req ${esc(r.status)}">
        ${folded ? `<summary><b>${esc(r.name)}</b><span class="req-line">${esc(r.request.split("\n")[0])}</span><span class="req-status">${esc(r.status)}</span></summary>` : ""}
        <header>
          <b>${esc(r.name)}</b>
          <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>
          <time>${esc(day(d))} · ${time}</time>
        </header>
        <p>${esc(r.request).replace(/\n/g, "<br>")}</p>
        <div class="seg small" role="group" aria-label="Status" data-id="${r.id}">
          ${STATUSES.map((s) => `<button type="button" data-status="${s}" aria-pressed="${s === r.status}">${s}</button>`).join("")}
        </div>
      </${folded ? "details" : "article"}>`;
    }).join("") : `<p class="empty">No requests yet.</p>`;
  }

  async function load() {
    const r = await fetch("/api/requests", { headers: auth(), cache: "no-store" });
    if (r.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} return showLogin(token ? "Wrong password." : ""); }
    if (!r.ok) return showLogin("The requests could not be loaded (the server has no admin password yet?).");
    const j = await r.json();
    $("#login").hidden = true;
    $("#admin").hidden = false;
    render(j.requests, j.new);
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
