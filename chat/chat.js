/* "Ask about Felix": the assistant widget on felixjanemalm.com.
 *
 * Source of truth: job-machine/chat/web/chat.js (build_portfolio.py copies it
 * to resume-ds/chat/). Include once, before </body>:
 *
 *   <link rel="stylesheet" href="/chat/chat.css">
 *   <script src="/chat/chat.js" data-endpoint="https://jobmachine-chat.felixacat.workers.dev" defer></script>
 *
 * Until PUBLIC is flipped to true the widget only renders for browsers that
 * have opened any page with ?chat=1 (sticky; ?chat=0 clears it).
 *
 * The assistant speaks first: a short opener generated from the page and, on
 * /for/<variant>?a=<id> links, the posting the visitor came from. It can also
 * act on the page (scroll to a section, hand over a case-study link, recolor
 * the site through the same token pipeline the color picker uses).
 */
(function () {
  "use strict";

  var PUBLIC = false;
  var OPENER_DELAY_MS = 2500;
  var FALLBACK_OPENER = "I'm the assistant on this site. Ask me anything about Felix's work, including what he's bad at.";

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

  // ---- state ---------------------------------------------------------------
  var sessionId = session.get("fjc_s");
  if (!sessionId) {
    sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2);
    session.set("fjc_s", sessionId);
  }
  var history = [];
  try { history = JSON.parse(session.get("fjc_h") || "[]") || []; } catch (e) { history = []; }
  function saveHistory() { session.set("fjc_h", JSON.stringify(history.slice(-30))); }

  var busy = false, panelOpen = false, openerRequested = history.length > 0;

  function pageContext() {
    var sub = document.querySelector(".hero-subhead");
    var path = location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
    return {
      path: path,
      headline: (sub && sub.textContent.trim()) || document.title,
      application_id: params.get("a") || null,
      qa: local.get("fj_qa") === "1"
    };
  }
  var ctx = pageContext();

  var CHIPS_BY_PATH = {
    "/for/ai": ["How did the 20-agent pipeline work?", "How is the classifier evaluated?", "What is he bad at?"],
    "/for/design-systems": ["How do you prove a design system's ROI?", "Show me the tokens pipeline", "What is he bad at?"],
    "/for/design-engineering": ["One Figma change, six platforms. How?", "Can he actually code?", "What is he bad at?"],
    "/for/design-leadership": ["How does he get systems adopted?", "Who has he managed?", "What is he bad at?"],
    "/for/product-design": ["What is his product design process?", "Show me a product case study", "What is he bad at?"]
  };
  var DEFAULT_CHIPS = ["Why should we hire Felix?", "What is he bad at?", "Show me the design tokens work"];
  var FIT_CHIP = "Is he a fit for our role?";
  var FIT_HINT = "Paste the job description here. You'll get an honest read: what matches, what's partial, and what's a real gap.";

  var CASE = {
    "work/ai-sourcing": ["AI-powered supply chain traceability", "/work/ai-sourcing.html"],
    "work/ai-classifier": ["A classifier that knows how good it is", "/work/ai-classifier.html"],
    "work/design-system": ["One design system for five products", "/work/design-system.html"],
    "work/design-tokens": ["One change, six platforms", "/work/design-tokens.html"]
  };

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

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2c-.5.4-1.3 0-1.3-.6V17A2.5 2.5 0 0 1 4 14.5z"/>' +
    '<path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>';

  var root = el("div", { "class": "fjc" });
  var launch = el("button", { "class": "fjc-launch", "type": "button", "aria-label": "Ask about Felix", "aria-expanded": "false", html: ICON });
  var peekText = el("div", { "class": "fjc-peek-text" });
  var peekX = el("button", { "class": "fjc-peek-x", "type": "button", "aria-label": "Dismiss", text: "×" });
  var peek = el("div", { "class": "fjc-peek", hidden: "" }, [peekText, peekX]);

  var log = el("div", { "class": "fjc-log", role: "log", "aria-live": "polite" });
  var chips = el("div", { "class": "fjc-chips" });
  var input = el("textarea", { rows: "1", placeholder: "Ask anything about Felix, or paste a job description", "aria-label": "Message" });
  var sendBtn = el("button", { "type": "submit", "aria-label": "Send", text: "→" });
  var form = el("form", { "class": "fjc-form" }, [input, sendBtn]);
  var closeBtn = el("button", { "class": "fjc-close", "type": "button", "aria-label": "Close", text: "×" });
  var head = el("header", { "class": "fjc-head" }, [
    el("div", null, [el("strong", { text: "Ask about Felix" }), el("span", { "class": "fjc-sub", text: "AI assistant. Knows his work, says when it doesn't." })]),
    closeBtn
  ]);
  var panel = el("section", { "class": "fjc-panel", role: "dialog", "aria-label": "Ask about Felix", hidden: "" }, [head, log, chips, form]);

  root.appendChild(peek);
  root.appendChild(panel);
  root.appendChild(launch);
  document.body.appendChild(root);

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
    node.innerHTML = "<p>" + h + "</p>";
  }
  function addMsg(role, text) {
    var n = el("div", { "class": "fjc-msg " + (role === "user" ? "fjc-user" : "fjc-bot") });
    if (text) renderText(n, text);
    log.appendChild(n);
    scrollLog();
    return n;
  }
  function addNote(text) {
    var n = el("div", { "class": "fjc-note", text: text });
    log.appendChild(n);
    scrollLog();
    return n;
  }
  function showDots(node) {
    node.innerHTML = '<span class="fjc-dots"><i></i><i></i><i></i></span>';
  }
  function linkCard(after, label, href) {
    var a = el("a", { "class": "fjc-card", href: href, text: label + " ↗" });
    if (!/^mailto:/.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    after.appendChild(a);
    scrollLog();
  }
  function scrollLog() { log.scrollTop = log.scrollHeight; }

  function renderChips() {
    chips.innerHTML = "";
    if (history.length > 1) return;
    var list = (CHIPS_BY_PATH[ctx.path] || DEFAULT_CHIPS).concat([FIT_CHIP]);
    list.forEach(function (q) {
      var b = el("button", { "class": "fjc-chip", "type": "button", text: q });
      b.addEventListener("click", function () {
        if (q === FIT_CHIP) {
          chips.innerHTML = "";
          addMsg("assistant", FIT_HINT);
          history.push({ role: "assistant", text: FIT_HINT });
          saveHistory();
          input.focus();
          return;
        }
        send(q);
      });
      chips.appendChild(b);
    });
  }

  function renderHistory() {
    log.innerHTML = "";
    history.forEach(function (m) { addMsg(m.role, m.text.replace(/(\n\[[^\]]*\])+$/, "")); });
    renderChips();
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
    if (code === "quiet" || code === "rate_limited" || code === "too_long" || code === "not_configured" || code === "session_cap" || code === "stream") return e.message;
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

  function runAction(a, botEl) {
    if (!a || !a.name) return;
    try {
      if (a.name === "navigate") navigate(a.input && a.input.target, botEl);
      else if (a.name === "set_accent_color") setAccent(a.input || {}, botEl);
    } catch (e) { /* an action failing must not break the answer */ }
  }

  function flash(node) {
    node.classList.add("fjc-flash");
    setTimeout(function () { node.classList.add("fjc-flash-out"); }, 1200);
    setTimeout(function () { node.classList.remove("fjc-flash", "fjc-flash-out"); }, 2800);
  }

  function navigate(target, botEl) {
    if (!target) return;
    if (target === "home") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (target === "resume") { linkCard(botEl, "Resume.pdf", "/Resume.pdf"); return; }
    if (target === "contact") {
      var f = document.querySelector("footer");
      if (f) f.scrollIntoView({ behavior: "smooth", block: "end" });
      linkCard(botEl, "hello@felixjanemalm.com", "mailto:hello@felixjanemalm.com");
      return;
    }
    if (CASE[target]) {
      var slug = target.slice(5);
      var teaser = document.querySelector('a.case-study-teaser[href*="' + slug + '"]');
      if (teaser) { teaser.scrollIntoView({ behavior: "smooth", block: "center" }); flash(teaser); }
      linkCard(botEl, CASE[target][0], CASE[target][1]);
      return;
    }
    var sel = { work: "#work", principles: "#scalability", testimonials: "#testimonials, .testimonials, .testimonial-wrapper, .testimonial" }[target];
    var node = sel && document.querySelector(sel);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function setAccent(inp, botEl) {
    var hex = toHex(inp.color);
    if (!hex) { addNote("Couldn't read that color."); return; }
    var hsl = hexToHsl(hex);
    if (inp.mode === "dark") hsl[2] = Math.min(hsl[2], 34);
    if (inp.mode === "light") hsl[2] = Math.max(hsl[2], 64);
    hex = hslToHex(hsl[0], hsl[1], hsl[2]);
    var desc = Object.getOwnPropertyDescriptor(window, "currentColor");
    if (desc && desc.set) window.currentColor = hex;        // the site's own token pipeline (color-shade-calculator.js)
    else document.documentElement.style.setProperty("--sysPrimaryDefault", hex);
    addNote("Accent set to " + hex.toUpperCase() + (inp.mode && inp.mode !== "auto" ? " (" + inp.mode + ")" : "") + ".");
  }

  // ---- conversation ----------------------------------------------------------
  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    chips.innerHTML = "";
    if (!history.length) { history.push({ role: "assistant", text: FALLBACK_OPENER }); }
    addMsg("user", text);
    history.push({ role: "user", text: text });
    saveHistory();
    var prior = history.slice(0, -1);
    var bot = addMsg("assistant", "");
    showDots(bot);
    var acc = "", acted = [];
    request({ session: sessionId, context: ctx, history: prior, text: text }, function (t) {
      acc += t;
      renderText(bot, acc);
      scrollLog();
    }, function (a) { acted.push(a); runAction(a, bot); })
      .then(function (done) {
        var stored = (done && done.history_text) || acc;
        if (!acc) {
          // A tool-only reply: give the visitor a line so the bubble is never empty.
          var line = acted.length ? actionLine(acted[0]) : "…";
          renderText(bot, line);
          stored = line + (stored ? "\n" + stored : "");
        }
        history.push({ role: "assistant", text: stored || "…" });
        saveHistory();
      })
      .catch(function (e) {
        renderText(bot, friendly(e));
        bot.classList.add("fjc-error");
      })
      .then(function () { busy = false; sendBtn.disabled = false; input.focus(); });
  }

  function requestOpener() {
    if (openerRequested || history.length) return;
    openerRequested = true;
    var acc = "";
    var bubble = panelOpen ? addMsg("assistant", "") : null;
    if (bubble) showDots(bubble);
    request({ session: sessionId, context: ctx, history: [], opener: true }, function (t) {
      acc += t;
      if (panelOpen) { if (!bubble) bubble = addMsg("assistant", ""); renderText(bubble, acc); scrollLog(); }
      else { peekText.textContent = acc; showPeek(); }
    }, function () { /* the opener takes no page actions */ })
      .then(function (done) {
        var stored = (done && done.history_text) || acc;
        if (!stored) throw new Error("empty opener");
        if (!history.length) { history.push({ role: "assistant", text: stored }); saveHistory(); }
        if (panelOpen) renderHistory();
      })
      .catch(function () {
        if (!history.length) { history.push({ role: "assistant", text: FALLBACK_OPENER }); saveHistory(); }
        if (panelOpen) renderHistory();
        else { peekText.textContent = FALLBACK_OPENER; showPeek(); }
      });
  }

  function showPeek() { peek.hidden = false; }
  function hidePeek() { peek.hidden = true; }

  function openPanel() {
    panelOpen = true;
    hidePeek();
    root.classList.add("is-open");
    panel.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    renderHistory();
    if (!history.length) requestOpener();
    setTimeout(function () { input.focus(); }, 50);
  }
  function closePanel() {
    panelOpen = false;
    root.classList.remove("is-open");
    panel.hidden = true;
    launch.setAttribute("aria-expanded", "false");
    launch.focus();
  }

  launch.addEventListener("click", openPanel);
  peek.addEventListener("click", function (e) { if (e.target !== peekX) openPanel(); });
  peekX.addEventListener("click", function (e) { e.stopPropagation(); hidePeek(); });
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panelOpen) closePanel(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); var t = input.value; input.value = ""; autosize(); send(t); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.dispatchEvent(new Event("submit", { cancelable: true })); }
  });
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  input.addEventListener("input", autosize);

  // The assistant speaks first, but only to visitors who show signs of life.
  // A posting link (?a=) gets the opener after a short delay; everyone else
  // after their first scroll, pointer or key. Crawlers and instant bounces
  // never trigger an API call.
  function whenVisible(fn) {
    if (document.visibilityState === "visible") { fn(); return; }
    document.addEventListener("visibilitychange", function once() {
      if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", once); fn(); }
    });
  }
  function armOpener() {
    if (history.length) return;
    if (ctx.application_id) { setTimeout(function () { whenVisible(requestOpener); }, OPENER_DELAY_MS); return; }
    var events = ["scroll", "pointerdown", "keydown", "touchstart"];
    var onFirst = function () {
      events.forEach(function (ev) { window.removeEventListener(ev, onFirst); });
      setTimeout(function () { whenVisible(requestOpener); }, 800);
    };
    events.forEach(function (ev) { window.addEventListener(ev, onFirst, { passive: true }); });
  }
  armOpener();
})();
