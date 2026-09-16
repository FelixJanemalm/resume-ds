/* ink-cursor.js: the pointer as a gooey trail of ink in the picked colour.
 *
 * A port of Eder Anaya's "Ink Cursor" (codepen.io/mendieta/pen/WgvENJ) without GSAP: twenty dots, each a little smaller than the one
 * before, chase each other at 35% of the gap per frame and an SVG goo filter (blur + alpha threshold) melts them into one blob with
 * a tail. When the pointer rests for 150 ms the tail's dots let go of the chain and wobble in place, so the ink keeps breathing.
 *
 * The ink is the hue picked in the hero (--primary-color, which color-shade-calculator.js sets on the root), made to stand out from
 * whatever is under the pointer: the ground there is read from the element under the pointer (its nearest painted background), and
 * the ink's lightness is pushed away from it until the contrast reaches 4.5:1 (light ink on a dark ground, deep ink on a pale one),
 * saturated so it still reads as the picked colour; a hair of the opposite tone rims the blob for grounds in between. It re-reads
 * the ground as the pointer moves (at most every 90 ms), on scroll, and when the colour is picked again; the change eases over 0.25 s.
 *
 * Only for a real mouse (hover + fine pointer) and without reduced motion; touch devices keep their native behaviour. Over links and
 * buttons the head swells a little, standing in for the native hand cursor. Self-contained: it injects its own filter, styles and
 * element, and can be loaded on any page with <script type="module" src="js/ink-cursor.js"></script>.
 */
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (fine && !calm && !document.getElementById('ink-cursor')) start();

function start() {
    const AMOUNT = 20, SINE_DOTS = Math.floor(AMOUNT * 0.3), WIDTH = 26, IDLE_MS = 150, FOLLOW = 0.35, CONTRAST = 4.5;
    const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label, summary, .case-study-teaser, .hitbox';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<defs><filter id="ink-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>'
        + '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 35 -15" result="goo"/>'
        + '<feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></defs>';
    const style = document.createElement('style');
    style.textContent = `
        html.ink-cursor-on, html.ink-cursor-on * { cursor: none !important; }
        #ink-cursor { --ink: #4faad1; --ink-rim: rgba(0, 0, 0, 0.55); position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;
            filter: url(#ink-goo) drop-shadow(0 0 1px var(--ink-rim)); opacity: 0; transition: opacity 0.25s ease; }
        #ink-cursor.is-shown { opacity: 1; }
        #ink-cursor.is-shown.is-picking { opacity: 0; transition-duration: 0.12s; }
        #ink-cursor span { position: absolute; top: 0; left: 0; width: ${WIDTH}px; height: ${WIDTH}px; border-radius: 50%; transform-origin: center center; will-change: transform;
            background-color: var(--ink); transition: background-color 0.25s ease; }`;
    const cursor = document.createElement('div');
    cursor.id = 'ink-cursor'; cursor.setAttribute('aria-hidden', 'true');
    document.head.appendChild(style); document.body.append(svg, cursor);
    document.documentElement.classList.add('ink-cursor-on');

    const mouse = { x: -100, y: -100 };   // the pointer (the dot's top-left corner)
    /* ---- colour: the picked hue, as far from the ground under the pointer as it needs to be */
    const parseColor = str => {
        str = (str || '').trim(); let m;
        if ((m = /^#([0-9a-f]{3})$/i.exec(str))) return m[1].split('').map(c => parseInt(c + c, 16)).concat(1);
        if ((m = /^#([0-9a-f]{6})$/i.exec(str))) return [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16)).concat(1);
        if ((m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i.exec(str))) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
        return null;
    };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l];
        const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; };
    const toRgb = ([h, s, l]) => { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]; };
    // the ground under a point: the nearest element that paints an opaque background (a translucent one is blended over what is beneath)
    function groundAt(x, y) {
        let el = document.elementFromPoint(x, y), layers = [];
        while (el && el !== document.documentElement) {
            const c = parseColor(getComputedStyle(el).backgroundColor);
            if (c && c[3] > 0.02) { layers.push(c); if (c[3] >= 0.95) break; }
            el = el.parentElement;
        }
        let base = layers.length && layers[layers.length - 1][3] >= 0.95 ? layers.pop() : (parseColor(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]);
        if (base[3] < 0.95) base = [255, 255, 255, 1];
        for (let k = layers.length - 1; k >= 0; k--) { const [r, g, b, a] = layers[k]; base = [base[0] + (r - base[0]) * a, base[1] + (g - base[1]) * a, base[2] + (b - base[2]) * a, 1]; }
        return base;
    }
    let lastInk = '', lastRim = '';
    function recolor() {
        const root = getComputedStyle(document.documentElement);
        const picked = parseColor(root.getPropertyValue('--primary-color')) || parseColor(root.getPropertyValue('--button-color')) || [79, 170, 209, 1];
        const ground = groundAt(Math.min(innerWidth - 1, Math.max(0, mouse.x + WIDTH / 2)), Math.min(innerHeight - 1, Math.max(0, mouse.y + WIDTH / 2)));
        const [h, s0] = toHsl(picked), s = Math.max(s0, 0.75), dark = lum(ground) < 0.3;
        let l = dark ? 0.58 : 0.42, rgb = toRgb([h, s, l]);
        for (let k = 0; k < 16 && contrast(rgb, ground) < CONTRAST; k++) { l = dark ? Math.min(0.94, l + 0.025) : Math.max(0.08, l - 0.025); rgb = toRgb([h, s, l]); }   // push the lightness away from the ground until it stands out
        const ink = `rgb(${rgb.map(v => Math.round(v)).join(', ')})`, rim = dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.6)';
        if (ink !== lastInk) { cursor.style.setProperty('--ink', ink); lastInk = ink; }
        if (rim !== lastRim) { cursor.style.setProperty('--ink-rim', rim); lastRim = rim; }
    }
    let recolorAt = 0, recolorQueued = false;
    const queueRecolor = () => { if (recolorQueued) return; const wait = Math.max(0, 90 - (performance.now() - recolorAt)); recolorQueued = true; setTimeout(() => { recolorQueued = false; recolorAt = performance.now(); recolor(); }, wait); };
    new MutationObserver(queueRecolor).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });   // a new pick (the picker writes the root's variables)
    new MutationObserver(queueRecolor).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    addEventListener('scroll', queueRecolor, { passive: true });

    /* ---- motion */
    let idle = false, idleTimer = 0, hover = 1, hoverT = 1;
    const dots = Array.from({ length: AMOUNT }, (_, index) => {
        const scale = 1 - 0.05 * index, el = document.createElement('span');
        cursor.appendChild(el);
        return { index, scale, el, x: -100, y: -100, lockX: 0, lockY: 0, angleX: 0, angleY: 0, range: WIDTH / 2 - WIDTH / 2 * scale + 2 };
    });

    const goIdle = () => { idle = true; for (const d of dots) { d.lockX = d.x; d.lockY = d.y; d.angleX = Math.PI * 2 * Math.random(); d.angleY = Math.PI * 2 * Math.random(); } };
    // pointermove, not mousemove: a pointerdown handler that calls preventDefault (the colour picker's does) stops the mouse events for the drag
    addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        mouse.x = e.clientX - WIDTH / 2; mouse.y = e.clientY - WIDTH / 2;
        if (picking) return;
        if (!cursor.classList.contains('is-shown')) { for (const d of dots) { d.x = mouse.x; d.y = mouse.y; } recolor(); cursor.classList.add('is-shown'); }   // first move: the ink appears where the pointer is, already in its colour
        idle = false; clearTimeout(idleTimer); idleTimer = setTimeout(goIdle, IDLE_MS);
        hoverT = e.target instanceof Element && e.target.closest(INTERACTIVE) ? 1.55 : 1;
        queueRecolor();
    }, { passive: true });
    // while dragging on the colour picker the ink steps aside, so its own dot is what the eye follows; on release it reappears at the pointer
    let picking = false;
    addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' || !(e.target instanceof Element) || !e.target.closest('#color-picker-container .hitbox')) return;
        picking = true; cursor.classList.add('is-picking');
    }, { capture: true, passive: true });
    const endPicking = () => {
        if (!picking) return;
        picking = false; for (const d of dots) { d.x = mouse.x; d.y = mouse.y; }
        idle = false; clearTimeout(idleTimer); idleTimer = setTimeout(goIdle, IDLE_MS);
        cursor.classList.remove('is-picking'); queueRecolor();
    };
    addEventListener('pointerup', endPicking, { capture: true, passive: true });
    addEventListener('pointercancel', endPicking, { capture: true, passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.remove('is-shown'));
    document.addEventListener('mouseenter', () => cursor.classList.add('is-shown'));

    function frame() {
        hover += (hoverT - hover) * 0.2;
        let x = mouse.x, y = mouse.y;
        dots.forEach((dot, index) => {
            const next = dots[index + 1] || dots[0];
            dot.x = x; dot.y = y;
            if (idle && index > SINE_DOTS) {   // the tail wobbles where it came to rest
                dot.angleX += 0.05; dot.angleY += 0.05;
                dot.x = dot.lockX + Math.sin(dot.angleX) * dot.range; dot.y = dot.lockY + Math.sin(dot.angleY) * dot.range;
            }
            const s = dot.scale * (index <= SINE_DOTS ? hover : 1);
            dot.el.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0) scale(${s})`;
            if (!idle || index <= SINE_DOTS) { x += (next.x - dot.x) * FOLLOW; y += (next.y - dot.y) * FOLLOW; }
        });
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
