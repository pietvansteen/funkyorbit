/* Funky Orbit — log in on this device: the way to the extra pages, also in the installed app (no address bar).
   /api/swipes takes both passwords and says which one it was. */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const stored = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const store = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };

  function message(text) {
    $("#login-msg").textContent = text;
    $("#login-msg").hidden = !text;
  }

  $("#login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    message("");
    const token = $("#pw").value.trim();
    let r = null;
    try { r = await fetch("/api/swipes", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); } catch (e) {}
    if (r && r.status === 401) return message("Wrong password.");
    if (!r || !r.ok) return message("The server cannot be reached right now. Please try again in a moment.");
    const admin = (await r.json()).admin;
    store(admin ? "fo_admin" : "fo_swipe", token);
    location.href = admin ? "/" : "/catch/"; // the Swipe password opens only that page
  });

  $("#logout").addEventListener("click", () => {
    store("fo_admin", "");
    store("fo_swipe", "");
    location.href = "/";
  });

  const loggedIn = !!(stored("fo_admin") || stored("fo_swipe"));
  $("#login").hidden = loggedIn;
  $("#logged-in").hidden = !loggedIn;
  if (!loggedIn) $("#pw").focus();
})();
