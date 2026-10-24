/* Funky Orbit — send a feature request (stored on our server, POST /api/requests). */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const form = $("#req-form"), msg = $("#req-msg"), send = $("#req-send");
  const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;

  const say = (text) => { msg.textContent = text; msg.hidden = !text; };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.name.trim() || !f.request.trim()) return say("Please fill in your name and your request.");
    if (!EMAIL_RE.test(f.email.trim())) return say("Please enter a valid email address.");
    say("");
    send.disabled = true;
    send.textContent = "Sending…";
    try {
      const r = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "");
      form.hidden = true;
      $("#req-thanks").hidden = false;
      window.FO.track("Send request");
      form.reset();
    } catch (e) {
      say(e.message || "Sending did not work. Please try again in a moment.");
    } finally {
      send.disabled = false;
      send.textContent = "Send request";
    }
  });

  $("#req-again").addEventListener("click", () => {
    $("#req-thanks").hidden = true;
    form.hidden = false;
    form.querySelector("input").focus();
  });
})();
