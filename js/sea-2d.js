/* sea-2d.js: the hero's sea and ship drawn on the CPU, on a plain 2D canvas, for a browser that gives the page no WebGL at all (graphics
 * acceleration off or crashed, a remote desktop, a virtual machine). Reached with ?sea=2d while it is reviewed.
 *
 * Not a copy of pixels: the same scene, computed again. The pose the scroll decides (where the ship sits, its size, course, tilt and level,
 * and where the hero's sea lies) comes from images/sea/hero-track.json, recorded from the live page at every 12 px of the hero (the ship
 * settled at rest there); between rows it is interpolated, and it follows the scroll with a lag as the live ship does. Everything time
 * drives is computed here with the live layer's own formulas: the scene's sway and bob, the hull's pitch, heave and roll on the swell,
 * and the sea itself (voyage-fold.js's seaHeight and the shader's crest-line phase), so the water runs on whether or not the page scrolls.
 *   the crest lines: each line is where the swell's phase crosses a whole band, solved in closed form along the sea's across axis, lifted by
 *     the swell's height, faded with distance as the shader fades them;
 *   the dots: a few thousand of the shader's tens of thousands, on the same disc, with its brightness (the band they sit in, distance) and size;
 *   the ship: the real model's particles (voyage-boat.js), posed as the shader poses them (about the waterline: pitch, heel, heave; then the
 *     hull's rotation, scale and place), its water and wake left out (the shader builds those).
 * Drawn at most 30 times a second, at up to 1.25x the CSS pixels; the canvas sits where the live one does (above the hero's grid).
 */
import { DEFAULTS, LAB, seaHeight } from './voyage-fold.js';
import { buildBoatLevels, WATERLINE } from './voyage-boat.js';

const D2R = Math.PI / 180, FPS = 30, NDOTS = 6000, SHIP_N = 128 * 128;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };   // row-major 3x3
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const mul = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
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
    let W = 0, H = 0, PR = 1;
    function size() { PR = Math.min(devicePixelRatio || 1, 1.25); W = canvas.width = Math.round(innerWidth * PR); H = canvas.height = Math.round(canvas.getBoundingClientRect().height * PR || innerHeight * PR); }
    size(); addEventListener('resize', size);

    /* ---- colour: the picked hue, as the live layer takes it (the sea at the lab's saturation and lightness, the ship's ink pushed vivid) */
    let sea = [0.3, 0.5, 0.8], ink = [0.4, 0.6, 1], colorKey = null;
    function color() {
        const c = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(); if (c === colorKey) return; colorKey = c;
        const m = /^#?([0-9a-f]{6})$/i.exec(c), rgb = m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255) : [0.08, 0.4, 0.72];
        const mx = Math.max(...rgb), mn = Math.min(...rgb), d = mx - mn, [r, g, b] = rgb;
        const h = !d ? 0 : (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
        sea = hsl(h, o.sat, o.lum); ink = hsl(h, 0.85, 0.62);
    }

    /* ---- the ship's particles, both levels the hero passes through (lo, hi), the shader-built water and wake left out */
    const boat = buildBoatLevels(SHIP_N, 1), role = i => Math.round(boat.meta[0][i * 4]);
    const shipIdx = []; for (let i = 0; i < SHIP_N; i++) { const r = role(i); if (r !== 6 && r !== 7) shipIdx.push(i); }

    /* ---- the sea's dots: a seeded disc of the shader's own layout (radius 34 lab units round the lab's middle, denser in the middle) */
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dots = new Float32Array(NDOTS * 3); for (let i = 0; i < NDOTS; i++) { const r = 34 * Math.sqrt(rnd()), a = rnd() * 2 * Math.PI; dots[i * 3] = Math.cos(a) * r; dots[i * 3 + 1] = Math.sin(a) * r; dots[i * 3 + 2] = Math.pow(rnd(), 2.2); }
    const sprite = (() => { const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return s; })();

    /* ---- the camera: the layer's (fov 35 at z = 12, looking down -z) */
    const cam = T.cam, tanH = Math.tan(T.fov * D2R / 2);
    const proj = (x, y, z, out) => { const vz = cam[2] - z; if (vz < 0.1) return false; const a = W / H; out[0] = ((x - cam[0]) / vz / (tanH * a) * 0.5 + 0.5) * W; out[1] = (0.5 - (y - cam[1]) / vz / tanH * 0.5) * H; out[2] = vz; return true; };

    /* ---- the pose at a (lagged) scroll: the track's rows, linear between them */
    const row = s => { const f = Math.min(rows.length - 1, Math.max(0, s / T.step)), i = Math.min(rows.length - 2, Math.floor(f)), u = f - i, A = rows[i], B = rows[i + 1]; const R = {}; for (const k of T.keys) R[k] = A[K[k]] + (B[K[k]] - A[K[k]]) * u; R.lo = A[K.lo]; R.hi = A[K.hi]; return R; };

    const pts = new Int32Array(SHIP_N * 2), ptA = new Float32Array(SHIP_N), off = document.createElement('canvas'), offCtx = off.getContext('2d');   // the ship's specks this frame; its pixel buffer
    let buf = null, acc = null;
    let sS = scrollY, last = 0, t0 = performance.now(), raf = 0;
    const P2 = [0, 0, 0];
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (now - last < 1000 / FPS - 2) return;
        const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
        if (scrollY > T.until + innerHeight * 0.2) { if (canvas.style.display !== 'none') canvas.style.display = 'none'; return; }
        if (canvas.style.display === 'none') canvas.style.display = '';
        sS += (scrollY - sS) * (1 - Math.exp(-dt / 0.35));   // the pose follows the scroll as the live ship does
        const r = row(sS), t = (now - t0) / 1000, tt = t * o.clock;
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
        const S0 = LAB.S[0], S1 = LAB.S[1];
        const toWorld = (x, y, z, out) => { const px = (x - S0) * k, py = y * k, pz = (z - S1) * k; return proj(at[0] + full[0] * px + full[1] * py + full[2] * pz, at[1] + full[3] * px + full[4] * py + full[5] * pz, at[2] + full[6] * px + full[7] * py + full[8] * pz, out); };
        // the camera in the lab's space, for the distance fades: full^T (cam - at) / k + S
        const cx = cam[0] - at[0], cy = cam[1] - at[1], cz = cam[2] - at[2];
        const camL = [(full[0] * cx + full[3] * cy + full[6] * cz) / k + S0, (full[1] * cx + full[4] * cy + full[7] * cz) / k, (full[2] * cx + full[5] * cy + full[8] * cz) / k + S1];
        // the ride on the hero's sea (fold.ride): the water under the bow, the stern and both sides
        if (r.silkW > 0) {
            const b = (r.seaYaw - r.foldTheta - turn) * D2R, bx = Math.cos(b), bz = -Math.sin(b), Ll = scale / Math.max(1e-4, k), B = 0.3 * Ll;
            const hB = seaHeight(o, S0 + bx * Ll * 0.45, S1 + bz * Ll * 0.45, tt), hS = seaHeight(o, S0 - bx * Ll * 0.45, S1 - bz * Ll * 0.45, tt);
            const hP = seaHeight(o, S0 - bz * B * 0.5, S1 + bx * B * 0.5, tt), hM = seaHeight(o, S0 + bz * B * 0.5, S1 - bx * B * 0.5, tt), g = r.silkW * pc.foldRide;
            pitch += g * Math.atan2(hB - hS, 0.9 * Ll); heave += g * (hB + hS + hP + hM) / 4 / Ll;
            r.foldRoll = g * -Math.atan2(hP - hM, B) / D2R;
        }
        const heel = 24 * Math.tanh((r.heel + rollSea + (r.foldRoll || 0)) / 24) * D2R;

        ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);

        /* crest lines: q * bands = m along the across axis (closed form), each lifted by the swell and faded with distance */
        const ax = o.axis * D2R, d = [Math.cos(ax), Math.sin(ax)], pp = [-d[1], d[0]];
        const wob = o.wander * D2R * Math.sin(tt * o.wanderRate), a1 = ax + o.swellRot * D2R + wob, d1 = [Math.cos(a1), Math.sin(a1)];
        const bf = o.bandFollow, c1 = d[0] * d1[0] + d[1] * d1[1], s1 = pp[0] * d1[0] + pp[1] * d1[1], du = (1 - bf) + bf * c1, lineFar = o.lineFar / Math.max(0.05, r.zoom);
        const gain = o.lineGain * Math.sqrt(Math.min(1, Math.max(0.1, r.zoom))) * r.silkW;
        if (gain > 0.003) {
            const lc = sea.map(v => v + (1 - v) * 0.25), span = 70, NA = 48;
            ctx.lineWidth = 1.4 * PR; ctx.lineCap = 'round';
            const uC = camL[0] * d[0] + camL[2] * d[1];   // the camera's place along the swell's travel
            for (let m = Math.floor((uC - span) * o.bands * du / o.lambda) - 2, mEnd = Math.ceil((uC + span) * o.bands * du / o.lambda) + 2; m <= mEnd; m++) {
                let prev = null;
                for (let j = 0; j <= NA; j++) {
                    const a = -span + 2 * span * j / NA + (camL[0] * pp[0] + camL[2] * pp[1]);
                    const u = (m * o.lambda / o.bands - a * bf * s1 + o.bend * a * a * 0.1 - o.speed * tt) / du;
                    const x = u * d[0] + a * pp[0], z = u * d[1] + a * pp[1], h = seaHeight(o, x, z, tt);
                    const dist = Math.hypot(camL[0] - x, camL[1] - h, camL[2] - z), al = gain * Math.exp(-dist / lineFar);
                    if (al < 0.01 || !toWorld(x, h, z, P2)) { prev = null; continue; }
                    if (prev) { ctx.strokeStyle = `rgba(${lc[0] * 255 | 0},${lc[1] * 255 | 0},${lc[2] * 255 | 0},${Math.min(1, (al + prev[2]) / 2)})`; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(P2[0], P2[1]); ctx.stroke(); }
                    prev = [P2[0], P2[1], al];
                }
            }
        }

        ctx.globalCompositeOperation = 'lighter';
        /* the dots: the band they sit in, their seed, the distance; additive */
        const dotsW = r.foldW;
        if (dotsW > 0.003) {
            const dc = sea.map(v => v + (1 - v) * 0.3), boost = 60000 / NDOTS * 0.18;   // fewer dots than the shader's: each a little brighter, so the sea keeps its light
            for (let i = 0; i < NDOTS; i++) {
                const x = dots[i * 3], z = dots[i * 3 + 1], sd = dots[i * 3 + 2], h = seaHeight(o, x, z, tt);
                const across = -x * Math.sin(ax) + z * Math.cos(ax), run = x * d[0] + z * d[1] - o.bend * across * across * 0.1;
                const q0 = (run + o.speed * tt) / o.lambda, q1 = (x * d1[0] + z * d1[1] - o.bend * across * across * 0.1 + o.speed * tt) / o.lambda, q = q0 + (q1 - q0) * bf;
                const band = Math.pow(1 - (((q * o.bands) % 1) + 1) % 1, o.bandPow), dist = Math.hypot(camL[0] - x, camL[1] - h, camL[2] - z);
                const vB = dotsW * o.dotGain * (0.18 + 0.9 * band) * (0.45 + 1.1 * sd) * Math.exp(-dist / o.dotFar) * boost;
                if (vB < 0.02 || !toWorld(x, h, z, P2)) continue;
                const px = o.dotPx * PR * (0.6 + 0.9 * sd) * 16.8 / Math.max(1, P2[2] / k);
                ctx.globalAlpha = Math.min(1, vB); ctx.drawImage(sprite, P2[0] - px / 2, P2[1] - px / 2, px, px);
            }
            ctx.globalAlpha = 1;
        }

        /* the ship: the model's particles posed as the shader poses them (about the waterline: pitch, then heel, then heave; then the hull's
           rotation, scale and place: one matrix and an offset per frame), summed as light into a pixel buffer round the ship and drawn in one call */
        const posA = boat.pos[r.lo | 0], posB = boat.pos[Math.min(boat.pos.length - 1, r.hi | 0)], mix = r.mix, R = shipRot, cp = Math.cos(pitch), sp = Math.sin(pitch), ch = Math.cos(heel), sh = Math.sin(heel);
        const HP = mul([1, 0, 0, 0, ch, -sh, 0, sh, ch], [cp, -sp, 0, sp, cp, 0, 0, 0, 1]), C = mul(R, HP), m0 = r.misc;
        const lx = m0 - HP[0] * m0, ly = -HP[3] * m0 + heave, lz = -HP[6] * m0;   // m + (0, heave, 0) - HP m, in the hull's frame
        const ox = at[0] + (R[0] * lx + R[1] * ly + R[2] * lz) * scale, oy = at[1] + (R[3] * lx + R[4] * ly + R[5] * lz) * scale, oz = at[2] + (R[6] * lx + R[7] * ly + R[8] * lz) * scale;
        let n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const i of shipIdx) {
            const o4 = i * 4, wa = posA[o4 + 3], wb = posB[o4 + 3], shade = wa + (wb - wa) * mix; if (shade < 0.03) continue;
            const x = posA[o4] + (posB[o4] - posA[o4]) * mix, y = posA[o4 + 1] + (posB[o4 + 1] - posA[o4 + 1]) * mix - WATERLINE, z = posA[o4 + 2] + (posB[o4 + 2] - posA[o4 + 2]) * mix;
            if (!proj(ox + (C[0] * x + C[1] * y + C[2] * z) * scale, oy + (C[3] * x + C[4] * y + C[5] * z) * scale, oz + (C[6] * x + C[7] * y + C[8] * z) * scale, P2)) continue;
            const sx = P2[0] | 0, sy = P2[1] | 0; if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) continue;
            pts[n * 2] = sx; pts[n * 2 + 1] = sy; ptA[n] = (0.25 + 0.6 * shade) * (P2[2] < 9 ? 2 : 1); n++;   // nearer than the hull's plane: a 2 px speck's light
            if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        }
        if (n) {
            const bw = x1 - x0 + 2, bh = y1 - y0 + 2;
            if (!buf || buf.width < bw || buf.height < bh) { buf = new ImageData(Math.max(bw, buf ? buf.width : 0), Math.max(bh, buf ? buf.height : 0)); acc = new Float32Array(buf.width * buf.height); off.width = buf.width; off.height = buf.height; }
            const BW = buf.width; acc.fill(0, 0, BW * bh);
            for (let k = 0; k < n; k++) acc[(pts[k * 2 + 1] - y0) * BW + pts[k * 2] - x0] += ptA[k];
            const d8 = buf.data, cr = (ink[0] + (1 - ink[0]) * 0.45) * 255, cg = (ink[1] + (1 - ink[1]) * 0.45) * 255, cb = (ink[2] + (1 - ink[2]) * 0.45) * 255;   // lit specks, as the layer's read
            for (let yy = 0; yy < bh; yy++) for (let xx = 0, o = yy * BW; xx < bw; xx++, o++) { const a = acc[o], q = o * 4; if (a > 0) { d8[q] = cr; d8[q + 1] = cg; d8[q + 2] = cb; d8[q + 3] = a >= 1 ? 255 : a * 255; } else d8[q + 3] = 0; }
            offCtx.putImageData(buf, 0, 0, 0, 0, bw, bh);
            ctx.drawImage(off, 0, 0, bw, bh, x0, y0, bw, bh);
        }
    }
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(frame); });
}
