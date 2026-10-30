/* ink-cursor.js: the pointer as a gooey trail of ink in the picked colour.
 *
 * A port of Eder Anaya's "Ink Cursor" (codepen.io/mendieta/pen/WgvENJ) without GSAP: twenty dots, each a little smaller than the one
 * before, chase each other at 35% of the gap per 120 Hz frame (rescaled by elapsed time, so a 60 Hz screen or Safari draws the same tight, quick trail) and a goo (blur + alpha threshold, drawn
 * with WebGL on a small canvas round the trail; an SVG filter without WebGL) melts them into one blob with a tail. When the pointer rests for 150 ms the tail's dots let go of the chain and wobble in place, so the ink keeps breathing.
 *
 * The ink is the hue picked in the hero (--primary-color, which color-shade-calculator.js sets on the root), made to stand out from
 * whatever is under the pointer: the ground there is read from the element under the pointer (its nearest painted background), and
 * the ink's lightness is pushed away from it until the contrast reaches 4.5:1 (light ink on a dark ground, deep ink on a pale one),
 * saturated so it still reads as the picked colour. It re-reads
 * the ground as the pointer moves (at most every 90 ms), on scroll, and when the colour is picked again; the change eases over 0.25 s.
 *
 * Only for a real mouse (hover + fine pointer) and without reduced motion; touch devices keep their native behaviour. Over links and
 * buttons the head swells a little, standing in for the native hand cursor, and (except on the colour picker, where a
 * change of colour would read as part of the pick) the blob switches to mix-blend-mode: difference, as in
 * the original, with the ink offset from the ground by its colour: the blob keeps its colour on the bare ground while the link under it
 * comes through inverted, in high contrast. Self-contained: it injects its own filter, styles and
 * element, and can be loaded on any page with <script type="module" src="js/ink-cursor.js"></script>.
 */
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (fine && !calm && !document.getElementById('ink-cursor')) start();

function start() {
    const AMOUNT = 20, SINE_DOTS = Math.floor(AMOUNT * 0.3), WIDTH = 26, IDLE_MS = 150, FOLLOW = 0.35, CONTRAST = 4.5;
    const TICK = 1000 / 120, LAG = FOLLOW * TICK / (1 - FOLLOW);   // the tuning frame (Chrome on a 120 Hz Mac) and each dot's lag behind the one before, in ms
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
        #ink-cursor { --ink: #4faad1; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;
            opacity: 0; transition: opacity 0.25s ease; }
        #ink-cursor.is-svg { filter: url(#ink-goo); }
        #ink-cursor canvas { position: absolute; top: 0; left: 0; display: block; }
        #ink-cursor.is-link { mix-blend-mode: difference; }
        #ink-cursor.is-snap span { transition: none; }
        #ink-cursor.is-shown { opacity: 1; }
        #ink-cursor.is-shown.is-picking { opacity: 0; transition-duration: 0.12s; }
        #ink-cursor span { position: absolute; top: 0; left: 0; width: ${WIDTH}px; height: ${WIDTH}px; border-radius: 50%; transform-origin: center center;
            background-color: var(--ink); transition: background-color 0.25s ease; }`;
    const cursor = document.createElement('div');
    cursor.id = 'ink-cursor'; cursor.setAttribute('aria-hidden', 'true');
    document.head.appendChild(style); document.body.append(svg, cursor);
    document.documentElement.classList.add('ink-cursor-on');
    let goo = new URLSearchParams(location.search).get('ink') === 'svg' ? null : gooCanvas(cursor, () => {   // ?ink=svg: the SVG filter, for comparison
        goo = null; cursor.classList.add('is-svg'); for (const d of dots) { d.el = document.createElement('span'); cursor.appendChild(d.el); }   // a lost context: the SVG filter takes over
    });
    if (!goo) cursor.classList.add('is-svg');

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
    let lastInk = '', over = false, inkTo = [0.31, 0.67, 0.82], inkNow = null;   // over: the pointer is on a link or button (not the colour picker), so the blob inverts what is under it
    function recolor(snap) {   // snap: the blend just changed, so the ink must not ease from a colour meant for the other blend
        const root = getComputedStyle(document.documentElement);
        const picked = parseColor(root.getPropertyValue('--primary-color')) || parseColor(root.getPropertyValue('--button-color')) || [79, 170, 209, 1];
        const ground = groundAt(Math.min(innerWidth - 1, Math.max(0, mouse.x + WIDTH / 2)), Math.min(innerHeight - 1, Math.max(0, mouse.y + WIDTH / 2)));
        const ph = parseFloat(root.getPropertyValue('--primary-hue')), [h0, s0] = toHsl(picked), h = s0 < 0.05 && isFinite(ph) ? ph / 360 : h0, s = Math.max(s0, 0.75), dark = lum(ground) < 0.3;
        const away = up => { let l = up ? 0.58 : 0.42, rgb = toRgb([h, s, l]);
            for (let k = 0; k < 16 && contrast(rgb, ground) < CONTRAST; k++) { l = up ? Math.min(0.94, l + 0.025) : Math.max(0.08, l - 0.025); rgb = toRgb([h, s, l]); }   // push the lightness away from the ground until it stands out
            return rgb; };
        const fits = rgb => rgb.every((v, c) => ground[c] + v <= 255 || ground[c] - v >= 0);
        let rgb = away(dark);
        if (over && !fits(rgb)) { const other = away(!dark); if (fits(other)) rgb = other; }   // on a mid ground a light ink can't show through the difference, a deep one can
        // over a link what shows is |ground - ink|, so the ink sits that colour away from the ground in each channel; where 0-255 can't reach it,
        // the ink that shows farthest from the ground: ink = ground shows 0, ink = 255 shows 255 - ground (ink 0 shows the ground itself, so the blob vanished on a mid-grey button)
        const inkRgb = rgb.map((v, c) => { const g = ground[c]; return Math.round(!over ? v : g + v <= 255 ? g + v : g - v >= 0 ? g - v : g >= 85 ? g : 255); }), ink = `rgb(${inkRgb.join(', ')})`;
        inkTo = inkRgb.map(v => v / 255); if (snap || !inkNow) inkNow = inkTo.slice();   // the canvas eases to it as the spans' background-color transition does
        if (snap) cursor.classList.add('is-snap');
        cursor.classList.toggle('is-link', over);
        if (ink !== lastInk) { cursor.style.setProperty('--ink', ink); lastInk = ink; }
        if (snap) { void cursor.offsetWidth; cursor.classList.remove('is-snap'); }
    }
    let recolorAt = 0, recolorQueued = false;
    const queueRecolor = () => { if (recolorQueued) return; const wait = Math.max(0, 90 - (performance.now() - recolorAt)); recolorQueued = true; setTimeout(() => { recolorQueued = false; recolorAt = performance.now(); recolor(); }, wait); };
    new MutationObserver(queueRecolor).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });   // a new pick (the picker writes the root's variables)
    new MutationObserver(queueRecolor).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    addEventListener('scroll', queueRecolor, { passive: true });

    /* ---- motion */
    let idle = false, idleTimer = 0, hover = 1, hoverT = 1;
    const dots = Array.from({ length: AMOUNT }, (_, index) => {
        const scale = 1 - 0.05 * index, el = goo ? null : document.createElement('span');
        if (el) cursor.appendChild(el);
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
        const onLink = e.target instanceof Element && !!e.target.closest(INTERACTIVE);
        hoverT = onLink ? 1.55 : 1;
        const invert = onLink && !e.target.closest('#color-picker-container');
        if (invert !== over) { over = invert; recolor(true); } else queueRecolor();
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

    // without WebGL the dots are painted into the SVG goo layer, not composited one by one: Safari leaves its own layers out of an SVG filter
    let lastT = performance.now(), shownAt = -1e9;
    function frame(t) {
        const dt = Math.min(50, Math.max(1, t - lastT)), k = dt / TICK, follow = LAG / (dt + LAG); lastT = t;   // follow: the share of the gap kept, so the trail spans the same time at any frame rate
        hover += (hoverT - hover) * (1 - Math.pow(0.8, k));
        let x = mouse.x, y = mouse.y;
        dots.forEach((dot, index) => {
            const next = dots[index + 1] || dots[0];
            dot.x = x; dot.y = y;
            if (idle && index > SINE_DOTS) {   // the tail wobbles where it came to rest
                dot.angleX += 0.05 * k; dot.angleY += 0.05 * k;
                dot.x = dot.lockX + Math.sin(dot.angleX) * dot.range; dot.y = dot.lockY + Math.sin(dot.angleY) * dot.range;
            }
            const s = dot.scale * (index <= SINE_DOTS ? hover : 1);
            if (goo) dot.r = WIDTH / 2 * s; else dot.el.style.transform = `translate(${dot.x}px, ${dot.y}px) scale(${s})`;
            if (!idle || index <= SINE_DOTS) { x += (next.x - dot.x) * follow; y += (next.y - dot.y) * follow; }
        });
        if (goo && inkNow) {
            const e = 1 - Math.exp(-dt / 80); for (let c = 0; c < 3; c++) inkNow[c] += (inkTo[c] - inkNow[c]) * e;
            if (cursor.classList.contains('is-shown')) shownAt = t;
            if (t - shownAt < 300) goo.draw(dots, WIDTH / 2, inkNow);   // and through the 0.25 s fade-out, so the ink keeps moving as it goes
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// The goo, drawn: a small WebGL canvas round the trail does on the GPU, in every browser, what the SVG filter does (Safari renders an SVG
// filter on page content on the CPU every frame, and its blob came out sluggish and less melted): the dots' union is drawn into a texture
// at half the CSS resolution (the blur hides it) and blurred by 6 px across; one pass at full resolution then blurs it down and pushes the
// alpha through 35a - 15, a third as steep, into an edge about a pixel soft (the filter's own edge read on screen as a cut-out; Felix chose
// this one by eye, 2026-10-29). Without WebGL, or after a lost context, the cursor uses the SVG filter.
function gooCanvas(host, onLost) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true });
    if (!gl) return null;
    const N = 20, SIGMA = 6, MARGIN = 3 * SIGMA, TAPS = 9;   // the blur at half resolution: sigma 3 texels, 9 taps each side
    const VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const program = fs => {
        const pr = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, 'precision highp float;\n' + fs]]) { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); gl.attachShader(pr, o); }
        gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
        const u = {}; for (const n of ['uDots', 'uTex', 'uStep', 'uSize', 'uInk']) u[n] = gl.getUniformLocation(pr, n);
        return { pr, u };
    };
    const discs = program(`uniform vec3 uDots[${N}];   // x, y (CSS px, from the bottom-left), radius
        void main() {
            vec2 p = gl_FragCoord.xy * 2.0; float c = 0.0;
            for (int i = 0; i < ${N}; i++) c = max(c, clamp((uDots[i].z - length(p - uDots[i].xy)) * 0.5 + 0.5, 0.0, 1.0));
            gl_FragColor = vec4(c);
        }`);
    const blur = program(`uniform sampler2D uTex; uniform vec2 uStep, uSize;
        void main() {
            vec2 uv = gl_FragCoord.xy / uSize; float s = 0.0, w = 0.0;
            for (int i = -${TAPS}; i <= ${TAPS}; i++) { float k = exp(-float(i * i) / ${(2 * (SIGMA / 2) ** 2).toFixed(1)}); s += texture2D(uTex, uv + uStep * float(i)).a * k; w += k; }
            gl_FragColor = vec4(s / w);
        }`);
    const edge = program(`uniform sampler2D uTex; uniform vec2 uStep, uSize; uniform vec3 uInk;   // the vertical blur and the threshold in one, at full resolution
        void main() {   // (stored in 8 bits and then multiplied by 35, the blurred alpha stepped in sevenths: a ragged, darker rim)
            vec2 uv = gl_FragCoord.xy / uSize; float s = 0.0, w = 0.0;
            for (int i = -${TAPS}; i <= ${TAPS}; i++) { float k = exp(-float(i * i) / ${(2 * (SIGMA / 2) ** 2).toFixed(1)}); s += texture2D(uTex, uv + uStep * float(i)).a * k; w += k; }
            float a = clamp((s / w - ${(31 / 70).toFixed(5)}) * 12.0 + 0.5, 0.0, 1.0); gl_FragColor = vec4(uInk * a, a);   // the filter's 35a - 15, a third as steep
        }`);
    if (!discs || !blur || !edge) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const target = () => {
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fb };
    };
    const A = target(), B = target();
    const buf = new Float32Array(N * 3), MAX_PX = 2048;   // per side: only a flick across a large screen reaches it, and only then does the edge pass run coarser
    let bw = 0, bh = 0, pr = 0, lost = false, smallSince = 0;
    function resize(w, h) {   // a rectangle round the trail (a long trail is thin), even in CSS px so the half-resolution textures cover it exactly
        bw = w; bh = h;
        pr = Math.min(devicePixelRatio || 1, 2, MAX_PX / Math.max(bw, bh));   // read each time: the window may have moved to another display
        canvas.width = Math.round(bw * pr); canvas.height = Math.round(bh * pr); canvas.style.width = bw + 'px'; canvas.style.height = bh + 'px';
        for (const t of [A, B]) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw / 2, bh / 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    }
    const pass = (prog, to, from, w, h) => {
        gl.useProgram(prog.pr); gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null); gl.viewport(0, 0, w, h);
        if (from) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from.tex); gl.uniform1i(prog.u.uTex, 0); }
        if (prog.u.uSize) gl.uniform2f(prog.u.uSize, w, h);
        return prog;
    };
    canvas.addEventListener('webglcontextlost', () => { lost = true; canvas.remove(); onLost(); }, { once: true });
    host.appendChild(canvas);
    return {
        draw(dots, r0, ink) {
            if (lost) return;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;   // the trail's extent, dot centres
            for (const d of dots) { const cx = d.x + r0, cy = d.y + r0; if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy; }
            const pad = 2 * (r0 * 1.6 + MARGIN), fit = v => Math.max(96, 32 * Math.ceil(v * 1.25 / 32));   // r0 * 1.6: the head swells over links
            const nw = x1 - x0 + pad, nh = y1 - y0 + pad, now = performance.now();
            const grow = nw > bw || nh > bh, slack = fit(nw) < bw * 0.75 || fit(nh) < bh * 0.75;
            if (grow || !slack) smallSince = now;
            if (grow) resize(Math.max(fit(nw), bw), Math.max(fit(nh), bh));   // grows with room to spare, shrinks once the trail has stayed well inside for half a second
            else if (now - smallSince > 500) resize(fit(nw), fit(nh));
            else if (Math.min(devicePixelRatio || 1, 2, MAX_PX / Math.max(bw, bh)) !== pr) resize(bw, bh);
            const dp = devicePixelRatio || 1, ox = Math.round(((x0 + x1) / 2 - bw / 2) * dp) / dp, oy = Math.round(((y0 + y1) / 2 - bh / 2) * dp) / dp;   // on whole device pixels
            canvas.style.transform = `translate(${ox}px, ${oy}px)`;
            dots.forEach((d, i) => { buf[i * 3] = d.x + r0 - ox; buf[i * 3 + 1] = bh - (d.y + r0 - oy); buf[i * 3 + 2] = d.r; });
            gl.uniform3fv(pass(discs, A, null, bw / 2, bh / 2).u.uDots, buf); gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.uniform2f(pass(blur, B, A, bw / 2, bh / 2).u.uStep, 2 / bw, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
            pass(edge, null, B, canvas.width, canvas.height); gl.uniform2f(edge.u.uStep, 0, 2 / bh); gl.uniform3f(edge.u.uInk, ink[0], ink[1], ink[2]); gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
    };
}
