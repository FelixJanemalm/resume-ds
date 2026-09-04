/* job-machine view beacon — first-party analytics for felixjanemalm.com
 *
 * Drop into every /for/* variant page, just before </body>:
 *     <script src="/track/beacon.js" data-endpoint="https://YOUR.workers.dev/v"></script>
 *
 * Records that a portfolio variant was opened, so the ledger can distinguish
 * "never viewed" (ATS screen rejected it) from "viewed, no reply" (materials
 * didn't land). Those need completely different fixes.
 *
 * Deliberately does NOT collect: IP addresses, fingerprints, mouse tracking,
 * or anything cross-site. Just first-party visit events on Felix's own site.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var endpoint = script && script.getAttribute("data-endpoint");
  if (!endpoint) return;

  var params = new URLSearchParams(location.search);

  // QA exclusion: open any page once with ?qa=1 and this browser is never
  // counted again (the flag persists in localStorage). Felix's own reviews
  // must not look like recruiter views.
  try {
    if (params.get("qa") === "1") localStorage.setItem("fj_qa", "1");
    if (localStorage.getItem("fj_qa") === "1") return;
  } catch (e) { /* no storage: count normally */ }

  // Stable-ish per-browser id so a forwarded link is distinguishable from the
  // same person reloading. Random, first-party, never leaves this origin's store.
  var visitor;
  try {
    visitor = localStorage.getItem("fj_v");
    if (!visitor) {
      visitor = (crypto.randomUUID && crypto.randomUUID()) ||
                String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem("fj_v", visitor);
    }
  } catch (e) {
    visitor = "no-storage";   // private window or blocked storage
  }

  function send(event, extra) {
    var body = JSON.stringify({
      event: event,
      application_id: params.get("a") || null,   // ties back to the ledger row
      variant: location.pathname,
      referrer: document.referrer || null,
      visitor: visitor,
      screen: window.innerWidth < 768 ? "mobile" : "desktop",
      ts: new Date().toISOString(),
      extra: extra || null
    });
    // text/plain is a CORS-safelisted type, so no preflight is needed.
    // sendBeacon always sends with credentials "include", and a preflighted
    // request in that mode is rejected unless the server also answers
    // Access-Control-Allow-Credentials: true. The worker parses the JSON body
    // regardless of Content-Type. (Found by a real-page test, 2026-09-03.)
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
      } else {
        fetch(endpoint, { method: "POST", body: body, keepalive: true, mode: "cors",
                          credentials: "omit", headers: { "Content-Type": "text/plain" } });
      }
    } catch (e) { /* analytics must never break the page */ }
  }

  send("view");

  // Engagement signals worth knowing about, all first-party.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/resume|\.pdf$/i.test(href)) send("resume_download", href);
    else if (/^mailto:|contact/i.test(href)) send("contact_click", href);
    else if (/\/work\//.test(href)) send("case_study_click", href);
  }, true);

  // Did they actually read it, or bounce? Fires once, at 30s or on leave.
  var start = Date.now(), sentDwell = false;
  function dwell() {
    if (sentDwell) return;
    sentDwell = true;
    send("dwell", String(Math.round((Date.now() - start) / 1000)));
  }
  setTimeout(dwell, 30000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") dwell();
  });
})();
