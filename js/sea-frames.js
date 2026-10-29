/* sea-frames.js: the hero sea for a browser that cannot run it live (no GPU WebGL: graphics acceleration off or crashed, a blocklisted
 * driver, a remote desktop or virtual machine). js/work-spine.js imports it only then.
 *
 * The live scene was recorded down the page (tools/record-sea.mjs: a frame every 60 px of scroll, light on black). This draws the frame
 * for the current scroll on a fixed 2D canvas, cross-fading between neighbours, screen-blended over the page (multiply, inverted, on a pale
 * one) and hue-rotated from the recording's colour to the picked one, in the layer the live canvas takes there: above the hero's grid,
 * behind the page, above the ending. Scroll maps through the sections' tops, so a page laid out unlike the recording still meets the same
 * frames at the same sections. Frames load nearest first, a few at a time, never more than RANGE frames ahead. At rest the frame drifts a
 * little either side of the scroll's (a slow sine, drawn at most 20 times a second), so the sea keeps moving.
 */
const RANGE = 24, PARALLEL = 4, DRIFT = 0.6, DRIFT_S = 6;   // frames each way to load; loads at once; drift amplitude (frames) and period (s)

export async function start(base = 'images/sea/') {
    if (document.getElementById('sea-frames')) return;
    let man;
    try { man = await (await fetch(base + 'desktop.json')).json(); } catch (e) { console.warn('sea-frames: no recording', e); return; }
    const n = man.frames.length, dir = base + 'desktop/', file = i => dir + 'f' + String(i).padStart(3, '0') + '.webp';

    const canvas = document.createElement('canvas');
    canvas.id = 'sea-frames'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;pointer-events:none;opacity:0;transition:opacity 0.8s ease;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });

    /* ---- scroll -> the recording's scroll, piecewise linear through the sections both pages have */
    let map = [[0, 0]];
    function anchors() {
        const pts = [[0, 0]], docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        for (const [id, recTop] of Object.entries(man.anchors)) {
            const el = id === 'footer' ? document.querySelector('footer') : document.getElementById(id); if (!el) continue;
            const top = el.getBoundingClientRect().top + scrollY, last = pts[pts.length - 1];
            if (top > last[0] && recTop > last[1] && top < docMax && recTop < man.docMax) pts.push([top, recTop]);
        }
        pts.push([docMax, man.docMax]);
        map = pts;
    }
    function recScroll(y) {
        for (let k = 1; k < map.length; k++) if (y <= map[k][0] || k === map.length - 1) { const [a, ra] = map[k - 1], [b, rb] = map[k]; return ra + (rb - ra) * Math.min(1, Math.max(0, (y - a) / (b - a))); }
        return 0;
    }
    const frameAt = y => Math.min(n - 1, Math.max(0, recScroll(y) / man.step));

    /* ---- frames: nearest first, PARALLEL at a time, within RANGE of where the reader is */
    const img = new Array(n).fill(null), state = new Uint8Array(n);   // 0 not asked, 1 loading, 2 ready, 3 failed
    let want = 0, active = 0;
    function pump() {
        while (active < PARALLEL) {
            let i = -1;
            for (let d = 0; d <= RANGE && i < 0; d++) for (const k of [want + d, want - d]) if (k >= 0 && k < n && !state[k]) { i = k; break; }
            if (i < 0) return;
            state[i] = 1; active++;
            const im = new Image(); im.decoding = 'async'; im.src = file(i);
            im.decode().then(() => { img[i] = im; state[i] = 2; }, () => { state[i] = 3; }).finally(() => { active--; pump(); queue(); });
        }
    }
    const nearest = i => { for (let d = 0; d < n; d++) { if (img[i - d]) return i - d; if (img[i + d]) return i + d; } return -1; };

    /* ---- colour: the recording's hue turned to the picked one; on a pale page the frames turn to dark ink */
    const hue = c => {
        const m = /^#?([0-9a-f]{6})$/i.exec((c || '').trim()), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : (/rgba?\(([^)]+)\)/.exec(c || '') || [, '0,0,0'])[1].split(/[\s,/]+/).slice(0, 3).map(v => +v / 255);
        const [r, g, b] = rgb, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
        return 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    };
    const recHue = hue(man.color);
    function tint() {
        const turn = Math.round(hue(getComputedStyle(document.documentElement).getPropertyValue('--primary-color')) - recHue);
        const light = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
        canvas.style.mixBlendMode = light ? 'multiply' : 'screen';
        canvas.style.filter = light ? `invert(1) hue-rotate(${180 + turn}deg)` : `hue-rotate(${turn}deg)`;
    }
    new MutationObserver(tint).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(tint).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    /* ---- drawing */
    let cw = 0, ch = 0, at = 0, still = 0, lastDraw = 0, raf = 0;
    function size() {
        const pr = Math.min(devicePixelRatio || 1, 1.5);
        cw = canvas.width = Math.round(innerWidth * pr); ch = canvas.height = Math.round(canvas.getBoundingClientRect().height * pr) || Math.round(innerHeight * pr);
        anchors(); lastDraw = 0;
    }
    function draw(f) {
        const i = Math.floor(f), t = f - i, a = img[i] ? i : nearest(i); if (a < 0) return false;
        const s = Math.max(cw / 1920, ch / 1200), dw = 1920 * s, dh = 1200 * s, dx = (cw - dw) / 2, dy = (ch - dh) / 2;   // cover, centred
        ctx.globalAlpha = 1; ctx.drawImage(img[a], dx, dy, dw, dh);
        if (a === i && t > 0.02 && img[i + 1]) { ctx.globalAlpha = t; ctx.drawImage(img[i + 1], dx, dy, dw, dh); }
        canvas.style.zIndex = String(man.frames[Math.round(f)][1]);
        if (canvas.style.opacity !== '1') canvas.style.opacity = '1';
        return true;
    }
    function frame(now) {
        raf = 0;
        const rest = (now - still) / 1000, drift = rest > 0.3 ? DRIFT * Math.sin((rest - 0.3) * 2 * Math.PI / DRIFT_S) * Math.min(1, (rest - 0.3) / 1.5) : 0;   // eases in once the scroll has stopped
        if (rest < 0.3 || now - lastDraw >= 50) { if (draw(Math.min(n - 1, Math.max(0, at + drift)))) lastDraw = now; }
        if (!document.hidden) raf = requestAnimationFrame(frame);
    }
    function queue() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
    function onScroll() { at = frameAt(scrollY); want = Math.round(at); still = performance.now(); lastDraw = 0; pump(); queue(); }

    size(); tint(); onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { size(); onScroll(); });
    new ResizeObserver(() => { anchors(); onScroll(); }).observe(document.body);
    document.addEventListener('visibilitychange', queue);
}
