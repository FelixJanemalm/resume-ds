/* voyage-boat.js: the particle targets of a sailing ship at four evolution levels (dinghy, sloop, schooner,
   tall ship), sampled as point clouds on 3D surfaces so a GPU particle system can morph the SAME particles
   from one level to the next. Plain ES module: no imports, no DOM; runs in node and in the browser.

   Boat space: hull length 1 (bow at x = +0.5, stern at -0.5), y up, z toward the viewer, waterline at
   y = WATERLINE. Every part is parameterised by surface coordinates and the same particle maps to the
   corresponding place at every level where its part exists (a hull point keeps its fraction along the
   length and its angle around the section, a sail point its across/up fractions, a mast point its height
   fraction); water and wake points are shared by all levels unchanged. A particle that is not part of a
   level has shade 0 there. Particle indices are allocated per role once, from the tall ship's needs.

   pos[L]:  x, y, z, shade   (shade: baked Lambert in (0.02, 1], light from upper-left-front; 0 = absent)
   meta[L]: role, flap, phase, aux   (flap: sail flutter weight; phase: ring / wake position 0..1 for
            sin(phase*2pi - time); aux: sail chord fraction | wake distance fraction | water radius)
   role[i]: the particle's role at every level where it exists (a particle never changes role). */

export const WATERLINE = -0.37;
export const LEVELS = ['dinghy', 'sloop', 'schooner', 'tallship'];
export const LEVEL_SCALE = [0.8, 1.0, 1.25, 1.5];
export const ROLE = { HULL: 1, DECK: 2, SAIL: 3, SPAR: 4, RIGGING: 5, WATER: 6, WAKE: 7, REFLECTION: 8 };

const NL = 4, WL = WATERLINE, PI = Math.PI;
const LIGHT = [-0.45, 0.72, 0.53];
const shadeN = n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; const d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l; return Math.min(1, 0.3 + 0.7 * Math.max(0, d)); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
const lerp3 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const frac = v => v - Math.floor(v);

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------------------------------------------------------------- hulls
   B: max half-beam, c/p: plan form (max beam at length fraction c, bow fullness p), D: depth below the deck,
   tumble: tumblehome (topsides leaning in), rake: stem rake, overhang: stern leaning out, deck(x): sheer line
   (a parabola rising toward the ends: rockered on the dinghy, a bow-heavy sheer on the schooner, stepped aft on the tall ship). */
const HULL = [
    { B: 0.170, c: 0.44, p: 0.50, D: 0.100, tumble: 0.00, rake: 0.00, overhang: 0.00, deck: x => -0.305 + 0.045 * 4 * x * x },
    { B: 0.140, c: 0.47, p: 0.50, D: 0.110, tumble: 0.00, rake: 0.02, overhang: 0.00, deck: x => -0.300 + 0.035 * 4 * x * x },
    { B: 0.115, c: 0.48, p: 0.45, D: 0.120, tumble: 0.00, rake: 0.03, overhang: 0.01, deck: x => -0.300 + 0.030 * 4 * x * x + 0.025 * Math.max(0, 2 * x) ** 2 },
    { B: 0.150, c: 0.44, p: 0.38, D: 0.150, tumble: 0.22, rake: 0.05, overhang: 0.04, deck: x => -0.250 + 0.025 * 4 * x * x + (x < -0.12 ? 0.035 : 0) + (x < -0.38 ? 0.035 : 0) },
];
const plan = (H, u) => Math.pow(Math.max(0, 1 - Math.pow((u - H.c) / (1 - H.c), 2)), H.p);   // u: 0 stern .. 1 bow
const halfBeam = (H, u) => H.B * plan(H, u);
const tumble = (H, v) => 1 - H.tumble * Math.pow(Math.max(0, v - 0.35), 2) / 0.4225;             // v: 0 waterline .. 1 gunwale
const bowness = u => Math.pow(Math.max(0, (u - 0.7) / 0.3), 2), sternness = u => Math.pow(Math.max(0, (0.3 - u) / 0.3), 2);
const deckAt = (H, u) => H.deck(-0.5 + u);
const hullX = (H, u, v) => -0.5 + u + H.rake * v * bowness(u) - H.overhang * v * sternness(u);

// a hull point: u along the length, s = +-1 side, v = 0 at the waterline .. 1 at the gunwale, gun: on the sheer line
function hullPt(H, u, s, v, gun) {
    const f = plan(H, u), b = H.B * f, dy = deckAt(H, u), vis = dy - WL, d = Math.max(H.D * f + 0.02, vis * 1.02);   // the section reaches the waterline even at the ends (stem, stern post)
    if (gun) { const x = hullX(H, u, 1); return [x, dy, s * b * tumble(H, 1), shadeN([0, 1, 0])]; }
    const thw = Math.acos(vis / d);   // the section below the waterline is not drawn
    const th = thw + (PI / 2 - thw) * v;
    const x = hullX(H, u, v), y = dy - d * Math.cos(th), z = s * b * Math.sin(th) * tumble(H, v);
    const bow = x > 0.25 ? -(x - 0.25) * 1.5 : 0;
    return [x, y, z, shadeN([bow, -Math.cos(th) * 0.6, s * Math.sin(th)])];
}

/* ---------------------------------------------------------------- sails
   Fore-and-aft sails are quads tack/clew/throat/peak (a triangle when throat = peak): a = 0 at the luff .. 1 at
   the leech, up = 0 at the foot .. 1 at the head, belly toward +z. Square sails hang from a yard braced BETA
   about the mast: a = 0 port .. 1 starboard, belly toward +x (the wind from astern). Edge samples walk the
   perimeter by a fraction p so they stay on the outline at every level. */
const FA = {
    main: [
        { tack: [0.12, -0.250], clew: [-0.32, -0.240], throat: [0.12, 0.30], peak: [0.12, 0.30] },
        { tack: [0.05, -0.230], clew: [-0.47, -0.230], throat: [0.05, 0.64], peak: [0.05, 0.64] },
        { tack: [-0.12, -0.220], clew: [-0.54, -0.210], throat: [-0.12, 0.42], peak: [-0.34, 0.58] },
        { tack: [-0.28, -0.130], clew: [-0.62, -0.110], throat: [-0.28, 0.12], peak: [-0.50, 0.22] },
    ],
    jib: [null,
        { tack: [0.50, -0.270], clew: [0.10, -0.240], throat: [0.08, 0.40], peak: [0.08, 0.40] },
        { tack: [0.72, -0.200], clew: [0.42, -0.180], throat: [0.21, 0.53], peak: [0.21, 0.53] },
        { tack: [0.80, -0.160], clew: [0.50, -0.120], throat: [0.27, 0.56], peak: [0.27, 0.56] },
    ],
    stay: [null, null,
        { tack: [0.50, -0.245], clew: [0.28, -0.210], throat: [0.21, 0.42], peak: [0.21, 0.42] },
        { tack: [0.64, -0.187], clew: [0.42, -0.140], throat: [0.27, 0.44], peak: [0.27, 0.44] },
    ],
    fore: [null, null,
        { tack: [0.22, -0.220], clew: [-0.08, -0.220], throat: [0.22, 0.36], peak: [0.04, 0.50] },
        null,   // becomes the fore course (square) on the tall ship
    ],
};
const BETA = -28 * PI / 180, SB = Math.sin(BETA), CB = Math.cos(BETA);   // yards braced so their faces show from the front-starboard 3/4 view
const SQ = {   // tall ship square sails: mast x, foot y, head (yard) y, half-widths at foot and head
    foreC: { mx: 0.27, yf: -0.17, yh: 0.06, hwF: 0.19, hwH: 0.22 },
    foreT: { mx: 0.27, yf: 0.09, yh: 0.34, hwF: 0.15, hwH: 0.18 },
    foreG: { mx: 0.27, yf: 0.37, yh: 0.58, hwF: 0.11, hwH: 0.13 },
    mainC: { mx: 0.00, yf: -0.17, yh: 0.08, hwF: 0.21, hwH: 0.24 },
    mainT: { mx: 0.00, yf: 0.11, yh: 0.40, hwF: 0.17, hwH: 0.20 },
    mainG: { mx: 0.00, yf: 0.43, yh: 0.66, hwF: 0.12, hwH: 0.14 },
    mizT: { mx: -0.28, yf: 0.12, yh: 0.34, hwF: 0.13, hwH: 0.16 },
    mizG: { mx: -0.28, yf: 0.37, yh: 0.52, hwF: 0.09, hwH: 0.11 },
};
const walk = (len, p) => { const tot = len.reduce((s, l) => s + l, 0); let d = p * tot, k = 0; while (k < len.length - 1 && d > len[k]) { d -= len[k]; k++; } return [k, len[k] > 0 ? d / len[k] : 0]; };

function faSail(Q, a, up, edgeP) {
    if (edgeP != null) {   // luff, head, leech, foot
        const E = [[Q.tack, Q.throat], [Q.throat, Q.peak], [Q.peak, Q.clew], [Q.clew, Q.tack]];
        const [k, t] = walk(E.map(([A, B]) => Math.hypot(B[0] - A[0], B[1] - A[1])), edgeP);
        [a, up] = k === 0 ? [0, t] : k === 1 ? [t, 1] : k === 2 ? [1, 1 - t] : [1 - t, 0];
    }
    const P = lerp2(lerp2(Q.tack, Q.clew, a), lerp2(Q.throat, Q.peak, a), up);
    const chord = Math.hypot(Q.clew[0] - Q.tack[0], Q.clew[1] - Q.tack[1]);
    const belly = 0.11 * (chord / 0.52) * (0.35 + 0.65 * (1 - up));
    const z = belly * Math.sin(PI * a);
    const sgn = Q.clew[0] > Q.tack[0] ? -1 : 1;
    const shade = shadeN([sgn * Math.cos(PI * a) * belly * 4, 0.15, 1]);
    const flap = (0.5 * Math.sin(PI * a) + 0.5 * a) * (0.4 + 0.6 * (1 - up));
    return [P[0], P[1], z, shade, flap, a];
}
function sqSail(S, a, up, edgeP) {
    if (edgeP != null) {   // foot, starboard leech, head, port leech
        const h = S.yh - S.yf;
        const [k, t] = walk([2 * S.hwF, h, 2 * S.hwH, h], edgeP);
        [a, up] = k === 0 ? [t, 0] : k === 1 ? [1, t] : k === 2 ? [1 - t, 1] : [0, 1 - t];
    }
    const y = lerp(S.yf, S.yh, up), hw = lerp(S.hwF, S.hwH, up), l = (a - 0.5) * 2 * hw;
    const soft = Math.sqrt(1 - up), bul = 0.28 * hw * Math.sin(PI * a) * soft;
    const x = S.mx + l * SB + bul * CB, z = l * CB - bul * SB;              // yard axis (SB,0,CB), belly normal (CB,0,-SB): +x, the wind from astern
    const tilt = Math.cos(PI * a) * soft;                                    // the viewer-facing normal (CB,0,-SB) tilts along the yard with the belly
    const shade = shadeN([0.5 * CB + SB * tilt, 0.25, -SB + CB * tilt]);
    const flap = 0.8 * Math.pow(Math.sin(PI * a), 0.8) * Math.pow(1 - up, 0.7);
    return [x, y, z, shade, flap, a];
}
function sailAt(L, part, a, up, edgeP) {
    if (SQ[part]) return L === 3 ? sqSail(SQ[part], a, up, edgeP) : null;
    if (part === 'fore' && L === 3) return sqSail(SQ.foreC, a, up, edgeP);
    const Q = FA[part][L];
    return Q ? faSail(Q, a, up, edgeP) : null;
}

/* ---------------------------------------------------------------- spars and rigging: line segments per level */
const yardOf = S => { const hw = S.hwH * 1.08; return [[S.mx - hw * SB, S.yh, -hw * CB], [S.mx + hw * SB, S.yh, hw * CB]]; };
const MAST = {   // [x, foot y, top y] per level (null = absent). mast1 is the aft mast at every level
    mast1: [[0.12, -0.31, 0.32], [0.06, -0.30, 0.66], [-0.12, -0.30, 0.62], [-0.28, -0.21, 0.60]],
    mast2: [null, null, [0.22, -0.29, 0.55], [0.27, -0.25, 0.72]],
    mast3: [null, null, null, [0.00, -0.25, 0.82]],
};
const SPAR = {
    mast1: MAST.mast1.map(m => m && [[m[0], m[1], 0], [m[0], m[2], 0]]),
    mast2: MAST.mast2.map(m => m && [[m[0], m[1], 0], [m[0], m[2], 0]]),
    mast3: MAST.mast3.map(m => m && [[m[0], m[1], 0], [m[0], m[2], 0]]),
    boom1: FA.main.map(Q => [[Q.tack[0], Q.tack[1] - 0.005, 0.01], [Q.clew[0] - 0.02, Q.clew[1] - 0.005, 0.01]]),
    gaff1: FA.main.map(Q => Q.peak[0] === Q.throat[0] ? null : [[Q.throat[0], Q.throat[1] + 0.005, 0], [Q.peak[0] - 0.02, Q.peak[1] + 0.008, 0]]),
    bowsprit: [null, null, [[0.47, -0.250, 0], [0.73, -0.200, 0]], [[0.46, -0.222, 0], [0.81, -0.155, 0]]],
};
for (const k of Object.keys(SQ)) SPAR['yard_' + k] = [null, null, null, yardOf(SQ[k])];
const SPAR_SHADE = k => k.startsWith('mast') ? 0.75 : 0.7;

const shroudSegs = (L, mastKey, hounds) => {   // 3 shrouds per side from the rail to the hounds
    const m = MAST[mastKey][L]; if (!m) return null;
    const H = HULL[L], segs = [];
    for (const s of [-1, 1]) for (const j of [-1, 0, 1]) {
        const x = m[0] + j * 0.05, u = clamp01(x + 0.5);
        segs.push([[x, deckAt(H, u), s * halfBeam(H, u) * tumble(H, 1) * 0.98], [m[0], m[1] + (m[2] - m[1]) * hounds, 0]]);
    }
    return segs;
};
const RIG = {   // per level: an array of segments (fixed count where present) or null
    shroudsM: [null, shroudSegs(1, 'mast1', 0.84), shroudSegs(2, 'mast1', 0.82), shroudSegs(3, 'mast1', 0.84)],
    shroudsF: [null, null, shroudSegs(2, 'mast2', 0.82), shroudSegs(3, 'mast2', 0.86)],
    shroudsA: [null, null, null, shroudSegs(3, 'mast3', 0.86)],
    foreStay: [null, [[[0.06, 0.66, 0], [0.50, -0.270, 0]]], [[[0.22, 0.55, 0], [0.73, -0.200, 0]]], [[[0.27, 0.72, 0], [0.81, -0.155, 0]]]],
    jibStay: [null, null, [[[0.22, 0.45, 0], [0.50, -0.245, 0]]], [[[0.27, 0.48, 0], [0.64, -0.187, 0]]]],
    mainStay: [null, null, [[[-0.12, 0.62, 0], [0.22, -0.12, 0]]], [[[0.00, 0.82, 0], [0.27, -0.05, 0]]]],
    mizzenStay: [null, null, null, [[[-0.28, 0.60, 0], [0.00, 0.02, 0]]]],
    backstay: [null, [[[0.06, 0.66, 0], [-0.50, -0.268, 0]]], [[[-0.12, 0.62, 0], [-0.51, -0.272, 0]]], [[[-0.28, 0.60, 0], [-0.54, -0.160, 0]]]],
};
const RIG_DENSITY = { foreStay: [0, 0.45, 0.8, 1] };   // fraction of a line's particles present per level (sparser forestay on the sloop so the jib reads apart from the main)

/* ---------------------------------------------------------------- deck */
function deckPt(L, u, w, q) {
    const H = HULL[L], x = -0.5 + u, hb = halfBeam(H, u) * tumble(H, 1);
    const flat = () => [x, deckAt(H, u), w * hb * 0.92, shadeN([0, 1, 0]) * 0.9];
    if (L === 0) {   // an open boat: three thwarts instead of a deck
        if (q >= 0.35) return null;
        const k = Math.floor(u * 3), tx = [0.28, 0.02, -0.28][k] + (frac(u * 3) - 0.5) * 0.05, tu = tx + 0.5;
        return [tx, deckAt(H, tu) - 0.015, w * halfBeam(H, tu) * 0.9, shadeN([0, 1, 0]) * 0.85];
    }
    if (q < 0.8) return flat();
    if (L === 1) return null;
    if (L === 2) {   // a deckhouse abaft the foremast: roof, then side and end walls
        const x0 = -0.32, x1 = -0.02, hx = lerp(x0, x1, u), hw = halfBeam(H, hx + 0.5) * 0.6, h = 0.05, dy = H.deck(hx);
        if (q < 0.9) return [hx, dy + h, w * hw, shadeN([0, 1, 0]) * 0.9];
        if (q < 0.95) { const s = Math.sign(w) || 1; return [hx, dy + h * Math.abs(w), s * hw, shadeN([0, 0.1, s])]; }
        const ex = u < 0.5 ? x1 : x0; return [ex, dy + h * frac(u * 2), w * hw, shadeN([u < 0.5 ? 1 : -1, 0.1, 0])];
    }
    // tall ship: the breaks of the quarterdeck and the poop are vertical faces across the deck
    const fx = q < 0.9 ? -0.12 : -0.38, yb = H.deck(fx + 0.001), hw = halfBeam(H, fx + 0.5) * tumble(H, 1) * 0.95;
    return [fx + 0.002, yb + 0.04 * frac(u * 5), w * hw, shadeN([1, 0.2, 0.3])];
}

/* ---------------------------------------------------------------- water and wake (shared by all levels) */
function waterPt(rand) {   // a disc of ripples around the hull: concentric rings (phase = ring position), denser, brighter and a little higher on the crests
    let x = 0, z = 0, rr = 0, ph = 0, rip = 0;
    for (let k = 0; k < 12; k++) {
        const a = rand() * PI * 2; rr = Math.pow(rand(), 0.6); x = Math.cos(a) * rr * 1.25; z = Math.sin(a) * rr * 0.75;
        ph = rr * 26; rip = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.6);
        if ((x / 0.5) ** 2 + (z / 0.17) ** 2 > 1 && rand() < 0.3 + 0.7 * rip) break;   // outside the hull footprint, favouring the crests
    }
    return { p: [x, WL - 0.008 + 0.016 * rip, z, 0.22 + 0.55 * rip], flap: 0, phase: frac(ph / (2 * PI)), aux: rr };
}
const KELVIN = Math.tan(19.5 * PI / 180);
function wakePt(rand) {
    const d = Math.pow(rand(), 2.2) * 1.6, f = d / 1.6, half = KELVIN * d, arm = rand() < 0.55;   // density and shade fall off with distance so the V dissolves
    let z, shade;
    if (arm) { z = (rand() < 0.5 ? -1 : 1) * half + (rand() - 0.5) * 0.012 * (1 + d); shade = 0.65 * (1 - 0.85 * f); }
    else { z = (rand() * 2 - 1) * half * 0.85; shade = 0.34 * (1 - 0.8 * f); }
    return { p: [-0.5 - d, WL - 0.002 + 0.004 * Math.sin(d * 25), z, Math.max(0.05, shade)], flap: 0, phase: frac(d * 3), aux: f };
}

/* ---------------------------------------------------------------- allocation */
const SAIL_W = { main: 550, jib: 350, stay: 250, fore: 600, mainC: 600, foreT: 400, mainT: 400, mizT: 350, foreG: 250, mainG: 250, mizG: 200 };
const SPAR_W = { mast1: 110, boom1: 40, gaff1: 30, mast2: 100, bowsprit: 50, mast3: 110 };
for (const k of Object.keys(SQ)) SPAR_W['yard_' + k] = 20;
const RIG_W = { shroudsM: 120, shroudsA: 130, shroudsF: 120, foreStay: 90, jibStay: 70, mainStay: 70, mizzenStay: 60, backstay: 60 };
const ROLE_W = [[ROLE.HULL, 0.20], [ROLE.DECK, 0.05], [ROLE.SAIL, 0.35], [ROLE.SPAR, 0.05], [ROLE.RIGGING, 0.06], [ROLE.WATER, 0.14], [ROLE.WAKE, 0.10], [ROLE.REFLECTION, 0.05]];
const PARTS = { [ROLE.SAIL]: SAIL_W, [ROLE.SPAR]: SPAR_W, [ROLE.RIGGING]: RIG_W };

function slots(count) {   // [{role, part, n}] whose n sum to count exactly
    const out = []; let cum = 0, prev = 0;
    for (const [role, rf] of ROLE_W) {
        const parts = PARTS[role] ? Object.entries(PARTS[role]) : [['', 1]], tot = parts.reduce((s, [, w]) => s + w, 0);
        for (const [part, w] of parts) { cum += rf * w / tot; const end = Math.round(cum * count); out.push({ role, part, n: end - prev }); prev = end; }
    }
    out[out.length - 1].n += count - prev;
    return out;
}
const pickWeighted = (W, r) => { const ks = Object.keys(W), tot = ks.reduce((s, k) => s + W[k], 0); let d = r * tot; for (const k of ks) { d -= W[k]; if (d <= 0) return k; } return ks[ks.length - 1]; };

export function buildBoatLevels(count, seed = 1) {
    count = Math.max(0, Math.floor(count)) || 0;
    const rand = mulberry32(seed);
    const pos = [], meta = [], role = new Uint8Array(count);
    for (let L = 0; L < NL; L++) { pos.push(new Float32Array(count * 4)); meta.push(new Float32Array(count * 4)); }
    const put = (L, i, p, r, flap, phase, aux) => {
        if (!p) return;
        const o = i * 4; pos[L][o] = p[0]; pos[L][o + 1] = p[1]; pos[L][o + 2] = p[2]; pos[L][o + 3] = Math.max(0.02, Math.min(1, p[3]));
        meta[L][o] = r; meta[L][o + 1] = flap; meta[L][o + 2] = phase; meta[L][o + 3] = aux;
    };
    const setMeta0 = (i, r) => { for (let L = 0; L < NL; L++) meta[L][i * 4] = r; };   // role readable even where absent

    // generators: sample a particle's surface coordinates once, then place it at every level
    const genHull = () => {
        const u = rand(), s = rand() < 0.5 ? -1 : 1, v = rand(), gun = rand() < 0.25, q = rand();
        return L => (L === 0 && q > 0.8) || (L === 1 && q > 0.9) ? null : hullPt(HULL[L], u, s, v, gun);
    };
    const genSail = part => {
        const edgeP = rand() < 0.22 ? rand() : null, a = rand(), r = rand();
        const up = SQ[part] ? r : part === 'fore' ? 1 - Math.pow(r, 0.8) : 1 - Math.pow(r, 0.65);   // triangles are fuller at the foot
        return L => sailAt(L, part, a, up, edgeP);
    };
    const genDeck = () => { const u = rand(), w = rand() * 2 - 1, q = rand(); return L => deckPt(L, u, w, q); };
    const genSpar = part => {
        const t = rand(), jx = (rand() - 0.5) * 0.01, jz = (rand() - 0.5) * 0.006, sh = SPAR_SHADE(part);
        return L => { const S = SPAR[part][L]; if (!S) return null; const P = lerp3(S[0], S[1], t); return [P[0] + jx, P[1], P[2] + jz, sh]; };
    };
    const genRig = part => {
        const q = rand(), t = rand(), jx = (rand() - 0.5) * 0.005, jy = (rand() - 0.5) * 0.005, dq = rand(), dens = RIG_DENSITY[part];
        return L => { const segs = RIG[part][L]; if (!segs || (dens && dq >= dens[L])) return null; const S = segs[Math.min(segs.length - 1, Math.floor(q * segs.length))]; const P = lerp3(S[0], S[1], t); return [P[0] + jx, P[1] + jy, P[2], 0.6]; };
    };
    const genRefl = () => {
        const src = rand() < 0.65 ? genSail(pickWeighted(SAIL_W, rand())) : genHull();
        return L => { const p = src(L); return p && [p[0] + 0.02 * Math.sin(p[1] * 32), 2 * WL - p[1], p[2], Math.max(0.05, p[3] * 0.3)]; };
    };

    let i = 0;
    for (const { role: r, part, n } of slots(count)) {
        for (let k = 0; k < n; k++, i++) {
            role[i] = r; setMeta0(i, r);
            if (r === ROLE.WATER || r === ROLE.WAKE) { const w = r === ROLE.WATER ? waterPt(rand) : wakePt(rand); for (let L = 0; L < NL; L++) put(L, i, w.p, r, w.flap, w.phase, w.aux); continue; }
            const g = r === ROLE.HULL ? genHull() : r === ROLE.DECK ? genDeck() : r === ROLE.SAIL ? genSail(part) : r === ROLE.SPAR ? genSpar(part) : r === ROLE.RIGGING ? genRig(part) : genRefl();
            for (let L = 0; L < NL; L++) { const p = g(L); if (p) put(L, i, p, r, r === ROLE.SAIL ? p[4] : 0, 0, r === ROLE.SAIL ? p[5] : 0); }
        }
    }
    return { count, pos, meta, role };
}
