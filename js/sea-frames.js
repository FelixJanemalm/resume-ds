/* sea-frames.js: the hero sea for a browser that cannot run it live (no GPU WebGL: graphics acceleration off or crashed, a blocklisted
 * driver, a remote desktop or virtual machine). js/work-spine.js imports it only then.
 *
 * The live scene was recorded down the page (tools/record-sea.mjs), as two kinds of video, both light on black, screen-blended over the
 * page (multiply, inverted, on a pale one) and hue-rotated from the recording's colour to the picked one, in the layer the live canvas takes
 * there (above the hero's grid, behind the page, above the ending):
 *   scroll.mp4: a frame per 12 px of scroll. Scrolling seeks it to the frame for the scroll position, always a recorded frame, never a blend.
 *   c<frame>.mp4: every 60 px, a clip recorded there with time running on and the scroll held, played there and back so it loops without a
 *   seam. When the scroll rests, the scroll video steps frame by frame to the nearest clip's spot (the ship settling, as it does live), the
 *   clip starts on that same frame, and the scroll video steps aside once the clip is playing; it comes back the moment the scroll moves.
 * Scroll maps through the sections' tops, so a page laid out unlike the recording still meets the same frames at the same sections. The
 * browser fetches only the parts of the scroll video it seeks to, and a clip only where the reader stops.
 */
const REST_MS = 250;

export async function start(set = 'hero', base = 'images/sea/') {   // set: 'hero' (the hero only, while it is reviewed) or 'desktop' (the whole page)
    if (document.getElementById('sea-frames')) return;
    let man;
    try { man = await (await fetch(base + set + '.json')).json(); } catch (e) { console.warn('sea-frames: no recording', e); return; }
    const n = man.frames.length, dir = base + set + '/', last = n - 1, until = man.until ?? Infinity;   // until: the recording ends there; below it the layer hides

    const video = () => {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.disablePictureInPicture = true; v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;object-fit:cover;pointer-events:none;';
        document.body.appendChild(v);
        return v;
    };
    const scrub = video(), clip = video();
    scrub.id = 'sea-frames'; scrub.preload = 'auto'; scrub.style.opacity = '0'; scrub.style.transition = 'opacity 0.8s ease';
    clip.loop = true; clip.preload = 'auto'; clip.style.visibility = 'hidden';
    scrub.src = dir + 'scroll.mp4';

    /* ---- scroll -> the recording's scroll, piecewise linear through the sections both pages have */
    let map = [[0, 0]];
    function anchors() {
        const pts = [[0, 0]], docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        for (const [id, recTop] of Object.entries(man.anchors)) {
            const el = id === 'footer' ? document.querySelector('footer') : document.getElementById(id); if (!el) continue;
            const top = el.getBoundingClientRect().top + scrollY, prev = pts[pts.length - 1];
            if (top > prev[0] && recTop > prev[1] && top < docMax && recTop < man.docMax) pts.push([top, recTop]);
        }
        pts.push([docMax, man.docMax]);
        map = pts;
    }
    function recAt(y) {
        for (let k = 1; k < map.length; k++) if (y <= map[k][0] || k === map.length - 1) { const [a, ra] = map[k - 1], [b, rb] = map[k]; return ra + (rb - ra) * Math.min(1, Math.max(0, (y - a) / (b - a))); }
        return 0;
    }
    const frameAt = rec => Math.min(last, Math.max(0, Math.round(rec / man.step)));

    /* ---- colour: the recording's hue turned to the picked one; on a pale page the frames turn to dark ink */
    const hue = c => {
        const m = /^#?([0-9a-f]{6})$/i.exec((c || '').trim()), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : (/rgba?\(([^)]+)\)/.exec(c || '') || [, '0,0,0'])[1].split(/[\s,/]+/).slice(0, 3).map(v => +v / 255);
        const [r, g, b] = rgb, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
        return 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    };
    const recHue = hue(man.color);
    function tint() {
        const turn = Math.round(hue(getComputedStyle(document.documentElement).getPropertyValue('--primary-color')) - recHue);
        const g = (/rgba?\(([^)]+)\)/.exec(getComputedStyle(document.body).backgroundColor) || [, '0,0,0'])[1].split(/[\s,/]+/).slice(0, 3).map(v => { v = +v / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        const light = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind') || 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] > 0.2;   // the ground itself, as the live layer reads it: the picker can land on a pale one while the class still says dark
        for (const v of [scrub, clip]) { v.style.mixBlendMode = light ? 'multiply' : 'screen'; v.style.filter = light ? `invert(1) hue-rotate(${180 + turn}deg)` : `hue-rotate(${turn}deg)`; }
    }
    new MutationObserver(tint).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(tint).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    /* ---- the scroll video: one seek at a time, always to the latest wanted frame */
    let target = 0, showing = -1, seeking = false;
    function seek() {
        if (seeking || scrub.readyState < 1 || target === showing) return;
        const i = target; seeking = true;
        scrub.addEventListener('seeked', () => {
            seeking = false; showing = i;
            scrub.style.zIndex = clip.style.zIndex = String(man.frames[i][1]);
            if (scrub.style.opacity !== '1') scrub.style.opacity = '1';
            seek();
        }, { once: true });
        scrub.currentTime = (i + 0.5) / man.fps;
    }
    scrub.addEventListener('loadedmetadata', seek);

    /* ---- at rest: step to the nearest clip's spot, then hand over to the clip */
    let restTimer = 0, settle = 0, clipAt = -1, resting = false;
    const spotFor = i => man.clips.reduce((best, c) => Math.abs(c - i) < Math.abs(best - i) ? c : best, man.clips[0]);
    clip.addEventListener('playing', () => { if (resting && clipAt === showing) { clip.style.visibility = 'visible'; scrub.style.visibility = 'hidden'; } });
    function rest() {
        if (!man.clips || !man.clips.length || document.hidden) return;
        resting = true;
        const spot = spotFor(target);
        if (clipAt !== spot) { clipAt = spot; clip.src = dir + 'c' + String(spot).padStart(4, '0') + '.mp4'; }   // fetched while the frames step over
        clearInterval(settle);
        settle = setInterval(() => {   // the recording's own pace: a frame per 1/30 s
            if (showing === spot && !seeking) { clearInterval(settle); clip.currentTime = 0; clip.play().catch(() => {}); return; }
            if (!seeking && target !== spot) { target += Math.sign(spot - target); seek(); }
        }, 1000 / man.fps);
    }
    function moving() {
        resting = false; clearInterval(settle);
        if (clip.style.visibility !== 'hidden') { scrub.style.visibility = ''; clip.style.visibility = 'hidden'; }
        if (!clip.paused) clip.pause();
    }
    function onScroll() {
        moving();
        const rec = recAt(scrollY), past = rec > until;
        for (const v of [scrub, clip]) v.style.display = past ? 'none' : '';
        clearTimeout(restTimer); if (past) return;
        target = frameAt(rec); seek();
        restTimer = setTimeout(rest, REST_MS);
    }

    tint(); anchors(); onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { anchors(); onScroll(); });
    new ResizeObserver(() => { anchors(); onScroll(); }).observe(document.body);
    document.addEventListener('visibilitychange', () => { if (document.hidden) moving(); else onScroll(); });
}
