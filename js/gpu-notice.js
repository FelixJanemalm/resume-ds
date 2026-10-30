/* gpu-notice.js: a small notice for a visitor whose browser gives the page no graphics acceleration (the setting off, a blocked GPU): the page
 * then runs its lighter CPU version, and the notice says how to turn acceleration on for the full one. A page cannot change the setting itself,
 * nor open the browser's settings page, so it gives the address to paste, with a button that copies it.
 *
 * Shown once a few seconds in, on a desktop browser that can turn acceleration off (not Safari, not a phone), until it is closed (remembered
 * in localStorage). ?gpunotice=1 shows it anyway, for a look at it.
 */
(function () {
    "use strict";
    var force = /[?&]gpunotice=1\b/.test(location.search), KEY = 'gpuNoticeClosed';
    try { if (!force && localStorage.getItem(KEY) === '1') return; } catch (e) { /* no storage: show it */ }
    if (!force && matchMedia('(pointer: coarse)').matches) return;

    var ua = navigator.userAgent, isFirefox = /Firefox\//.test(ua), isEdge = /Edg\//.test(ua), isOpera = /OPR\//.test(ua), isChromium = /Chrome\//.test(ua) || isEdge;
    if (!force && ((!isFirefox && !isChromium) || /Android/.test(ua))) return;   // Safari (and every iOS browser): acceleration is always on; Android: no such setting

    function noAcceleration() {   // no WebGL, or only a software one
        try {
            var c = document.createElement('canvas'), o = { failIfMajorPerformanceCaveat: true }, g = c.getContext('webgl2', o) || c.getContext('webgl', o);
            if (g) { var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return false; }
            return true;
        } catch (e) { return true; }
    }

    // where the setting lives, per browser
    var steps;
    if (isFirefox) steps = { addr: 'about:preferences', rest: ['Under <b>Performance</b>, untick <b>Use recommended performance settings</b>.', 'Tick <b>Use hardware acceleration when available</b>, then restart Firefox.'] };
    else if (isOpera) steps = { addr: 'opera://settings', rest: ['Search the settings for <b>hardware acceleration</b> and turn it on.', 'Relaunch the browser.'] };
    else {
        var scheme = isEdge ? 'edge' : (navigator.brave ? 'brave' : 'chrome');
        steps = { addr: scheme + '://settings/system', rest: ['Turn on <b>Use graphics acceleration when available</b> (or search the settings for <b>acceleration</b>).', 'Relaunch the browser.'] };
    }
    var already = 'If it is already on, the browser may be blocking your graphics driver: updating the driver usually helps.';

    // its own styles, reset first: the page's own button and list styles would otherwise reach in
    var css = '' +
        '.gpu-note{all:initial;position:fixed;left:16px;bottom:16px;z-index:8999;display:block;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px 40px 12px 14px;border-radius:12px;' +
        'background:var(--bgMedium,#2b2b2b);color:var(--text,#ddd);border:1px solid var(--border,rgba(255,255,255,.15));box-shadow:0 6px 24px rgba(0,0,0,.3);' +
        'font-family:RNSPhysis,system-ui,sans-serif;font-size:14px;line-height:1.45;text-align:left;opacity:0;transform:translateY(8px);transition:opacity .35s ease,transform .35s ease}' +
        '.gpu-note.is-on{opacity:1;transform:none}' +
        '.gpu-note *{all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:normal;text-align:left}' +
        '.gpu-note p{display:block;margin:0}' +
        '.gpu-note ol{display:block;margin:10px 0 0;padding:0 0 0 20px;list-style:decimal}.gpu-note li{display:list-item;margin:4px 0}' +
        '.gpu-note b{font-weight:700}.gpu-note [hidden]{display:none}' +
        '.gpu-note code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:rgba(127,127,127,.18);padding:2px 5px;border-radius:5px;word-break:break-all}' +
        '.gpu-note button{position:static;display:inline-block;margin:0;padding:0;border:0;background:none;cursor:pointer;width:auto;height:auto;min-width:0;box-shadow:none}' +
        '.gpu-note .gpu-how{display:block;margin-top:6px;text-decoration:underline;text-underline-offset:2px}' +
        '.gpu-note .gpu-copy{margin-left:6px;padding:1px 8px;border-radius:6px;border:1px solid var(--border,rgba(255,255,255,.25));font-size:12px;vertical-align:baseline}' +
        '.gpu-note .gpu-x{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:6px;font-size:18px;line-height:26px;text-align:center;opacity:.7}' +
        '.gpu-note .gpu-x:hover,.gpu-note .gpu-x:focus-visible{opacity:1;background:rgba(127,127,127,.18)}' +
        '@media (max-width:1440px){.gpu-note{bottom:84px}}' +   // clear of the chat bar along the bottom (720 px wide, centred) on a window narrower than both side by side
        'body:has(.fjc[data-open="1"]) .gpu-note,body:has(#overlay[style*="visibility: visible"]) .gpu-note,body:has(.is-fullscreen) .gpu-note{display:none}' +   // out of the way of the open chat, the drawer and a full-screen slideshow
        '.gpu-note .gpu-already{display:block;margin-top:8px;font-size:12px;opacity:.75}' +
        '@media (prefers-reduced-motion:reduce){.gpu-note{transition:none}}';

    function show() {
        var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
        var box = document.createElement('div');
        box.className = 'gpu-note';
        box.innerHTML =
            '<p role="status"></p>' +
            '<button type="button" class="gpu-how" aria-expanded="false">How?</button>' +
            '<ol hidden><li>Paste <code>' + steps.addr + '</code><button type="button" class="gpu-copy">Copy</button> into the address bar.</li>' +
            steps.rest.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '<span class="gpu-already">' + already + '</span></ol>' +
            '<button type="button" class="gpu-x" aria-label="Close this notice">×</button>';
        document.body.appendChild(box);
        var how = box.querySelector('.gpu-how'), list = box.querySelector('ol'), copy = box.querySelector('.gpu-copy');
        how.addEventListener('click', function () { var open = list.hidden; list.hidden = !open; how.setAttribute('aria-expanded', String(open)); how.textContent = open ? 'Hide' : 'How?'; });
        copy.addEventListener('click', function () {
            var label = function (t) { copy.textContent = t; setTimeout(function () { copy.textContent = 'Copy'; }, 2000); };
            var manual = function () { try { getSelection().selectAllChildren(box.querySelector('code')); } catch (e) {} label(/Mac/.test(navigator.platform) ? 'Press ⌘C' : 'Press Ctrl+C'); };   // no clipboard access: the address selected, to copy by hand
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(steps.addr).then(function () { label('Copied'); }, manual); else manual();
        });
        function close() {
            try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
            if (box.contains(document.activeElement)) document.activeElement.blur();
            box.classList.remove('is-on'); setTimeout(function () { box.remove(); }, 400);
            removeEventListener('keydown', esc);
        }
        function esc(e) { if (e.key === 'Escape' && box.contains(document.activeElement)) close(); }
        box.querySelector('.gpu-x').addEventListener('click', close);
        addEventListener('keydown', esc);
        requestAnimationFrame(function () { requestAnimationFrame(function () {
            box.classList.add('is-on');
            box.querySelector('p').textContent = 'You’re seeing the lighter version of this page. Turn on graphics acceleration in your browser for the full 3D version.';   // (written into the live region once it exists, so a screen reader announces it)
        }); });
    }

    function start() { if (force || noAcceleration()) setTimeout(show, force ? 300 : 4000); }
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
})();
