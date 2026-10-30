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

const PROF = new URLSearchParams(location.search).has('prof');   // ?sea=2d&prof: the frame's parts timed in window.__s2dP
const D2R = Math.PI / 180, NDOTS = 60000, SHIP_N = 128 * 128;
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

export async function start() {
    if (document.getElementById('sea-2d')) return;
    let T;
    try { T = await (await fetch('images/sea/hero-track.json')).json(); } catch (e) { console.warn('sea-2d: no track', e); return; }
    const o = DEFAULTS, rows = T.rows, K = Object.fromEntries(T.keys.map((k, i) => [k, i])), pc = T.pc;

    const canvas = document.createElement('canvas');
    canvas.id = 'sea-2d'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;z-index:1;pointer-events:none;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const PR = 1;   // CSS pixels: on a 2x screen 1.25x looked the same and cost a fifth more of each frame
    let accS, accI, img, px32, lit1;   // the light buffer: the sea's dots and the ship's specks, summed per pixel, and the pixels they are written through
    function size() {
        W = canvas.width = Math.max(1, Math.round(innerWidth * PR)); H = canvas.height = Math.max(1, Math.round(canvas.getBoundingClientRect().height * PR || innerHeight * PR));
        accS = new Float32Array(W * H); accI = new Float32Array(W * H); img = ctx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer); lit1 = new Int32Array(W * H);
    }
    size(); addEventListener('resize', size);

    /* ---- colour: the picked hue, as the live layer takes it (the sea at the lab's saturation and lightness, the ship's ink pushed vivid) */
    let sea = [0.3, 0.5, 0.8], ink = [0.4, 0.6, 1], colorKey = null;
    function color() {
        const c = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(); if (c === colorKey) return; colorKey = c;
        const m = /^#?([0-9a-f]{6})$/i.exec(c), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : [0.08, 0.4, 0.72];
        const mx = Math.max(...rgb), mn = Math.min(...rgb), d = mx - mn, [r, g, b] = rgb;
        const h = !d ? 0 : (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
        sea = hsl(h, o.sat, o.lum); ink = hsl(h, 0.85, 0.62); dotSprites(sea.map(v => v + (1 - v) * 0.3));
    }

    /* ---- the ship's particles, both levels the hero passes through (lo, hi), the shader-built water and wake left out */
    const boat = buildBoatLevels(SHIP_N, 1), role = i => Math.round(boat.meta[0][i * 4]);
    const shipIdx = []; for (let i = 0; i < SHIP_N; i++) { const r = role(i); if (r !== 6 && r !== 7) shipIdx.push(i); }

    /* ---- the sea's dots: a seeded disc of the shader's own layout (radius 34 lab units round the lab's middle, denser in the middle) */
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dots = new Float32Array(NDOTS * 3); for (let i = 0; i < NDOTS; i++) { const r = 34 * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI; dots[i * 3] = Math.cos(a) * r; dots[i * 3 + 1] = Math.sin(a) * r; dots[i * 3 + 2] = Math.pow(rnd(), 2.2); }
    // the dot's disc (the shader's smoothstep(0.5, 0.1, d); a one-pixel point is lit whole): as a kernel of weights for every whole size up to
    // KMAX px, summed into the light buffer, and above that as tinted sprites, ready at every whole size up to 16 px and one big one to scale
    const disc = (n, x, y) => n === 1 ? 1 : smooth(0.5, 0.1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5));
    const KMAX = 6, kern = [];
    for (let n = 1; n <= KMAX; n++) { kern[n] = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) kern[n][y * n + x] = disc(n, x, y); }
    const SPR_MAX = 16, sprites = [];
    function dotSprites(c) {
        for (let n = KMAX + 1; n <= SPR_MAX * 4; n = n < SPR_MAX ? n + 1 : n === SPR_MAX ? SPR_MAX * 4 : Infinity) {
            const s = sprites[n] || (sprites[n] = document.createElement('canvas')); s.width = s.height = n;
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
    const lag = {}; for (const g in LAGS) lag[g] = { p: scrollY, v: 0 };
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
    let fps = 60, judge = { n: 0, work: 0, late: 0 }, last = 0, prevRaf = 0, vs = 0, tick = 0, t0 = performance.now(), raf = 0;
    const P2 = [0, 0, 0];
    function frame(now) {
        raf = requestAnimationFrame(frame);
        // the screen's refresh interval (the usual gap between callbacks), and every how many refreshes a frame is drawn to come near fps
        const raw = now - prevRaf; prevRaf = now;
        if (raw > 2 && raw < 50) vs = vs ? vs * 0.95 + Math.min(raw, vs * 1.5) * 0.05 : raw;
        if (++tick < Math.max(1, Math.round(1000 / fps / (vs || 16.7)))) return;
        tick = 0;
        const w0 = performance.now();
        const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
        if (scrollY > T.until + innerHeight * 0.2) { if (canvas.style.visibility !== 'hidden') canvas.style.visibility = 'hidden'; return; }   // (hidden, not display:none: it keeps its size for a resize down the page)
        if (canvas.style.visibility === 'hidden') canvas.style.visibility = '';
        for (const g in lag) follow(lag[g], scrollY, LAGS[g], dt);
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

        const tA = PROF && performance.now();
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
                const px = pxK * (0.6 + 0.9 * sd) / Math.max(1, P2[2] / k), n = Math.max(1, Math.round(px));
                const X = Math.round(P2[0] - n / 2), Y = Math.round(P2[1] - n / 2);
                if (n > KMAX) { if (X + n > 0 && Y + n > 0 && X < W && Y < H) big.push(X, Y, n, vB); continue; }   // a sprite: clipped by the canvas
                if (X < 0 || Y < 0 || X + n >= W || Y + n >= H) continue;   // off the screen (or on its very edge)
                const kn = kern[n];
                for (let yy = 0, q = Y * W + X, j = 0; yy < n; yy++, q += W) for (let xx = 0; xx < n; xx++, j++) { const w = kn[j]; if (w === 0) continue; const qq = q + xx; if (accS[qq] === 0 && accI[qq] === 0) lit1[nLit++] = qq; accS[qq] += vB * w; }   // (a zero weight would list a pixel that stays dark, then list it again)
                if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + n > x1) x1 = X + n; if (Y + n > y1) y1 = Y + n;
            }
        }
        const tB = PROF && performance.now();

        /* the ship: the model's particles posed as the shader poses them (about the waterline: pitch, then heel, then heave; then the hull's
           rotation, scale and place: one matrix and an offset per frame), summed as light into the buffer's ship layer */
        const posA = boat.pos[r.lo | 0], posB = boat.pos[Math.min(boat.pos.length - 1, r.hi | 0)], mix = r.mix, R = shipRot, cp = Math.cos(pitch), sp = Math.sin(pitch), ch = Math.cos(heel), sh = Math.sin(heel);
        const HP = mul([1, 0, 0, 0, ch, -sh, 0, sh, ch], [cp, -sp, 0, sp, cp, 0, 0, 0, 1]), C = mul(R, HP), m0 = r.misc;
        const lx = m0 - HP[0] * m0, ly = -HP[3] * m0 + heave, lz = -HP[6] * m0;   // m + (0, heave, 0) - HP m, in the hull's frame
        const ox = at[0] + (R[0] * lx + R[1] * ly + R[2] * lz) * scale, oy = at[1] + (R[3] * lx + R[4] * ly + R[5] * lz) * scale, oz = at[2] + (R[6] * lx + R[7] * ly + R[8] * lz) * scale;
        for (const i of shipIdx) {
            const o4 = i * 4, wa = posA[o4 + 3], wb = posB[o4 + 3], shade = wa + (wb - wa) * mix; if (shade < 0.03) continue;
            const x = posA[o4] + (posB[o4] - posA[o4]) * mix, y = posA[o4 + 1] + (posB[o4 + 1] - posA[o4 + 1]) * mix - WATERLINE, z = posA[o4 + 2] + (posB[o4 + 2] - posA[o4 + 2]) * mix;
            if (!proj(ox + (C[0] * x + C[1] * y + C[2] * z) * scale, oy + (C[3] * x + C[4] * y + C[5] * z) * scale, oz + (C[6] * x + C[7] * y + C[8] * z) * scale, P2)) continue;
            const X = P2[0] | 0, Y = P2[1] | 0; if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;
            const q = Y * W + X; if (accS[q] === 0 && accI[q] === 0) lit1[nLit++] = q;
            accI[q] += (0.25 + 0.6 * shade) * (P2[2] < 9 ? 2 : 1);   // nearer than the hull's plane: a 2 px speck's light
            if (X < x0) x0 = X; if (Y < y0) y0 = Y; if (X + 1 > x1) x1 = X + 1; if (Y + 1 > y1) y1 = Y + 1;
        }

        /* the buffer, written in one call: each pixel the sum of its light, as additive points on a clear canvas sum (a channel saturates to
           white, the alpha to opaque), and its layers cleared for the next frame as they are read */
        if (x1 > x0) {
            const dc = sea.map(v => v + (1 - v) * 0.3), lit = ink.map(v => v + (1 - v) * 0.45);   // the dots' tint; the ship's lit specks, as the layer's read
            for (let j = 0; j < nLit; j++) {   // only the pixels that took light (the rest of the buffer stays clear)
                const q = lit1[j], a = accS[q], b = accI[q], A = Math.min(1, a + b); if (!(A > 0)) continue; const iA = 255 / A;   // a pixel at a time (little-endian RGBA)
                px32[q] = (A * 255) << 24 | (Math.min(1, dc[2] * a + lit[2] * b) * iA) << 16 | (Math.min(1, dc[1] * a + lit[1] * b) * iA) << 8 | (Math.min(1, dc[0] * a + lit[0] * b) * iA);
                accS[q] = 0; accI[q] = 0;
            }
            ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0); for (let j = 0; j < nLit; j++) px32[lit1[j]] = 0;
        }
        const tC = PROF && performance.now();

        ctx.globalCompositeOperation = 'lighter';
        /* crest lines: q * bands = m along the across axis (closed form), each lifted by the swell and faded with distance; added like the dots */
        const c1 = d[0] * d1[0] + d[1] * d1[1], s1 = pp[0] * d1[0] + pp[1] * d1[1], du = (1 - bf) + bf * c1, lineFar = o.lineFar / Math.max(0.05, r.zoom);
        const gain = o.lineGain * Math.sqrt(Math.min(1, Math.max(0.1, r.zoom))) * r.silkW;
        if (gain > 0.003) {
            const lc = sea.map(v => v + (1 - v) * 0.25), span = 70, NA = 48, NB = 12, top = Math.min(1, gain);
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
            for (let left = v; left > 0.004; left -= 1) {   // brighter than 1: drawn again for the rest, and the adding saturates toward white as the shader's min(colour * light, 1) does
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
        if (PROF) { const tD = performance.now(), P = window.__s2dP || (window.__s2dP = { n: 0, dots: 0, ship: 0, lines: 0 }); P.n++; P.dots += tB - tA; P.ship += tC - tB; P.lines += tD - tC; }
    }
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(frame); });
}
