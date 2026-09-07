/* "Ask about Felix": the assistant on felixjanemalm.com.
 *
 * Source of truth: job-machine/chat/web/chat.js (build_portfolio.py copies it
 * to resume-ds/chat/). Include once, before </body>:
 *
 *   <link rel="stylesheet" href="/chat/chat.css">
 *   <script src="/chat/chat.js" data-endpoint="https://jobmachine-chat.felixacat.workers.dev" defer></script>
 *
 * One conversation, one DOM node, two states:
 *   hero    - sits in the hero where "View Work" was (the button moves beside
 *             the input). Shows the latest exchange only; earlier turns fold.
 *   docked  - once the hero slot scrolls out of view the same node becomes a
 *             slim bar at the bottom: last reply on one line plus the input.
 *             Focus expands it into a sheet with the whole thread, never more
 *             than about half the viewport, so the page stays visible while
 *             the assistant scrolls it or recolors it.
 * Pages without a hero start docked. The hero slot keeps its reserved height
 * while docked, so nothing on the page jumps.
 *
 * The assistant speaks first only when it has something the page doesn't:
 * on a signed ?a= link it shows the posting's first line, which is written
 * by the pipeline (push_context.py), not generated: no model call happens
 * until the visitor types. On plain pages the input's placeholder asks what
 * they are hiring for.
 * The signed reference in ?a= is remembered by the browser (localStorage
 * fj_app, shared with the beacon), so a recruiter who comes back by typing
 * the domain still gets their opener, their h1 stamp, and their case-study
 * order. A newer link overwrites it; ?a=clear forgets it. Links go to the
 * root; there are no per-track pages any more.
 * A new reference starts a fresh conversation; otherwise a thread with real
 * messages in it follows the visitor across pages.
 *
 * Until PUBLIC is true the widget only renders for browsers that have opened
 * any page with ?chat=1 (sticky; ?chat=0 clears it).
 */
(function () {
  "use strict";

  var PUBLIC = false;
  var FALLBACK_OPENER = "What are you hiring for? Tell me the role and I'll say honestly whether Felix fits.";
  var BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|prerender|facebookexternalhit|embedly|preview|whatsapp|telegram|discord/i;

  var script = document.currentScript;
  var endpoint = script && script.getAttribute("data-endpoint");
  if (!endpoint) return;
  endpoint = endpoint.replace(/\/+$/, "");

  function storage(s) {
    return {
      get: function (k) { try { return s.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { s.setItem(k, v); } catch (e) { /* private mode */ } },
      remove: function (k) { try { s.removeItem(k); } catch (e) { /* ignore */ } }
    };
  }
  var local = storage(window.localStorage);
  var session = storage(window.sessionStorage);
  var params = new URLSearchParams(location.search);

  if (params.get("chat") === "1") local.set("fjc_on", "1");
  if (params.get("chat") === "0") local.remove("fjc_on");
  if (!PUBLIC && local.get("fjc_on") !== "1") return;

  // ---- context and session -------------------------------------------------
  // Signed application reference: from the link, else the one this browser was
  // given before. A newer link overwrites; ?a=clear forgets.
  var refParam = params.get("a");
  if (refParam === "clear") { local.remove("fj_app"); refParam = null; }
  else if (refParam) local.set("fj_app", refParam);
  var appRef = refParam || local.get("fj_app") || null;

  function pageContext() {
    var sub = document.querySelector(".hero-subhead");
    var path = location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
    return {
      path: path,
      headline: (sub && sub.textContent.trim()) || document.title,
      application_id: appRef,                      // "<id>.<sig>", minted by chat/link.py
      qa: local.get("fj_qa") === "1"
    };
  }
  var ctx = pageContext();

  function uuid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2);
  }
  function hasUserTurn(h) { return (h || []).some(function (m) { return m.role === "user"; }); }

  // A conversation belongs to the page it started on. A new ?a= link is a new
  // front door, so it starts fresh. A different page with no real messages yet
  // just gets a fresh opener. A thread with real messages follows the visitor.
  var STATE_VERSION = 4;
  var stored = null;
  try { stored = JSON.parse(session.get("fjc_state") || "null"); } catch (e) { stored = null; }
  var history = [], sessionId = null;
  // Only a thread the visitor actually spoke in survives, and only for the same ?a= link.
  // Anything else (an opener alone, a failed opener, an older widget version) starts fresh.
  if (stored && stored.v === STATE_VERSION && stored.application_id === ctx.application_id && hasUserTurn(stored.history)) {
    history = stored.history || [];
    sessionId = stored.session || null;
  }
  if (!sessionId) sessionId = uuid();
  function save() {
    session.set("fjc_state", JSON.stringify({
      v: STATE_VERSION, session: sessionId, application_id: ctx.application_id, path: ctx.path, history: history.slice(-30)
    }));
  }

  var CASE = {
    "work/ai-sourcing": ["AI-powered supply chain traceability", "/work/ai-sourcing.html"],
    "work/ai-classifier": ["A classifier that knows how good it is", "/work/ai-classifier.html"],
    "work/design-system": ["One design system for five products", "/work/design-system.html"],
    "work/design-tokens": ["One change, six platforms", "/work/design-tokens.html"]
  };
  // Sections inside case studies open via text fragments (#:~:text=), so the
  // case-study pages need no anchors. Label, then the heading text on the page.
  var DEEP = {
    "work/ai-sourcing#pipeline": ["One pipeline, end to end", "One pipeline. End to end."],
    "work/ai-sourcing#agents": ["Specialized AI agents", "Specialized AI agents"],
    "work/ai-sourcing#human-in-the-loop": ["Human in the loop", "Human in the Loop"],
    "work/ai-sourcing#records": ["Permanent records", "Permanent records, a checkpoint in time"],
    "work/ai-classifier#architecture": ["Retrieval as a service, generation as a workflow", "Retrieval is a service"],
    "work/ai-classifier#evaluation": ["The harness came first", "The harness came first"],
    "work/ai-classifier#results": ["Four things the numbers said", "Four things the numbers said"],
    "work/ai-classifier#honesty": ["Honest numbers are a feature", "Honest numbers are a feature"],
    "work/design-system#governance": ["How teams would trust the system", "How teams would trust the system in practice"],
    "work/design-system#accessibility": ["Accessibility built in", "Simple APIs, accessibility built in"],
    "work/design-system#results": ["Every target exceeded", "Every target exceeded"],
    "work/design-system#adoption": ["Adoption was uneven at first", "Adoption was uneven at first"],
    "work/design-tokens#architecture": ["Four layers from raw values to code", "Four layers from raw values"],
    "work/design-tokens#naming": ["Names describe purpose, not appearance", "Names describe purpose"],
    "work/design-tokens#results": ["Moving faster added $6M", "Moving faster added"],
    "work/design-tokens#trust": ["The hardest part was the trust", "The hardest part"]
  };
  var TRACK = {
    "for/design-systems": "Design systems", "for/design-engineering": "Design engineering", "for/ai": "AI systems",
    "for/product-design": "Product design", "for/design-leadership": "Design leadership"
  };
  function deepUrl(target) {
    var page = target.split("#")[0];
    var base = CASE[page] ? CASE[page][1] : "/" + page + ".html";
    return base + "#:~:text=" + encodeURIComponent(DEEP[target][1]);
  }

  // ---- DOM -------------------------------------------------------------------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';

  // On an application link, stamp "at <Company>?" after the h1, in the
  // heading's own font ("Ship better products faster at Anthropic?"). The
  // first bubble then never needs to name the company.
  function markFor(company) {
    var h1 = document.querySelector(".hero h1");
    if (!h1 || !company || h1.querySelector(".fjc-for")) return;
    h1.appendChild(document.createTextNode(" "));
    h1.appendChild(el("span", { "class": "fjc-for", text: "at " + company + "?" }));
  }
  // Lead with the case studies that matter for the visitor's track (what the
  // retired /for/* pages did statically).
  function leadWith(slugs) {
    var wrap = document.querySelector(".case-study-teasers");
    if (!wrap || !slugs || !slugs.length) return;
    var picked = [];
    slugs.forEach(function (slug) {
      var a = wrap.querySelector('a.case-study-teaser[href*="' + slug + '"]');
      if (a) picked.push(a);
    });
    for (var i = picked.length - 1; i >= 0; i--) wrap.insertBefore(picked[i], wrap.firstChild);
  }
  if (ctx.application_id) {
    fetch(endpoint + "/posting?a=" + encodeURIComponent(ctx.application_id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) { if (refParam !== ctx.application_id) local.remove("fj_app"); return; }   // stale stored reference
        if (j.company) markFor(j.company);
        leadWith(j.lead);
        if (j.opener && !history.length) {
          history.push({ role: "assistant", text: j.opener });
          save();
          addMsg("assistant", j.opener);
          updateFold();
        }
      })
      .catch(function () { /* no stamp, no harm */ });
  }

  var viewWork = document.querySelector(".hero-content .primary-btn");
  var hasHero = !!viewWork;

  var root = el("div", { "class": "fjc", "data-state": hasHero ? "hero" : "docked", "data-open": "0" });
  var barText = el("button", { "class": "fjc-bar-text", type: "button", text: "Ask anything about Felix" });
  var toggle = el("button", { "class": "fjc-toggle", type: "button", "aria-label": "Show the conversation", html: CHEVRON });
  var bar = el("div", { "class": "fjc-bar" }, [el("span", { "class": "fjc-badge", text: "AI" }), barText, toggle]);
  var earlier = el("button", { "class": "fjc-earlier", type: "button", hidden: "" });
  var thread = el("div", { "class": "fjc-thread", role: "log", "aria-live": "polite" });
  var placeholder = ctx.application_id
    ? "Ask anything, or paste a job description"
    : "What are you hiring for? Ask anything, or paste the job description";
  var input = el("textarea", { rows: "1", placeholder: placeholder, "aria-label": "Ask about Felix" });
  var sendBtn = el("button", { "class": "fjc-send", type: "submit", "aria-label": "Send", html: ARROW });
  var form = el("form", { "class": "fjc-form" }, [input, sendBtn]);
  var slot = null;

  root.appendChild(bar);
  root.appendChild(earlier);
  root.appendChild(thread);
  root.appendChild(form);

  if (hasHero) {
    slot = el("div", { "class": "fjc-slot" });
    viewWork.parentNode.insertBefore(slot, viewWork.nextSibling);   // View Work stays the primary CTA, untouched
    slot.appendChild(root);
  } else {
    document.body.appendChild(root);
  }

  // ---- rendering -------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function renderText(node, text) {
    var h = esc(text.trim());
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, '$1<a href="mailto:$2">$2</a>');
    h = h.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
    var body = node.querySelector(".fjc-body") || node;
    body.innerHTML = "<p>" + h + "</p>";
  }
  function stripNotes(text) { return String(text).replace(/(\n\[[^\]]*\])+$/, ""); }

  function addMsg(role, text) {
    var n = el("div", { "class": "fjc-msg " + (role === "user" ? "fjc-user" : "fjc-bot") }, [
      role === "user" ? null : el("span", { "class": "fjc-badge", text: "AI" }),
      el("div", { "class": "fjc-body" })
    ]);
    if (text) renderText(n, text);
    thread.appendChild(n);
    updateFold();
    scrollThread();
    return n;
  }
  function addNote(text) {
    var n = el("div", { "class": "fjc-note", text: text });
    thread.appendChild(n);
    scrollThread();
  }
  function showDots(node) {
    (node.querySelector(".fjc-body") || node).innerHTML = '<span class="fjc-dots"><i></i><i></i><i></i></span>';
  }
  function linkCard(msg, label, href) {
    var a = el("a", { "class": "fjc-card", href: href, text: label + " ↗" });
    if (!/^mailto:/.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    (msg.querySelector(".fjc-body") || msg).appendChild(a);
    scrollThread();
  }
  function scrollThread() { thread.scrollTop = thread.scrollHeight; }

  // Hero state shows the latest exchange only; the rest folds behind "N earlier".
  var unfolded = false;
  function updateFold() {
    var msgs = thread.querySelectorAll(".fjc-msg");
    var hidden = Math.max(0, msgs.length - 2);
    for (var i = 0; i < msgs.length; i++) {
      msgs[i].classList.toggle("fjc-folded", !unfolded && i < hidden);
    }
    earlier.hidden = unfolded || hidden === 0;
    earlier.textContent = hidden + (hidden === 1 ? " earlier message" : " earlier messages");
    var last = lastBotText();
    barText.textContent = last ? last.replace(/\s+/g, " ").slice(0, 140) : placeholder;
  }
  function lastBotText() {
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant" && !history[i].hidden) return stripNotes(history[i].text);
    }
    return "";
  }
  earlier.addEventListener("click", function () { unfolded = true; updateFold(); });

  function renderAll() {
    thread.innerHTML = "";
    history.forEach(function (m) { if (!m.hidden) addMsg(m.role, stripNotes(m.text)); });
    updateFold();
  }

  // ---- transport -------------------------------------------------------------
  function request(payload, onText, onAction) {
    return fetch(endpoint + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          var err = new Error(j.message || ("HTTP " + res.status));
          err.code = j.error || String(res.status);
          throw err;
        });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", done = null;
      function handle(frame) {
        var ev = "message", data = "";
        frame.split("\n").forEach(function (line) {
          if (line.indexOf("event:") === 0) ev = line.slice(6).trim();
          else if (line.indexOf("data:") === 0) data += line.slice(5).trim();
        });
        var obj = {};
        try { obj = JSON.parse(data || "{}"); } catch (e) { obj = {}; }
        if (ev === "text") onText(obj.t || "");
        else if (ev === "action") onAction(obj);
        else if (ev === "done") done = obj;
        else if (ev === "error") { var e2 = new Error(obj.message || "error"); e2.code = "stream"; throw e2; }
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { if (buf.trim()) handle(buf); return done; }
          buf += dec.decode(r.value, { stream: true });
          var frames = buf.split("\n\n");
          buf = frames.pop();
          frames.forEach(handle);
          return pump();
        });
      }
      return pump();
    });
  }
  function friendly(e) {
    var code = e && e.code;
    if (["quiet", "rate_limited", "too_long", "not_configured", "session_cap", "stream"].indexOf(code) >= 0) return e.message;
    return "Something broke on my end. Email hello@felixjanemalm.com; Felix answers those himself.";
  }

  // ---- page actions ----------------------------------------------------------
  function actionLine(a) {
    var t = (a.input && a.input.target) || "";
    if (a.name === "set_accent_color") return "Done. Every color on the page comes from one token, so one change moves everything.";
    if (t === "resume") return "Here's the resume.";
    if (t === "contact") return "hello@felixjanemalm.com reaches him.";
    if (t.indexOf("work/") === 0) return "Here it is.";
    return "Here you go.";
  }
  function runAction(a, msg) {
    if (!a || !a.name) return;
    try {
      if (a.name === "navigate") navigate(a.input && a.input.target, (a.input && a.input.mode) || "go", msg);
      else if (a.name === "set_accent_color") setAccent(a.input || {});
      else if (a.name === "email_felix") emailCard(a.input || {}, msg);
    } catch (e) { /* an action failing must not break the answer */ }
  }
  function emailCard(inp, msg) {
    var href = "mailto:hello@felixjanemalm.com?subject=" + encodeURIComponent(inp.subject || "About a role") +
      "&body=" + encodeURIComponent(inp.body || "");
    linkCard(msg, "Email Felix", href);
  }
  function flash(node) {
    node.classList.add("fjc-flash");
    setTimeout(function () { node.classList.add("fjc-flash-out"); }, 1200);
    setTimeout(function () { node.classList.remove("fjc-flash", "fjc-flash-out"); }, 2800);
  }
  // mode "go": the visitor asked. Same-page sections scroll; track pages open in
  // place (the thread follows); case studies open from a link, because a page
  // without the widget would strand the conversation and a new tab needs a click.
  // mode "offer": only a link, the visitor decides.
  function navigate(target, mode, msg) {
    if (!target) return;
    var go = mode !== "offer";
    if (DEEP[target]) { linkCard(msg, DEEP[target][0], deepUrl(target)); return; }
    if (CASE[target]) {
      var teaser = document.querySelector('a.case-study-teaser[href*="' + target.slice(5) + '"]');
      if (go && teaser) { teaser.scrollIntoView({ behavior: "smooth", block: "center" }); flash(teaser); }
      linkCard(msg, CASE[target][0], CASE[target][1]);
      return;
    }
    if (TRACK[target]) {
      var href = "/" + target + "/";
      if (go && location.pathname.replace(/\/+$/, "") !== "/" + target) { save(); location.href = href; return; }
      linkCard(msg, TRACK[target] + " version of this site", href);
      return;
    }
    if (target === "resume") { linkCard(msg, "Resume.pdf", "/Resume.pdf"); return; }
    if (target === "contact") {
      var f = document.querySelector("footer");
      if (go && f) f.scrollIntoView({ behavior: "smooth", block: "end" });
      linkCard(msg, "hello@felixjanemalm.com", "mailto:hello@felixjanemalm.com");
      return;
    }
    if (target === "home") { if (go) window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    var node = findSection(target);
    if (!node) return;
    if (go) { scrollToNode(node); return; }
    var card = el("a", { "class": "fjc-card", href: "#", text: sectionLabel(target) + " ↓" });
    card.addEventListener("click", function (e) { e.preventDefault(); scrollToNode(node); });
    (msg.querySelector(".fjc-body") || msg).appendChild(card);
  }
  function sectionLabel(target) {
    return { work: "The work", principles: "Principles that scale", testimonials: "What colleagues say" }[target] || target;
  }
  // Sections by selector first, then by heading text, so a markup change on the
  // site degrades to "no scroll" rather than a wrong scroll.
  var SECTIONS = {
    work: { sel: "#work, .case-study-teasers", heading: /^work$/i },
    principles: { sel: "#scalability, .card-wrapper", heading: /principles/i },
    testimonials: { sel: "#testimonials, .testimonials-wrapper, .testimonials", heading: /take my word|colleagues|testimonial/i }
  };
  function findSection(target) {
    var spec = SECTIONS[target];
    if (!spec) return null;
    var node = document.querySelector(spec.sel);
    if (node) return node;
    var heads = document.querySelectorAll("h2, h3");
    for (var i = 0; i < heads.length; i++) if (spec.heading.test(heads[i].textContent.trim())) return heads[i];
    return null;
  }
  function scrollToNode(node) {
    var top = node.getBoundingClientRect().top + window.pageYOffset - 96;   // clear the fixed header
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  function toHex(c) {
    if (!c || typeof c !== "string") return null;
    var cv = document.createElement("canvas").getContext("2d");
    var sentinel = "#010203";
    var tries = [c.trim(), c.replace(/\s+/g, "").toLowerCase()];
    for (var i = 0; i < tries.length; i++) {
      cv.fillStyle = sentinel;
      cv.fillStyle = tries[i];
      var v = String(cv.fillStyle);
      if (v === sentinel && tries[i].toLowerCase() !== sentinel) continue;
      if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
      var m = v.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) return rgbToHex(+m[0], +m[1], +m[2]);
    }
    return null;
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (x) { return ("0" + Math.round(x).toString(16)).slice(-2); }).join("");
  }
  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function setAccent(inp) {
    var hex = toHex(inp.color);
    if (!hex) { addNote("Couldn't read that color."); return; }
    var hsl = hexToHsl(hex);
    if (inp.mode === "dark") hsl[2] = Math.min(hsl[2], 34);
    if (inp.mode === "light") hsl[2] = Math.max(hsl[2], 64);
    hex = hslToHex(hsl[0], hsl[1], hsl[2]);
    var desc = Object.getOwnPropertyDescriptor(window, "currentColor");
    if (desc && desc.set) window.currentColor = hex;        // the site's own token pipeline
    else document.documentElement.style.setProperty("--sysPrimaryDefault", hex);
    addNote("Accent set to " + hex.toUpperCase() + (inp.mode && inp.mode !== "auto" ? " (" + inp.mode + ")" : "") + ".");
  }

  // ---- conversation ----------------------------------------------------------
  var busy = false;

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    if (!history.length) history.push({ role: "assistant", text: FALLBACK_OPENER, hidden: true });
    addMsg("user", text);
    history.push({ role: "user", text: text });
    save();
    var prior = history.slice(0, -1);
    var bot = addMsg("assistant", "");
    showDots(bot);
    if (root.getAttribute("data-state") === "docked") setOpen(true);
    var acc = "", acted = [];
    request({ session: sessionId, context: ctx, history: prior, text: text }, function (t) {
      acc += t;
      renderText(bot, acc);
      scrollThread();
    }, function (a) { acted.push(a); runAction(a, bot); })
      .then(function (done) {
        var stored = (done && done.history_text) || acc;
        if (!acc) {
          var line = acted.length ? actionLine(acted[0]) : "…";
          renderText(bot, line);
          stored = line + (stored ? "\n" + stored : "");
        }
        history.push({ role: "assistant", text: stored || "…" });
        save();
        updateFold();
      })
      .catch(function (e) {
        renderText(bot, friendly(e));
      })
      .then(function () { busy = false; sendBtn.disabled = false; input.focus(); });
  }

  // ---- states ----------------------------------------------------------------
  function setOpen(open) {
    root.setAttribute("data-open", open ? "1" : "0");
    toggle.setAttribute("aria-label", open ? "Hide the conversation" : "Show the conversation");
    if (open) { unfolded = true; updateFold(); scrollThread(); }
  }
  function setState(state) {
    if (root.getAttribute("data-state") === state) return;
    if (state === "docked" && slot) slot.style.minHeight = root.offsetHeight + "px";   // keep the hero's height
    root.setAttribute("data-state", state);
    document.documentElement.classList.toggle("fjc-docked-page", state === "docked");
    if (state === "hero") { setOpen(false); unfolded = false; updateFold(); }
  }
  if (hasHero && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      var r = entries[0].intersectionRatio;
      if (r < 0.15) setState("docked");
      else if (r > 0.5) setState("hero");
    }, { threshold: [0, 0.15, 0.5, 1] });
    io.observe(slot);
  } else if (!hasHero) {
    document.documentElement.classList.add("fjc-docked-page");
  }

  barText.addEventListener("click", function () { setOpen(root.getAttribute("data-open") !== "1"); });
  toggle.addEventListener("click", function () { setOpen(root.getAttribute("data-open") !== "1"); });
  input.addEventListener("focus", function () {
    if (root.getAttribute("data-state") === "docked") setOpen(true);
  });
  document.addEventListener("click", function (e) {
    if (root.getAttribute("data-state") === "docked" && !root.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root.getAttribute("data-open") === "1") { setOpen(false); input.blur(); }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); var t = input.value; input.value = ""; autosize(); send(t); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.dispatchEvent(new Event("submit", { cancelable: true })); }
  });
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }
  input.addEventListener("input", autosize);

  renderAll();

})();
