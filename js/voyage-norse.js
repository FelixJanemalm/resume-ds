/* voyage-norse.js: the Norse lineage of the voyage, a theme for the particle ship. Six ship levels (faering, karvi,
   snekkja, skeid, drakkar, the Long Serpent) plus the shared rocket, built with the same conventions as voyage-boat.js
   (boat space: hull length 1, bow at +x, y up, z toward the viewer, waterline at WATERLINE; the same particle keeps its
   role and its surface coordinates at every level; pos = x, y, z, shade with shade 0 = absent; meta = role, flap,
   belly | phase, aux), so js/work-spine.js can swap it in for the Atlantic lineage without any shader change.

   The lineage: a clinker-built double-ender all the way, one mast, one striped square sail (braced -30 deg; the
   module exports that normal for the shader), rising stem and stern posts. The faering rows (oars out) under a small sail, the karvi
   has more oars and shrouds, the snekkja ships its oars, hangs the shield row and raises a dragon head, the skeid adds
   the tail curl and a second pair of shrouds, the drakkar the weather vane and a third pair, the Long Serpent the full
   shield row with bigger shields and the tallest posts. WATER / WAKE / the rocket come from voyage-boat.js. */
import { ROLE, WATERLINE, mulberry32, shadeN, waterPt, wakePt, rocketLevel } from './voyage-boat.js';
export { ROLE, WATERLINE };
export const THEME = { id: 'norse', name: 'Norse', title: 'Faering to the Long Serpent' };
export const LEVELS = ['faering', 'karvi', 'snekkja', 'skeid', 'drakkar', 'long serpent', 'rocket'];
export const LEVEL_SCALE = [0.7, 0.85, 1.0, 1.15, 1.32, 1.5, 1.0];
export const LEVEL_HEEL = [0.55, 0.75, 0.85, 0.9, 0.95, 0.95, 0.2];   // a low square sail on a wide, shallow hull: less wind heel than the yachts
export const LEVEL_PIVOT = [0, 0, -0.01, -0.01, -0.02, -0.02, 0];
export const ROCKET = 6;

const NL = 6, WL = WATERLINE, PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const TOP = shadeN([0, 1, 0]);

/* per level: B max half-beam, f0 / fEnd freeboard amidships / at the ends, post height above the sheer, mast height,
   sail width and height, rooms (rowing benches), shields (0 none, 1 every other / all, 2 all and bigger), oars per side,
   head / tail / vane flags, sail stripes */
const SHIP = [
    { B: 0.150, f0: 0.075, fEnd: 0.140, post: 0.050, mast: 0.50, sailW: 0.34, sailH: 0.28, rooms: 3, shields: 0, oars: 2, head: 0, tail: 0, vane: 0, stripes: 5 },
    { B: 0.120, f0: 0.065, fEnd: 0.150, post: 0.080, mast: 0.58, sailW: 0.42, sailH: 0.34, rooms: 6, shields: 0, oars: 6, head: 0, tail: 0, vane: 0, stripes: 7 },
    { B: 0.095, f0: 0.060, fEnd: 0.160, post: 0.100, mast: 0.64, sailW: 0.48, sailH: 0.40, rooms: 10, shields: 1, oars: 0, head: 0.8, tail: 0, vane: 0, stripes: 8 },
    { B: 0.085, f0: 0.058, fEnd: 0.170, post: 0.120, mast: 0.70, sailW: 0.52, sailH: 0.45, rooms: 13, shields: 1, oars: 0, head: 0.95, tail: 0.9, vane: 0, stripes: 9 },
    { B: 0.080, f0: 0.056, fEnd: 0.180, post: 0.140, mast: 0.76, sailW: 0.56, sailH: 0.50, rooms: 16, shields: 1, oars: 0, head: 1.1, tail: 1.0, vane: 1, stripes: 10 },
    { B: 0.078, f0: 0.055, fEnd: 0.200, post: 0.170, mast: 0.82, sailW: 0.60, sailH: 0.55, rooms: 17, shields: 2, oars: 0, head: 1.25, tail: 1.1, vane: 1, stripes: 12 },
];
const SHROUD_PAIRS = [1, 1, 2, 2, 3, 3], SHROUD_X = [-0.07, -0.13, -0.19];
const HULL_PRES = [0.5, 0.65, 0.78, 0.88, 0.95, 1];
const SH_N = 26;                                                       // shield slots per side, u = 0.14 .. 0.86
const YARD_A = [-0.5, 0, -0.866], SAIL_N = [0.866, 0, -0.5];            // the yard braced -30 deg (a reach): wide from the hero's course (turn 145), half width from the side; the shader fills / luffs along SQUARE_NORMAL
export const SQUARE_NORMAL = SAIL_N;

const hb = (S, u) => S.B * Math.pow(Math.max(0, 1 - Math.pow((u - 0.5) / 0.5, 2)), 0.55);   // half-beam along u (0 stern .. 1 bow): fine double ends
const fb = (S, u) => S.f0 + (S.fEnd - S.f0) * Math.pow(Math.abs(2 * u - 1), 3);              // freeboard: low amidships, sweeping up at the ends
const hbX = (S, x) => hb(S, clamp01(x + 0.5)), railY = (S, x) => WL + fb(S, clamp01(x + 0.5));
const bez2 = (p0, p1, p2, t) => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]; };
const bez3 = (p0, p1, p2, p3, t) => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]; };
/* the stem (e = +1) and stern (e = -1) posts: a curve rising from the end of the sheer, sweeping out and back in at the top */
const post = (S, e, t) => { const y0 = WL + S.fEnd; return bez2([e * 0.5, y0], [e * 0.565, y0 + 0.55 * S.post], [e * 0.53, y0 + S.post], t); };
const alongN = (f, t) => { const a = f(t), b = f(Math.min(1, t + 0.02)); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };   // the in-plane normal of a curve

/* ---------------------------------------------------------------- the hull */
function hullPt(S, u, sgn, v, plank, rail) {
    const H = hb(S, u), F = fb(S, u);
    const vv = rail ? 1 : plank ? Math.min(1, 0.03 + Math.floor(v * 7) / 7) : v;             // clinker: 7 strakes, their lands as denser rows
    const z = sgn * H * (0.82 + 0.18 * vv), y = WL + vv * F;
    const du = 0.01, slope = (hb(S, Math.min(1, u + du)) - hb(S, Math.max(0, u - du))) / (2 * du);
    let sh = shadeN([-sgn * slope * 0.6, 0.35, sgn * 0.94]);
    if (plank && !rail) sh *= 0.82 + 0.18 * (Math.floor(v * 7) % 2);
    if (rail) sh = TOP;
    return [-0.5 + u, y, z, sh];
}
function postPt(S, e, t, w, zj) { const [x, y] = post(S, e, t), n = alongN(tt => post(S, e, tt), t); return [x + n[0] * w * 0.012, y + n[1] * w * 0.012, zj * 0.012, 0.72]; }

/* ---------------------------------------------------------------- deck fittings */
function benchPt(S, u, w, jx) { const n = S.rooms, k = Math.min(n - 1, Math.floor(u * n)), x = -0.36 + (k + 0.5) * (0.72 / n) + jx; return [x, WL + 0.55 * fb(S, x + 0.5), w * hbX(S, x) * 0.88, TOP * 0.85]; }
function mastFishPt(S, a, b, c) { return [-0.03 + a * 0.08, WL + 0.5 * S.f0 + c * 0.02, (b - 0.5) * 0.04, TOP * 0.8]; }
function steerPt(S, t, w, jz) {   // the side rudder on the starboard quarter: shaft from the rail down aft, the blade below the waterline
    const x0 = -0.36, A = [x0, railY(S, x0) + 0.03, hbX(S, x0) + 0.012], B = [x0 - 0.08, WL - 0.07, hbX(S, x0) + 0.02];
    const P = [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)], blade = t > 0.6 ? 0.014 * (w - 0.5) * 2 : 0.003 * (w - 0.5);
    return [P[0] + blade * 0.9, P[1] - Math.abs(blade) * 0.3, P[2] + jz * 0.004, 0.6];
}
function shieldPt(S, L, i, sgn, q, a, rr) {
    if (S.shields === 0 || i >= SH_N || (S.shields === 1 && L === 2 && i % 2 === 1)) return null;   // the snekkja hangs every other shield
    const r = S.shields === 2 ? 0.024 : 0.02, u = 0.14 + (i + 0.5) * (0.72 / SH_N), x = u - 0.5;
    const cy = WL + fb(S, u) * 0.95, cz = sgn * (hb(S, u) + 0.006);
    const rad = q < 0.45 ? r * (0.86 + 0.14 * rr) : q < 0.6 ? r * 0.2 * rr : r * Math.sqrt(rr);
    const sh = q < 0.45 ? 1.0 : q < 0.6 ? 0.9 : i % 2 ? 0.42 : 0.88;
    return [x + Math.cos(a) * rad, cy + Math.sin(a) * rad, cz, sh];
}
function headPt(S, L, t, w, zj, kind) {   // the dragon head on the stem: a neck continuing the post's sweep, the head bulging, the snout forward, a jaw and a crest
    const g = S.head; if (!g) return null;
    const T = post(S, 1, 1), curve = tt => bez2(T, [T[0] + 0.02 * g, T[1] + 0.09 * g], [T[0] + 0.09 * g, T[1] + 0.08 * g], tt);
    if (kind === 1) { const J = curve(0.8); return [J[0] + t * 0.04 * g + w * 0.003, J[1] - t * 0.03 * g, zj * 0.004, 0.85]; }                 // the lower jaw
    if (kind === 2) { const k = [0.2, 0.42, 0.62][Math.floor(t * 3)], C = curve(k), n = alongN(curve, k), s = (t * 3) % 1; return [C[0] + n[0] * s * 0.022 * g, C[1] + n[1] * s * 0.022 * g, zj * 0.003, 0.9]; }   // the crest spikes
    const C = curve(t), n = alongN(curve, t), r = g * (0.011 + 0.014 * Math.sin(PI * t) * (t > 0.5 ? 1.15 : 0.8)) * (t > 0.92 ? 0.4 : 1);
    return [C[0] + n[0] * w * r, C[1] + n[1] * w * r, zj * r, 0.88];
}
function tailPt(S, t, w, zj) {   // the tail on the stern post: a curl aft and down
    const g = S.tail; if (!g) return null;
    const T = post(S, -1, 1), curve = tt => bez3(T, [T[0] - 0.05 * g, T[1] + 0.06 * g], [T[0] - 0.09 * g, T[1] + 0.0], [T[0] - 0.05 * g, T[1] - 0.03 * g], tt);
    const C = curve(t), n = alongN(curve, t), r = 0.008 * g * (1 - 0.5 * t);
    return [C[0] + n[0] * w * r, C[1] + n[1] * w * r, zj * r, 0.82];
}
function vanePt(S, a, rr, rim) { if (!S.vane) return null; const r = rim ? 0.036 : 0.036 * Math.sqrt(rr), ang = a * PI * 0.5; return [0.02 + Math.cos(ang) * r, WL + S.mast - 0.005 + Math.sin(ang) * r, 0, rim ? 1 : 0.9]; }

/* ---------------------------------------------------------------- spars and rigging */
function mastPt(S, t, jx, jz) { const r = 0.006 * (1 - 0.4 * t); return [0.02 + jx * r, WL - 0.01 + t * (S.mast + 0.01), jz * r, 0.62]; }
function yardPt(S, t, jx, jz) { const half = S.sailW * 0.55, k = (t - 0.5) * 2 * half; return [0.02 + YARD_A[0] * k + jx * 0.005, WL + 0.85 * S.mast + jz * 0.005, YARD_A[2] * k, 0.62]; }
function oarPt(S, k, sgn, t, w) {
    if (k >= S.oars) return null;
    const x = -0.3 + (k + 0.5) * (0.6 / S.oars), A = [x, railY(S, x), sgn * hbX(S, x)], B = [x - 0.06, WL - 0.025, sgn * (hbX(S, x) + 0.14)];
    const P = [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)], blade = t > 0.85 ? 0.012 * (w - 0.5) * 2 : 0.003 * (w - 0.5);
    return [P[0] + blade, P[1], P[2], 0.6];
}
function rigSeg(S, L, part, j, sgn) {   // [A, B] or null
    const M = [0.02, WL + S.mast - 0.01, 0], st = post(S, 1, 0.92), ss = post(S, -1, 0.92), half = S.sailW * 0.55;
    const rp = (x, s) => [x, railY(S, x), s * hbX(S, x) * 0.96];
    switch (part) {
        case 'forestay': return [M, [st[0], st[1], 0]];
        case 'backstay': return [M, [ss[0], ss[1], 0]];
        case 'shrouds': return j < SHROUD_PAIRS[L] ? [M, rp(SHROUD_X[j], sgn)] : null;
        case 'braces': return [[0.02 + YARD_A[0] * sgn * half, WL + 0.85 * S.mast, YARD_A[2] * sgn * half], rp(-0.4, sgn)];
        case 'sheets': { const cw = S.sailW * 1.08 * 0.5 * sgn, cy = WL + 0.85 * S.mast - S.sailH; return [[0.02 + YARD_A[0] * cw, cy, YARD_A[2] * cw], rp(-0.3, sgn)]; }
    }
    return null;
}

/* ---------------------------------------------------------------- the sail: one square sail, striped, bellying forward along SAIL_N */
function sailPt(S, s, up, edge) {
    const sw = S.sailW * (1.08 - 0.08 * up), k = (s - 0.5) * sw, cy = WL + 0.85 * S.mast - S.sailH * (1 - up);
    const belly = 0.18 * S.sailW * Math.sin(PI * s) * Math.sqrt(1 - up) * (0.35 + 0.65 * Math.sin(PI * up));
    const x = 0.02 + YARD_A[0] * k + SAIL_N[0] * belly, z = YARD_A[2] * k + SAIL_N[2] * belly;
    let sh = Math.floor(s * S.stripes) % 2 ? 0.5 : 0.95;
    if (edge) sh = 1;
    const flap = (1 - up) * (0.5 + 0.5 * (1 - up));
    return [x, cy, z, sh, flap, s, -(belly + 1e-3)];   // x y z shade, flap weight, across fraction, belly (< 0: square)
}

/* ---------------------------------------------------------------- allocation */
const ROLE_W = [[ROLE.HULL, 0.22], [ROLE.DECK, 0.13], [ROLE.SAIL, 0.24], [ROLE.SPAR, 0.10], [ROLE.RIGGING, 0.07], [ROLE.WATER, 0.11], [ROLE.WAKE, 0.09], [ROLE.REFLECTION, 0.04]];
const PARTS = {
    [ROLE.HULL]: { body: 0.86, posts: 0.14 },
    [ROLE.DECK]: { bench: 0.2, mastfish: 0.03, steer: 0.05, shields: 0.5, head: 0.14, tail: 0.05, vane: 0.03 },
    [ROLE.SPAR]: { mast: 0.3, yard: 0.28, oars: 0.42 },
    [ROLE.RIGGING]: { forestay: 0.1, backstay: 0.1, shrouds: 0.35, braces: 0.2, sheets: 0.25 },
};
function slots(count) {
    const out = []; let cum = 0, prev = 0;
    for (const [role, rf] of ROLE_W) {
        const parts = PARTS[role] ? Object.entries(PARTS[role]) : [['', 1]], tot = parts.reduce((s, [, w]) => s + w, 0);
        for (const [part, w] of parts) { cum += rf * w / tot; const end = Math.round(cum * count); out.push({ role, part, n: end - prev }); prev = end; }
    }
    out[out.length - 1].n += count - prev;
    return out;
}

export function buildBoatLevels(count, seed = 1) {
    count = Math.max(0, Math.floor(count)) || 0;
    const rand = mulberry32(seed + 7919);
    const pos = [], meta = [], role = new Uint8Array(count);
    for (let L = 0; L < NL; L++) { pos.push(new Float32Array(count * 4)); meta.push(new Float32Array(count * 4)); }
    const put = (L, i, p, r, flap, phase, aux) => {
        if (!p) return;
        const o = i * 4; pos[L][o] = p[0]; pos[L][o + 1] = p[1]; pos[L][o + 2] = p[2]; pos[L][o + 3] = Math.max(0.02, Math.min(1, p[3]));
        meta[L][o] = r; meta[L][o + 1] = flap; meta[L][o + 2] = phase; meta[L][o + 3] = aux;
    };
    const setMeta0 = (i, r) => { for (let L = 0; L < NL; L++) meta[L][i * 4] = r; };
    const j = () => rand() - 0.5;

    const genHull = part => {
        if (part === 'posts') { const e = rand() < 0.5 ? 1 : -1, t = rand(), w = j() * 2, zj = j() * 2; return L => postPt(SHIP[L], e, t, w, zj); }
        const q = rand(), u = rand(), sgn = rand() < 0.5 ? -1 : 1, v = rand(), plank = rand() < 0.6, rail = rand() < 0.08;
        return L => q >= HULL_PRES[L] ? null : hullPt(SHIP[L], u, sgn, v, plank, rail);
    };
    const genDeck = part => {
        const a = rand(), b = rand(), c = rand(), d = rand(), sgn = rand() < 0.5 ? -1 : 1;
        switch (part) {
            case 'bench': return L => benchPt(SHIP[L], a, (b - 0.5) * 2, (c - 0.5) * 0.008);
            case 'mastfish': return L => mastFishPt(SHIP[L], a, b, c);
            case 'steer': return L => steerPt(SHIP[L], a, b, (c - 0.5) * 2);
            case 'shields': { const i = Math.floor(a * SH_N), ang = b * 2 * PI; return L => shieldPt(SHIP[L], L, i, sgn, c, ang, d); }
            case 'head': { const kind = a < 0.12 ? 1 : a < 0.22 ? 2 : 0; return L => headPt(SHIP[L], L, b, (c - 0.5) * 2, (d - 0.5) * 2, kind); }
            case 'tail': return L => tailPt(SHIP[L], a, (b - 0.5) * 2, (c - 0.5) * 2);
            case 'vane': return L => vanePt(SHIP[L], a, b, c < 0.35);
        }
        return () => null;
    };
    const genSpar = part => {
        const t = rand(), a = j() * 2, b = j() * 2, k = Math.floor(rand() * 8), sgn = rand() < 0.5 ? -1 : 1, w = rand();
        switch (part) {
            case 'mast': return L => mastPt(SHIP[L], t, a, b);
            case 'yard': return L => yardPt(SHIP[L], t, a, b);
            case 'oars': return L => oarPt(SHIP[L], k, sgn, t, w);
        }
        return () => null;
    };
    const genRig = part => {
        const t = rand(), jj = [j() * 0.004, j() * 0.004, j() * 0.004], jIdx = Math.floor(rand() * 3), sgn = rand() < 0.5 ? -1 : 1;
        return L => { const seg = rigSeg(SHIP[L], L, part, jIdx, sgn); if (!seg) return null; const [A, B] = seg; return [lerp(A[0], B[0], t) + jj[0], lerp(A[1], B[1], t) + jj[1], lerp(A[2], B[2], t) + jj[2], 0.55]; };
    };
    const genSail = () => { const s = rand(), r = rand(), up = 1 - Math.pow(r, 0.85), edge = rand() < 0.06 && (s < 0.03 || s > 0.97 || up < 0.03 || up > 0.97); return L => sailPt(SHIP[L], s, up, edge); };
    const genRefl = () => {
        const src = rand() < 0.6 ? genSail() : genHull('body');
        return L => { const p = src(L); return p && [p[0] + 0.02 * Math.sin(p[1] * 32), 2 * WL - p[1], p[2], Math.max(0.05, p[3] * 0.3)]; };
    };

    let i = 0;
    for (const { role: r, part, n } of slots(count)) {
        for (let k = 0; k < n; k++, i++) {
            role[i] = r; setMeta0(i, r);
            if (r === ROLE.WATER || r === ROLE.WAKE) { const w = r === ROLE.WATER ? waterPt(rand) : wakePt(rand); for (let L = 0; L < NL; L++) put(L, i, w.p, r, w.flap, w.phase, w.aux); continue; }
            const g = r === ROLE.HULL ? genHull(part) : r === ROLE.DECK ? genDeck(part) : r === ROLE.SAIL ? genSail() : r === ROLE.SPAR ? genSpar(part) : r === ROLE.RIGGING ? genRig(part) : genRefl();
            for (let L = 0; L < NL; L++) { const p = g(L); if (p) put(L, i, p, r, r === ROLE.SAIL ? p[4] : 0, r === ROLE.SAIL ? p[6] : 0, r === ROLE.SAIL ? p[5] : 0); }
        }
    }
    const rk = rocketLevel(count, role, rand, pos[NL - 1], meta[NL - 1]); pos.push(rk.pos); meta.push(rk.meta);
    return { count, pos, meta, role };
}
