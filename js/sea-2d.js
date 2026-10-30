/* sea-2d.js: the hero's sea and ship drawn on the CPU, on a plain 2D canvas, for a browser that gives the page no WebGL at all (graphics
 * acceleration off or crashed, a remote desktop, a virtual machine). Reached with ?sea=2d while it is reviewed.
 *
 * Not a copy of pixels: the same scene, computed again. The pose the scroll decides (where the ship sits, its size, course, tilt and level,
 * and where the hero's sea lies) comes from images/sea/hero-track.json, recorded from the live page at every 12 px of the hero (the ship
 * settled at rest there); between rows it is interpolated, and each part of it chases the scroll through the live ship's own lags.
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

const D2R = Math.PI / 180, NDOTS = 60000;
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

/* the page's side: a canvas where the live one sits (and under it one for the field, which changes only as the page scrolls), drawn by a worker when the browser can hand a canvas to one (the page's own thread then
   only passes on the scroll, the size and the colour, and stays free for the scroll itself), else drawn here. ?sea=2d&main: always here */
export async function start() {
    if (document.getElementById('sea-2d')) return;
    let T;
    try { T = await (await fetch('images/sea/hero-track.json')).json(); } catch (e) { console.warn('sea-2d: no track', e); return; }
    let canvas = null, under = null;
    const mount = () => {
        for (const c of [under, canvas]) c?.remove();
        [under, canvas] = ['sea-2d-field', 'sea-2d'].map(id => {
            const c = document.createElement('canvas'); c.id = id; c.setAttribute('aria-hidden', 'true');
            c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;z-index:1;pointer-events:none;';
            document.body.appendChild(c); return c;
        });
    };
    mount();
    // the picked colour, and the page's ground under the canvas (the sea's dots are light added to it: see the buffer below)
    const colour = () => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() + '|' + getComputedStyle(document.body).backgroundColor;
    const box = () => ({ w: Math.max(1, Math.round(innerWidth)), h: Math.max(1, Math.round(canvas.getBoundingClientRect().height || innerHeight)) });
    const show = v => { const s = v ? '' : 'hidden'; for (const c of [under, canvas]) if (c.style.visibility !== s) c.style.visibility = s; };   // (hidden, not display:none: it keeps its size for a resize down the page)
    const S = { y: scrollY, vh: innerHeight, ...box(), colour: colour(), hidden: document.hidden, coarse: matchMedia('(pointer: coarse)').matches, prof: new URLSearchParams(location.search).has('prof') };
    const here = () => {   // drawn on the page (a canvas handed to a worker never comes back: a failed worker leaves a fresh one here)
        if (canvas.dataset.sent) mount();
        Object.assign(S, { y: scrollY, vh: innerHeight, ...box(), colour: colour(), hidden: document.hidden });
        const api = draw(canvas, under, T, S, show, n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; }, p => { window.__s2dP = p; });
        send = m => api.set(m);
    };
    let send = () => {};
    if (canvas.transferControlToOffscreen && typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && !new URLSearchParams(location.search).has('main')) {
        let wk = null, ok = false;
        const fail = why => { if (!wk) return; console.warn('sea-2d: the worker failed, drawing on the page', why); wk.terminate(); wk = null; here(); };
        try {
            wk = new Worker(import.meta.url, { type: 'module' });
            canvas.dataset.sent = '1'; const off = canvas.transferControlToOffscreen(), offU = under.transferControlToOffscreen();   // (marked first: if the second transfer throws, the page draws on fresh canvases)
            wk.onmessage = e => { const m = e.data; if (m.ready) ok = true; if (m.failed) fail(m.failed); if ('show' in m) show(m.show); if (m.prof) window.__s2dP = m.prof; };
            wk.onerror = e => { e.preventDefault?.(); fail(e.message || 'did not load'); };
            wk.postMessage({ init: true, canvas: off, under: offU, T, S }, [off, offU]);
            send = m => wk && wk.postMessage(m);
            setTimeout(() => { if (!ok) fail('no answer in 8 s'); }, 8000);
        } catch (e) { wk?.terminate(); wk = null; console.warn('sea-2d: no worker, drawing on the page', e); here(); }
    } else here();
    addEventListener('scroll', () => send({ y: scrollY }), { passive: true });
    addEventListener('resize', () => send({ y: scrollY, vh: innerHeight, ...box() }));
    document.addEventListener('visibilitychange', () => send({ hidden: document.hidden }));
    let c0 = S.colour; setInterval(() => { const c = colour(); if (c !== c0) { c0 = c; send({ colour: c }); } }, 300);   // the picker
}

/* the worker's side: the same drawing on the canvas the page handed over */
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    let api = null;
    self.onmessage = e => {
        const m = e.data;
        if (m.init) {
            try { api = draw(m.canvas, m.under, m.T, Object.assign(m.S, { worker: true }), v => self.postMessage({ show: v }), n => new OffscreenCanvas(n, n), p => self.postMessage({ prof: p })); self.postMessage({ ready: true }); }
            catch (err) { self.postMessage({ failed: String(err && err.message || err) }); }
        } else if (api) api.set(m);
    };
    self.addEventListener('error', e => self.postMessage({ failed: e.message || 'error' }));   // a frame that throws: the page takes over
}

/* the drawing, on either side: S holds what the page reports (scroll, its height, the canvas's size, the colour, whether the tab is hidden) */
function draw(canvas, under, T, S, show, newCanvas, report) {
    const o = DEFAULTS, rows = T.rows, K = Object.fromEntries(T.keys.map((k, i) => [k, i])), pc = T.pc;
    const ctx = canvas.getContext('2d'), uctx = under.getContext('2d');
    let W = 0, H = 0;
    const PR = 1;   // CSS pixels: on a 2x screen 1.25x looked the same and cost a fifth more of each frame
    let fKey = '';   // the scroll, size and colour the field's canvas was drawn for
    let accS, accI, accF, seen, img, px32, lit1, uImg, upx32;   // the light buffer: the sea's dots, the ship's points (and apart, the field's), summed per pixel; the pixels that took any, listed once
    function size() {
        if (W === Math.max(1, Math.round(S.w * PR)) && H === Math.max(1, Math.round(S.h * PR))) return;   // (a phone's bar sliding fires resizes at the same size)
        W = canvas.width = under.width = Math.max(1, Math.round(S.w * PR)); H = canvas.height = under.height = Math.max(1, Math.round(S.h * PR));
        accS = new Float32Array(W * H); accI = new Float32Array(W * H); accF = new Float32Array(W * H); seen = new Uint8Array(W * H);
        fKey = '';   // (setting the size cleared the field's canvas)
        img = ctx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer); lit1 = new Int32Array(W * H); uImg = uctx.createImageData(W, H); upx32 = new Uint32Array(uImg.data.buffer);
    }
    size();

    /* ---- colour: the picked hue, as the live layer takes it (the sea at the lab's saturation and lightness, the ship's ink pushed vivid) */
    // on a pale ground (the light theme, or a light picked colour) light added to the page would not show: the live layer then draws its
    // points as dark ink of the same hue, normally blended, and so does this (pale; dark: the tints it uses then)
    let sea = [0.3, 0.5, 0.8], ink = [0.4, 0.6, 1], ground = [0.26, 0.26, 0.26], pale = false, dark = null, colorKey = null;
    function color() {
        if (S.colour === colorKey) return; colorKey = S.colour;
        const [c, bg = ''] = S.colour.split('|'), gm = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg); if (gm) ground = [gm[1] / 255, gm[2] / 255, gm[3] / 255];
        const m = /^#?([0-9a-f]{6})$/i.exec(c), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : [0.08, 0.4, 0.72];
        const mx = Math.max(...rgb), mn = Math.min(...rgb), d = mx - mn, [r, g, b] = rgb;
        const h = !d ? 0 : (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
        sea = hsl(h, o.sat, o.lum); ink = hsl(h, 0.85, 0.62);
        pale = 0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2] > 0.45; dark = { sea: hsl(h, o.sat, 0.28), ink: hsl(h, 0.85, 0.22), field: hsl(h, 0.85, 0.25) };
        const t = pale ? dark.sea : sea.map(v => v + (1 - v) * 0.3);
        dotSprites(sprites, pale ? t : t.map((v, i) => Math.min(1, v + ground[i]))); dotSprites(sprites2, t);   // the first pass of a big dot adds the ground under its disc (laid over it, it would cover it); passes over it add the tint alone
    }
    // a pixel of light (L, per channel) written over the ground g: the colour and the least alpha that show g + L (its alpha rounded up, so a
    // faint pixel keeps its light); on a pale ground, dark ink of colour c at coverage a
    function pixel(L0, L1, L2, g0, g1, g2) {
        if (L0 > 1 - g0) L0 = 1 - g0; if (L1 > 1 - g1) L1 = 1 - g1; if (L2 > 1 - g2) L2 = 1 - g2;
        let A = L0 / Math.max(1e-3, 1 - g0); const a1 = L1 / Math.max(1e-3, 1 - g1), a2 = L2 / Math.max(1e-3, 1 - g2); if (a1 > A) A = a1; if (a2 > A) A = a2;
        if (!(A > 0)) return 0; const A8 = Math.min(255, Math.ceil(A * 255)), iA = 255 * 255 / A8; A = A8 / 255;
        return A8 << 24 | Math.min(255, (L2 + g2 * A) * iA) << 16 | Math.min(255, (L1 + g1 * A) * iA) << 8 | Math.min(255, (L0 + g0 * A) * iA);
    }
    function ink2(c0, c1, c2, a) { if (!(a > 0)) return 0; if (a > 1) a = 1; return Math.ceil(a * 255) << 24 | c2 * 255 << 16 | c1 * 255 << 8 | c0 * 255; }

    /* ---- the ship's particles, both levels the hero passes through (lo, hi): the solid ones, and the water at rest (below); the wake (no
       way on in the hero) and the stowed anchor (shown only as it is lowered) left out. Each has the layer's point size: pSize x its own
       size (most 0.5 .. 1, one in 70 1.4 .. 1.9) x the ship's factor at rest, at the camera's distance */
    // the layer's share of its particles (256 x 256 on a desktop, a fifth of them the ship's; 192 x 192 on a phone, three tenths)
    const SHIP_N = S.coarse ? Math.floor(192 * 192 * 0.3) : Math.floor(256 * 256 * 0.2), FIELD_N = S.coarse ? 0 : 256 * 256 - SHIP_N - 12;
    const boat = buildBoatLevels(SHIP_N, 1), meta0 = boat.meta[0], role = i => Math.round(meta0[i * 4]);
    const P_SIZE = 1.5, BOAT_PX = 1.25, hash1 = n => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };
    let seed2 = 11; const rnd2 = () => { seed2 = (seed2 * 16807) % 2147483647; return seed2 / 2147483647; };
    const shipIdx = [], aSz = new Float32Array(SHIP_N);
    for (let i = 0; i < SHIP_N; i++) {
        aSz[i] = rnd2() < 0.015 ? 1.4 + rnd2() * 0.5 : 0.5 + rnd2() * 0.5;
        const r = role(i); if (r !== 6 && r !== 7 && !(r === 5 && meta0[i * 4 + 1] > 1.5)) shipIdx.push(i);
    }
    // the hull's waterline per level, as the layer measures it (work-spine.js measureHull): the half-beam at 17 stations, the stem and the stern
    const hulls = boat.pos.map(pos => {
        const beam = new Float32Array(17), n = new Uint16Array(17); let stem = -Infinity, stern = Infinity;
        for (let i = 0; i < SHIP_N; i++) {
            const o4 = i * 4; if (boat.role[i] !== 1 || pos[o4 + 3] <= 0 || pos[o4 + 1] - WATERLINE > 0.018) continue;
            const x = pos[o4], az = Math.abs(pos[o4 + 2]), k = Math.max(0, Math.min(16, Math.round((x + 0.5) * 16)));
            if (az > beam[k]) beam[k] = az; n[k]++; if (x > stem) stem = x; if (x < stern) stern = x;
        }
        if (!Number.isFinite(stem)) { for (let k = 0; k < 17; k++) { const x = -0.5 + k / 16; beam[k] = 0.15 * Math.sqrt(Math.max(0, 1 - Math.pow((x + 0.02) / 0.48, 2))); } stem = 0.5; stern = -0.5; }
        else for (let k = 0; k < 17; k++) { if (!n[k]) { let a = k, b = k; while (a > 0 && !n[a]) a--; while (b < 16 && !n[b]) b++; beam[k] = n[a] && n[b] ? (beam[a] + beam[b]) * 0.5 : n[a] ? beam[a] : beam[b]; } }
        for (let k = 0; k < 17; k++) beam[k] *= 0.96;
        return { beam, stem: Math.min(0.5, stem), stern: Math.max(-0.5, stern) };
    });
    /* the water at rest (the shader's flowLocal, the ship with no way on): a disc of still specks round the hull, 2.9 x 2.2 hull lengths,
       feathered to nothing, parted along the waterline, with a two-armed spiral of brighter, lifted crests and faint rings spreading from
       the hull. Each speck's place in the disc and its window are fixed: listed once */
    const restFeather = (x, z) => Math.pow(1 - smooth(0.12, 1, Math.hypot(x / 1.45, z / 1.1)), 1.5);
    // what a speck's place gives it: the distance the rings run, the spiral's crest (still: shipRipple is 0), the feather, the rings' reach
    const ripple = (x, z) => { const rr = Math.hypot(x, z * 1.6); return [rr, 0.5 + 0.5 * Math.sin(rr * 20.8 - 2 * Math.atan2(z * 1.6, x)), restFeather(x, z), 1 - smooth(0.35, 1.3, rr)]; };
    const WS = 10, wat = []; for (let i = 0; i < SHIP_N; i++) {   // (WS: the numbers kept per speck)
        if (role(i) !== 6) continue; const mz = meta0[i * 4 + 2], mw = meta0[i * 4 + 3];
        const h1 = hash1(mz * 5.3), h2 = hash1(mz * 31.0), h3 = hash1(mw * 77.0), h5 = hash1(mw * 13.7), qz = Math.abs(h5 - 0.5) * 2;
        const xl = 0.75 - (h1 * 2.6) % 2.6, x = xl + 0.55, z = (h5 < 0.5 ? -1 : 1) * Math.pow(qz, 0.8);
        const win = (1 - smooth(0.45, 0.75, xl)) * smooth(-1.85, -1.45, xl) * (0.8 + 0.2 * h3);
        if (win > 0.01) wat.push(i, x, z, h2, win, aSz[i] * (1.05 + 0.8 * hash1(mz * 7.7)), ...ripple(x, z));
    }
    /* ---- the field: the layer's all-over particles (desktop only, as live), each at a home in a box 20 x 11 x 8 round the camera's target,
       faint points that scroll with the page at a parallax of their depth (pParallax 0.004 a pixel at mid depth, less as the camera comes
       to hold the ship: live's P.cam, 0 at the top to 0.7 by the hero's end), wrapping top to bottom */
    const field = new Float32Array(FIELD_N * 4); let seed3 = 5; const rnd3 = () => { seed3 = (seed3 * 16807) % 2147483647; return seed3 / 2147483647; };
    for (let i = 0; i < FIELD_N; i++) { field[i * 4] = (rnd3() * 2 - 1) * 10; field[i * 4 + 1] = (rnd3() - 0.5) * 11; field[i * 4 + 2] = (rnd3() * 2 - 1) * 4; field[i * 4 + 3] = rnd3() < 0.015 ? 1.4 + rnd3() * 0.5 : 0.5 + rnd3() * 0.5; }
    // the field's points as live draws them: its point size, but each about 1.4 x as wide (so twice the light), which is how big and bright
    // the live field's points measure on a screenshot (570 of them in a 250 x 200 px patch of sky, 4.5 px and 29 levels above the ground each)
    const FIELD_K = 1.4;
    // what of each point the scroll leaves alone, worked out once a size: its column on the screen, its pixels per unit of height, its size and light
    const fX = new Float32Array(FIELD_N), fKY = new Float32Array(FIELD_N), fS = new Float32Array(FIELD_N), fL = new Float32Array(FIELD_N); let fWH = '';
    function drawField() {
        if (fWH !== W + 'x' + H) {
            fWH = W + 'x' + H;
            for (let i = 0, o4 = 0; i < FIELD_N; i++, o4 += 4) {
                proj(field[o4], cam[1], field[o4 + 2], P2); const s = Math.max(1, FIELD_K * P_SIZE * cam[2] * PR * field[o4 + 3] / P2[2]);
                fX[i] = P2[0]; fKY[i] = H * 0.5 / (P2[2] * tanH); fS[i] = s; fL[i] = SHIP_L * s * s;
            }
        }
        const par = fieldPar(S.y), cy = H * 0.5; let n = 0, X0 = W, Y0 = H, X1 = -1, Y1 = -1;
        const add = (q, L) => { if (!seen[q]) { seen[q] = 1; lit1[n++] = q; } accF[q] += L; };
        for (let i = 0, o4 = 0; i < FIELD_N; i++, o4 += 4) {
            const z = field[o4 + 2], df = 0.3 + 1.3 * Math.min(1, Math.max(0, (z + 4) / 8)), yy = field[o4 + 1] + par * df + 5.5, y = yy - Math.floor(yy / 11) * 11 - 5.5;
            const px = fX[i], py = cy - (y - cam[1]) * fKY[i], L = fL[i];
            if (fS[i] < 1.5) { const X = px | 0, Y = py | 0; if (px < 0 || py < 0 || X >= W || Y >= H) continue; add(Y * W + X, L); if (X < X0) X0 = X; if (Y < Y0) Y0 = Y; if (X >= X1) X1 = X + 1; if (Y >= Y1) Y1 = Y + 1; continue; }
            if (fS[i] >= 2.5) {   // the few big ones: over the disc's kernel
                const m = Math.min(KMAX, Math.round(fS[i])), X = Math.round(px - m / 2), Y = Math.round(py - m / 2), kn = kern[m], g = L / kSum[m]; if (X < 0 || Y < 0 || X + m >= W || Y + m >= H) continue;
                for (let yy = 0, j = 0; yy < m; yy++) for (let xx = 0; xx < m; xx++, j++) if (kn[j] > 0) add((Y + yy) * W + X + xx, g * kn[j]);
                if (X < X0) X0 = X; if (Y < Y0) Y0 = Y; if (X + m > X1) X1 = X + m; if (Y + m > Y1) Y1 = Y + m; continue;
            }
            const fx = px - 0.5, fy = py - 0.5, X = Math.floor(fx), Y = Math.floor(fy); if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;   // 1.5 .. 2.5 px: spread over the four pixels round it
            const ax = fx - X, ay = fy - Y, q = Y * W + X;
            add(q, L * (1 - ax) * (1 - ay)); add(q + 1, L * ax * (1 - ay)); add(q + W, L * (1 - ax) * ay); add(q + W + 1, L * ax * ay);
            if (X < X0) X0 = X; if (Y < Y0) Y0 = Y; if (X + 2 > X1) X1 = X + 2; if (Y + 2 > Y1) Y1 = Y + 2;
        }
        if (X1 <= X0) { uctx.clearRect(0, 0, W, H); return; }
        const fc = ink.map(v => (v + (1 - v) * 0.1) * 0.85), [g0, g1, g2] = ground, D = dark.field;
        for (let j = 0; j < n; j++) {   // light added to the page, as the buffer's (below)
            const q = lit1[j], f = accF[q]; accF[q] = 0; seen[q] = 0;
            upx32[q] = pale ? ink2(D[0], D[1], D[2], f) : pixel(fc[0] * f, fc[1] * f, fc[2] * f, g0, g1, g2);
        }
        uctx.putImageData(uImg, 0, 0); for (let j = 0; j < n; j++) upx32[lit1[j]] = 0;   // (the whole canvas: it replaces the last drawing, so no clearing first)
    }
    const fieldPar = y => { const U = T.until, c = Math.min(y, U); return -0.004 * (c - 0.35 * c * c / U + Math.max(0, y - U) * 0.3); };

    /* ---- the sea's dots: a seeded disc of the shader's own layout (radius 34 lab units round the lab's middle, denser in the middle) */
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dots = new Float32Array(NDOTS * 3); for (let i = 0; i < NDOTS; i++) { const r = 34 * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI; dots[i * 3] = Math.cos(a) * r; dots[i * 3 + 1] = Math.sin(a) * r; dots[i * 3 + 2] = Math.pow(rnd(), 2.2); }
    // the dot's disc (the shader's smoothstep(0.5, 0.1, d); a one-pixel point is lit whole): as a kernel of weights for every whole size up to
    // KMAX px, summed into the light buffer, and above that as tinted sprites, ready at every whole size up to 16 px and one big one to scale
    const disc = (n, x, y) => n === 1 ? 1 : smooth(0.5, 0.1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5));
    const KMAX = 6, kern = [];
    for (let n = 1; n <= KMAX; n++) { kern[n] = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) kern[n][y * n + x] = disc(n, x, y); }
    const kSum = kern.map(k => k.reduce((a, b) => a + b, 0));
    // a ship point's light per px^2 of its size: the layer's alpha (0.24 x (1.1 + 1.4 shade), the shade term here x the size^2 by the
    // caller) x the area under its disc (1 - smoothstep(0.08, 0.5, d)), 0.292 of the square
    const SHIP_L = 0.24 * 0.292, DOT_A = 0.308;   // (the sea's dots: smoothstep(0.5, 0.1, d), 0.308 of the square, at the light the shader gives them)
    const SPR_MAX = 16, sprites = [], sprites2 = [];
    function dotSprites(set, c) {
        for (let n = KMAX + 1; n <= SPR_MAX * 4; n = n < SPR_MAX ? n + 1 : n === SPR_MAX ? SPR_MAX * 4 : Infinity) {
            const s = set[n] || (set[n] = newCanvas(n));
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
    const rowsAt = s => { const f = Math.min(rows.length - 1, Math.max(0, s / T.step)), i = Math.min(rows.length - 2, Math.floor(f)); return [rows[i], rows[i + 1], f - i]; };
    function pose() {
        const R = {}, w = {}; for (const g in lag) w[g] = rowsAt(lag[g].p);
        for (const k of T.keys) { const [A, B, u] = w[GROUP[k] || 'ang'], j = K[k]; R[k] = A[j] + (B[j] - A[j]) * u; }
        const [A] = w.size; R.lo = A[K.lo]; R.hi = A[K.hi];   // the two levels being blended are the row's, not a blend of them
        return R;
    }

    const on = new Int32Array(NDOTS); let nOn = 0, onAge = 0, onK = 0, onAt = [0, 0, 0], onWH = '';   // the dots on the screen
    const VMIN = 0.012, big = [], paths = [];   // a dot fainter than this adds under 2 of 255 to a pixel | this frame's big dots (x, y, size, light) | the lines' paths
    let judgedAs = null, fps = 60, judge = { n: 0, work: 0, late: 0 }, last = 0, prevRaf = 0, vs = 0, tick = 0, t0 = performance.now(), raf = 0, shown = true, prof = null;
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
        const vis = S.y <= T.until + S.vh * 0.2; if (vis !== shown) { shown = vis; show(vis); } if (!vis) return;
        for (const g in lag) follow(lag[g], S.y, LAGS[g], dt);
        const r = pose(), t = (now - t0) / 1000, tt = t * o.clock;
        color();
        const visH = 2 * cam[2] * tanH, visW = visH * W / H;

        /* the scene's sway and bob, the hull's ride (the live layer's formulas, at rest) */
        const sway = pc.shipSway * pc.shipBob * r.restW, sceneTilt = sway * 3.44 * Math.sin(t * 0.6), swayYaw = (1.5 + 3.7 * sway) * Math.sin(t * 0.21);
        const turn = r.turn + swayYaw, tilt = r.tilt + sceneTilt, scale = r.size * visW * r.LS;
        const at = [r.x * visW / 2, r.y * visH / 2 + r.restW * pc.shipBob * 0.04 * Math.sin(t * 0.8), 0];
        const omegaE = 0.9 * (1.2 - 0.15 * r.lvn), ph = t * omegaE, ks = 2 * Math.PI / 2.4, sinc = Math.sin(ks / 2) / (ks / 2), A = 0.008 / r.LS * pc.shipSwell;
        const thetaA = 1.4 * A * ks * sinc * pc.shipBob, hA = A * sinc * pc.shipBob;
        let pitch = -thetaA * (Math.sin(ph) + 0.35 * Math.sin(1.83 * ph + 1.1)) / 1.35, heave = hA * (Math.cos(ph) + 0.35 * Math.cos(1.83 * ph + 1.1)) / 1.35;
        const phiR = 0.6 * omegaE * t, pF = (1.5 - 0.33 * r.lvn) * pc.shipBob * pc.shipSwell, rollSea = 0.8 * pF * (Math.sin(phiR) + 0.4 * Math.sin(1.7 * phiR + 0.9)) / 1.4;
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

        // a point of s px at (px, py) carrying light L into a layer: under 1.5 px on the pixel it falls in (as a GPU draws it); up to 2.5 px
        // spread over the four pixels round it by where it falls between them; bigger, over the disc's kernel
        const splat = (acc, px, py, s, L) => {
            if (s < 1.5) {
                const X = px | 0, Y = py | 0; if (X < 0 || Y < 0 || X >= W || Y >= H || px < 0 || py < 0) return;
                const q = Y * W + X; if (!seen[q]) { seen[q] = 1; lit1[nLit++] = q; } acc[q] += L;
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X >= x1) x1 = X + 1; if (Y >= y1) y1 = Y + 1;
            } else if (s < 2.5) {
                const fx = px - 0.5, fy = py - 0.5, X = Math.floor(fx), Y = Math.floor(fy); if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) return;
                const ax = fx - X, ay = fy - Y, q = Y * W + X;
                for (let k = 0; k < 4; k++) {
                    const w = (k & 1 ? ax : 1 - ax) * (k & 2 ? ay : 1 - ay); if (w <= 0) continue;
                    const qq = q + (k & 1) + (k & 2 ? W : 0); if (!seen[qq]) { seen[qq] = 1; lit1[nLit++] = qq; } acc[qq] += L * w;
                }
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + 2 > x1) x1 = X + 2; if (Y + 2 > y1) y1 = Y + 2;
            } else {
                const n = Math.min(KMAX, Math.round(s)), X = Math.round(px - n / 2), Y = Math.round(py - n / 2); if (X < 0 || Y < 0 || X + n >= W || Y + n >= H) return;
                const kn = kern[n], g = L / kSum[n];
                for (let yy = 0, q = Y * W + X, j = 0; yy < n; yy++, q += W) for (let xx = 0; xx < n; xx++, j++) { const w = kn[j]; if (w === 0) continue; const qq = q + xx; if (!seen[qq]) { seen[qq] = 1; lit1[nLit++] = qq; } acc[qq] += g * w; }   // (a zero weight would list a pixel that stays dark)
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + n > x1) x1 = X + n; if (Y + n > y1) y1 = Y + n;
            }
        };

        /* the field: its points where the scroll has carried them, wrapped top to bottom, on its own canvas: still while the page is, so drawn
           only when it scrolls (or resizes, or the colour changes) */
        let fieldMs = 0; if (FIELD_N && fKey !== (fKey = fieldPar(S.y) + ' ' + W + 'x' + H + ' ' + colorKey)) { const f0 = performance.now(); drawField(); fieldMs = performance.now() - f0; }
        const tF = S.prof && performance.now();
        /* the dots: all of the shader's, on the same disc, with its brightness (the band they sit in, their seed, the distance) and size. Most
           are a pixel or a few: their light is summed into the buffer's sea layer through the disc's own kernel; the few big ones near the camera
           are drawn after it as sprites */
        const dotsW = r.foldW;
        if (dotsW > 0.003) {
            const gD = dotsW * o.dotGain, sx = Math.sin(ax), cxa = Math.cos(ax), qk = o.bands / o.lambda;
            const qx = (d[0] + (d1[0] - d[0]) * bf) * qk, qz = (d[1] + (d1[1] - d[1]) * bf) * qk, qc = o.speed * tt * qk, qb = o.bend * 0.1 * qk, pxK = o.dotPx * PR * 16.8;
            // two thirds of the disc lies off the screen: every half second (or when the view has moved) the dots on it, with a margin for the
            // swell and the sway, are listed, and only those are worked out each frame
            if (--onAge < 0 || onWH !== W + 'x' + H || Math.abs(k - onK) > 0.02 * onK || Math.abs(camL[0] - onAt[0]) + Math.abs(camL[2] - onAt[2]) > 1) {
                onAge = 30; onWH = W + 'x' + H; onK = k; onAt = camL.slice(); nOn = 0; const mx = W * 0.15, my = H * 0.15;
                for (let i = 0; i < NDOTS; i++) if (toWorld(dots[i * 3], 0, dots[i * 3 + 1], P2) && P2[0] > -mx && P2[0] < W + mx && P2[1] > -my && P2[1] < H + my) on[nOn++] = i;
            }
            for (let c = 0; c < nOn; c++) {
                const i = on[c], x = dots[i * 3], z = dots[i * 3 + 1], sd = dots[i * 3 + 2], h = hAt(x, z);
                const across = -x * sx + z * cxa, qB = x * qx + z * qz - qb * across * across + qc;   // the phase, in bands
                const ex = camL[0] - x, ey = camL[1] - h, ez = camL[2] - z, band = Math.pow(1 - (qB - Math.floor(qB)), o.bandPow);
                const vB = gD * (0.18 + 0.9 * band) * (0.45 + 1.1 * sd) * Math.exp(-Math.sqrt(ex * ex + ey * ey + ez * ez) / o.dotFar);
                if (vB < VMIN || !toWorld(x, h, z, P2)) continue;
                const px = Math.max(1, pxK * (0.6 + 0.9 * sd) / Math.max(1, P2[2] / k)), n = Math.round(px);   // (a GPU draws no point under a pixel)
                if (n > KMAX) { const X = Math.round(P2[0] - n / 2), Y = Math.round(P2[1] - n / 2); if (X + n > 0 && Y + n > 0 && X < W && Y < H) big.push(X, Y, n, vB); continue; }   // a sprite: clipped by the canvas
                splat(accS, P2[0], P2[1], px, vB * DOT_A * px * px);
            }
        }
        const tB = S.prof && performance.now();

        /* the ship: the model's particles posed as the shader poses them (about the waterline: pitch, then heel, then heave; then the hull's
           rotation, scale and place: one matrix and an offset per frame), summed as light into the buffer's ship layer */
        const posA = boat.pos[r.lo | 0], posB = boat.pos[Math.min(boat.pos.length - 1, r.hi | 0)], mix = r.mix, R = shipRot, cp = Math.cos(pitch), sp = Math.sin(pitch), ch = Math.cos(heel), sh = Math.sin(heel);
        const m0 = r.misc, ride = sg => {   // the matrix and offset for the hull (sg 1) and for its reflection (sg -1: every motion reversed, as the shader mirrors it)
            const HP = mul([1, 0, 0, 0, ch, -sg * sh, 0, sg * sh, ch], [cp, -sg * sp, 0, sg * sp, cp, 0, 0, 0, 1]);
            const lx = m0 - HP[0] * m0, ly = -HP[3] * m0 + sg * heave, lz = -HP[6] * m0;   // m + (0, heave, 0) - HP m, in the hull's frame
            return [mul(R, HP), at[0] + (R[0] * lx + R[1] * ly + R[2] * lz) * scale, at[1] + (R[3] * lx + R[4] * ly + R[5] * lz) * scale, at[2] + (R[6] * lx + R[7] * ly + R[8] * lz) * scale];
        }, hull = ride(1), mirror = ride(-1);
        const sz0 = P_SIZE * BOAT_PX * cam[2] * PR, refl = (1 - Math.min(1, Math.max(0, (r.tilt - 10) / 30))) * (1 - smooth(0, 120, lag.size.p));   // the reflection fades as the view tilts down and as the ship gets under way (the layer's uReflect; the track keeps no way, and live's is gone by 100 px of scroll)
        for (const i of shipIdx) {
            const o4 = i * 4, wa = posA[o4 + 3], wb = posB[o4 + 3]; let shade = wa + (wb - wa) * mix; if (shade < 0.03) continue;
            const x = posA[o4] + (posB[o4] - posA[o4]) * mix, y = posA[o4 + 1] + (posB[o4 + 1] - posA[o4 + 1]) * mix - WATERLINE, z = posA[o4 + 2] + (posB[o4 + 2] - posA[o4 + 2]) * mix;
            const isR = meta0[o4] > 7.5 && meta0[o4] < 8.5, f = isR ? refl : 1; if (f < 0.02) continue;
            const [C, ox, oy, oz] = isR ? mirror : hull;
            if (!proj(ox + (C[0] * x + C[1] * y + C[2] * z) * scale, oy + (C[3] * x + C[4] * y + C[5] * z) * scale, oz + (C[6] * x + C[7] * y + C[8] * z) * scale, P2)) continue;
            const s = Math.max(1, sz0 * aSz[i] / P2[2]); splat(accI, P2[0], P2[1], s, SHIP_L * (1.1 + 1.4 * shade) * s * s * f);
        }
        const tS = S.prof && performance.now();
        /* the water at rest, in the hull's frame: on the level sea at the waterline (no heel, pitch or heave), turned and placed with the hull */
        if (r.restW > 0.01) {
            const hA = hulls[r.lo | 0], hB = hulls[Math.min(hulls.length - 1, r.hi | 0)], stem = hA.stem + (hB.stem - hA.stem) * mix, stern = hA.stern + (hB.stern - hA.stern) * mix;
            const ringT = t, crestK = 0.5 * r.restW;   // the rings' clock (shipRings: 1 rad/s); the spiral's contrast (uMisc.z)
            for (let j = 0; j < wat.length; j += WS) {
                const i = wat[j], o4 = i * 4; if (posA[o4 + 3] < 0.01 && posB[o4 + 3] < 0.01) continue;
                const x = wat[j + 1]; let z = wat[j + 2], rr = wat[j + 6], rc = wat[j + 7], fth = wat[j + 8], reach = wat[j + 9];
                if (x >= stern && x <= stem && Math.abs(z) < 0.3) {   // parted along the real waterline: a thin rim on the hull
                    const u = Math.min(15.999, Math.max(0, (x + 0.5) * 16)), k = u | 0, fu = u - k;
                    const hb = (hA.beam[k] + (hA.beam[k + 1] - hA.beam[k]) * fu) * (1 - mix) + (hB.beam[k] + (hB.beam[k + 1] - hB.beam[k]) * fu) * mix;
                    if (Math.abs(z) <= hb + 0.008) { z = (z < 0 ? -1 : 1) * (hb + 0.01 + 0.02 * wat[j + 3]); [rr, rc, fth, reach] = ripple(x, z); }
                }
                const fade = r.restW * wat[j + 4] * fth * 0.8 * (1 - crestK * (1 - rc)) * (1 + 0.12 * r.restW * reach * Math.sin(rr * 14 - ringT));   // (2 rings - 1: the sine itself)
                if (fade < 0.02) continue;
                const y = 0.014 * crestK * rc;
                if (!proj(at[0] + (R[0] * x + R[1] * y + R[2] * z) * scale, at[1] + (R[3] * x + R[4] * y + R[5] * z) * scale, at[2] + (R[6] * x + R[7] * y + R[8] * z) * scale, P2)) continue;
                const s = Math.max(1, sz0 / BOAT_PX * wat[j + 5] / P2[2]); splat(accI, P2[0], P2[1], s, SHIP_L * 1.8 * s * s * fade);
            }
        }

        const tW = S.prof && performance.now();
        /* the buffer, written in one call, and its layers cleared for the next frame as they are read. Every layer in it is light added to the
           page, as the live ones are: the sea's dots leave the canvas's alpha alone, and the ship's points (additive, their
           alpha weighted by itself) add to it only the square of their faint alpha. A canvas laid over the page cannot add without covering,
           so each pixel is written as the colour and the least alpha that give, over the page's ground, the ground plus the light */
        let tP = tW;
        if (x1 > x0) {
            const dc = sea.map(v => v + (1 - v) * 0.3), lit = ink.map(v => v + (1 - v) * 0.45), [g0, g1, g2] = ground;   // the dots' tint; the ship's lit points, as the layer's read
            if (!pale) for (let j = 0; j < nLit; j++) {   // only the pixels that took light (the rest of the buffer stays clear)
                const q = lit1[j], a = accS[q], b = accI[q]; accS[q] = 0; accI[q] = 0; seen[q] = 0;
                px32[q] = pixel(dc[0] * a + lit[0] * b, dc[1] * a + lit[1] * b, dc[2] * a + lit[2] * b, g0, g1, g2);   // (little-endian RGBA)
            } else for (let j = 0; j < nLit; j++) {
                const q = lit1[j], a = accS[q], b = accI[q], w = a + b, D = dark; accS[q] = 0; accI[q] = 0; seen[q] = 0;
                px32[q] = ink2((D.sea[0] * a + D.ink[0] * b) / w, (D.sea[1] * a + D.ink[1] * b) / w, (D.sea[2] * a + D.ink[2] * b) / w, w);
            }
            tP = S.prof && performance.now();
            ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0); for (let j = 0; j < nLit; j++) px32[lit1[j]] = 0;
        }
        const tC = S.prof && performance.now();

        ctx.globalCompositeOperation = 'lighter';
        /* crest lines: q * bands = m along the across axis (closed form), each lifted by the swell and faded with distance; added like the dots */
        const c1 = d[0] * d1[0] + d[1] * d1[1], s1 = pp[0] * d1[0] + pp[1] * d1[1], du = (1 - bf) + bf * c1, lineFar = o.lineFar / Math.max(0.05, r.zoom);
        const gain = o.lineGain * Math.sqrt(Math.min(1, Math.max(0.1, r.zoom))) * r.silkW;
        if (gain > 0.003) {
            const lc = pale ? dark.sea : sea.map(v => v + (1 - v) * 0.25), span = 70, NA = 48, NB = 12, top = Math.min(1, gain);
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
            const n = big[j + 2], v = big[j + 3], k = Math.min(n, SPR_MAX) === n ? n : SPR_MAX * 4;
            for (let left = pale ? Math.min(1, v) : v, first = true; left > 0.004; left -= 1, first = false) {   // brighter than 1: drawn again for the rest, and the adding saturates toward white as the shader's min(colour * light, 1) does
                ctx.globalAlpha = Math.min(1, left); ctx.drawImage((first ? sprites : sprites2)[k], big[j], big[j + 1], n, n);
            }
        }
        ctx.globalAlpha = 1;
        // 60 a second unless this machine cannot hold it: judged over 90 drawn frames after the first 30, on the frame's own work and on how
        // often a refresh was missed (the field's redraw left out: a scroll during the judging is not the machine). On the page's thread the work may take 6 ms (the page's own drawing after it costs about as much again);
        // a worker's thread has nothing else to do, and held 60 at 7 ms with 2 refreshes missed in 90: 10 ms there
        if (judge && dt < 0.1 && ++judge.n > 30) {
            judge.work += performance.now() - w0 - fieldMs;   // (not the field's redraw: only a scroll costs it) if (raw > vs * 1.6) judge.late++;
            if (judge.n === 120) { if (judge.work / 90 > (S.worker ? 10 : 6) || judge.late > 25) fps = 30; judgedAs = [+(judge.work / 90).toFixed(2), judge.late]; judge = null; }
        }
        if (S.prof) { const tD = performance.now(), P = prof || (prof = { n: 0, field: 0, dots: 0, ship: 0, water: 0, buf: 0, put: 0, lines: 0 }); P.n++; P.field += tF - tA; P.dots += tB - tF; P.ship += tS - tB; P.water += tW - tS; P.buf += tP - tW; P.put += tC - tP; P.lines += tD - tC; if (P.n % 30 === 0) report({ ...P, fps, judgedAs }); }
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
