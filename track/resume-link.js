/* job-machine resume link — the resume an application was sent, on its link
 *
 *     <script src="/track/resume-link.js" data-endpoint="https://jobmachine-chat.felixacat.workers.dev" defer></script>
 *
 * On a signed application link (?a=<id>.<sig>, chat/link.py), or in a browser
 * that was given one before (localStorage fj_app, shared with the beacon and
 * the assistant), every link to Resume.pdf on the page goes to the chat
 * worker's GET /resume instead. The worker checks the signature and serves
 * the base resume that application was sent ("Felix Janemalm - Resume -
 * <code>.pdf"); a bad reference is redirected back to the site's Resume.pdf.
 * Without a reference the page is left as it is. Runs for ?qa=1 browsers too,
 * so a test sees what the recruiter sees; the beacon alone decides counting.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var endpoint = script && script.getAttribute("data-endpoint");
  if (!endpoint) return;

  var ref = new URLSearchParams(location.search).get("a");
  if (ref === "clear") return;
  if (!ref) { try { ref = localStorage.getItem("fj_app"); } catch (e) { ref = null; } }
  if (!ref) return;

  var href = endpoint.replace(/\/+$/, "") + "/resume?a=" + encodeURIComponent(ref);
  var links = document.querySelectorAll('a[href$="Resume.pdf"]');
  for (var i = 0; i < links.length; i++) {
    links[i].setAttribute("href", href);
    links[i].removeAttribute("download");   // cross-origin: the worker's filename and inline view apply
  }
})();
