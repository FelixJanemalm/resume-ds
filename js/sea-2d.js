/* sea-2d.js: the page's particle voyage drawn on the CPU, on a plain 2D canvas, for a browser that gives the page no WebGL at all (graphics
 * acceleration off or crashed, a remote desktop, a virtual machine): the hero's sea and ship, the ship's voyage down the page, the fleet at
 * the quote and the armada at the end. Started by work-spine.js when there is no hardware WebGL (or with ?sea=2d).
 *
 * Not a copy of pixels: the same scene, computed again. The pose the scroll decides (where the ship sits, its size, course, tilt and level,
 * where the hero's sea lies, the way on, the fleet, the launch and where the layer sits) comes from images/sea/voyage-track.json, recorded
 * from the live page (every 12 px over the hero, the ship settled at rest; every 24 px below it, scrolled at a reading pace); between rows
 * it is interpolated, and each part of it chases the scroll through the live ship's own lags.
 * Everything time drives is computed here with the live layer's own formulas: the scene's sway and bob, the hull's pitch, heave and roll on
 * the swell, and the sea itself (voyage-fold.js's seaHeight and the shader's crest-line phase), so the water runs on whether or not the
 * page scrolls.
 *   the crest lines: each line is where the swell's phase crosses a whole band, solved in closed form along the sea's across axis, lifted by
 *     the swell's height, faded with distance as the shader fades them;
 *   the dots: all 60,000 of the shader's, on the same disc, with its brightness (the band they sit in, their seed, the distance) and size;
 *   the ship: the real model's particles (voyage-boat.js), posed as the shader poses them (about the waterline: pitch, heel, heave; then the
 *     hull's rotation, scale and place), its water and wake left out (the shader builds those).
 * The cost is in drawing, not in the sums: the small dots and the ship's specks are summed as light into one buffer written in a single call,
 * the lines are one-pixel strokes in a dozen batches. 60 frames a second, or 30 on a machine that cannot hold 60, at the CSS pixel size;
 * the canvas sits where the live one does (above the hero's grid).
 */
import { DEFAULTS, LAB } from './voyage-fold.js';
import { buildBoatLevels, WATERLINE } from './voyage-boat.js';

const D2R = Math.PI / 180, NDOTS = 30000, DOT_BOOST = 1.4, SHIP_N = Math.floor(256 * 256 * 0.2);   // the first 30,000 of the shader's 60,000 dots (the same layout, thinned), each 1.4 x brighter for the light the rest carried | the layer's ship share (13,107 on a desktop)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };   // row-major 3x3
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const mul = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
// voyage-fold.js's seaHeight with all that depends only on the time worked out once a frame: the same sea, three cosines a point instead of sixteen sines
export function seaField(o, t) {
    const D = Math.PI / 180, TAU = 2 * Math.PI, a = o.axis * D, sa = Math.sin(a), ca = Math.cos(a), wob = o.wander * D * Math.sin(t * o.wanderRate), B = o.bend * 0.1, H = o.height;
    const a1 = a + o.swellRot * D + wob, k1 = TAU / o.lambda, c1 = Math.cos(a1) * k1, s1 = Math.sin(a1) * k1, p1 = o.speed * t * k1, r1 = o.crest * 0.5, g1 = o.amp * (1 + o.breathe * Math.sin(t * o.breatheRate)) / (1 + r1) * H;
    const a2 = o.dir2 * D - wob, k2 = TAU / o.lambda2, c2 = Math.cos(a2) * k2, s2 = Math.sin(a2) * k2, p2 = o.speed * o.spd2 * t * k2, r2 = o.crest * 0.3, g2 = o.amp2 / (1 + r2) * H;
    const a3 = o.dir3 * D + wob * 0.5, k3 = TAU / Math.max(0.2, o.lambda3), c3 = Math.cos(a3) * k3, s3 = Math.sin(a3) * k3, p3 = o.speed * o.spd3 * t * k3, r3 = o.crest * 0.2, g3 = o.amp3 > 0 ? o.amp3 / (1 + r3) * H : 0;
    return (x, z) => {   // wave(th, crest) = (cos th + crest/2 cos 2th) / (1 + crest/2), and cos 2th = 2 cos^2 th - 1
        const ac = -x * sa + z * ca;
        let c = Math.cos(x * c1 + z * s1 - B * ac * ac * k1 + p1), h = g1 * (c + r1 * (2 * c * c - 1));
        c = Math.cos(x * c2 + z * s2 + p2); h += g2 * (c + r2 * (2 * c * c - 1));
        if (g3) { c = Math.cos(x * c3 + z * s3 + p3); h += g3 * (c + r3 * (2 * c * c - 1)); }
        return h;
    };
}
const hsl = (h, s, l) => { const k = n => (n + h * 12) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0), f(8), f(4)]; };

/* the page's side: a canvas where the live one sits, drawn by a worker when the browser can hand a canvas to one (the page's own thread then
   only passes on the scroll, the size and the colour, and stays free for the scroll itself), else drawn here. ?sea=2d&main: always here */
export async function start() {
    if (document.getElementById('sea-2d')) return;
    let T;
    try { T = await (await fetch('images/sea/voyage-track.json')).json(); } catch (e) { console.warn('sea-2d: no track', e); return; }
    let canvas = null;
    const mount = () => {
        canvas?.remove(); canvas = document.createElement('canvas');
        canvas.id = 'sea-2d'; canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;z-index:1;pointer-events:none;';
        document.body.appendChild(canvas);
    };
    mount();
    // the picked colour, and the page's ground under the canvas (on a pale one the sea is drawn in dark ink: see color() below)
    const colour = () => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() + '|' + getComputedStyle(document.body).backgroundColor + '|' + (document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind') ? 'light' : '');
    const box = () => ({ w: Math.max(1, Math.round(innerWidth)), h: Math.max(1, Math.round(canvas.getBoundingClientRect().height || innerHeight)) });
    // z: where the live layer sits (over the hero, behind the page below it, over the page at the ending); blend: at the ending the canvas is
    // screened over a dark ground, multiplied over a pale one, as live's
    const show = (v, z, blend) => {
        const s = v ? '' : 'hidden'; if (canvas.style.visibility !== s) canvas.style.visibility = s;
        if (z !== undefined && canvas.style.zIndex !== String(z)) canvas.style.zIndex = z;
        if (blend !== undefined && canvas.style.mixBlendMode !== blend) canvas.style.mixBlendMode = blend;
    };
    // the ending's block (the armada is drawn from its top edge down): where its top is on the screen
    const block = document.querySelector('.testimonials-wrapper'), clip = () => block ? block.getBoundingClientRect().top : 1e9;
    // the page's end (live's docEnd: the body or the footer's foot, whichever is lower), less a screen: the scroll at which the page ends
    const foot = document.querySelector('footer'), end = () => Math.max(document.body.offsetHeight, foot ? foot.getBoundingClientRect().bottom + scrollY : 0) - innerHeight;   // z: where the live layer sits (over the hero, behind the page below it)   // (hidden, not display:none: it keeps its size for a resize down the page)
    const S = { y: scrollY, vh: innerHeight, ...box(), clip: clip(), end: end(), colour: colour(), hidden: document.hidden, prof: new URLSearchParams(location.search).has('prof') };
    const here = () => {   // drawn on the page (a canvas handed to a worker never comes back: a failed worker leaves a fresh one here)
        if (canvas.dataset.sent) mount();
        Object.assign(S, { y: scrollY, vh: innerHeight, ...box(), clip: clip(), end: end(), colour: colour(), hidden: document.hidden });
        const api = draw(canvas, T, S, show, (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, p => { window.__s2dP = p; });
        send = m => api.set(m);
    };
    let send = () => {};
    if (canvas.transferControlToOffscreen && typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && !new URLSearchParams(location.search).has('main')) {
        let wk = null, ok = false;
        const fail = why => { if (!wk) return; console.warn('sea-2d: the worker failed, drawing on the page', why); wk.terminate(); wk = null; here(); };
        try {
            wk = new Worker(import.meta.url, { type: 'module' });
            const off = canvas.transferControlToOffscreen(); canvas.dataset.sent = '1';
            wk.onmessage = e => { const m = e.data; if (m.ready) ok = true; if (m.failed) fail(m.failed); if ('show' in m) show(m.show, m.z, m.blend); if (m.prof) window.__s2dP = m.prof; };
            wk.onerror = e => { e.preventDefault?.(); fail(e.message || 'did not load'); };
            wk.postMessage({ init: true, canvas: off, T, S }, [off]);
            send = m => wk && wk.postMessage(m);
            setTimeout(() => { if (!ok) fail('no answer in 8 s'); }, 8000);
        } catch (e) { wk?.terminate(); wk = null; console.warn('sea-2d: no worker, drawing on the page', e); here(); }
    } else here();
    addEventListener('scroll', () => send({ y: scrollY, clip: clip(), end: end() }), { passive: true });
    addEventListener('resize', () => send({ y: scrollY, vh: innerHeight, ...box(), clip: clip(), end: end() }));
    document.addEventListener('visibilitychange', () => send({ hidden: document.hidden }));
    let c0 = S.colour; setInterval(() => { const c = colour(); if (c !== c0) { c0 = c; send({ colour: c }); } }, 300);   // the picker
}

/* the worker's side: the same drawing on the canvas the page handed over */
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    let api = null;
    self.onmessage = e => {
        const m = e.data;
        if (m.init) {
            try { api = draw(m.canvas, m.T, m.S, (v, z, blend) => self.postMessage({ show: v, z, blend }), (w, h = w) => new OffscreenCanvas(w, h), p => self.postMessage({ prof: p })); self.postMessage({ ready: true }); }
            catch (err) { self.postMessage({ failed: String(err && err.message || err) }); }
        } else if (api) api.set(m);
    };
    self.addEventListener('error', e => self.postMessage({ failed: e.message || 'error' }));   // a frame that throws: the page takes over
}

/* the drawing, on either side: S holds what the page reports (scroll, its height, the canvas's size, the colour, whether the tab is hidden) */
function draw(canvas, T, S, show, newCanvas, report) {
    const o = DEFAULTS, rows = T.rows, K = Object.fromEntries(T.keys.map((k, i) => [k, i])), pc = T.pc;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const PR = 1;   // CSS pixels: on a 2x screen 1.25x looked the same and cost a fifth more of each frame
    let accS, accI, img, px32, lit1;   // the light buffer: the sea's dots and the ship's specks, summed per pixel, and the pixels they are written through
    function size() {
        if (W === Math.max(1, Math.round(S.w * PR)) && H === Math.max(1, Math.round(S.h * PR))) return;   // (a phone's bar sliding fires resizes at the same size)
        W = canvas.width = Math.max(1, Math.round(S.w * PR)); H = canvas.height = Math.max(1, Math.round(S.h * PR));
        accS = new Float32Array(W * H); accI = new Float32Array(W * H); img = ctx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer); lit1 = new Int32Array(W * H);
    }
    size();

    /* ---- colour: the picked hue, as the live layer takes it (the sea at the lab's saturation and lightness, the ship's ink pushed vivid) */
    // on a pale ground (the light theme, or a light picked colour) light added to the page would not show: the live layer then draws its
    // points as dark ink of the same hue, and so does this (pale; dark: the tints it uses then)
    let hueNow = 0.58, sea = [0.3, 0.5, 0.8], ink = [0.4, 0.6, 1], pale = false, blendPale = false, dark = null, colorKey = null;
    function color() {
        if (S.colour === colorKey) return; colorKey = S.colour;
        const [c, bg = '', theme = ''] = S.colour.split('|'), gm = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(bg), ground = gm ? [gm[1] / 255, gm[2] / 255, gm[3] / 255] : [0.26, 0.26, 0.26];
        const m = /^#?([0-9a-f]{6})$/i.exec(c), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : [0.08, 0.4, 0.72];
        const mx = Math.max(...rgb), mn = Math.min(...rgb), d = mx - mn, [r, g, b] = rgb;
        const h = !d ? 0 : (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; hueNow = h;
        sea = hsl(h, o.sat, o.lum); ink = hsl(h, 0.85, 0.62);
        const lin = v => { v = Math.min(1, v); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };   // as the live layer judges it (groundLum; dark ink past half of smoothstep(0.06, 0.4))
        const lum = 0.2126 * lin(ground[0]) + 0.7152 * lin(ground[1]) + 0.0722 * lin(ground[2]); pale = theme === 'light' || lum > 0.23; blendPale = theme === 'light' || lum > 0.2;   // (the ending's blend: live's own test) dark = { sea: hsl(h, o.sat, 0.28), ink: hsl(h, 0.85, 0.22) };
        dotSprites(pale ? dark.sea : sea.map(v => v + (1 - v) * 0.3));
    }

    /* ---- the ship's particles, both levels the hero passes through (lo, hi), the shader-built water and wake left out */
    const boat = buildBoatLevels(SHIP_N, 1), role = i => Math.round(boat.meta[0][i * 4]);
    /* the fleet at the quote (live's): nine small copies of the ship in three waves, each made of an even sample of its particles (40% for the
       first wave's three, 22% for the rest), every member with its own threshold on the route's fleet key, so a copy forms a few particles at a
       time; per copy its place in the formation (hull lengths aft, toward the horizon, across) and its size */
    const FLEET_WAVE = [0, 0, 0, 1, 1, 1, 2, 2, 2], FLEET_SAMPLE = [0.4, 0.4, 0.4, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22];
    const FLEET_POS = [[-1.1, 0.30, -0.8, 0.30], [-1.2, 0.55, 0.8, 0.24], [0.9, 0.45, 0.9, 0.26], [-2.3, 0.80, -1.4, 0.18], [-0.4, 0.95, 1.9, 0.16], [2.0, 0.85, -1.2, 0.17], [-3.2, 1.10, 0.4, 0.13], [1.2, 1.20, 2.6, 0.12], [3.1, 1.15, 1.6, 0.12]];
    // a small copy needs fewer of them than live gives it: each copy keeps at most 3 x the ship's own density on the screen (live's far copies,
    // at an eighth of the ship's size, put 15 particles on each of its pixels), each member carrying the light of those it stands for (fleetW)
    const fleetM = [], fleetW = []; { let a = 20261030; const rf = () => (a = (a * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < 9; k++) { const cnt0 = Math.floor(SHIP_N * FLEET_SAMPLE[k]), sz = FLEET_POS[k][3], cnt = Math.max(1, Math.min(cnt0, Math.floor(SHIP_N * sz * sz * 3))); fleetW[k] = cnt0 / cnt; for (let j = 0; j < cnt; j++) { const src = Math.floor(j * SHIP_N / cnt), rl = Math.round(boat.meta[0][src * 4]); if (rl !== 6 && rl !== 7) fleetM.push(src, k, FLEET_WAVE[k] + 0.999 * rf()); } } }
    const shipIdx = [], refl = new Uint8Array(SHIP_N); for (let i = 0; i < SHIP_N; i++) { const r = role(i); if (r !== 6 && r !== 7) shipIdx.push(i); refl[i] = r === 8 ? 1 : 0; }

    /* ---- the sea's dots: a seeded disc of the shader's own layout (radius 34 lab units round the lab's middle, denser in the middle) */
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dots = new Float32Array(NDOTS * 3); for (let i = 0; i < NDOTS; i++) { const r = 34 * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI; dots[i * 3] = Math.cos(a) * r; dots[i * 3 + 1] = Math.sin(a) * r; dots[i * 3 + 2] = Math.pow(rnd(), 2.2); }
    // the dot's disc (the shader's smoothstep(0.5, 0.1, d); a one-pixel point is lit whole): as a kernel of weights for every whole size up to
    // KMAX px, summed into the light buffer, and above that as tinted sprites, ready at every whole size up to 16 px and one big one to scale
    const disc = (n, x, y) => n === 1 ? 1 : smooth(0.5, 0.1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5));
    const KMAX = 6, kern = [];
    for (let n = 1; n <= KMAX; n++) { kern[n] = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) kern[n][y * n + x] = disc(n, x, y); }
    /* ---- the ending (live's armada): the fleet's ship (the clipper, the route's last level before the launch) as silk cloth, 32 copies
       sailing off across the testimonials and the footer, seen from a camera high over the sea. The ship is the same for every copy, in the
       same view, so it is drawn once (cloth and dots, from the model) and set down 32 times a frame, each copy at its place on the course, its
       distance's size, surging and drifting on its own clock; the canvas lies over the page there, screened (multiplied on a pale ground),
       drawn from the block's top edge down, and moves up with the page until the page's end */
    const ARMADA_K = 32, ARMADA_LOOP = 48, ARMADA_SPEED = 0.6, ARMADA_VIEW = { wide: { turn: 313, tilt: 34, x: -0.1, y: -0.7, unit: null }, tall: { turn: 292, tilt: 40, x: 0, y: -0.75, unit: 0.62 } };
    const ARMADA = (() => { let a = 20260915; const rf = () => (a = (a * 16807) % 2147483647) / 2147483647, out = [], L = ARMADA_LOOP;   // live's scatter, the same seed
        for (let tries = 0; out.length < ARMADA_K && tries < 80000; tries++) {
            const sAlong = rf() * L, zAcross = -5.8 + rf() * 9;
            if (out.every(o => { const ds = Math.abs(o[0] - sAlong), dl = Math.min(ds, L - ds); return Math.hypot(dl, o[1] - zAcross) > 2.8; })) out.push([sAlong, zAcross, 0.84 + 0.22 * rf(), rf()]);
        }
        return out; })();
    const FL = 5;   // the fleet's level
    let armSpr = null, armKey = '', armWinKey = '', armWin = null;
    // the copies' loop along the course for this screen: from just before the first can enter the frame to after every one has left it (live's armadaWin)
    function armadaWindow(V, unit, asp) {
        const extra = Math.max(0, (S.end || 0) - (S.y + (S.clip || 0))), xN = 2 * extra / H;   // the block's part above the screen when the page has ended: a copy must clear it before it wraps (live's extraNDC)
        const k = W + 'x' + H + ':' + unit.toFixed(3) + ':' + Math.round(extra); if (k === armWinKey) return armWin; armWinKey = k;
        const Rf = mul(rx(V.tilt * D2R), ry(-V.turn * D2R)), visH = 2 * cam[2] * tanH, visW = visH * asp, Ax = V.x * visW / 2, Ay = V.y * visH / 2;
        const on = (sAl, a, dAl, dUp, hl) => { const cx = sAl + dAl * hl, uy = dUp * hl, px = Ax + Rf[0] * cx + Rf[1] * uy + Rf[2] * a, py = Ay + Rf[3] * cx + Rf[4] * uy + Rf[5] * a, pz = Rf[6] * cx + Rf[7] * uy + Rf[8] * a, d = cam[2] - pz, ny = py / (d * tanH);
            return d > 0.5 && Math.abs(px / (d * tanH * asp)) < 1.12 && ny > -1.12 && ny < 1.12 + xN; };
        let first = Infinity, last = -Infinity;
        for (const S of ARMADA) { const a = S[1] * unit, hl = S[2] * unit; for (let sAl = -40; sAl <= 160; sAl += 0.25) if (on(sAl, a, 0, 0.5, hl) || on(sAl, a, 1.0, 0, hl) || on(sAl, a, -0.5, 0, hl) || on(sAl, a, 0, 1.4, hl) || on(sAl, a, -1.9, 0, hl)) { if (sAl < first) first = sAl; if (sAl > last) last = sAl; } }
        if (!Number.isFinite(first)) { first = -12; last = 28; }
        return (armWin = { s0: first - 2, len: Math.max(ARMADA_LOOP * Math.max(unit, 0.6), last - first + 4) });
    }
    // the ship drawn once: its cloth (the sails' and the hull's particle grids, smoothed as live's cloth is: Catmull-Rom, each cell cut 3 x 3),
    // flat-shaded per facet (the colour fanned from the picked hue, light at the head and deep at the foot; a plain light from the upper left; a
    // little sheen where it turns edge-on), far facets first, then its dots; px: pixels per hull length
    function armadaSprite(Rf, px) {
        const pos = boat.pos[FL], WL = WATERLINE, Kc = 3, tris = [], P3 = i => [pos[i * 4], pos[i * 4 + 1] - WL, pos[i * 4 + 2]];
        const cr = t => [((2 - t) * t - 1) * t / 2, (t * t * (3 * t - 5) + 2) / 2, ((4 - 3 * t) * t + 1) * t / 2, (t - 1) * t * t / 2];
        let top = -Infinity; for (const sd of boat.mesh.sails) if (sd.levels[FL]) for (const i of sd.idx) top = Math.max(top, pos[i * 4 + 1]);
        const hy = Math.max(1e-3, top - WL);
        const grid = (idx, nu, nv, sides, hull) => {
            const per = nu * nv;
            for (let sdx = 0; sdx < sides; sdx++) {
                const at = (iu, iv) => idx[sdx * per + Math.max(0, Math.min(nv - 1, iv)) * nu + Math.max(0, Math.min(nu - 1, iu))];
                const FU = (nu - 1) * Kc + 1, FV = (nv - 1) * Kc + 1, V = [];
                for (let fv = 0; fv < FV; fv++) for (let fu = 0; fu < FU; fu++) {
                    const iu = Math.min(nu - 2, Math.floor(fu / Kc)), iv = Math.min(nv - 2, Math.floor(fv / Kc)), ws = cr(fu / Kc - iu), wt = cr(fv / Kc - iv), p = [0, 0, 0];
                    for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) { const q = P3(at(iu - 1 + a, iv - 1 + b)), w = ws[a] * wt[b]; p[0] += q[0] * w; p[1] += q[1] * w; p[2] += q[2] * w; }
                    V.push([Rf[0] * p[0] + Rf[1] * p[1] + Rf[2] * p[2], Rf[3] * p[0] + Rf[4] * p[1] + Rf[5] * p[2], Rf[6] * p[0] + Rf[7] * p[1] + Rf[8] * p[2], fv / (FV - 1), p[1] / hy]);
                }
                for (let fv = 0; fv < FV - 1; fv++) for (let fu = 0; fu < FU - 1; fu++) { const a = fv * FU + fu; tris.push([V[a], V[a + 1], V[a + FU], hull], [V[a + 1], V[a + FU + 1], V[a + FU], hull]); }
            }
        };
        for (const sd of boat.mesh.sails) if (sd.levels[FL]) grid(sd.idx, sd.na, sd.nup, 1, false);
        if (boat.mesh.hull) grid(boat.mesh.hull.idx, boat.mesh.hull.nu, boat.mesh.hull.nv, 2, true);
        if (!tris.length) return null;
        // the sprite's extent (screen: x right, y down)
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const t of tris) for (const v of t.slice(0, 3)) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, -v[1]); y1 = Math.max(y1, -v[1]); }
        const pad = 3, w = Math.ceil((x1 - x0) * px) + 2 * pad, h = Math.ceil((y1 - y0) * px) + 2 * pad, ox = -x0 * px + pad, oy = -y0 * px + pad;
        const acc = new Float32Array(w * h * 4), Lx = -0.4, Ly = 0.75, Lz = 0.5, Ll = Math.hypot(Lx, Ly, Lz);
        tris.sort((a, b) => (a[0][2] + a[1][2] + a[2][2]) - (b[0][2] + b[1][2] + b[2][2]));   // far first (toward -z, away from the camera)
        const [A, B, C] = armCols;
        for (const [p, q, rr, hull] of tris) {
            const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = rr[0] - p[0], vy = rr[1] - p[1], vz = rr[2] - p[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // the side facing the camera (cloth is two-sided)
            const lit = 0.45 + 0.85 * Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / Ll), sheen = Math.min(1, 0.5 * Math.pow(1 - nz, 2.5)) * 0.65;
            const f = (p[3] + q[3] + rr[3]) / 3 * 0.7 + (p[4] + q[4] + rr[4]) / 3 * 0.3, y = 1 - Math.min(1, Math.max(0, f));   // up the sail (and a little up the rig): 0 head .. 1 foot
            const col = [0, 1, 2].map(k => { let c = hull ? C[k] * 0.7 : (A[k] + (B[k] - A[k]) * smooth(0, 0.55, y)) * (1 - smooth(0.45, 1, y)) + C[k] * smooth(0.45, 1, y);
                if (!hull) c *= 1 - 0.32 * smooth(0.6, 1, y); c = Math.min(1, c * (1 + (lit - 1) * 0.9)); return c + (1 - c) * sheen; });
            fillTri(acc, w, h, p[0] * px + ox, -p[1] * px + oy, q[0] * px + ox, -q[1] * px + oy, rr[0] * px + ox, -rr[1] * px + oy, col, 0.95);
        }
        // its dots: the clipper's solid particles, as light on the cloth
        const lit2 = ink.map(v => v + (1 - v) * 0.45);
        for (let i = 0; i < SHIP_N; i += 2) {
            const rl = role(i); if (rl === 6 || rl === 7 || rl === 8 || pos[i * 4 + 3] < 0.03) continue;
            const x = pos[i * 4], y = pos[i * 4 + 1] - WL, zz = pos[i * 4 + 2], sx = (Rf[0] * x + Rf[1] * y + Rf[2] * zz) * px + ox, sy = -(Rf[3] * x + Rf[4] * y + Rf[5] * zz) * px + oy;
            const X = sx | 0, Y = sy | 0; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
            const q4 = (Y * w + X) * 4, a = 0.35 * pos[i * 4 + 3], k = 1 - a; for (let c = 0; c < 3; c++) acc[q4 + c] = lit2[c] * a + acc[q4 + c] * k; acc[q4 + 3] = a + acc[q4 + 3] * k;
        }
        const cv = newCanvas(w, h), g = cv.getContext('2d'), im = g.createImageData(w, h), d32 = new Uint32Array(im.data.buffer);
        for (let q = 0; q < w * h; q++) { const a = acc[q * 4 + 3]; if (!(a > 0.003)) continue; const ia = 255 / a; d32[q] = (Math.min(255, a * 255) << 24) | (Math.min(255, acc[q * 4 + 2] * ia) << 16) | (Math.min(255, acc[q * 4 + 1] * ia) << 8) | Math.min(255, acc[q * 4] * ia); }
        g.putImageData(im, 0, 0);
        return { cv, ox, oy, px };
    }
    // a triangle of one colour laid over the buffer (premultiplied), its edges covered by the pixel centres inside it
    function fillTri(acc, w, h, ax, ay, bx, by, cx, cy, col, al) {
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-6) return; const ia = 1 / area;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5, w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * ia, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * ia;
            if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
            const q = (y * w + x) * 4, k = 1 - al; acc[q] = col[0] * al + acc[q] * k; acc[q + 1] = col[1] * al + acc[q + 1] * k; acc[q + 2] = col[2] * al + acc[q + 2] * k; acc[q + 3] = al + acc[q + 3] * k;
        }
    }
    let armCols = null;
    function armadaFrame(t) {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
        const asp = W / H, tall = H > W, V = tall ? ARMADA_VIEW.tall : ARMADA_VIEW.wide, visH = 2 * cam[2] * tanH, visW = visH * asp, unit = V.unit || Math.max(0.4, Math.min(1, visW / 12));
        const Rf = mul(rx(V.tilt * D2R), ry(-V.turn * D2R)), win = armadaWindow(V, unit, asp), Ax = V.x * visW / 2, Ay = V.y * visH / 2;
        const sprPx = Math.round(H / (2 * 6 * tanH) * unit * 1.1), key = colorKey + '|' + sprPx + '|' + (tall ? 't' : 'w');   // the sprite at about the nearest copy's size
        if (key !== armKey) { armKey = key; const h0 = hueNow; armCols = [hsl((h0 - 0.07 + 1) % 1, 0.95, 0.66), hsl(h0, 0.95, 0.52), hsl((h0 + 0.09) % 1, 0.9, 0.4)]; armSpr = armadaSprite(Rf, sprPx); }
        if (!armSpr) return;
        const below = Math.max(0, (S.end || 0) - S.y), clipY = Math.max(0, S.clip || 0);   // the page still below the screen: the shot sits lower by that; drawn only below the block's top
        if (clipY >= H) return;
        ctx.save(); ctx.beginPath(); ctx.rect(0, clipY, W, H - clipY); ctx.clip();
        const list = [];
        for (let k = 0; k < ARMADA.length; k++) {
            const A = ARMADA[k], h = A[3], rel = ((A[0] * win.len / ARMADA_LOOP + t * ARMADA_SPEED) % win.len + win.len) % win.len;
            const cx = win.s0 + rel + 0.45 * Math.sin(t * (0.05 + 0.04 * h) + 6.283 * h), cy = 0.02 * Math.sin(t * (0.8 + 0.3 * h) + 9 * h), cz = A[1] * unit + 0.08 * Math.sin(t * (0.04 + 0.04 * h) + 4.1 * h), hl = A[2] * unit;
            const wx = Ax + Rf[0] * cx + Rf[1] * cy + Rf[2] * cz, wy = Ay + Rf[3] * cx + Rf[4] * cy + Rf[5] * cz, wz = Rf[6] * cx + Rf[7] * cy + Rf[8] * cz, d = cam[2] - wz; if (d < 0.5) continue;
            list.push([d, (wx / (d * tanH * asp) * 0.5 + 0.5) * W, (0.5 - wy / (d * tanH) * 0.5) * H + below, hl * H / (2 * d * tanH)]);
        }
        list.sort((a, b) => b[0] - a[0]);   // far ones first
        for (const [, sx, sy, pxl] of list) {
            const s = pxl / armSpr.px, w = armSpr.cv.width * s, hgt = armSpr.cv.height * s, x = sx - armSpr.ox * s, y = sy - armSpr.oy * s;
            if (x > W || y > H || x + w < 0 || y + hgt < clipY) continue;
            ctx.drawImage(armSpr.cv, x, y, w, hgt);
        }
        ctx.restore();
    }

    const SPR_MAX = 16, sprites = [];
    function dotSprites(c) {
        for (let n = KMAX + 1; n <= SPR_MAX * 4; n = n < SPR_MAX ? n + 1 : n === SPR_MAX ? SPR_MAX * 4 : Infinity) {
            const s = sprites[n] || (sprites[n] = newCanvas(n));
            const g = s.getContext('2d'), im = g.createImageData(n, n);
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                const a = disc(n, x, y), q = (y * n + x) * 4;
                im.data[q] = c[0] * 255; im.data[q + 1] = c[1] * 255; im.data[q + 2] = c[2] * 255; im.data[q + 3] = a * 255;
            }
            g.putImageData(im, 0, 0);
        }
    }

    /* ---- the camera: the layer's (fov 35 at z = 12, looking down -z) */
    const cam = T.cam, tanH = Math.tan(T.fov * D2R / 2);
    const proj = (x, y, z, out) => { const vz = cam[2] - z; if (vz < 0.1) return false; const a = W / H; out[0] = ((x - cam[0]) / vz / (tanH * a) * 0.5 + 0.5) * W; out[1] = (0.5 - (y - cam[1]) / vz / tanH * 0.5) * H; out[2] = vz; return true; };

    /* ---- the pose: the track's rows, linear between them, each key read at its own lagged scroll. The live layer chases each part of the pose
       through a critically damped follower (work-spine.js follow(), its pcfg.shipLag* defaults: seconds to close 95% of a jump), position
       quickest, then framing, then the angles and the sea; here the scroll itself is chased three times and each key read where its own lag has
       got to */
    const LAGS = { pos: 0.6, size: 0.8, ang: 0.9 }, GROUP = { x: 'pos', y: 'pos', size: 'size', level: 'size', lo: 'size', hi: 'size', mix: 'size', LS: 'size', lvn: 'size', scale: 'size', zoom: 'size', foldK: 'size' };
    const lag = {}; for (const g in LAGS) lag[g] = { p: S.y, v: 0 };
    function follow(f, target, L, dt) {
        const w = 4.7 / Math.max(0.05, L), x = w * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const d = f.p - target, tmp = (f.v + w * d) * dt;
        let v = (f.v - w * tmp) * ex, out = target + (d + tmp) * ex;
        if ((d < 0) === (out > target)) { out = target; v = 0; }   // never past the mark
        f.v = v; f.p = out;
    }
    // the row at or before a scroll (the track's rows are 12 px apart over the hero, 24 px below it), and how far on to the next
    const ys = T.ys, rowsAt = s => {
        if (s <= ys[0]) return [rows[0], rows[1], 0]; if (s >= ys[ys.length - 1]) return [rows[rows.length - 1], rows[rows.length - 1], 0];
        let a = 0, b = ys.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (ys[m] <= s) a = m; else b = m; }
        return [rows[a], rows[b], (s - ys[a]) / (ys[b] - ys[a])];
    };
    function pose() {
        const R = {}, w = {}; for (const g in lag) w[g] = rowsAt(lag[g].p);
        for (const k of T.keys) { const [A, B, u] = w[GROUP[k] || 'ang'], j = K[k]; R[k] = A[j] + (B[j] - A[j]) * u; }
        // the two levels being blended, from the level itself (lo + mix): a row's own lo would hold the old pair while the mix runs on to the next
        R.lo = Math.min(Math.floor(R.level + 1e-6), boat.pos.length - 2); R.hi = R.lo + 1; R.mix = Math.min(1, Math.max(0, R.level - R.lo));
        for (const k of ['way', 'fleet', 'rocket']) R[k] = R[k] || 0;   // (a track without them: the hero at rest)
        return R;
    }

    const on = new Int32Array(NDOTS); let nOn = 0, onAge = 0, onK = 0, onAt = [0, 0, 0], onWH = '', onNew = true;   // the dots on the screen (onNew: just listed, none worked out yet)
    // each dot's height on the swell and its light, worked out for half the dots a frame (alternately the even and the odd ones: the swell
    // moves slowly) and kept; every dot is still placed and drawn every frame, so none trails the scroll or the sway
    const dH = new Float32Array(NDOTS), dV = new Float32Array(NDOTS); let dotTick = 0, dotAt = 0;   // dotAt: when they were last worked out (after a pause, all are)
    // tables for the costly per-dot functions: the band's falloff pow(x, bandPow) at 1/1024 steps, the distance fade exp(-d / dotFar) at 1/16
    const BAND_T = new Float32Array(1026), FAR_T = new Float32Array(4097);
    for (let i = 0; i <= 1025; i++) BAND_T[i] = Math.pow(Math.min(1, i / 1024), o.bandPow);
    for (let i = 0; i <= 4096; i++) FAR_T[i] = Math.exp(-i / 16 / o.dotFar);
    const far = d => { const u = d * 16; return u < 4096 ? FAR_T[u | 0] : 0; };
    const VMIN = 0.012, big = [], paths = [];   // a dot fainter than this adds under 2 of 255 to a pixel | this frame's big dots (x, y, size, light) | the lines' paths
    let phE = 0, phR = 0, shownZ = 1, shownBlend = '', fps = 60, judge = { n: 0, work: 0, late: 0 }, last = 0, prevRaf = 0, vs = 0, tick = 0, t0 = performance.now(), raf = 0, shown = true, prof = null;
    // a worker has requestAnimationFrame where it can draw to a canvas the page handed over (Chrome, Firefox); else a timer at the refresh
    const RAF = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(() => f(performance.now()), 1000 / 60);
    const CAF = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    const P2 = [0, 0, 0];
    function frame(now) {
        raf = RAF(frame);
        // the screen's refresh interval (the usual gap between callbacks), and every how many refreshes a frame is drawn to come near fps
        const raw = now - prevRaf; prevRaf = now;
        if (raw > 2 && raw < 50) vs = vs ? vs * 0.95 + Math.min(raw, vs * 1.5) * 0.05 : raw;
        if (++tick < Math.max(1, Math.round(1000 / fps / (vs || 16.7)))) return;
        tick = 0;
        const w0 = performance.now();
        const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
        for (const g in lag) follow(lag[g], S.y, LAGS[g], dt);
        const r = pose(), t = (now - t0) / 1000, tt = t * o.clock;
        // over the hero the layer sits above the page, below it behind the page (as live's flips, at once, by the scroll); the launch and the
        // armada at the page's end are not drawn here yet
        // the ending begins as live's does, when the testimonials block's top comes on screen (whatever this page's length); before it the launch,
        // behind the page's grounds, is not drawn
        const ending = S.clip !== undefined && S.clip < S.h, z = ending ? 12 : Math.min(1, K.layerZ !== undefined ? rowsAt(S.y)[0][K.layerZ] : 1), vis = ending || r.rocket < 0.5;
        color();
        const blend = ending ? (blendPale ? 'multiply' : 'screen') : '';
        if (vis !== shown || z !== shownZ || blend !== shownBlend) { shown = vis; shownZ = z; shownBlend = blend; show(vis, z, blend); } if (!vis) return;
        if (ending) { const a0 = S.prof && performance.now(); armadaFrame(t); if (S.prof) { const P = prof || (prof = { n: 0, dots: 0, ship: 0, fleet: 0, buf: 0, lines: 0 }); P.n++; P.armada = (P.armada || 0) + performance.now() - a0; if (P.n % 30 === 0) report({ ...P, fps }); } return; }
        const visH = 2 * cam[2] * tanH, visW = visH * W / H;

        /* the scene's sway and bob, the hull's ride (the live layer's formulas, at rest) */
        const sway = pc.shipSway * pc.shipBob * r.restW, sceneTilt = sway * 3.44 * Math.sin(t * 0.6), swayYaw = (1.5 + 3.7 * sway) * Math.sin(t * 0.21);
        const turn = r.turn + swayYaw, tilt = r.tilt + sceneTilt, scale = r.size * visW * r.LS;
        const at = [r.x * visW / 2, r.y * visH / 2 + r.restW * pc.shipBob * 0.04 * Math.sin(t * 0.8), 0];
        const omegaE = (0.9 + 1.5 * r.way) * (1.2 - 0.15 * r.lvn), ph = (phE += dt * omegaE), ks = 2 * Math.PI / 2.4, sinc = Math.sin(ks / 2) / (ks / 2), A = 0.008 / r.LS * pc.shipSwell;
        const thetaA = 1.4 * A * ks * sinc * pc.shipBob, hA = A * sinc * pc.shipBob;
        let pitch = -thetaA * (Math.sin(ph) + 0.35 * Math.sin(1.83 * ph + 1.1)) / 1.35, heave = hA * (Math.cos(ph) + 0.35 * Math.cos(1.83 * ph + 1.1)) / 1.35;
        const phiR = (phR += dt * 0.6 * omegaE), pF = (1.5 - 0.33 * r.lvn) * pc.shipBob * pc.shipSwell, rollSea = 0.8 * pF * (Math.sin(phiR) + 0.4 * Math.sin(1.7 * phiR + 0.9)) / 1.4;
        const shipRot = mul(rx(tilt * D2R), ry(-turn * D2R));

        /* the sea: the lab's sea in the ship's sea frame (world = at + full * (p - S) * k) */
        const sw = Math.min(1, Math.max(0, pc.foldSway)), full = mul(mul(rx((tilt - (1 - sw) * sceneTilt) * D2R), ry(-(r.seaYaw + sw * swayYaw) * D2R)), ry(r.foldTheta * D2R)), k = r.foldK;
        const S0 = LAB.S[0], S1 = LAB.S[1], hAt = seaField(o, tt);
        const toWorld = (x, y, z, out) => { const px = (x - S0) * k, py = y * k, pz = (z - S1) * k; return proj(at[0] + full[0] * px + full[1] * py + full[2] * pz, at[1] + full[3] * px + full[4] * py + full[5] * pz, at[2] + full[6] * px + full[7] * py + full[8] * pz, out); };
        // the camera in the lab's space, for the distance fades: full^T (cam - at) / k + S
        const cx = cam[0] - at[0], cy = cam[1] - at[1], cz = cam[2] - at[2];
        const camL = [(full[0] * cx + full[3] * cy + full[6] * cz) / k + S0, (full[1] * cx + full[4] * cy + full[7] * cz) / k, (full[2] * cx + full[5] * cy + full[8] * cz) / k + S1];
        // the ride on the hero's sea (fold.ride): the water under the bow, the stern and both sides
        if (r.silkW > 0) {
            const b = (r.seaYaw - r.foldTheta - turn) * D2R, bx = Math.cos(b), bz = -Math.sin(b), Ll = scale / Math.max(1e-4, k), B = 0.3 * Ll;
            const hB = hAt(S0 + bx * Ll * 0.45, S1 + bz * Ll * 0.45), hS = hAt(S0 - bx * Ll * 0.45, S1 - bz * Ll * 0.45);
            const hP = hAt(S0 - bz * B * 0.5, S1 + bx * B * 0.5), hM = hAt(S0 + bz * B * 0.5, S1 - bx * B * 0.5), g = r.silkW * pc.foldRide;
            pitch += g * Math.atan2(hB - hS, 0.9 * Ll); heave += g * (hB + hS + hP + hM) / 4 / Ll;
            r.foldRoll = g * -Math.atan2(hP - hM, B) / D2R;
        }
        const heel = 24 * Math.tanh((r.heel + rollSea + (r.foldRoll || 0)) / 24) * D2R;

        const tA = S.prof && performance.now();
        ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
        const ax = o.axis * D2R, d = [Math.cos(ax), Math.sin(ax)], pp = [-d[1], d[0]];
        const wob = o.wander * D2R * Math.sin(tt * o.wanderRate), a1 = ax + o.swellRot * D2R + wob, d1 = [Math.cos(a1), Math.sin(a1)], bf = o.bandFollow;
        let x0 = W, y0 = H, x1 = -1, y1 = -1, nLit = 0;   // the part of the light buffer written this frame; the pixels in it that took light
        big.length = 0;

        /* the dots: all of the shader's, on the same disc, with its brightness (the band they sit in, their seed, the distance) and size. Most
           are a pixel or a few: their light is summed into the buffer's sea layer through the disc's own kernel; the few big ones near the camera
           are drawn after it as sprites */
        const dotsW = r.foldW;
        if (dotsW > 0.003) {
            const gD = dotsW * o.dotGain * DOT_BOOST, sx = Math.sin(ax), cxa = Math.cos(ax), qk = o.bands / o.lambda;
            const qx = (d[0] + (d1[0] - d[0]) * bf) * qk, qz = (d[1] + (d1[1] - d[1]) * bf) * qk, qc = o.speed * tt * qk, qb = o.bend * 0.1 * qk, pxK = o.dotPx * PR * 16.8;
            // two thirds of the disc lies off the screen: every half second (or when the view has moved) the dots on it, with a margin for the
            // swell and the sway, are listed, and only those are worked out each frame
            if (--onAge < 0 || onWH !== W + 'x' + H || Math.abs(k - onK) > 0.02 * onK || Math.abs(camL[0] - onAt[0]) + Math.abs(camL[2] - onAt[2]) > 1) {
                onAge = 30; onWH = W + 'x' + H; onK = k; onAt = camL.slice(); nOn = 0; onNew = true; const mx = W * 0.15, my = H * 0.15;
                for (let i = 0; i < NDOTS; i++) if (toWorld(dots[i * 3], 0, dots[i * 3 + 1], P2) && P2[0] > -mx && P2[0] < W + mx && P2[1] > -my && P2[1] < H + my) on[nOn++] = i;
            }
            // toWorld then proj, folded for the frame: world = full k p + (at - full k S); the camera's offset taken off; the screen's scales
            const m0 = full[0] * k, m1 = full[1] * k, m2 = full[2] * k, m3 = full[3] * k, m4 = full[4] * k, m5 = full[5] * k, m6 = full[6] * k, m7 = full[7] * k, m8 = full[8] * k;
            const vc0 = at[0] - m0 * S0 - m2 * S1 - cam[0], vc1 = at[1] - m3 * S0 - m5 * S1 - cam[1], vc2 = cam[2] - (at[2] - m6 * S0 - m8 * S1), gx = 0.5 / (tanH * W / H), gy = 0.5 / tanH;
            const half = ++dotTick & 1, all = onNew || now - dotAt > 100; onNew = false; dotAt = now;
            for (let c = 0; c < nOn; c++) {
                const i = on[c], x = dots[i * 3], z = dots[i * 3 + 1], sd = dots[i * 3 + 2];
                if (all || (i & 1) === half) {
                    const ex = camL[0] - x, ez = camL[2] - z, top = gD * 1.08 * (0.45 + 1.1 * sd);
                    if (top * far(Math.sqrt(ex * ex + ez * ez)) < VMIN) dV[i] = 0;   // too far to show even on a crest: no swell worked out for it
                    else {
                        const h = hAt(x, z), across = -x * sx + z * cxa, qB = x * qx + z * qz - qb * across * across + qc, ey = camL[1] - h;   // the phase, in bands
                        dH[i] = h; dV[i] = top / 1.08 * (0.18 + 0.9 * BAND_T[((1 - (qB - Math.floor(qB))) * 1024) | 0]) * far(Math.sqrt(ex * ex + ey * ey + ez * ez));
                    }
                }
                const vB = dV[i]; if (vB < VMIN) continue;
                const h = dH[i], vz = vc2 - (m6 * x + m7 * h + m8 * z); if (vz < 0.1) continue;   // the lab's point to the screen in one step (toWorld and proj folded)
                const iv = 1 / vz, sxp = ((m0 * x + m1 * h + m2 * z + vc0) * iv * gx + 0.5) * W, syp = (0.5 - (m3 * x + m4 * h + m5 * z + vc1) * iv * gy) * H;
                const px = pxK * (0.6 + 0.9 * sd) / Math.max(1, vz / k), n = Math.max(1, Math.round(px));
                const X = Math.round(sxp - n / 2), Y = Math.round(syp - n / 2);
                if (n > KMAX) { if (X + n > 0 && Y + n > 0 && X < W && Y < H) big.push(X, Y, n, vB); continue; }   // a sprite: clipped by the canvas
                if (X < 0 || Y < 0 || X + n >= W || Y + n >= H) continue;   // off the screen (or on its very edge)
                const kn = kern[n];
                for (let yy = 0, q = Y * W + X, j = 0; yy < n; yy++, q += W) for (let xx = 0; xx < n; xx++, j++) { const w = kn[j]; if (w === 0) continue; const qq = q + xx; if (accS[qq] === 0 && accI[qq] === 0) lit1[nLit++] = qq; accS[qq] += vB * w; }   // (a zero weight would list a pixel that stays dark, then list it again)
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + n > x1) x1 = X + n; if (Y + n > y1) y1 = Y + n;
            }
        }
        const tB = S.prof && performance.now();

        /* the ship: the model's particles posed as the shader poses them (about the waterline: pitch, then heel, then heave; then the hull's
           rotation, scale and place: one matrix and an offset per frame), summed as light into the buffer's ship layer */
        const posA = boat.pos[r.lo | 0], posB = boat.pos[Math.min(boat.pos.length - 1, r.hi | 0)], mix = r.mix, R = shipRot, cp = Math.cos(pitch), sp = Math.sin(pitch), ch = Math.cos(heel), sh = Math.sin(heel);
        const m0 = r.misc, ride = sg => {   // the matrix and offset for the hull (sg 1) and for its reflection (sg -1: every motion reversed, as the shader mirrors it)
            const HP = mul([1, 0, 0, 0, ch, -sg * sh, 0, sg * sh, ch], [cp, -sg * sp, 0, sg * sp, cp, 0, 0, 0, 1]);
            const lx = m0 - HP[0] * m0, ly = -HP[3] * m0 + sg * heave, lz = -HP[6] * m0;   // m + (0, heave, 0) - HP m, in the hull's frame
            return [mul(R, HP), at[0] + (R[0] * lx + R[1] * ly + R[2] * lz) * scale, at[1] + (R[3] * lx + R[4] * ly + R[5] * lz) * scale, at[2] + (R[6] * lx + R[7] * ly + R[8] * lz) * scale, HP, lx, ly, lz];
        }, hull = ride(1), mirror = ride(-1);
        // the reflection: whole over the hero; below it as live's (uReflect: gone as the ship gets way on and as the view tilts down)
        const below = smooth((T.hero ?? 960) - 120, (T.hero ?? 960) + 120, lag.size.p), rW = 1 - below * (1 - (1 - smooth(0, 0.5, r.way)) * (1 - Math.min(1, Math.max(0, (r.tilt - 10) / 30))));
        for (const i of shipIdx) {
            const o4 = i * 4, wa = posA[o4 + 3], wb = posB[o4 + 3], shade = wa + (wb - wa) * mix; if (shade < 0.03) continue;
            if (refl[i] && rW < 0.02) continue; const [C, ox, oy, oz] = refl[i] ? mirror : hull;
            const x = posA[o4] + (posB[o4] - posA[o4]) * mix, y = posA[o4 + 1] + (posB[o4 + 1] - posA[o4 + 1]) * mix - WATERLINE, z = posA[o4 + 2] + (posB[o4 + 2] - posA[o4 + 2]) * mix;
            if (!proj(ox + (C[0] * x + C[1] * y + C[2] * z) * scale, oy + (C[3] * x + C[4] * y + C[5] * z) * scale, oz + (C[6] * x + C[7] * y + C[8] * z) * scale, P2)) continue;
            const X = P2[0] | 0, Y = P2[1] | 0; if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;
            const q = Y * W + X; if (accS[q] === 0 && accI[q] === 0) lit1[nLit++] = q;
            accI[q] += (0.25 + 0.6 * shade) * (P2[2] < 9 ? 2 : 1) * (refl[i] ? rW : 1);   // nearer than the hull's plane: a 2 px speck's light
            if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + 1 > x1) x1 = X + 1; if (Y + 1 > y1) y1 = Y + 1;
        }

        /* the fleet: each member is its source particle as the ship holds it (heel, pitch, heave: the hull's frame), rolled a little on its copy's
           own clock about the keel line, scaled and set at its copy's place, then turned and placed with the ship on the sea */
        const tS = S.prof && performance.now();
        if (r.fleet > 0.001) {
            // per copy and per side (hull, reflection) one matrix and offset for the frame: world = at + R scale (cw (Roll (HP p + l - wl) + wl) + c)
            const cpM = []; for (let k = 0; k < 9; k++) {
                const F = FLEET_POS[k], kq = k + 1, ro = 0.045 * Math.sin(t * (0.61 + 0.043 * kq) + kq * 2.1) + 0.02 * Math.sin(t * (1.13 + 0.031 * kq) + kq * 4.7), cr = Math.cos(ro), sr = Math.sin(ro);
                const c = [F[0] + 0.06 * Math.sin(t * (0.19 + 0.02 * k) + k), F[1] + 0.015 * Math.sin(t * 0.23 + k), F[2] + 0.05 * Math.sin(t * 0.17 + 2 * k)], cw = F[3], Roll = [1, 0, 0, 0, cr, -sr, 0, sr, cr];
                for (const side of [hull, mirror]) {
                    const HP = side[4], RR = mul(R, Roll), M = mul(RR, HP).map(v => v * scale * cw);
                    const l = [side[5], side[6] - WATERLINE, side[7]], rl = [Roll[0] * l[0] + Roll[1] * l[1] + Roll[2] * l[2], Roll[3] * l[0] + Roll[4] * l[1] + Roll[5] * l[2] + WATERLINE, Roll[6] * l[0] + Roll[7] * l[1] + Roll[8] * l[2]];
                    const v = [cw * rl[0] + c[0], cw * rl[1] + c[1], cw * rl[2] + c[2]];
                    cpM.push(M, at[0] + (R[0] * v[0] + R[1] * v[1] + R[2] * v[2]) * scale, at[1] + (R[3] * v[0] + R[4] * v[1] + R[5] * v[2]) * scale, at[2] + (R[6] * v[0] + R[7] * v[1] + R[8] * v[2]) * scale);
                }
            }
            const fw = 0.85;   // a fleet member is drawn at 0.85 of the ship's weight, as live's
            for (let j = 0; j < fleetM.length; j += 3) {
                if (fleetM[j + 2] > r.fleet) continue;
                const i = fleetM[j], o4 = i * 4, wa = posA[o4 + 3], wb = posB[o4 + 3], shade = wa + (wb - wa) * mix; if (shade < 0.03) continue;
                const rf = refl[i]; if (rf && rW < 0.02) continue;
                const b = (fleetM[j + 1] * 2 + rf) * 4, M = cpM[b];
                const x = posA[o4] + (posB[o4] - posA[o4]) * mix, y = posA[o4 + 1] + (posB[o4 + 1] - posA[o4 + 1]) * mix - WATERLINE, z = posA[o4 + 2] + (posB[o4 + 2] - posA[o4 + 2]) * mix;
                if (!proj(cpM[b + 1] + M[0] * x + M[1] * y + M[2] * z, cpM[b + 2] + M[3] * x + M[4] * y + M[5] * z, cpM[b + 3] + M[6] * x + M[7] * y + M[8] * z, P2)) continue;
                const X = P2[0] | 0, Y = P2[1] | 0; if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;
                const q = Y * W + X; if (accS[q] === 0 && accI[q] === 0) lit1[nLit++] = q;
                accI[q] += fw * fleetW[fleetM[j + 1]] * (0.25 + 0.6 * shade) * (rf ? rW : 1);
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + 1 > x1) x1 = X + 1; if (Y + 1 > y1) y1 = Y + 1;
            }
        }

        const tF = S.prof && performance.now();
        /* the buffer, written in one call: each pixel the sum of its light, as additive points on a clear canvas sum (a channel saturates to
           white, the alpha to opaque), and its layers cleared for the next frame as they are read */
        if (x1 > x0) {
            const dc = pale ? dark.sea : sea.map(v => v + (1 - v) * 0.3), lit = pale ? dark.ink : ink.map(v => v + (1 - v) * 0.45);   // the dots' tint; the ship's lit specks, as the layer's read
            for (let j = 0; j < nLit; j++) {   // only the pixels that took light (the rest of the buffer stays clear)
                const q = lit1[j], a = accS[q], b = accI[q], A = Math.min(1, a + b); if (!(A > 0)) continue; const iA = 255 / A;   // a pixel at a time (little-endian RGBA)
                px32[q] = (A * 255) << 24 | (Math.min(1, dc[2] * a + lit[2] * b) * iA) << 16 | (Math.min(1, dc[1] * a + lit[1] * b) * iA) << 8 | (Math.min(1, dc[0] * a + lit[0] * b) * iA);
                accS[q] = 0; accI[q] = 0;
            }
            ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0); for (let j = 0; j < nLit; j++) px32[lit1[j]] = 0;
        }
        const tC = S.prof && performance.now();

        ctx.globalCompositeOperation = pale ? 'source-over' : 'lighter';   // (dark ink is laid on, not added: added, it would lighten where it overlaps)
        /* crest lines: q * bands = m along the across axis (closed form), each lifted by the swell and faded with distance; added like the dots */
        const c1 = d[0] * d1[0] + d[1] * d1[1], s1 = pp[0] * d1[0] + pp[1] * d1[1], du = (1 - bf) + bf * c1, lineFar = o.lineFar / Math.max(0.05, r.zoom);
        const gain = o.lineGain * Math.sqrt(Math.min(1, Math.max(0.1, r.zoom))) * r.silkW;
        if (gain > 0.003) {
            const lc = pale ? dark.sea : sea.map(v => v + (1 - v) * 0.25), span = 70, NA = 36, NB = 12, top = Math.min(1, gain);
            ctx.lineWidth = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';   // a one-pixel line is the rasteriser's fast path: the shader's width (o.lineWidth css px) is carried as light (below)
            for (let b = 0; b < NB; b++) paths[b] = new Path2D();   // one path per brightness step, stroked once each
            const uC = camL[0] * d[0] + camL[2] * d[1];   // the camera's place along the swell's travel
            for (let m = Math.floor(((uC - span) * du + o.speed * tt) * o.bands / o.lambda) - 2, mEnd = Math.ceil(((uC + span) * du + o.speed * tt) * o.bands / o.lambda) + 2; m <= mEnd; m++) {   // (the lines run with the swell: the window of m follows speed * tt)
                let px = 0, py = 0, pa = -1, pb = -1;
                for (let j = 0; j <= NA; j++) {
                    const a = -span + 2 * span * j / NA + (camL[0] * pp[0] + camL[2] * pp[1]);
                    const u = (m * o.lambda / o.bands - a * bf * s1 + o.bend * a * a * 0.1 - o.speed * tt) / du;
                    const x = u * d[0] + a * pp[0], z = u * d[1] + a * pp[1], h = hAt(x, z), ex = camL[0] - x, ey = camL[1] - h, ez = camL[2] - z;
                    const al = gain * Math.exp(-Math.sqrt(ex * ex + ey * ey + ez * ez) / lineFar);
                    if (al < 0.01 || !toWorld(x, h, z, P2)) { pa = -1; continue; }
                    if (pa >= 0) {
                        const b = Math.min(NB - 1, Math.floor((al + pa) / 2 / top * NB)), P = paths[b];
                        if (b !== pb) P.moveTo(px, py);
                        P.lineTo(P2[0], P2[1]); pb = b;
                    } else pb = -1;
                    px = P2[0]; py = P2[1]; pa = al;
                }
            }
            const rgb = `${lc[0] * 255 | 0},${lc[1] * 255 | 0},${lc[2] * 255 | 0}`, wl = o.lineWidth * PR;
            for (let b = 0; b < NB; b++) { ctx.strokeStyle = `rgba(${rgb},${Math.min(1, (b + 0.5) / NB * top * wl)})`; ctx.stroke(paths[b]); }
        }
        // the big dots, as sprites
        for (let j = 0; j < big.length; j += 4) {
            const n = big[j + 2], v = big[j + 3], spr = sprites[Math.min(n, SPR_MAX) === n ? n : SPR_MAX * 4];
            for (let left = pale ? Math.min(1, v) : v; left > 0.004; left -= 1) {   // brighter than 1: drawn again for the rest, and the adding saturates toward white as the shader's min(colour * light, 1) does
                ctx.globalAlpha = Math.min(1, left); ctx.drawImage(spr, big[j], big[j + 1], n, n);
            }
        }
        ctx.globalAlpha = 1;
        // 60 a second unless this machine cannot hold it: judged over 90 drawn frames after the first 30, on the frame's own work (the drawing
        // the browser does after it costs about as much again) and on how often a refresh was missed
        if (judge && dt < 0.1 && ++judge.n > 30) {
            judge.work += performance.now() - w0; if (raw > vs * 1.6) judge.late++;
            if (judge.n === 120) { if (judge.work / 90 > 6 || judge.late > 25) fps = 30; judge = null; }
        }
        if (S.prof) { const tD = performance.now(), P = prof || (prof = { n: 0, dots: 0, ship: 0, fleet: 0, buf: 0, lines: 0 }); P.n++; P.dots += tB - tA; P.ship += tC - tB; P.fleet += tF - tS; P.buf += tC - tF; P.lines += tD - tC; if (P.n % 30 === 0) report({ ...P, fps }); }
    }
    if (!S.hidden) raf = RAF(frame);
    return {
        set(m) {
            Object.assign(S, m);
            if ('w' in m) size();
            if ('hidden' in m) { if (m.hidden) { CAF(raf); raf = 0; } else if (!raf) { last = 0; raf = RAF(frame); } }
            if ('prof' in m) prof = null;
        },
    };
}
