/* voyage-boat.js: the particle targets of a sailing ship at six evolution levels (skiff, sloop, ketch, schooner,
   barque, clipper), sampled as point clouds on 3D surfaces so a GPU particle system can morph the SAME particles
   from one level to the next. Plain ES module: no imports, no DOM; runs in node and in the browser.

   Boat space: hull length 1 (bow at x = +0.5 on the waterline, stern at -0.5), y up, z toward the viewer, waterline
   at y = WATERLINE. Every part is parameterised by surface coordinates and the same particle maps to the
   corresponding place at every level where its part exists (a hull point keeps its fraction along the length and
   its angle around the section, a sail point its across/up fractions, a mast point its height fraction); water and
   wake points are shared by all levels unchanged. A particle that is not part of a level has shade 0 there, and
   once present it stays present at every higher level. Particle indices are allocated per role and part once,
   from the clipper's needs; lower levels use a subset (hull and deck first, then spars, sails, rigging, fittings).

   The lineage. mast A is the fore (or only) mast at every level, mast B the aft mast (the ketch's mizzen, the
   schooner's main, the square riggers' mizzen), mast C the main mast that arrives with the barque. The skiff's lug
   sail becomes the sloop's Bermuda main, the ketch's gaff main, the schooner's gaff foresail and then the fore
   COURSE of the barque and clipper; its boom and yard rise to become the fore course and fore topsail yards.
   The ketch's mizzen becomes the schooner's main and the spanker. The schooner's gaff topsails become the fore
   topsail and (on the clipper) the mizzen topsail. Everything else is recruited at its first level.

   pos[L]:  x, y, z, shade   (shade: baked Lambert in (0.02, 1], light from upper-left-front; 0 = absent)
   meta[L]: role, flap, belly | phase, aux
            SAIL: flap = flutter weight (0 along the luff / yard, strongest at the leech and foot), belly = the baked
            belly along the sail's normal (> 0 fore-and-aft: the baked z itself, normal +z; < 0 square: -(belly along
            (cos b, 0, -sin b) + 1e-3), b the yard's brace angle), aux = across-chord fraction (0 luff .. 1 leech,
            or 0 port .. 1 starboard). WATER: phase = ring position, aux = radius fraction. WAKE: phase, aux =
            distance fraction astern. Others 0.
   role[i]: the particle's role at every level where it exists (a particle never changes role). */

export const WATERLINE = -0.37;
export const LEVELS = ['skiff', 'sloop', 'ketch', 'schooner', 'barque', 'clipper'];
export const LEVEL_SCALE = [0.7, 0.85, 1.0, 1.15, 1.32, 1.5];              // on-screen size multiplier per level
export const LEVEL_HEEL = [0.62, 1.0, 1.12, 1.3, 1.05, 0.95];               // wind-heel gain: sail area x CE height / (beam^2 x depth), the sloop = 1
export const LEVEL_PIVOT = [0.0, -0.02, -0.03, -0.04, -0.05, -0.06];         // pitch pivot x (the centre of flotation drifts aft with the finer, longer hulls)
export const ROLE = { HULL: 1, DECK: 2, SAIL: 3, SPAR: 4, RIGGING: 5, WATER: 6, WAKE: 7, REFLECTION: 8 };

const NL = 6, WL = WATERLINE, PI = Math.PI;
const LIGHT = [-0.45, 0.72, 0.53];
const shadeN = n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; const d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l; return Math.min(1, 0.3 + 0.7 * Math.max(0, d)); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
const lerp3 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const frac = v => v - Math.floor(v);
const TOP = shadeN([0, 1, 0]);
const nulls = n => new Array(n).fill(null);
const from = (L0, ...vals) => nulls(L0).concat(vals);   // a per-level table for a part that appears at level L0

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------------------------------------------------------------- hulls
   B: max half-beam, c/p: plan form (max beam at length fraction c, bow fullness p), D: depth below the sheer line,
   tumble: tumblehome (topsides leaning in), rake / rakeP: stem rake and its profile (> 1: the concave clipper stem),
   overhang: the counter leaning out astern, sheer(x): the base sheer line (rockered on the skiff, bow-heavy on the
   yachts, flat on the square riggers), steps(x): raised decks above the sheer (quarterdeck, forecastle, poop),
   bulwark: a solid bulwark above the deck line. The section is measured from the sheer so the hull bottom sits on
   the waterline along the whole length; the raised decks and the bulwark are drawn as a vertical topside above the sheer. */
const HULL = [
    { B: 0.175, c: 0.48, p: 0.55, D: 0.100, tumble: 0.00, rake: 0.02, rakeP: 1, overhang: 0.00, bulwark: 0, sheer: x => -0.300 + 0.055 * 4 * x * x },
    { B: 0.145, c: 0.47, p: 0.50, D: 0.110, tumble: 0.00, rake: 0.03, rakeP: 1, overhang: 0.02, bulwark: 0, sheer: x => -0.302 + 0.028 * 4 * x * x + 0.022 * Math.max(0, 2 * x) ** 2 },
    { B: 0.135, c: 0.46, p: 0.50, D: 0.120, tumble: 0.00, rake: 0.03, rakeP: 1, overhang: 0.02, bulwark: 0.012, sheer: x => -0.295 + 0.026 * 4 * x * x + 0.020 * Math.max(0, 2 * x) ** 2 },
    { B: 0.115, c: 0.48, p: 0.45, D: 0.120, tumble: 0.00, rake: 0.04, rakeP: 1, overhang: 0.03, bulwark: 0.012, sheer: x => -0.298 + 0.030 * 4 * x * x + 0.030 * Math.max(0, 2 * x) ** 2 },
    { B: 0.135, c: 0.45, p: 0.40, D: 0.170, tumble: 0.15, rake: 0.04, rakeP: 1, overhang: 0.03, bulwark: 0.028, sheer: x => -0.268 + 0.026 * 4 * x * x, steps: x => (x < -0.15 ? 0.030 : 0) + (x > 0.33 ? 0.025 : 0) },
    { B: 0.125, c: 0.46, p: 0.42, D: 0.180, tumble: 0.25, rake: 0.09, rakeP: 1.7, overhang: 0.05, bulwark: 0.028, sheer: x => -0.262 + 0.022 * 4 * x * x, steps: x => (x < -0.30 ? 0.025 : 0) + (x > 0.36 ? 0.020 : 0) },
];
const deckX = (H, x) => H.sheer(x) + (H.steps ? H.steps(x) : 0);   // the deck line: the sheer plus any raised deck
const topX = (H, x) => deckX(H, x) + H.bulwark;                      // the hull's top edge: the deck line plus the bulwark
const plan = (H, u) => Math.pow(Math.max(0, 1 - Math.pow((u - H.c) / (1 - H.c), 2)), H.p);   // u: 0 stern .. 1 bow
const halfBeam = (H, u) => H.B * plan(H, u);
const tumble = (H, v) => 1 - H.tumble * Math.pow(Math.max(0, v - 0.35), 2) / 0.4225;             // v: 0 waterline .. 1 top edge
const bowness = u => Math.pow(Math.max(0, (u - 0.7) / 0.3), 2), sternness = u => Math.pow(Math.max(0, (0.3 - u) / 0.3), 2);
const deckAt = (H, u) => deckX(H, -0.5 + u);
const hullX = (H, u, v) => -0.5 + u + H.rake * Math.pow(v, H.rakeP) * bowness(u) - H.overhang * v * sternness(u);
const railHB = (H, x) => halfBeam(H, clamp01(x + 0.5)) * tumble(H, 1) * 0.98;   // the half-beam at the rail

/* the section at u, height fraction v: y, the half-width factor (times the plan half-beam) and the outward normal's y and z */
function section(H, u, v) {
    const f = plan(H, u), x0 = -0.5 + u, dy0 = H.sheer(x0), top = topX(H, x0);
    const vis = dy0 - WL, d = Math.max(H.D * f + 0.02, vis * 1.02), va = vis / (top - WL);   // depth below the sheer; the section reaches the waterline even at the ends (stem, stern post)
    if (v > va) return { y: dy0 + (top - dy0) * (v - va) / (1 - va), hw: tumble(H, v), ny: 0, nz: 1 };   // the vertical topside above the sheer: bulwark, raised deck
    const thw = Math.acos(Math.min(1, vis / d)), th = thw + (PI / 2 - thw) * v / va;   // the section below the waterline is not drawn
    return { y: dy0 - d * Math.cos(th), hw: Math.sin(th) * tumble(H, v), ny: -Math.cos(th) * 0.6, nz: Math.sin(th) };
}
// a hull point: u along the length, s = +-1 side, v = 0 at the waterline .. 1 at the top edge, gun: on the top edge (sheer / rail)
function hullPt(H, u, s, v, gun) {
    const b = H.B * plan(H, u);
    if (gun) return [hullX(H, u, 1), topX(H, -0.5 + u), s * b * tumble(H, 1), TOP];
    const x = hullX(H, u, v), S = section(H, u, v), bow = x > 0.25 ? -(x - 0.25) * 1.5 : 0;
    return [x, S.y, s * b * S.hw, shadeN([bow, S.ny, s * S.nz])];
}
function transomPt(H, v, w) {   // the flat stern face: w across (-1..1)
    const b = H.B * plan(H, 0), S = section(H, 0, v);
    return [hullX(H, 0, v) - 0.004, S.y, w * b * S.hw, shadeN([-1, 0.25, 0.2 * w])];
}

/* ---------------------------------------------------------------- masts and sails
   MAST[key][L]: [x, foot y, top y]. Fore-and-aft sails are quads tack/clew/throat/peak (a triangle when throat = peak):
   a = 0 at the luff .. 1 at the leech, up = 0 at the foot .. 1 at the head, belly toward +z. Square sails hang from a
   yard braced BETA about the mast: a = 0 port .. 1 starboard, belly toward +x (the wind from astern). Edge samples walk
   the perimeter by a fraction p so they stay on the outline at every level. */
const MAST = {
    A: [[0.15, -0.31, 0.24], [0.06, -0.30, 0.66], [0.10, -0.30, 0.64], [0.20, -0.30, 0.66], [0.27, -0.26, 0.66], [0.28, -0.25, 0.80]],
    B: from(2, [-0.34, -0.29, 0.38], [-0.16, -0.29, 0.72], [-0.30, -0.24, 0.68], [-0.29, -0.23, 0.86]),
    C: from(4, [0.00, -0.26, 0.74], [0.00, -0.25, 0.96]),
};
const quad = (tack, clew, throat, peak) => ({ tack, clew, throat, peak });
const tri = (tack, clew, head) => ({ tack, clew, throat: head, peak: head });
const sq = (mx, yf, yh, hwF, hwH) => ({ mx, yf, yh, hwF, hwH });   // mast x, foot y, head (yard) y, half-widths at foot and head
const SQ4 = {
    foreC: sq(0.27, -0.15, 0.08, 0.20, 0.22), foreT: sq(0.27, 0.11, 0.36, 0.16, 0.18), foreG: sq(0.27, 0.39, 0.58, 0.12, 0.14),
    mainC: sq(0.00, -0.15, 0.10, 0.22, 0.25), mainT: sq(0.00, 0.13, 0.42, 0.18, 0.20), mainG: sq(0.00, 0.45, 0.66, 0.13, 0.15),
};
const SQ5 = {
    foreC: sq(0.28, -0.14, 0.08, 0.21, 0.23), foreT: sq(0.28, 0.11, 0.36, 0.17, 0.19), foreG: sq(0.28, 0.39, 0.58, 0.13, 0.15), foreR: sq(0.28, 0.61, 0.74, 0.10, 0.11),
    mainC: sq(0.00, -0.14, 0.10, 0.23, 0.26), mainT: sq(0.00, 0.13, 0.40, 0.19, 0.21), mainG: sq(0.00, 0.43, 0.62, 0.14, 0.16), mainR: sq(0.00, 0.65, 0.78, 0.11, 0.12), mainSky: sq(0.00, 0.81, 0.91, 0.08, 0.09),
    mizT: sq(-0.29, 0.30, 0.50, 0.14, 0.16), mizG: sq(-0.29, 0.53, 0.68, 0.11, 0.12), mizR: sq(-0.29, 0.71, 0.81, 0.08, 0.09),
};
const SAILS = {   // per part, per level: a fore-and-aft quad, a square sail, or null
    main: [quad([0.17, -0.245], [-0.21, -0.235], [0.25, 0.03], [-0.06, 0.23]),          // the skiff's standing lug
        tri([0.05, -0.235], [-0.43, -0.225], [0.055, 0.64]),                                // Bermuda main
        quad([0.09, -0.225], [-0.25, -0.215], [0.09, 0.40], [-0.13, 0.56]),                  // gaff main
        quad([0.19, -0.215], [-0.11, -0.215], [0.19, 0.32], [0.01, 0.46]),                   // gaff foresail
        SQ4.foreC, SQ5.foreC],                                                              // fore course
    mizzen: from(2, quad([-0.35, -0.215], [-0.60, -0.20], [-0.35, 0.15], [-0.52, 0.31]),   // gaff mizzen
        quad([-0.17, -0.205], [-0.58, -0.19], [-0.17, 0.42], [-0.42, 0.62]),                 // schooner gaff main
        quad([-0.31, -0.16], [-0.60, -0.14], [-0.31, 0.25], [-0.50, 0.42]),                  // spanker
        quad([-0.30, -0.15], [-0.60, -0.13], [-0.30, 0.14], [-0.47, 0.27])),
    jib: from(1, tri([0.49, -0.26], [0.13, -0.22], [0.065, 0.55]), tri([0.70, -0.21], [0.30, -0.18], [0.10, 0.50]), tri([0.64, -0.19], [0.30, -0.16], [0.20, 0.54]),
        tri([0.66, -0.16], [0.40, -0.10], [0.27, 0.50]), tri([0.66, -0.16], [0.42, -0.10], [0.28, 0.60])),
    stay: from(2, tri([0.48, -0.24], [0.20, -0.20], [0.10, 0.34]), tri([0.49, -0.235], [0.25, -0.19], [0.20, 0.36]), tri([0.50, -0.20], [0.31, -0.15], [0.27, 0.36]), tri([0.52, -0.19], [0.33, -0.14], [0.28, 0.42])),
    flying: from(3, tri([0.76, -0.17], [0.45, -0.12], [0.20, 0.64]), tri([0.82, -0.13], [0.52, -0.06], [0.27, 0.58]), tri([0.80, -0.13], [0.52, -0.06], [0.28, 0.74])),
    jib4: from(5, tri([0.93, -0.10], [0.60, -0.02], [0.28, 0.80])),
    topA: from(3, tri([0.20, 0.34], [0.02, 0.47], [0.20, 0.65]), SQ4.foreT, SQ5.foreT),        // fore gaff topsail, then the fore topsail
    topB: from(3, tri([-0.16, 0.44], [-0.40, 0.62], [-0.16, 0.71]), tri([-0.30, 0.27], [-0.48, 0.41], [-0.30, 0.56]), SQ5.mizT),   // gaff topsail, then the mizzen topsail
    foreG: from(4, SQ4.foreG, SQ5.foreG), mainC: from(4, SQ4.mainC, SQ5.mainC), mainT: from(4, SQ4.mainT, SQ5.mainT), mainG: from(4, SQ4.mainG, SQ5.mainG),
    foreR: from(5, SQ5.foreR), mainR: from(5, SQ5.mainR), mainSky: from(5, SQ5.mainSky), mizG: from(5, SQ5.mizG), mizR: from(5, SQ5.mizR),
};
const TRI_PARTS = new Set(['jib', 'stay', 'flying', 'jib4']);
const BETA = -14 * PI / 180, SB = Math.sin(BETA), CB = Math.cos(BETA);   // yards braced a little toward the front-starboard 3/4 view; nearly square so the sails keep their area from every side
const walk = (len, p) => { const tot = len.reduce((s, l) => s + l, 0); let d = p * tot, k = 0; while (k < len.length - 1 && d > len[k]) { d -= len[k]; k++; } return [k, len[k] > 0 ? d / len[k] : 0]; };

function faSail(Q, a, up, edgeP) {   // -> [x, y, z, shade, flap, a, belly meta]
    if (edgeP != null) {   // luff, head, leech, foot
        const E = [[Q.tack, Q.throat], [Q.throat, Q.peak], [Q.peak, Q.clew], [Q.clew, Q.tack]];
        const [k, t] = walk(E.map(([A, B]) => Math.hypot(B[0] - A[0], B[1] - A[1])), edgeP);
        [a, up] = k === 0 ? [0, t] : k === 1 ? [t, 1] : k === 2 ? [1, 1 - t] : [1 - t, 0];
    }
    const P = lerp2(lerp2(Q.tack, Q.clew, a), lerp2(Q.throat, Q.peak, a), up);
    const chord = Math.hypot(Q.clew[0] - Q.tack[0], Q.clew[1] - Q.tack[1]);
    const belly = 0.11 * (chord / 0.52) * (0.35 + 0.65 * (1 - up));
    const z = belly * Math.sin(PI * a);
    const shade = shadeN([Math.cos(PI * a) * belly * 4, 0.15, 1]);
    const flap = (0.5 * Math.sin(PI * a) + 0.5 * a) * (0.4 + 0.6 * (1 - up));
    return [P[0], P[1], z, shade, flap, a, z + 1e-3];
}
function sqSail(S, a, up, edgeP) {
    if (edgeP != null) {   // foot, starboard leech, head, port leech
        const h = S.yh - S.yf;
        const [k, t] = walk([2 * S.hwF, h, 2 * S.hwH, h], edgeP);
        [a, up] = k === 0 ? [t, 0] : k === 1 ? [1, t] : k === 2 ? [1 - t, 1] : [0, 1 - t];
    }
    const y = lerp(S.yf, S.yh, up), hw = lerp(S.hwF, S.hwH, up), l = (a - 0.5) * 2 * hw;
    const soft = Math.pow(1 - up, 0.6), bul = 0.50 * hw * Math.sin(PI * a) * (0.35 + 0.65 * soft);   // a soft belly, fullest at the foot, that still shows from the side
    const x = S.mx + l * SB + bul * CB, z = l * CB - bul * SB;              // yard axis (SB,0,CB), belly normal (CB,0,-SB): +x, the wind from astern
    const tilt = Math.cos(PI * a) * soft;                                    // the viewer-facing normal (CB,0,-SB) tilts along the yard with the belly
    const shade = shadeN([0.5 * CB + SB * tilt, 0.25, -SB + CB * tilt]);
    const flap = 0.8 * Math.pow(Math.sin(PI * a), 1.3) * Math.pow(1 - up, 0.7);   // still at the yard, both leeches
    return [x, y, z, shade, flap, a, -(bul + 1e-3)];
}
function sailAt(L, part, a, up, edgeP) {
    const E = SAILS[part][L];
    return !E ? null : E.mx !== undefined ? sqSail(E, a, up, edgeP) : faSail(E, a, up, edgeP);
}

/* ---------------------------------------------------------------- spars: line segments per level */
const yardOf = (S, dy = 0, k = 1.08) => { const hw = S.hwH * k; return [[S.mx - hw * SB, S.yh + dy, -hw * CB], [S.mx + hw * SB, S.yh + dy, hw * CB]]; };
const mastSeg = m => m && [[m[0], m[1], 0], [m[0], m[2], 0]];
const mastPt = (key, L, t) => { const m = MAST[key][L]; return [m[0], lerp(m[1], m[2], t), 0]; };
const boomOf = Q => Q && Q.tack && [[Q.tack[0], Q.tack[1] - 0.005, 0.01], [Q.clew[0] - 0.02, Q.clew[1] - 0.005, 0.01]];
const gaffOf = Q => Q && Q.tack && Q.peak[0] !== Q.throat[0] ? [[Q.throat[0], Q.throat[1] + 0.005, 0], [Q.peak[0] - 0.02, Q.peak[1] + 0.008, 0]] : null;
const BOWSPRIT = from(2, [[0.47, -0.240, 0], [0.72, -0.200, 0]], [[0.48, -0.235, 0], [0.78, -0.165, 0]], [[0.50, -0.210, 0], [0.86, -0.120, 0]], [[0.54, -0.200, 0], [0.96, -0.090, 0]]);
const SPAR = {
    mastA: MAST.A.map(mastSeg), mastB: MAST.B.map(mastSeg), mastC: MAST.C.map(mastSeg),
    boomA: [boomOf(SAILS.main[0]), boomOf(SAILS.main[1]), boomOf(SAILS.main[2]), boomOf(SAILS.main[3]), yardOf(SQ4.foreC), yardOf(SQ5.foreC)],   // the boom rises to become the fore course yard
    gaffA: [gaffOf(SAILS.main[0]), [[0.06, 0.40, -0.05], [0.06, 0.40, 0.05]], gaffOf(SAILS.main[2]), gaffOf(SAILS.main[3]), yardOf(SQ4.foreT), yardOf(SQ5.foreT)],   // lug yard, spreaders, gaff, fore topsail yard
    boomB: SAILS.mizzen.map(boomOf), gaffB: SAILS.mizzen.map(gaffOf),
    bowsprit: BOWSPRIT,
    yard_foreG: from(4, yardOf(SQ4.foreG), yardOf(SQ5.foreG)), yard_mainC: from(4, yardOf(SQ4.mainC), yardOf(SQ5.mainC)),
    yard_mainT: from(4, yardOf(SQ4.mainT), yardOf(SQ5.mainT)), yard_mainG: from(4, yardOf(SQ4.mainG), yardOf(SQ5.mainG)),
    yard_foreR: from(5, yardOf(SQ5.foreR)), yard_mainR: from(5, yardOf(SQ5.mainR)), yard_mainSky: from(5, yardOf(SQ5.mainSky)),
    yard_mizT: from(5, yardOf(SQ5.mizT)), yard_mizG: from(5, yardOf(SQ5.mizG)), yard_mizR: from(5, yardOf(SQ5.mizR)),
};
const SPAR_SHADE = k => k.startsWith('mast') ? 0.75 : k.startsWith('yard') ? 0.8 : 0.7;

/* ---------------------------------------------------------------- rigging: arrays of segments per level */
const railPt = (L, x, s) => { const H = HULL[L], xc = Math.max(-0.5, Math.min(0.5, x)); return [xc, topX(H, xc), s * railHB(H, xc)]; };
const shroudSegs = (L, key, hounds, n) => {   // n shrouds per side from the rail to the hounds
    const m = MAST[key][L]; if (!m) return null;
    const segs = [];
    for (const s of [-1, 1]) for (let j = 0; j < n; j++) segs.push([railPt(L, m[0] + (j - (n - 1) / 2) * 0.045, s), [m[0], lerp(m[1], m[2], hounds), 0]]);
    return segs;
};
const ratlineSegs = (L, key, hounds, n) => {   // the ladder across the shrouds: rows every 0.06 up the lower two thirds
    const m = MAST[key][L]; if (!m) return null;
    const segs = [], hy = lerp(m[1], m[2], hounds);
    for (const s of [-1, 1]) {
        const r0 = railPt(L, m[0] - (n - 1) / 2 * 0.045, s), r1 = railPt(L, m[0] + (n - 1) / 2 * 0.045, s), top = [m[0], hy, 0];
        for (let y = Math.max(r0[1], r1[1]) + 0.04; y < r0[1] + (hy - r0[1]) * 0.68; y += 0.06) segs.push([lerp3(r0, top, (y - r0[1]) / (hy - r0[1])), lerp3(r1, top, (y - r1[1]) / (hy - r1[1]))]);
    }
    return segs;
};
const luff = (part, L, ext = 0.04) => { const Q = SAILS[part][L]; return Q && Q.tack ? [[[Q.throat[0], Q.throat[1] + ext, 0], [Q.tack[0], Q.tack[1], 0]]] : null; };   // a headsail's stay: its luff, a little past the head
const under = (L, P, dx = 0) => { const x = Math.max(-0.5, Math.min(0.5, P[0] + dx)); return [x, deckX(HULL[L], x) + 0.01, 0]; };
const sheet = (part, L, dx) => { const Q = SAILS[part][L]; return Q && Q.tack ? [[Q.clew[0], Q.clew[1], 0], under(L, Q.clew, dx)] : null; };
const peakHal = (part, key, L) => { const Q = SAILS[part][L]; return Q && Q.tack ? [mastPt(key, L, 1), [Q.peak[0], Q.peak[1], 0]] : null; };
const sqAt = L => L === 4 ? SQ4 : L === 5 ? SQ5 : null;
const braceSegs = L => {   // from each yard arm aft and down toward the deck
    const S = sqAt(L); if (!S) return null;
    const segs = [];
    for (const k of Object.keys(S)) { const Y = yardOf(S[k]); for (const e of Y) { const x = S[k].mx - 0.24, hb = railHB(HULL[L], x); segs.push([e, [x, Math.max(deckX(HULL[L], x) + 0.03, e[1] - 0.26), Math.sign(e[2]) * hb * 0.95]]); } }
    return segs;
};
const footropeSegs = L => { const S = sqAt(L); return S && Object.keys(S).map(k => yardOf(S[k], -0.022, 0.95)); };
const backstaySegs = L => {   // two per side per mast, from the head and the hounds to the rail abaft the mast
    const segs = [];
    for (const key of ['A', 'B', 'C']) { const m = MAST[key][L]; if (!m) continue; for (const s of [-1, 1]) { segs.push([mastPt(key, L, 1), railPt(L, m[0] - 0.13, s)]); segs.push([mastPt(key, L, 0.72), railPt(L, m[0] - 0.09, s)]); } }
    return segs;
};
const RIG = {
    shroudsA: [null, shroudSegs(1, 'A', 0.84, 3), shroudSegs(2, 'A', 0.82, 3), shroudSegs(3, 'A', 0.80, 3), shroudSegs(4, 'A', 0.78, 4), shroudSegs(5, 'A', 0.78, 4)],
    shroudsB: from(2, shroudSegs(2, 'B', 0.82, 2), shroudSegs(3, 'B', 0.80, 3), shroudSegs(4, 'B', 0.78, 3), shroudSegs(5, 'B', 0.78, 4)),
    shroudsC: from(4, shroudSegs(4, 'C', 0.78, 4), shroudSegs(5, 'C', 0.78, 4)),
    ratA: from(4, ratlineSegs(4, 'A', 0.78, 4), ratlineSegs(5, 'A', 0.78, 4)),
    ratB: from(4, ratlineSegs(4, 'B', 0.78, 3), ratlineSegs(5, 'B', 0.78, 4)),
    ratC: from(4, ratlineSegs(4, 'C', 0.78, 4), ratlineSegs(5, 'C', 0.78, 4)),
    foreStay: [null, luff('jib', 1), luff('jib', 2), luff('jib', 3), luff('jib', 4), luff('jib', 5)],
    jibStay: [null, null, luff('stay', 2), luff('stay', 3), luff('stay', 4), luff('stay', 5)],
    flyingStay: from(3, luff('flying', 3), luff('flying', 4), luff('flying', 5)),
    jib4Stay: from(5, luff('jib4', 5)),
    stays: from(2, [[mastPt('B', 2, 1), [MAST.A[2][0], MAST.B[2][2], 0]]],   // the ketch's triatic stay
        [[mastPt('B', 3, 1), mastPt('A', 3, 1)], [mastPt('B', 3, 0.55), mastPt('A', 3, 0.6)]],
        [[mastPt('C', 4, 1), mastPt('A', 4, 1)], [mastPt('C', 4, 1), mastPt('B', 4, 1)], [mastPt('C', 4, 0.55), mastPt('A', 4, 0.6)], [mastPt('B', 4, 0.55), mastPt('C', 4, 0.6)]],
        [[mastPt('C', 5, 1), mastPt('A', 5, 1)], [mastPt('C', 5, 1), mastPt('B', 5, 1)], [mastPt('C', 5, 0.55), mastPt('A', 5, 0.62)], [mastPt('B', 5, 0.55), mastPt('C', 5, 0.62)], [mastPt('C', 5, 0.8), mastPt('A', 5, 0.85)], [mastPt('B', 5, 0.8), mastPt('C', 5, 0.85)]]),
    backstay: [null, [[mastPt('A', 1, 1), railPt(1, -0.49, 0)]], [[mastPt('B', 2, 1), railPt(2, -0.49, 0)]], [[mastPt('B', 3, 1), railPt(3, -0.49, 0)]], [[mastPt('B', 4, 1), railPt(4, -0.49, 0)]], [[mastPt('B', 5, 1), railPt(5, -0.49, 0)]]],
    backstays: from(4, backstaySegs(4), backstaySegs(5)),
    running: from(3,
        [peakHal('main', 'A', 3), peakHal('mizzen', 'B', 3), sheet('main', 3, -0.08), sheet('mizzen', 3, 0.06), sheet('jib', 3, -0.12), sheet('flying', 3, -0.14), sheet('stay', 3, -0.1)],
        [peakHal('mizzen', 'B', 4), sheet('mizzen', 4, 0.06), sheet('jib', 4, -0.12), sheet('flying', 4, -0.16), sheet('stay', 4, -0.1), [mastPt('A', 4, 0.5), under(4, [0.27, 0], -0.1)], [mastPt('C', 4, 0.5), under(4, [0, 0], -0.1)]],
        [peakHal('mizzen', 'B', 5), sheet('mizzen', 5, 0.06), sheet('jib', 5, -0.12), sheet('flying', 5, -0.16), sheet('jib4', 5, -0.2), sheet('stay', 5, -0.1), [mastPt('A', 5, 0.5), under(5, [0.28, 0], -0.1)], [mastPt('C', 5, 0.5), under(5, [0, 0], -0.1)], [mastPt('B', 5, 0.5), under(5, [-0.29, 0], -0.1)]]),
    braces: from(4, braceSegs(4), braceSegs(5)),
    footropes: from(5, footropeSegs(5)),
};
const RIG_DENSITY = { foreStay: [0, 0.5, 1, 1, 1, 1] };   // fraction of a line's particles present per level (sparser forestay on the sloop so the jib reads apart from the main)
const RIG_SHADE = k => k.startsWith('rat') || k === 'footropes' ? 0.45 : k === 'braces' || k === 'running' ? 0.5 : 0.6;

/* ---------------------------------------------------------------- deck and fittings
   Per level a weighted list of fittings; a deck particle (u along, w across, q) picks its fitting by q and places itself by (u, w).
   Each fitting is a small parametric surface: boxes (roof, sides, ends), rails with stanchions, thwarts, a wheel, boats, anchors... */
const face = u => frac(u * 61.7);   // a second uniform derived from u, for picking a face of a fitting
function fittings(L) {
    const H = HULL[L], hb = x => railHB(H, x), dk = x => deckX(H, x), side = s => shadeN([0, 0.1, s]);
    const flat = (u, w) => { const x = -0.5 + u; return [x, dk(x), w * hb(x) * 0.92, TOP * 0.9]; };
    const box = (x0, x1, h, hwf, yOff = 0) => (u, w) => {
        const x = lerp(x0, x1, u), f = face(u);
        if (f < 0.5) return [x, dk(x) + yOff + h, w * hwf * hb(x), TOP * 0.9];
        if (f < 0.82) { const s = w < 0 ? -1 : 1; return [x, dk(x) + yOff + h * Math.abs(w), s * hwf * hb(x), side(s)]; }
        const e = f < 0.91 ? x0 : x1; return [e, dk(e) + yOff + h * frac(u * 7.3), w * hwf * hb(e), shadeN([e === x0 ? -1 : 1, 0.1, 0])];
    };
    const rail = (x0, x1, h, n) => (u, w) => {
        const s = w < 0 ? -1 : 1;
        if (!n || face(u) < 0.6) { const x = lerp(x0, x1, u); return [x, dk(x) + h, s * hb(x), 0.62]; }
        const xs = lerp(x0, x1, Math.round(u * n) / n); return [xs, dk(xs) + h * Math.abs(w), s * hb(xs), 0.55];
    };
    const thwart = (x, wd) => (u, w) => [x + (u - 0.5) * wd, dk(x) - 0.012, w * hb(x) * 0.92, TOP * 0.85];
    const line = (P0, P1, sh) => (u, w) => { const P = lerp3(P0, P1, u); return [P[0], P[1], P[2] + w * 0.003, sh]; };
    const tiller = line([-0.48, dk(-0.48) + 0.012, 0], [-0.33, dk(-0.33) + 0.02, 0], 0.7);
    const oars = (u, w) => { const x = lerp(-0.28, 0.30, u), s = w < 0 ? -1 : 1; return [x, dk(x) - 0.02, s * hb(x) * 0.78, 0.62]; };
    const foredeck = (u, w) => { const x = lerp(0.36, 0.5, u); return [x, dk(x) - 0.006, w * hb(x) * 0.9, TOP * 0.85]; };
    const cockpit = (u, w) => {
        const x = lerp(-0.44, -0.24, u), f = face(u), hw = 0.55 * hb(x), s = w < 0 ? -1 : 1;
        if (f < 0.4) return [x, dk(x) - 0.03, w * hw, TOP * 0.7];
        if (f < 0.8) return [x, dk(x) - 0.03 + 0.042 * Math.abs(w), s * hw, side(s)];
        return [x, dk(x) + 0.012, s * hw, 0.75];
    };
    const wheel = x => (u, w) => { const f = face(u); if (f < 0.25) return [x, dk(x) + 0.04 * frac(u * 13), 0, 0.6]; const a = u * 2 * PI, r = 0.028; return [x, dk(x) + 0.04 + r * Math.sin(a), r * Math.cos(a) + w * 0.002, 0.72]; };
    const capstan = x => (u, w) => { const a = u * 2 * PI, r = 0.014; return [x + r * Math.cos(a), dk(x) + 0.026 * Math.abs(w), r * Math.sin(a), 0.6]; };
    const boat = (x0, x1, z0, yOff) => (u, w) => {   // a ship's boat on deck: gunwale ring, then the sides
        const x = lerp(x0, x1, u), t = 2 * u - 1, hw = 0.036 * Math.sqrt(Math.max(0, 1 - t * t * 0.92)), y0 = dk((x0 + x1) / 2) + yOff, s = w < 0 ? -1 : 1;
        if (face(u) < 0.5) return [x, y0 + 0.03, z0 + s * hw, 0.82];
        const v = Math.abs(w); return [x, y0 + 0.03 * v, z0 + s * hw * Math.sqrt(v * (2 - v)), side(s) * 0.9];
    };
    const anchor = (x, s) => (u, w) => {
        const z = s * (hb(x) + 0.016), yt = dk(x) + 0.02, yb = WL + 0.035;
        if (u < 0.55) return [x, lerp(yt, yb, u / 0.55), z, 0.55];
        if (u < 0.82) { const t = (u - 0.55) / 0.27 * 2 - 1; return [x + t * 0.032, yb + 0.014 * t * t, z, 0.55]; }
        return [x, yt - 0.012, z + ((u - 0.82) / 0.18 - 0.5) * 0.05, 0.55];
    };
    const figurehead = (u, w) => [0.56 + 0.06 * u, -0.262 + 0.07 * u + 0.012 * Math.sin(PI * u), w * 0.012, 0.85];
    const gallery = (u, w) => { const x = hullX(H, 0, 0.7) - 0.006, y = dk(-0.5); return face(u) < 0.7 ? [x, y - 0.045 + 0.012 * frac(u * 9), w * hb(-0.5) * 0.8, 0.9] : [x, y - 0.02, w * hb(-0.5) * 0.9, 0.55]; };
    const breakQ = (fx, h) => (u, w) => [fx + 0.002, dk(fx + 0.001) + h * frac(u * 5), w * hb(fx) * 0.95, shadeN([1, 0.2, 0.3])];    // the break of a raised deck aft (face looks forward)
    const breakF = (fx, h) => (u, w) => [fx - 0.002, dk(fx - 0.001) + h * frac(u * 5), w * hb(fx) * 0.95, shadeN([-1, 0.2, 0.3])];   // the break of the forecastle (face looks aft)
    const bw = H.bulwark + 0.004;
    return [
        [[thwart(0.12, 0.05), 1], [thwart(-0.16, 0.05), 1], [thwart(-0.40, 0.08), 0.8], [foredeck, 0.8], [tiller, 0.5], [oars, 1.2]],
        [[flat, 3], [box(-0.22, 0.12, 0.035, 0.62), 2], [cockpit, 1.2], [rail(-0.46, 0.44, 0.035, 8), 1.8], [tiller, 0.4], [box(0.18, 0.26, 0.012, 0.4), 0.3]],
        [[flat, 3], [box(-0.28, -0.08, 0.045, 0.6), 1.6], [rail(-0.47, 0.44, 0.03, 14), 2], [wheel(-0.42), 0.6], [box(0.22, 0.32, 0.012, 0.4), 0.4], [box(-0.05, 0.04, 0.012, 0.4), 0.4]],
        [[flat, 3], [box(-0.36, -0.20, 0.04, 0.6), 1.2], [rail(-0.48, 0.46, 0.03, 16), 2], [wheel(-0.44), 0.5], [box(0.30, 0.38, 0.012, 0.4), 0.3], [box(0.02, 0.12, 0.012, 0.4), 0.4], [boat(-0.12, 0.08, 0.055, 0.01), 1], [capstan(0.40), 0.3]],
        [[flat, 3.2], [breakQ(-0.15, 0.03), 0.5], [breakF(0.33, 0.025), 0.4], [rail(-0.49, 0.48, bw, 0), 1.6], [box(-0.24, -0.06, 0.04, 0.6), 1], [wheel(-0.45), 0.5], [box(0.12, 0.20, 0.012, 0.4), 0.4], [boat(-0.10, 0.10, 0.06, 0.03), 0.9], [anchor(0.40, 1), 0.5], [anchor(0.40, -1), 0.5], [capstan(0.38), 0.3], [box(-0.40, -0.33, 0.02, 0.3), 0.3]],
        [[flat, 3.4], [breakQ(-0.30, 0.025), 0.4], [breakF(0.36, 0.02), 0.4], [rail(-0.49, 0.49, bw, 0), 1.6], [box(0.08, 0.22, 0.04, 0.6), 0.8], [box(-0.22, -0.08, 0.04, 0.6), 0.8], [wheel(-0.46), 0.4], [boat(-0.20, -0.02, 0.06, 0.03), 0.7], [boat(0.08, 0.24, -0.06, 0.03), 0.7], [anchor(0.40, 1), 0.45], [anchor(0.40, -1), 0.45], [figurehead, 0.6], [gallery, 0.8], [capstan(0.40), 0.3], [box(0.28, 0.34, 0.012, 0.4), 0.3], [box(-0.40, -0.34, 0.02, 0.3), 0.3]],
    ][L];
}
const FIT = [0, 1, 2, 3, 4, 5].map(fittings);
const FIT_TOT = FIT.map(f => f.reduce((s, [, w]) => s + w, 0));
function deckPt(L, u, w, q) {
    let d = q * FIT_TOT[L];
    for (const [f, wt] of FIT[L]) { d -= wt; if (d <= 0) return f(u, w); }
    return FIT[L][FIT[L].length - 1][0](u, w);
}
const HULL_PRES = [0.48, 0.68, 0.80, 0.90, 0.95, 1], DECK_PRES = [0.45, 0.68, 0.80, 0.90, 0.95, 1];   // the share of hull / deck particles present per level

/* ---------------------------------------------------------------- water and wake (shared by all levels) */
function waterPt(rand) {   // a disc of ripples around the hull: concentric rings (phase = ring position), denser, brighter and a little higher on the crests
    let x = 0, z = 0, rr = 0, ph = 0, rip = 0;
    for (let k = 0; k < 12; k++) {
        const a = rand() * PI * 2; rr = Math.pow(rand(), 0.6); x = Math.cos(a) * rr * 1.25; z = Math.sin(a) * rr * 0.75;
        ph = rr * 26; rip = Math.pow(0.5 + 0.5 * Math.sin(ph), 2.0);
        if ((x / 0.5) ** 2 + (z / 0.17) ** 2 > 1 && rand() < 0.3 + 0.7 * rip) break;   // outside the hull footprint, favouring the crests
    }
    return { p: [x, WL - 0.008 + 0.016 * rip, z, 0.15 + 0.68 * rip], flap: 0, phase: frac(ph / (2 * PI)), aux: rr };
}
const KELVIN = Math.tan(19.5 * PI / 180);
function wakePt(rand) {
    const d = 0.004 + Math.pow(rand(), 2.8) * 1.596, f = d / 1.6, half = KELVIN * d, arm = rand() < 0.55 * (1 - 0.5 * f);   // starts just abaft the stern; density, arm share and shade fall off with distance so the V dissolves
    let z, shade;
    if (arm) { z = (rand() < 0.5 ? -1 : 1) * half + (rand() - 0.5) * (0.012 * (1 + d) + 0.02 * f); shade = 0.65 * (1 - 0.9 * f) ** 1.5; }
    else { z = (rand() * 2 - 1) * half * 0.85; shade = 0.34 * (1 - 0.85 * f) ** 1.5; }
    return { p: [-0.5 - d, WL - 0.002 + 0.004 * Math.sin(d * 25), z, Math.max(0.05, shade)], flap: 0, phase: frac(d * 3), aux: f };
}

/* ---------------------------------------------------------------- allocation */
const SAIL_W = { main: 520, mizzen: 330, jib: 260, stay: 220, flying: 180, jib4: 120, topA: 380, topB: 150, foreG: 260, foreR: 170, mainC: 560, mainT: 400, mainG: 280, mainR: 180, mainSky: 100, mizG: 200, mizR: 130 };
const SPAR_W = { mastA: 120, mastB: 110, mastC: 120, boomA: 45, gaffA: 40, boomB: 35, gaffB: 30, bowsprit: 55, yard_foreG: 32, yard_mainC: 40, yard_mainT: 36, yard_mainG: 32, yard_foreR: 24, yard_mainR: 26, yard_mainSky: 18, yard_mizT: 32, yard_mizG: 26, yard_mizR: 20 };
const RIG_W = { shroudsA: 130, shroudsB: 110, shroudsC: 130, ratA: 190, ratB: 150, ratC: 200, foreStay: 60, jibStay: 50, flyingStay: 45, jib4Stay: 35, stays: 80, backstay: 50, backstays: 90, running: 100, braces: 170, footropes: 110 };
const ROLE_W = [[ROLE.HULL, 0.19], [ROLE.DECK, 0.06], [ROLE.SAIL, 0.35], [ROLE.SPAR, 0.05], [ROLE.RIGGING, 0.09], [ROLE.WATER, 0.11], [ROLE.WAKE, 0.09], [ROLE.REFLECTION, 0.06]];
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
        const q = rand(), kind = rand(), s = rand() < 0.5 ? -1 : 1, v = rand(), w = rand() * 2 - 1;
        let u = rand(); if (kind < 0.07) u = kind < 0.035 ? 1 - 0.03 * rand() : 0.03 * rand();   // extra samples on the stem and stern post
        const gun = kind >= 0.07 && kind < 0.32, transom = kind >= 0.32 && kind < 0.36, plank = rand() < 0.7;
        return L => {
            if (q >= HULL_PRES[L]) return null;
            if (transom) return transomPt(HULL[L], v, w);
            const vv = L === 0 && plank && !gun ? Math.max(0.012, Math.floor(v * 5) / 5) : v;   // the skiff's lapstrake: plank lands as denser rows (the lowest at the waterline)
            return hullPt(HULL[L], u, s, vv, gun);
        };
    };
    const genSail = part => {
        const edgeP = rand() < 0.22 ? rand() : null, a = rand(), r = rand();
        const up = TRI_PARTS.has(part) ? 1 - Math.pow(r, 0.65) : SAILS[part].some(E => E && E.tack) ? 1 - Math.pow(r, 0.85) : r;   // fore-and-aft sails are fuller at the foot
        return L => sailAt(L, part, a, up, edgeP);
    };
    const genDeck = () => { const u = rand(), w = rand() * 2 - 1, q = rand(), q2 = rand(); return L => q2 >= DECK_PRES[L] ? null : deckPt(L, u, w, q); };
    const genSpar = part => {
        const t = rand(), jx = (rand() - 0.5) * 0.01, jz = (rand() - 0.5) * 0.006, sh = SPAR_SHADE(part);
        return L => { const S = SPAR[part][L]; if (!S) return null; const P = lerp3(S[0], S[1], t); return [P[0] + jx, P[1], P[2] + jz, sh]; };
    };
    const genRig = part => {
        const q = rand(), t = rand(), jx = (rand() - 0.5) * 0.005, jy = (rand() - 0.5) * 0.005, dq = rand(), dens = RIG_DENSITY[part], sh = RIG_SHADE(part);
        return L => { const segs = RIG[part][L]; if (!segs || (dens && dq >= dens[L])) return null; const S = segs[Math.min(segs.length - 1, Math.floor(q * segs.length))]; if (!S) return null; const P = lerp3(S[0], S[1], t); return [P[0] + jx, P[1] + jy, P[2], sh]; };
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
            for (let L = 0; L < NL; L++) { const p = g(L); if (p) put(L, i, p, r, r === ROLE.SAIL ? p[4] : 0, r === ROLE.SAIL ? p[6] : 0, r === ROLE.SAIL ? p[5] : 0); }
        }
    }
    return { count, pos, meta, role };
}
