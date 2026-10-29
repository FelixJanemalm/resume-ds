/* fold-lab.js — the hero sea's controls, on the real page. Dev only: index.html imports it when the URL carries ?waves=1.
 *
 * The look-dev lab (the exploration workspace's fold-lab/) tuned the sea on its own page; this is the same kind of panel wired to the sea the
 * site actually draws — js/voyage-fold.js's view, which work-spine.js hands out as section.wsLayer.fold — so what you see while you drag a
 * slider is the finished hero: the ship on it, the page's colour, the real camera and the real scroll.
 *
 * The panel writes the module's own uniforms (the keys of voyage-fold.js's DEFAULTS) and a set of extra ones this file patches into the sea's
 * shader at runtime (EXT below). 2026-09-21: the wave parameters (a third swell, crest shape, chop, wander, breath, the master height) were baked
 * into voyage-fold.js with Felix's lines-only pick, so for those the panel now drives the module's uniforms and Reset goes back to its numbers;
 * the wall's S-bend, rise and taper, its place in the hero (slid and turned about the ship) and the drift are still patched in here.
 * "Copy for voyage-fold.js" prints what to bake in, and where.
 *
 * Composition: the wall is kept off the hero's text by its shape and place, never by hiding part of it. measureWall() builds the wall in JS as
 * the shader does, projects it through the page's camera, and reports how much of the headline, subhead and button the solid wall covers, how far
 * it stays from them, and how much of the hero it still fills. The panel draws that (C), fits the wall to the text (F), and no roll is allowed to
 * leave the wall on the text.
 *
 * The ship rides what you tune: fold.ride() is replaced with the same mirror of the shader in JS, extended to the new components (the chop is
 * left out on purpose — a hull should not follow a 40 cm ripple).
 *
 * Keys: H hides the panel, P pauses the water, R rolls, Z / Y step through the history, K keeps a look, C shows the composition, F fits it. */

/* the wave parameters this file adds to the sea (the module's own DEFAULTS cover the rest). Angles are degrees here and radians in the shader. */
export const EXT = {
    height: 1, crest: 0, swellRot: 0, breathe: 0, breatheRate: 0.08,          // the swell as a whole: master height, crest shape (0 = a plain cosine), the swell turned off the fold's axis, a slow rise and fall
    bandFollow: 0,            // 0 = the bands and crest lines run along the fold, as the module draws them; 1 = they turn with the swell, so the crests run sideways across the hero
    drift: 0, driftDir: 90,   // the whole pattern streaming across the sea (lab units per second, degrees), with the ship at anchor: motion that does not wait for the scroll
    wallX: 0, wallY: 0, seaTurn: 0,              // the sea slid across the screen (+ right), away from the camera (+ up the screen), and turned about the ship (deg) — the wall's place in the hero
    bend3: 0, riseAt: 0, riseLen: 0, taper: 0,   // the wall's shape along its length: an S-bend on the crescent, where it starts rising and over how long (0 = the whole length, ± picks the side), tall at one end and low at the other
    spd2: 0.8,                                                                // the cross swell's speed, as a share of the main one's (0.8 is what the module hard-coded)
    amp3: 0, lambda3: 7, dir3: -60, spd3: 0.5,                                // a third, long swell crossing the other two
    chop: 0, chopScale: 0.4, chopSpeed: 0.12, chopDir: 20, chopOct: 2, chopGain: 0.5, chopFade: 60,   // drifting detail: fractal noise on top of the swell, fading out with distance so the far sea stays smooth
    wander: 0, wanderRate: 0.05,                                              // every direction wobbles this many degrees, on this clock: the pattern stops repeating
    nEps: 0.08, sEps: 0.06,                                                   // how far apart the shader samples the water for its normals: small reads the chop, large smooths the light
};
const EXT_DEFAULTS = { ...EXT };
const DEG = new Set(['swellRot', 'dir3', 'chopDir', 'wander']);   // EXT keys the panel shows in degrees and the shader takes in radians (driftDir and seaTurn are used in JS)

/* the panel. [key, label, min, max, step] under a group; `x` marks an EXT key, everything else is a key of voyage-fold.js's DEFAULTS */
const GROUPS = [
    ['swell · the wave the bands ride', [
        ['amp', 'height', 0, 1, 0.005], ['lambda', 'wavelength', 1, 20, 0.1], ['speed', 'speed', 0, 3, 0.01], ['clock', 'clock (× the speed of everything)', 0, 2, 0.05],
        ['x:height', 'master height ×', 0, 3, 0.01], ['x:crest', 'crest shape', 0, 1, 0.01],
        ['x:swellRot', 'swell rotation (deg)', -180, 180, 1],
        ['x:breathe', 'breathe (height ±)', 0, 1, 0.01], ['x:breatheRate', 'breathe rate', 0.005, 0.5, 0.005],
        ['x:bandFollow', 'bands follow the swell', 0, 1, 0.01],
    ]],
    ['cross swell', [
        ['amp2', 'height', 0, 0.5, 0.005], ['lambda2', 'wavelength', 1, 14, 0.1], ['dir2', 'direction (deg)', -180, 180, 1], ['x:spd2', 'speed (× main)', -2, 2, 0.01],
    ]],
    ['third swell · the long one', [
        ['x:amp3', 'height', 0, 0.5, 0.005], ['x:lambda3', 'wavelength', 1, 30, 0.1], ['x:dir3', 'direction (deg)', -180, 180, 1], ['x:spd3', 'speed (× main)', -2, 2, 0.01],
    ]],
    ['chop · the organic detail', [
        ['x:chop', 'height', 0, 0.3, 0.002], ['x:chopScale', 'grain', 0.05, 3, 0.01], ['x:chopSpeed', 'drift', 0, 2, 0.01],
        ['x:chopDir', 'drift direction', -180, 180, 1], ['x:chopOct', 'octaves', 1, 4, 1], ['x:chopGain', 'octave falloff', 0.2, 0.8, 0.01],
        ['x:chopFade', 'gone by distance', 5, 200, 1],
    ]],
    ['wander and drift · nothing sits still', [
        ['x:drift', 'drift (units/s)', 0, 1.5, 0.01], ['x:driftDir', 'drift direction (deg)', -180, 180, 1],
        ['x:wander', 'wobble (deg)', 0, 45, 0.5], ['x:wanderRate', 'wobble rate', 0.005, 0.4, 0.005],
    ]],
    ['wall · its shape and place in the hero', [
        ['x:wallX', 'slide ← →', -30, 30, 0.1], ['x:wallY', 'slide ↓ toward / ↑ away', -30, 30, 0.1], ['x:seaTurn', 'turn about the ship (deg)', -180, 180, 0.5],
        ['x0', 'fold line offset', -10, 30, 0.1], ['axis', 'run direction (deg)', -180, 180, 1],
        ['bend', 'crescent', -0.5, 0.5, 0.005], ['x:bend3', 'S-bend', -0.5, 0.5, 0.005],
        ['x:riseAt', 'wall starts at (along)', -80, 80, 0.5], ['x:riseLen', 'rises over (± side, 0 = all)', -80, 80, 0.5], ['x:taper', 'taper (tall one end)', -1.5, 1.5, 0.01],
        ['c:margin', 'clearance from the text (px)', 0, 200, 2],
    ]],
    ['ship · the hero pose', [
        ['s:x', 'x (ndc)', -1, 1, 0.005], ['s:y', 'y (ndc)', -1, 1, 0.005], ['s:size', 'hull length', 0.05, 0.8, 0.005],
        ['s:turn', 'heading (deg)', 0, 360, 0.5], ['s:tilt', 'tilt (deg)', 0, 90, 0.5], ['s:heel', 'heel (deg)', -25, 25, 0.5],
        ['s:ride', 'rides the swell', 0, 2, 0.05], ['s:seaScale', 'sea size vs ship', 0.3, 3, 0.05],
    ]],
    ['fold · the curl', [
        ['curl', 'curl at the top of the page (0 = flat)', 0, 1, 0.01], ['R', 'curl radius', 1, 30, 0.1], ['phiMax', 'curl angle (deg)', 20, 180, 1], ['fan', 'fan', -1, 1, 0.01], ['fanSoft', 'fan softness', 0, 4, 0.05],
        ['foldDamp', 'calm up the wall', 0, 1, 0.01],
    ]],
    ['surface · smooth and high fidelity', [
        ['mesh', 'mesh detail (seg)', 160, 900, 20], ['smoothN', 'smooth shading', 0, 1, 1],
        ['x:sEps', 'sheet normal step', 0.01, 0.4, 0.005], ['x:nEps', 'swell normal step', 0.01, 0.4, 0.005],
        ['grain', 'grain', 0, 3, 0.05], ['lineWidth', 'crest line px', 0.3, 4, 0.05], ['lineGain', 'crest lines', 0, 2, 0.01], ['lineFar', 'lines fade by', 2, 80, 0.5],
        ['dotPx', 'sea dot px', 0.5, 6, 0.1], ['dotGain', 'sea dots', 0, 3, 0.01], ['dotOnSolid', 'dots on the sheet', 0, 1, 0.01], ['dotFar', 'dots fade by', 2, 80, 0.5],
    ]],
    ['bands and light', [
        ['bands', 'bands / wave', 1, 8, 1], ['bandPow', 'band falloff', 0.3, 8, 0.05], ['edge', 'band edge boost', 0, 1, 0.01], ['floor', 'band floor', 0, 1, 0.01],
        ['baseGlow', 'glow at the foot', 0, 2, 0.01], ['strand', 'silk strands', 0, 1, 0.01], ['strandFreq', 'strand freq', 1, 60, 0.5],
        ['sheen', 'fold sheen', 0, 2, 0.01], ['sheenPow', 'sheen power', 0.5, 8, 0.05], ['light', 'key light', 0, 1, 0.01],
        ['hueDrift', 'hue drift up the fold', -60, 60, 0.5], ['wallDark', 'darken up the fold', 0, 1, 0.01], ['farDark', 'darken with distance', 0, 0.2, 0.001],
        ['sat', 'saturation', 0, 1, 0.01], ['lum', 'lightness', 0.2, 0.8, 0.01],
    ]],
    ['dissolve · where the sheet ends', [
        ['solid', 'the silk sheet (0 = lines only)', 0, 1, 0.01],
        ['solidA', 'solid from (deg up)', -10, 90, 0.5], ['solidB', 'solid by (deg up)', 0, 120, 0.5],
        ['farA', 'dissolve from dist', 0, 300, 1], ['farB', 'dissolved by dist', 0, 400, 1], ['fogA', 'fades into page from', 0, 300, 1],
        ['lipLen', 'lip length', 0, 40, 0.1], ['lipSoft', 'lip dissolve', 0.1, 30, 0.1], ['spray', 'spray lift', 0, 2, 0.01], ['sprayLen', 'spray reach', 0.1, 30, 0.1],
        ['nearA', 'dissolve near the lens', 0, 20, 0.1], ['nearB', 'clear of the lens by', 0, 40, 0.1],
    ]],
];

/* The wall's place in the hero, measured rather than eyeballed (2026-09-16): slid 2.0 left and 1.0 away, S-bent -0.12, so the crest curves round
   the text block. Checked at 1920x1080, 1680x1050, 1600x900, 1440x900, 1366x768, 1280x800 and 1280x720, each watched for 8 s of the scene's sway:
   the solid wall never covers the headline, the line under it or the button, and at its closest it stays 53 px away (1280x720; 88-227 px at the
   others). It still fills 34-45% of the hero outside the text; the module's own placement fills 41-47% and covers 6-22% of the text. */
const COMPOSED = { 'x:wallX': -2.0, 'x:wallY': 1.0, 'x:bend3': -0.12 };
/* Portrait has no numbers of its own on purpose. On a phone the headline, the colour picker, the subhead and the button stack down the screen, the
   only room for the wall is the band behind the picker, and that band moves as the text reflows: the placement fitted at 390x844 (clear by 58 px)
   was measured at 360x800, 375x667, 414x896 and 430x932 under sway and covered the text at two of them (31% at 430x932). So in portrait "composed"
   fits the wall to the layout on screen instead; shipping it would mean placing the wall from the layout at load, not from a constant. */

/* the wave looks: each applies on top of what the module ships and keeps the wall where it is now, so picking a look never undoes a composition */
const PRESETS = {
    'ocean swell': { amp: 0.22, lambda: 5.2, speed: 0.4, amp2: 0.07, lambda2: 3.1, 'x:crest': 0.45, 'x:amp3': 0.05, 'x:lambda3': 11, 'x:chop': 0.012, 'x:chopScale': 0.5, 'x:wander': 6 },
    'silk calm': { amp: 0.1, lambda: 4.4, speed: 0.3, amp2: 0.03, 'x:crest': 0.15, 'x:chop': 0.004, 'x:chopScale': 0.8, 'x:wander': 3, 'x:breathe': 0.25 },
    'sideways': { amp: 0.2, lambda: 4.6, speed: 0.55, 'x:crest': 0.4, 'x:swellRot': 78, 'x:bandFollow': 0.85, 'x:drift': 0.35, 'x:driftDir': 100,
        amp2: 0.06, lambda2: 3.2, dir2: 10, 'x:spd2': 0.9, 'x:amp3': 0.04, 'x:lambda3': 12, 'x:dir3': -70, 'x:chop': 0.015, 'x:chopScale': 0.6, 'x:wander': 8, 'x:breathe': 0.18 },
    'weather': { amp: 0.3, lambda: 3.2, speed: 0.75, amp2: 0.12, lambda2: 2.0, 'x:crest': 0.7, 'x:amp3': 0.08, 'x:chop': 0.03, 'x:chopScale': 1.1, 'x:chopSpeed': 0.4, 'x:wander': 12 },
};

/* What a roll is allowed to reach for, per key. These are narrower than the sliders on purpose: the sliders go as far as the shader does, a roll
   should land on water that could exist. Keys missing here are never rolled — the mesh (it costs frames), smoothN (0 is flat-shaded facets, which
   is a bug, not a look) and the hue, which belongs to the page's colour picker. */
const ROLL = {
    amp: [0.06, 0.34], lambda: [2.4, 9], speed: [0.2, 0.8], 'x:height': [0.75, 1.35], 'x:crest': [0, 0.8], 'x:swellRot': [-40, 40], 'x:breathe': [0, 0.3], 'x:breatheRate': [0.02, 0.2],
    amp2: [0, 0.12], lambda2: [1.6, 6], dir2: [-180, 180], 'x:spd2': [0.4, 1.2],
    'x:amp3': [0, 0.09], 'x:lambda3': [5, 16], 'x:dir3': [-180, 180], 'x:spd3': [0.2, 0.9],
    'x:chop': [0, 0.035], 'x:chopScale': [0.2, 1.4], 'x:chopSpeed': [0.03, 0.5], 'x:chopDir': [-180, 180], 'x:chopOct': [1, 3], 'x:chopGain': [0.35, 0.65], 'x:chopFade': [30, 120],
    'x:wander': [0, 14], 'x:wanderRate': [0.02, 0.15], 'x:bandFollow': [0, 1], 'x:drift': [0, 0.6], 'x:driftDir': [-180, 180],
    axis: [-25, 15], x0: [2, 12], bend: [-0.25, 0.1], 'x:wallX': [-8, 8], 'x:wallY': [-6, 6], 'x:seaTurn': [-25, 25], 'x:bend3': [-0.15, 0.15], 'x:riseAt': [-30, 30], 'x:riseLen': [-40, 40], 'x:taper': [-0.6, 0.6], R: [2.5, 7], phiMax: [95, 160], fan: [0, 0.6], fanSoft: [0.3, 1.6], foldDamp: [0.55, 1],
    'x:sEps': [0.03, 0.12], 'x:nEps': [0.04, 0.16], grain: [0.4, 1.6], lineWidth: [0.8, 1.8], lineGain: [0.25, 1], lineFar: [16, 40],
    dotPx: [1.4, 3], dotGain: [0.5, 1.8], dotOnSolid: [0.05, 0.5], dotFar: [18, 44],
    bands: [1, 3], bandPow: [1.4, 4], edge: [0.1, 0.6], floor: [0.08, 0.35], baseGlow: [0.1, 0.8], strand: [0.05, 0.5], strandFreq: [8, 34],
    sheen: [0.2, 1], sheenPow: [2, 6], light: [0.25, 0.7], hueDrift: [-14, 8], wallDark: [0.45, 0.85], farDark: [0.002, 0.02], sat: [0.6, 1], lum: [0.42, 0.65],
    's:x': [-0.7, 0.55], 's:y': [-0.75, 0.1], 's:size': [0.3, 0.72], 's:turn': [185, 250], 's:tilt': [0, 26], 's:heel': [-8, 8], 's:seaScale': [0.6, 1.8],
    solidA: [0, 8], solidB: [16, 45], farA: [120, 220], farB: [200, 320], fogA: [60, 180], lipLen: [2, 14], lipSoft: [3, 14], spray: [0.1, 0.7], sprayLen: [3, 12], nearA: [1.5, 4], nearB: [5, 10],
};
const INT = new Set(['bands', 'x:chopOct']);
/* the roll's scopes, as the start of the group titles each one covers */
const SCOPES = [['waves', ['swell', 'cross', 'third', 'chop', 'wander']], ['wall', ['wall ·']], ['fold', ['fold ·']], ['ship', ['ship ·']], ['surface', ['surface']], ['light', ['bands']], ['edges', ['dissolve']]];
/* a seeded dice, so a roll can be written down and rolled again (mulberry32) */
function dice(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const STORE = 'fold-lab-v1';
const R = Math.PI / 180;
let mounted = false;

export async function mountFoldLab() {
    if (mounted) return; mounted = true;
    const section = document.querySelector('[data-work-spine]');
    if (!section) return console.warn('fold lab: no work-spine section on this page');
    const layer = await waitFor(() => section.wsLayer && section.wsLayer.fold && section.wsLayer, 30000);
    if (!layer) return console.warn('fold lab: the sea never started (three.js, reduced motion, or data-fold="0")');
    const fold = layer.fold, U = fold.uniforms;
    const defaults = { ...fold.opts };   // the module's own numbers, read before anything stored is applied: what Reset goes back to and what the changed marks compare against
    defaults.__seg = (fold.sheet && fold.sheet.geometry.parameters && fold.sheet.geometry.parameters.widthSegments) || 440;   // and the grid it built for this device (finer on a desktop than on a phone)

    // ── the state: the module's own keys, this file's extra ones, and the stage (what the panel holds still while you tune)
    const stage = { hold: true, fold: 1, vis: 1, lines: 1, dots: 1, timeScale: 1, mesh: 0, compose: { margin: MARGIN(), show: false } };
    const clock = { t: 0 };
    const stored = read();
    for (const k in EXT) if (k in defaults) EXT[k] = EXT_DEFAULTS[k] = defaults[k];   // baked into the module: its numbers are the defaults here, and what Reset goes back to
    Object.assign(EXT, stored.x || {});
    Object.assign(stage, stored.stage || {});
    delete stage.keep;   // the feathered mask this once had
    stage.compose = Object.assign({ margin: MARGIN(), show: false }, stage.compose || {});

    patchShader(fold, U);
    if (stored.n) fold.set(stored.n);
    writeExt(U, fold.opts);
    const THREE = await import('three').catch(() => null);
    if (stage.mesh) setMesh(THREE, fold, stage.mesh);
    holdTheSea(fold, stage, clock, U);
    rideTheSwell(fold, stage, clock);

    buildPanel({ fold, U, stage, clock, THREE, stored, defaults, layer });
}

/* ── the shader: the extra wave parameters patched into the sea the module compiled ──────────────────────────────────────────────────────── */

const GLSL_KEYS = Object.keys(EXT).filter(k => !/^(drift|driftDir|wallX|wallY|seaTurn)$/.test(k));   // the EXT keys the shader reads (the rest are used in JS)
const PRELUDE = keys => `
    ${keys.length ? 'uniform float ' + keys.map(k => 'u' + cap(k)).join(', ') + ';' : ''}
    uniform vec3 uFLCam;   /* the camera in the lab's own space: the same uniform object as the module's uCam, under a name that is declared up here, before the swell uses it */`;
/* the helpers the patched swell uses, put in just before it (after every uniform, the module's and the prelude's, is declared) */
const HELPERS = `float fl_hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float fl_vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(fl_hash(i), fl_hash(i + vec2(1.0, 0.0)), f.x), mix(fl_hash(i + vec2(0.0, 1.0)), fl_hash(i + 1.0), f.x), f.y); }
    /* fractal noise: a few octaves of the same value noise, each half the height and twice the frequency of the last */
    float fl_fbm(vec2 p){ float a = 1.0, s = 0.0, w = 0.0;
      for (int i = 0; i < 4; i++) { if (float(i) >= uChopOct) break; s += a * (fl_vnoise(p) - 0.5) * 2.0; w += a; a *= uChopGain; p = p * 2.03 + 11.7; }
      return w > 0.0 ? s / w : 0.0; }
    /* the wave's profile: a cosine at crest 0, and with it the crest sharpens and the trough flattens, as a real swell does (the second harmonic
       of a trochoid), held to the same peak height so turning it up does not raise the water */
    float fl_wave(float th, float crest){ return (cos(th) + crest * 0.5 * cos(2.0 * th)) / (1.0 + crest * 0.5); }
    `;

/* the replacement for voyage-fold.js's swellH. q — the phase the bands and the crest lines are drawn from — still comes from the fold's own run,
   so the bands stay tied to the wall; only the water's height gains the new components. */
const SWELL = `float swellH(vec2 xz, float t, out float q){
      xz += uFlow;
      float across; float run = runOf(xz, across); q = (run + uSpeed * t) / uLambda;
      float wob = uWander * sin(t * uWanderRate);
      vec2 d1 = vec2(cos(uAxis + uSwellRot + wob), sin(uAxis + uSwellRot + wob));
      float q1 = (dot(xz, d1) - uBend * across * across * 0.1 - uBend3 * across * across * across * 0.004 + uSpeed * t) / uLambda;
      q = mix(q, q1, uBandFollow);
      float h = uAmp * fl_wave(6.2831853 * q1, uCrest) * (1.0 + uBreathe * sin(t * uBreatheRate));
      vec2 d2 = vec2(cos(uDir2 - wob), sin(uDir2 - wob));
      h += uAmp2 * fl_wave(6.2831853 * (dot(xz, d2) + uSpeed * uSpd2 * t) / uLambda2, uCrest * 0.6);
      if (uAmp3 > 0.0) { vec2 d3 = vec2(cos(uDir3 + wob * 0.5), sin(uDir3 + wob * 0.5));
        h += uAmp3 * fl_wave(6.2831853 * (dot(xz, d3) + uSpeed * uSpd3 * t) / max(0.2, uLambda3), uCrest * 0.4); }
      if (uChop > 0.0) { vec2 cd = vec2(cos(uChopDir), sin(uChopDir));
        float fade = exp(-length(uFLCam - vec3(xz.x, 0.0, xz.y)) / max(1.0, uChopFade));   /* the detail dies with distance: nothing to alias out there */
        h += uChop * fl_fbm(xz * uChopScale + cd * (uChopSpeed * t)) * fade; }
      return h * uHeight; }`;

/* the fold line: the module's crescent (bend, quadratic in across), and on top of it an S-bend (cubic), so the wall can curve one way at one end
   and the other way at the other */
const RUNOF = `float runOf(vec2 xz, out float across){ vec2 d = vec2(cos(uAxis), sin(uAxis)); across = dot(xz, vec2(-d.y, d.x));
      return dot(xz, d) - uBend * across * across * 0.1 - uBend3 * across * across * across * 0.004; }`;

/* the module's deform, with the wall's height varying along its length. fl_rise is a local fold amount: where it is 0 the sea lies flat, exactly as
   the scroll lays the whole wall down (the curl radius grows as its angle shrinks, the arc length held), so the wall can begin part-way along its
   length and rise into full height over riseLen. fl_taper scales the curl angle along the length: tall at one end, low at the other, through
   the same soft limits as the fan so it never creases. With riseLen 0 and taper 0 this is the module's deform, number for number. */
const DEFORM = `float fl_rise(float a){ if (abs(uRiseLen) < 0.01) return 1.0; float x = clamp((a - uRiseAt) / uRiseLen, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
    float fl_taper(float a){ if (abs(uTaper) < 0.0001) return 1.0; return -smax2(-smax2(1.0 + uTaper * a / 12.0, 0.15, 0.25), -1.8, 0.25); }
    void deform(vec3 p0, out vec3 p, out vec3 n, out float q, out float phi, out float across, out float beyond){
      vec2 d = vec2(cos(uAxis), sin(uAxis)), xz = p0.xz;
      float s = runOf(xz, across) - uX0, h = swellH(xz, uTime, q);
      phi = 0.0; beyond = 0.0; n = vec3(0.0, 1.0, 0.0); p = vec3(xz.x, 0.0, xz.y);
      float fl = uFold * fl_rise(across);
      if (s > 0.0 && fl > 0.001) {
        float R = max(0.5, uR * (1.0 + uFan * fanAt(across))) / fl, pm = uPhiMax * fl * fl_taper(across), along, up;
        if (s < R * pm) { phi = s / R; along = R * sin(phi); up = R * (1.0 - cos(phi)); }
        else { phi = pm; beyond = s - R * pm; along = R * sin(pm) + beyond * cos(pm); up = R * (1.0 - cos(pm)) + beyond * sin(pm); }
        p.xz = xz - d * s + d * along; p.y = up;
        n = vec3(-sin(phi) * d.x, cos(phi), -sin(phi) * d.y);
        h *= 1.0 - uFoldDamp * smoothstep(0.0, 0.8, phi); }
      p += n * h; }`;

function patchShader(fold, U) {
    for (const k in EXT) if (!U['u' + cap(k)]) U['u' + cap(k)] = { value: DEG.has(k) ? EXT[k] * R : EXT[k] };
    U.uFLCam = U.uCam;   // one uniform under two names: the module writes it every frame in place(), the patched swell reads it
    const prelude = PRELUDE(GLSL_KEYS.filter(k => !(k in fold.opts)));   // what the module has baked is declared by the module
    const mats = [fold.sheet && fold.sheet.material, fold.dots && fold.dots.material].filter(Boolean);
    for (const mat of mats) {
        if (mat.__foldLab) continue;
        let vs = mat.vertexShader;
        const swapped = replaceFn(replaceFn(replaceFn(vs, 'swellH', HELPERS + SWELL), 'runOf', RUNOF), 'deform', DEFORM, 'void');
        if (!swapped) { console.warn('fold lab: swellH, runOf or deform not found — voyage-fold.js has moved on; the extra controls are off'); continue; }
        vs = swapped
            .replace('float e = 0.08, qq;', 'float e = uNEps, qq;')             // the flat sea's normal, for the light on the lines and dots
            .replace('float e = 0.06; vec3 pa', 'float e = uSEps; vec3 pa');    // the risen sheet's own normal
        mat.vertexShader = '/* fold-lab */' + prelude + '\n' + vs;
        mat.needsUpdate = true;
        mat.__foldLab = true;
    }
}

/* swap a GLSL function out by name, counting braces, so this keeps working if the lines around it change (null in, null out) */
function replaceFn(src, name, replacement, type = 'float') {
    if (src == null) return null;
    const i = src.indexOf(type + ' ' + name + '(');
    if (i < 0) return null;
    let j = src.indexOf('{', i), depth = 0;
    if (j < 0) return null;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) return src.slice(0, i) + replacement + src.slice(k + 1);
    }
    return null;
}

function writeExt(U, opts) { for (const k in EXT) { const u = U['u' + cap(k)]; if (u) u.value = DEG.has(k) ? EXT[k] * R : EXT[k]; if (opts && k in opts) opts[k] = EXT[k]; } }   // opts: the module's own copy, kept in step for the keys it has baked

/* ── the stage: the sea held where you can see it, and its own clock ──────────────────────────────────────────────────────────────────────── */

/* the page lays the fold down as you scroll and fades it out by the work section. While the panel is open the sheet can be pinned instead, so a
   wave stays on screen while you tune it; its clock runs through here too, so P freezes the water for a screenshot. */
function holdTheSea(fold, stage, clock, U) {
    const place0 = fold.place.bind(fold);
    let labT = null, lastT = 0;
    // the camera the sheet is drawn with, for projecting the wall onto the screen (three hands it to onBeforeRender)
    if (fold.sheet) { const before = fold.sheet.onBeforeRender; fold.sheet.onBeforeRender = function (renderer, scene, camera) { clock.camera = camera; return before.apply(this, arguments); }; }
    fold.place = function (a) {
        if (labT === null) { labT = a.t; lastT = a.t; }
        labT += (a.t - lastT) * stage.timeScale; lastT = a.t;
        clock.t = labT;
        const da = EXT.driftDir * Math.PI / 180;   // the pattern streaming across the sea on its own, over and above the ship's way
        clock.driftX = Math.cos(da) * EXT.drift * labT; clock.driftZ = Math.sin(da) * EXT.drift * labT;
        const o = Object.assign({}, a, { t: labT, theta: a.theta + EXT.seaTurn, flowX: (a.flowX || 0) + clock.driftX, flowZ: (a.flowZ || 0) + clock.driftZ });
        if (stage.hold) {
            o.fold = stage.fold;
            o.vis = Math.max(o.vis, stage.vis); o.lines = Math.max(o.lines, stage.lines); o.dots = Math.max(o.dots, stage.dots);
        }
        place0(o);
        // the slide: the lab's anchor (uS, the point of the sea that sits under the ship) moved against the screen's right and the view's forward,
        // both laid flat onto the sea, so the whole sea — wall and all — moves the way the slider says on screen. place() wrote the camera into lab
        // space against the module's own anchor, so it is moved by the same amount.
        const S = slideAnchor(U.uRot.value.elements, EXT.wallX, EXT.wallY);
        U.uS.value.set(S[0], S[1]);
        U.uCam.value.x += S[0] - LAB_S[0]; U.uCam.value.z += S[1] - LAB_S[1];
        clock.S = S;
        clock.pose = { at: a.at, rotSea: a.rotSea, theta: a.theta, k: a.k, cam: a.cam, fold: o.fold, vis: o.vis };   // live references: read them, never keep them
    };
}

/* the hull on the sea you are tuning: voyage-fold.js's ride() reads its own two-cosine mirror of the shader, which knows nothing of the third
   swell, the crest shape or the master height. Same maths, same state, extended — the chop is left out: a hull does not follow ripples. */
function rideTheSwell(fold, stage, clock) {
    const st = { heave: 0, pitch: 0, roll: 0 };
    fold.ride = function ({ bowX, bowZ, k, L, t, dt, flowX = 0, flowZ = 0, rate = 4 }) {
        const S = clock.S || LAB_S, zx = -bowZ, zz = bowX;   // where the ship sits on the lab's sea: voyage-fold.js's LAB.S, moved by the slide
        const Ll = L / Math.max(1e-4, k), B = 0.3 * Ll, tt = (clock.t || t) * (fold.opts.clock === undefined ? 1 : fold.opts.clock), dd = dt * stage.timeScale;
        const h = (x, z) => seaH(fold.opts, S[0] + x, S[1] + z, tt, flowX + (clock.driftX || 0), flowZ + (clock.driftZ || 0));
        const hB = h(bowX * Ll * 0.45, bowZ * Ll * 0.45), hS = h(-bowX * Ll * 0.45, -bowZ * Ll * 0.45);
        const hP = h(zx * B * 0.5, zz * B * 0.5), hM = h(-zx * B * 0.5, -zz * B * 0.5);
        const f = 1 - Math.exp(-rate * dd);
        st.heave += ((hB + hS + hP + hM) / 4 / Ll - st.heave) * f;
        st.pitch += (Math.atan2(hB - hS, 0.9 * Ll) - st.pitch) * f;
        st.roll += (-Math.atan2(hP - hM, B) * 180 / Math.PI - st.roll) * f;
        return st;
    };
}

const fl_wave = (th, crest) => (Math.cos(th) + crest * 0.5 * Math.cos(2 * th)) / (1 + crest * 0.5);

/* the shader's swellH in JS (without the chop), for the ride and for the readout */
function seaH(o, x, z, t, fx = 0, fz = 0) {
    x += fx; z += fz;
    const a = o.axis * R, across = -x * Math.sin(a) + z * Math.cos(a), wob = EXT.wander * R * Math.sin(t * EXT.wanderRate);
    const a1 = a + EXT.swellRot * R + wob;
    const q1 = (x * Math.cos(a1) + z * Math.sin(a1) - o.bend * across * across * 0.1 - EXT.bend3 * across * across * across * 0.004 + o.speed * t) / o.lambda;
    let h = o.amp * fl_wave(2 * Math.PI * q1, EXT.crest) * (1 + EXT.breathe * Math.sin(t * EXT.breatheRate));
    const a2 = o.dir2 * R - wob;
    h += o.amp2 * fl_wave(2 * Math.PI * (x * Math.cos(a2) + z * Math.sin(a2) + o.speed * EXT.spd2 * t) / o.lambda2, EXT.crest * 0.6);
    if (EXT.amp3 > 0) { const a3 = EXT.dir3 * R + wob * 0.5;
        h += EXT.amp3 * fl_wave(2 * Math.PI * (x * Math.cos(a3) + z * Math.sin(a3) + o.speed * EXT.spd3 * t) / Math.max(0.2, EXT.lambda3), EXT.crest * 0.4); }
    return h * EXT.height;
}

/* ── composition: where the wall lands on screen, against the hero's text ─────────────────────────────────────────────────────────────────── */

const LAB_S = [-0.447, 1.777];   // voyage-fold.js's LAB.S: the point of the lab's sea under the ship
/* The sea is anchored to the ship, which sways and bobs at anchor, so the wall's distance from the text breathes: 19-38 px peak to peak over 12 s
   at 1600x900 for the composed placement, and up to 39 px for rolled poses (a heeled or tilted ship swings the wall further). A composition judged
   at one instant is judged with this much in hand. */
const SWAY = 40;
/* The clearance asked for by default. 40 px on a wide screen. 12 px in portrait, where the band behind the colour picker is the only room between
   the text: asking 20-40 px there (with the sway on top) leaves no band, and the fit lays the wall flat (0-3% of the hero, measured at 390x844),
   while 12 keeps a wall across a quarter of the hero that, over 6 s of sway, comes no nearer the text than 27 px. */
const MARGIN = () => innerHeight > innerWidth ? 12 : 40;

/* the anchor moved so the sea slides x lab units along the screen's right and y along the view's forward, both flattened onto the sea
   (e: the lab -> world rotation's elements, column-major; the layer's camera looks down world -z with +x to its right) */
function slideAnchor(e, x, y) {
    const rx = e[0], rz = e[6], nr = Math.hypot(rx, rz) || 1, fx = -e[2], fz = -e[8], nf = Math.hypot(fx, fz) || 1;
    return [LAB_S[0] - rx / nr * x - fx / nf * y, LAB_S[1] - rz / nr * x - fz / nf * y];
}

/* the headline, the line under it and the button, each as its own box in CSS pixels, read from the page so they follow the text at any width.
   Separately, not as one box: on a phone the three stack down the whole screen with the colour picker between them, and the gap behind the
   picker is where the wall can go; on a desktop the gaps between them are narrower than two clearances, so nothing passes between anyway. */
const TEXT_SEL = '.hero-left h1, .hero-subhead, .hero-content .primary-btn';
function textBoxes() {
    const out = [];
    for (const e of document.querySelectorAll(TEXT_SEL)) { const q = e.getBoundingClientRect(); if (q.width && q.height) out.push([q.left, q.top, q.right, q.bottom]); }
    return out.length ? out : null;
}

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const smax2 = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h); };

/* The wall as the shader builds it (runOf + deform, without the swell's few centimetres), sampled on a grid of (distance up the fold, position
   along it), each node projected through the page's camera and weighed as the fragment shader weighs the solid sheet: risen enough, not past
   the lip, not dissolved by distance or by the lens, not faded into the page's ground. Crest lines and dots on the flat sea are not the wall
   and are not counted. Returns the nodes (for the overlay) and the verdict against the text boxes: how much of the text the solid wall covers,
   how far its nearest solid part is from any of them (px, negative when it is over one), and how much of the hero it fills outside them. */
function measureWall({ o, x, pose, camera, rect, boxes, coarse = false }) {
    const R_ = Math.PI / 180, ax = o.axis * R_, dx = Math.cos(ax), dz = Math.sin(ax);
    const M = pose.M, k = pose.k, S = pose.S, at = pose.at;
    // the camera in the lab's space, and its forward, as place() computes them
    const cx = pose.cam[0] - at[0], cy = pose.cam[1] - at[1], cz = pose.cam[2] - at[2];
    const camL = [(M[0] * cx + M[1] * cy + M[2] * cz) / k + S[0], (M[3] * cx + M[4] * cy + M[5] * cz) / k, (M[6] * cx + M[7] * cy + M[8] * cz) / k + S[1]];
    const fwdL = [-M[2], -M[5], -M[8]];
    const V = camera.matrixWorldInverse.elements, P = camera.projectionMatrix.elements, PV = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let i = 0; i < 4; i++) v += P[i * 4 + r] * V[c * 4 + i]; PV[c * 4 + r] = v; }
    const fanAt = a => { const t = a / 12; return o.fanSoft < 0.001 ? clamp(t, -0.9, 3) : -smax2(-smax2(t, -0.9, o.fanSoft), -3, o.fanSoft); };
    const rise = a => { if (Math.abs(x.riseLen) < 0.01) return 1; const t = clamp((a - x.riseAt) / x.riseLen, 0, 1); return t * t * (3 - 2 * t); };
    const taper = a => Math.abs(x.taper) < 0.0001 ? 1 : -smax2(-smax2(1 + x.taper * a / 12, 0.15, 0.25), -1.8, 0.25);
    const dA = coarse ? 3 : 1.5, dS = coarse ? 1 : 0.5, A0 = -120, NA = Math.round(240 / dA) + 1, NS = Math.round(45 / dS) + 1;
    const sx = new Float32Array(NA * NS), sy = new Float32Array(NA * NS), w = new Float32Array(NA * NS);
    const phiMax = o.phiMax * R_, fold = pose.fold;
    for (let i = 0; i < NA; i++) {
        const across = A0 + i * dA, fl = fold * rise(across);
        const R = Math.max(0.5, o.R * (1 + o.fan * fanAt(across))) / Math.max(fl, 1e-4), pm = phiMax * fl * taper(across);
        const alongLine = o.x0 + o.bend * across * across * 0.1 + x.bend3 * across * across * across * 0.004;
        for (let j = 0; j < NS; j++) {
            const s = j * dS, n = i * NS + j;
            // the flat point of the sheet at this (s, across), then the curl
            const run = alongLine + s, px0 = dx * run - dz * across, pz0 = dz * run + dx * across;
            let phi = 0, beyond = 0, along = s, up = 0;
            if (s > 0 && fl > 0.001) {
                if (s < R * pm) { phi = s / R; along = R * Math.sin(phi); up = R * (1 - Math.cos(phi)); }
                else { phi = pm; beyond = s - R * pm; along = R * Math.sin(pm) + beyond * Math.cos(pm); up = R * (1 - Math.cos(pm)) + beyond * Math.sin(pm); }
            }
            const lx = px0 - dx * s + dx * along, ly = up, lz = pz0 - dz * s + dz * along;
            // weight: the fragment shader's solid sheet, then its fade into the page's ground
            const ddx = lx - camL[0], ddy = ly - camL[1], ddz = lz - camL[2], dist = Math.hypot(ddx, ddy, ddz);
            const nearK = sstep(o.nearA, Math.max(o.nearA + 0.01, o.nearB), ddx * fwdL[0] + ddy * fwdL[1] + ddz * fwdL[2]);
            const sol = sstep(o.solidA, Math.max(o.solidA + 0.01, o.solidB), phi / R_) * (1 - sstep(o.farA, Math.max(o.farA + 0.01, o.farB), dist)) * (1 - sstep(o.lipLen, o.lipLen + o.lipSoft, beyond)) * nearK * pose.vis * (o.solid === undefined ? 1 : o.solid);
            const edgeK = Math.max(sstep(o.fogA, o.farB, dist), sstep(o.lipLen - 1, o.lipLen + o.lipSoft, beyond), 1 - nearK);
            w[n] = sol * (1 - edgeK);
            // lab -> world -> clip -> CSS pixels
            const vx = (lx - S[0]) * k, vy = ly * k, vz = (lz - S[1]) * k;
            const wx = at[0] + M[0] * vx + M[3] * vy + M[6] * vz, wy = at[1] + M[1] * vx + M[4] * vy + M[7] * vz, wz = at[2] + M[2] * vx + M[5] * vy + M[8] * vz;
            const cw = PV[3] * wx + PV[7] * wy + PV[11] * wz + PV[15];
            if (cw <= 1e-4) { w[n] = 0; sx[n] = sy[n] = NaN; continue; }
            sx[n] = rect.left + ((PV[0] * wx + PV[4] * wy + PV[8] * wz + PV[12]) / cw * 0.5 + 0.5) * rect.width;
            sy[n] = rect.top + (0.5 - (PV[1] * wx + PV[5] * wy + PV[9] * wz + PV[13]) / cw * 0.5) * rect.height;
        }
    }
    // the verdict. Solid quads (each as two triangles) are rasterised twice: onto the text box, for how much of the text the wall covers, and onto
    // the whole screen, for how much of the hero the wall fills outside the text (its presence — what "clear of the text" must not give away).
    const SOLID = 0.2;
    const grid = (x0, y0, x1, y1, cell) => ({ x0, y0, cell, cols: Math.max(1, Math.ceil((x1 - x0) / cell)), rows: Math.max(1, Math.ceil((y1 - y0) / cell)), get cells() { return this._c || (this._c = new Uint8Array(this.cols * this.rows)); } });
    const texts = boxes.map(([l, t, r, b]) => grid(l, t, r, b, 8)), screen = grid(rect.left, rect.top, rect.left + rect.width, rect.top + rect.height, 24);
    const inText = (px, py) => boxes.some(([l, t, r, b]) => px > l && px < r && py > t && py < b);
    const tri = (G, ax_, ay, bx, by, cx_, cy_) => {
        const X1 = G.x0 + G.cols * G.cell, Y1 = G.y0 + G.rows * G.cell;
        const minX = Math.max(G.x0, Math.min(ax_, bx, cx_)), maxX = Math.min(X1, Math.max(ax_, bx, cx_)), minY = Math.max(G.y0, Math.min(ay, by, cy_)), maxY = Math.min(Y1, Math.max(ay, by, cy_));
        if (!(minX <= maxX && minY <= maxY)) return;
        const area = (bx - ax_) * (cy_ - ay) - (by - ay) * (cx_ - ax_); if (Math.abs(area) < 1e-6) return;
        const cells = G.cells;
        for (let gy = Math.floor((minY - G.y0) / G.cell); gy <= Math.min(G.rows - 1, Math.floor((maxY - G.y0) / G.cell)); gy++)
            for (let gx = Math.floor((minX - G.x0) / G.cell); gx <= Math.min(G.cols - 1, Math.floor((maxX - G.x0) / G.cell)); gx++) {
                const px = G.x0 + (gx + 0.5) * G.cell, py = G.y0 + (gy + 0.5) * G.cell;
                const w0 = ((bx - px) * (cy_ - py) - (by - py) * (cx_ - px)) / area, w1 = ((cx_ - px) * (ay - py) - (cy_ - py) * (ax_ - px)) / area;
                if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) cells[gy * G.cols + gx] = 1;
            }
    };
    let nearest = Infinity;
    for (let i = 0; i < NA; i++) for (let j = 0; j < NS; j++) {
        const n = i * NS + j;
        if (w[n] > SOLID && sx[n] === sx[n]) for (const [bl, bt, br, bb] of boxes) { const ddx = Math.max(bl - sx[n], 0, sx[n] - br), ddy = Math.max(bt - sy[n], 0, sy[n] - bb); nearest = Math.min(nearest, Math.hypot(ddx, ddy)); }
        if (i + 1 < NA && j + 1 < NS) {
            const a_ = n, b_ = n + NS, c_ = n + 1, d_ = n + NS + 1;
            if (w[a_] > SOLID && w[b_] > SOLID && w[c_] > SOLID && w[d_] > SOLID)
                for (const G of [...texts, screen]) { tri(G, sx[a_], sy[a_], sx[b_], sy[b_], sx[c_], sy[c_]); tri(G, sx[b_], sy[b_], sx[d_], sy[d_], sx[c_], sy[c_]); }
        }
    }
    const sum = a => { let c = 0; for (const v of a) c += v; return c; };
    const overlap = texts.reduce((a, G) => a + sum(G.cells), 0) / texts.reduce((a, G) => a + G.cells.length, 0);   // the share of all the text's cells
    // presence: the share of the screen outside the text box that the solid wall fills
    let outside = 0, filled = 0;
    for (let gy = 0; gy < screen.rows; gy++) for (let gx = 0; gx < screen.cols; gx++) {
        const px = screen.x0 + (gx + 0.5) * screen.cell, py = screen.y0 + (gy + 0.5) * screen.cell;
        if (inText(px, py)) continue;
        outside++; filled += screen.cells[gy * screen.cols + gx];
    }
    return { overlap, clearance: overlap > 0 ? -overlap * 100 : nearest, presence: outside ? filled / outside : 0, sx, sy, w, NA, NS };
}

/* ── the sheet's mesh: the module's grid rebuilt finer (or coarser) without a reload ───────────────────────────────────────────────────────── */

function setMesh(THREE, fold, seg) {
    if (!THREE || !fold.sheet) return;
    const g = new THREE.PlaneGeometry(2, 2, seg, seg), pos = g.attributes.position;
    const U0 = 0.45, LIN = 100, C = (260 - LIN) / Math.pow(1 - U0, 3);   // as voyage-fold.js's sheetGeometry: fine in the middle, growing out to the horizon
    const warp = u => { const a = Math.abs(u), s = Math.sign(u); return s * (a <= U0 ? LIN * a : LIN * a + C * Math.pow(a - U0, 3)); };
    for (let i = 0; i < pos.count; i++) pos.setXY(i, warp(pos.getX(i)), warp(pos.getY(i)));
    g.rotateX(-Math.PI / 2); g.computeBoundingSphere();
    const old = fold.sheet.geometry; fold.sheet.geometry = g; old.dispose();
}

/* ── the panel ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

function buildPanel({ fold, U, stage, clock, THREE, stored, defaults, layer }) {
    const el = document.createElement('div'); el.id = 'fold-lab';
    el.innerHTML = `<style>
        #fold-lab { position: fixed; right: 12px; top: 12px; z-index: 100000; width: 336px; max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
            padding: 10px 12px; background: rgba(10,12,16,.92); backdrop-filter: blur(10px); color: #e8ecf1; border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
            font: 12px/1.4 ui-monospace, Menlo, monospace; text-align: left; }
        #fold-lab.hid { display: none; }
        #fold-lab-tab { position: fixed; right: 12px; bottom: 12px; left: auto; top: auto; z-index: 100001; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2);
            background: rgba(10,12,16,.9); backdrop-filter: blur(10px); color: #cfd6df; font: 12px/1.2 ui-monospace, Menlo, monospace; cursor: pointer;
            position: fixed; margin: 0; width: auto; height: auto; min-width: 0; text-transform: none; letter-spacing: 0; box-shadow: none; transform: none; }
        #fold-lab-tab:hover { color: #7fd0ff; border-color: #4faad1; }
        #fold-lab h4 { margin: 0 0 6px; font: inherit; letter-spacing: .08em; text-transform: uppercase; color: #9aa4b2; }
        #fold-lab details { border-top: 1px solid rgba(255,255,255,.08); margin-top: 6px; }
        #fold-lab summary { cursor: pointer; padding: 5px 0; color: #cfd6df; letter-spacing: .04em; }
        #fold-lab .row { display: grid; grid-template-columns: 1fr 66px 62px; gap: 6px; align-items: center; margin: 2px 0; }
        #fold-lab .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b9c2cd; }
        #fold-lab .row.set span { color: #7fd0ff; }
        #fold-lab input[type=range] { width: 100%; min-width: 0; accent-color: #4faad1; }
        #fold-lab input[type=number], #fold-lab input[type=text] { width: 100%; box-sizing: border-box; background: rgba(0,0,0,.35); color: #e8ecf1; border: 1px solid rgba(255,255,255,.15);
            border-radius: 4px; font: inherit; padding: 1px 4px; text-align: right; }
        #fold-lab input[type=text] { text-align: left; margin: 0 0 6px; }
        #fold-lab button { position: static; display: inline-block; margin: 0; width: auto; height: auto; min-width: 0; line-height: 1.3; text-transform: none; letter-spacing: 0;
            box-shadow: none; transform: none; font: inherit; background: none; color: inherit; border: 1px solid rgba(255,255,255,.25); border-radius: 6px; padding: 3px 7px; cursor: pointer; }
        #fold-lab button.on { background: rgba(79,170,209,.25); border-color: #4faad1; }
        #fold-lab .btns { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 2px; align-items: center; }
        #fold-lab .btns small { color: #9aa4b2; }
        #fold-lab .chip { display: inline-flex; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; overflow: hidden; }
        #fold-lab .chip button { border: 0; border-radius: 0; padding: 3px 6px; }
        #fold-lab .chip button + button { border-left: 1px solid rgba(255,255,255,.2); padding: 3px 5px; color: #9aa4b2; }
        #fold-lab summary button { float: right; padding: 0 5px; line-height: 1.2; border-color: rgba(255,255,255,.15); color: #9aa4b2; }
        #fold-lab summary button:hover { color: #7fd0ff; border-color: #4faad1; }
        #fold-lab input[type=range].amt { width: 64px; flex: none; }
        #fold-lab .hud { margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,.08); color: #9aa4b2; white-space: pre-line; }
        #fold-lab .hud b { color: #e8ecf1; font-weight: 400; }
        #fold-lab .warn { color: #ffb36b; }
        #fold-lab textarea { width: 100%; box-sizing: border-box; height: 64px; margin-top: 6px; background: rgba(0,0,0,.35); color: #cfd6df; border: 1px solid rgba(255,255,255,.12);
            border-radius: 6px; font: 11px/1.35 ui-monospace, Menlo, monospace; padding: 5px; }
    </style>
    <h4>hero sea · waves<button data-close title="hide the panel (H)" style="float:right;padding:0 6px;line-height:1.2">×</button></h4>
    <div class="btns" data-stage></div>
    <div class="btns" data-roll></div>
    <div class="btns" data-shelf></div>
    <input type="text" data-filter placeholder="filter (amp, dir, chop …)">
    <div data-groups></div>
    <div class="btns" data-tools></div>
    <textarea data-out readonly placeholder="Copy puts the changed values here and on the clipboard"></textarea>
    <div class="hud" data-hud></div>`;
    document.body.appendChild(el);

    // one switch for the panel, and a pill that stays on screen when it is closed (H does the same)
    const tab = document.createElement('button'); tab.id = 'fold-lab-tab'; tab.type = 'button'; tab.textContent = '× hide'; document.body.appendChild(tab);
    function setHidden(v) { el.classList.toggle('hid', !!v); stage.hidden = !!v; tab.textContent = v ? '≈ waves' : '× hide'; if (rowsReady) save(); }
    tab.onclick = () => setHidden(!el.classList.contains('hid'));
    el.querySelector('[data-close]').onclick = () => setHidden(true);
    let rowsReady = false;

    /* ── the hero ship. Its framing (x, y, hull length, how much it answers the swell, the sea's size against it) are work-spine's own
       data-attributes, which the route's first waypoint reads; its pose there (heading, tilt, heel) is that waypoint itself, so those go through
       the same route override the ?route=1 editor writes — one source of truth for both panels. Nothing here is the other module's file: it is
       all through routeApi, which work-spine hands out. */
    const rapi = layer.routeApi;
    const SHIP = { x: ['p', 'boatX'], y: ['p', 'boatY'], size: ['p', 'boatSize'], ride: ['p', 'foldRide'], seaScale: ['p', 'foldScale'],
        turn: ['w', 'turn'], tilt: ['w', 'tilt'], heel: ['w', 'heel'] };
    const FRAMING = new Set(['x', 'y', 'size']);
    let wpTimer = 0, wpPending = null;   // these three are baked into waypoint 0 when the route is built, so the route is rebuilt after them
    function getShip(k) {
        const [kind, name] = SHIP[k] || [];
        if (kind === 'p') return rapi.params()[name];
        if (wpPending && name in wpPending) return wpPending[name];   // a pose edit is still on its way to the route: read what was asked for
        const l = rapi.tables()[rapi.orientation()];
        return l && l[0] ? l[0][name] : 0;
    }
    function setShip(k, v) {
        const [kind, name] = SHIP[k] || [];
        if (kind === 'p') { rapi.setParam(name, v); if (FRAMING.has(k)) rapi.rebuild(); return; }
        // the waypoint: collected and written once the slider settles, since each write rebuilds the whole route
        wpPending = Object.assign(wpPending || {}, { [name]: v });
        clearTimeout(wpTimer);
        wpTimer = setTimeout(() => {
            const o = rapi.orientation(), list = rapi.tables()[o].map(w => Object.assign({}, w));
            if (list[0]) { Object.assign(list[0], wpPending); rapi.set(o, list); }
            wpPending = null;
            for (const key in SHIP) if (rows['s:' + key]) mark('s:' + key);
        }, 80);
    }

    const rows = {};   // key -> { row, range, num }
    const groupsEl = el.querySelector('[data-groups]');
    for (const [title, list] of GROUPS) {
        const d = document.createElement('details'); d.open = /swell · |cross/.test(title);
        d.innerHTML = `<summary>${title}<button data-die title="re-roll only this group">⟳</button></summary>`;
        d.querySelector('[data-die]').onclick = e => { e.preventDefault(); e.stopPropagation(); rollKeys(list.map(([k]) => k), amount()); };
        for (const [key, label, min, max, step] of list) {
            const row = document.createElement('div'); row.className = 'row'; row.dataset.k = key; row.dataset.q = (key + ' ' + label + ' ' + title).toLowerCase();
            row.innerHTML = `<span title="${label}">${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><input type="number" min="${min}" max="${max}" step="${step}">`;
            const [range, num] = row.querySelectorAll('input');
            const v = get(key); range.value = v; num.value = fmt(v, step);
            const on = x => { set(key, clamp(+x, min, max)); const w = get(key); range.value = w; num.value = fmt(w, step); mark(key); save(); };
            range.oninput = () => on(range.value); num.onchange = () => on(num.value);
            rows[key] = { row, range, num, step }; d.appendChild(row); mark(key);
        }
        groupsEl.appendChild(d);
    }

    // ── the stage row: hold the sheet up, slow the water down, pause it
    const stageEl = el.querySelector('[data-stage]');
    stageEl.innerHTML = `<button data-s="hold" title="pin the sheet risen so it stays on screen while you tune (otherwise the scroll lays it down)">hold the fold</button>
        <button data-s="pause" title="freeze the water (P)">pause</button>
        <button data-s="slow" title="quarter speed">slow</button>
        <button data-s="nofade" title="the water stops dissolving: no fade into the page at distance, none at the lip, none near the lens — the whole sheet, edge to edge">no fade</button>
        <label style="display:flex;align-items:center;gap:5px;color:#9aa4b2">fold<input type="range" min="0" max="1" step="0.01" data-s="foldamt" style="width:70px"></label>
        <button data-s="comp" title="draw the solid wall as it lands on screen, and the text it has to leave room for (C)">composition</button>
        <button data-s="fit" title="move and shape the wall, as little as possible, until it clears the text by the clearance set in the wall group (F)">fit to text</button>`;
    const b = k => stageEl.querySelector(`[data-s="${k}"]`);
    b('foldamt').value = stage.fold;
    b('hold').onclick = () => { stage.hold = !stage.hold; syncStage(); save(); };
    b('pause').onclick = () => { stage.timeScale = stage.timeScale === 0 ? 1 : 0; syncStage(); save(); };
    b('slow').onclick = () => { stage.timeScale = stage.timeScale === 0.25 ? 1 : 0.25; syncStage(); save(); };
    b('foldamt').oninput = e => { stage.fold = +e.target.value; stage.hold = true; syncStage(); save(); };
    b('comp').onclick = () => { stage.compose.show = !stage.compose.show; syncStage(); drawComposition(); save(); };
    b('fit').onclick = () => { fitToText(); flash(b('fit')); };
    // the sheet's own dissolves — into the page's ground at distance, along the lip, and in front of the lens — pushed out of reach and put back
    const NOFADE = { farA: 300, farB: 400, fogA: 300, lipLen: 40, lipSoft: 30, nearA: 0, nearB: 0.1, farDark: 0 };
    let faded = null;
    b('nofade').onclick = () => {
        if (faded) { fold.set(faded); faded = null; }
        else { faded = {}; for (const k in NOFADE) faded[k] = fold.opts[k]; fold.set(NOFADE); }
        refresh(); syncStage(); save();
    };
    function syncStage() {
        b('hold').classList.toggle('on', stage.hold);
        b('pause').classList.toggle('on', stage.timeScale === 0);
        b('slow').classList.toggle('on', stage.timeScale === 0.25);
        b('nofade').classList.toggle('on', !!faded);
        b('comp').classList.toggle('on', !!stage.compose.show);
        b('foldamt').value = stage.fold;
    }
    syncStage();

    // ── the dice: a roll lands somewhere inside ROLL's ranges for every key of the scopes that are on, then guard() pulls the result back onto
    // water that can exist. "amount" mixes the roll with what is on screen now: at 0.2 it nudges, at 1 it starts over.
    const rollEl = el.querySelector('[data-roll]');
    rollEl.innerHTML = `<button data-r="roll" title="roll the scopes that are on (R)">roll</button>
        <button data-r="auto" title="keep rolling, every few seconds, until something is worth keeping">auto</button>
        <button data-r="undo" title="back to the state before the last roll (Z)">←</button><button data-r="redo" title="forward again (Y)">→</button>
        <button data-r="keep" title="put this look on the shelf (K)">keep</button>
        <label style="display:flex;align-items:center;gap:4px;color:#9aa4b2">amount<input type="range" class="amt" min="0.05" max="1" step="0.05" data-r="amt"></label>
        <small data-seedbox>seed <b data-seed>—</b></small>`
        + '<div style="flex-basis:100%;height:0"></div>' + SCOPES.map(([id]) => `<button data-scope="${id}">${id}</button>`).join('');
    const rb = k => rollEl.querySelector(`[data-r="${k}"]`);
    const scopes = new Set(stored.scopes || ['waves']);
    rb('amt').value = stored.amount || 1;
    const amount = () => +rb('amt').value;
    rb('amt').oninput = save;

    const scopeOf = title => (SCOPES.find(([, pre]) => pre.some(p => title.startsWith(p))) || ['waves'])[0];
    const keysInScope = () => GROUPS.filter(([t]) => scopes.has(scopeOf(t))).flatMap(([, list]) => list.map(([k]) => k));

    let seed = 0, rnd = dice(1), guardTimer = 0;
    /* what a roll has to leave behind: none of the text under the solid wall, the wanted clearance round it, and a wall worth the name (a fifth of
       the hero outside the text, at least) — a roll that clears the text by losing the wall is not a composition either */
    const noSolid = () => 'solid' in fold.opts && fold.opts.solid < 0.005;   // the sheet is lines only: there is no wall to keep off the text
    const composed = c => !!c && (noSolid() || (c.overlap === 0 && c.clearance >= stage.compose.margin + SWAY && c.presence >= 0.2));
    function rollKeys(keys, amt, useSeed) {
        seed = useSeed !== undefined ? useSeed >>> 0 : (Math.random() * 4294967295) >>> 0;
        rnd = dice(seed);
        push();
        const before = stateNow();
        for (const k of keys) {
            const r = ROLL[k]; if (!r) continue;                       // not in ROLL = never rolled
            if (faded && /^(farA|farB|fogA|lipLen|lipSoft|nearA|nearB|farDark)$/.test(k)) continue;   // "no fade" is on: leave the dissolves where it put them
            let v = get(k) + (r[0] + rnd() * (r[1] - r[0]) - get(k)) * amt;
            if (INT.has(k)) v = Math.round(v);
            set(k, v);
        }
        guard();
        // the roll brought the wall too close to the text: fit it clear, and if even that fails, the wall's shape and place go back to before the roll.
        // The sea is anchored to the ship, and a ship that was rolled glides to its new pose over about a second (the route's lag): measured at once,
        // the wall would be judged where the ship was. So when the ship moved, the check waits for it to arrive.
        const shipMoved = keys.some(k => k.startsWith('s:') && ROLL[k]);
        const SHAPE = new Set(GROUPS.filter(([t]) => /^(wall|fold|ship|dissolve) ·/.test(t)).flatMap(([, list]) => list.map(([k]) => k)));
        const shapeRolled = keys.some(k => ROLL[k] && SHAPE.has(k));   // waves, surface and light cannot move the wall's silhouette: nothing to judge
        clearTimeout(guardTimer);
        const revert = () => { for (const [t, list] of GROUPS) if (/^(wall|fold|ship|dissolve) ·/.test(t)) for (const [k] of list) if (k in before) set(k, before[k]); };
        const settle = () => { refresh(); hist[hi] = stateNow(); save(); };   // the roll's history entry is already written: it takes the corrected wall
        const check = later => {
            const comp = measureNow();   // the fine grid: the coarse one the fit searches with reads a little generous near the text
            if (comp && !composed(comp)) {
                if (!composed(fitToText(true, 0.3))) revert();   // no fit gets there: the wall, its dissolves and the ship go back to before the roll (the waves keep it)
                if (later) settle(); else refresh();
            }
            watch(0);
        };
        /* the sway differs from pose to pose (a heeled ship swings the wall further than SWAY allows for), so the result is watched for 2 s of the real
           thing; if the wall comes closer than the clearance, it is fitted again with the shortfall added, twice at most, and then reverted */
        const watch = round => {
            let lo = Infinity, cov = 0, n = 0;
            const tick = () => {
                const r = measureNow(); if (r) { if (r.overlap > 0) cov = Math.max(cov, r.overlap); else lo = Math.min(lo, r.clearance); }
                if (++n < 10) { guardTimer = setTimeout(tick, 200); return; }
                if (cov === 0 && lo >= stage.compose.margin) return;
                const short = cov > 0 ? stage.compose.margin + 60 : stage.compose.margin - lo;
                if (round < 2) { const f = fitToText(true, 0.3, short + 20 * (round + 1)); if (!composed(f)) revert(); settle(); watch(round + 1); }
                else { revert(); settle(); }
            };
            guardTimer = setTimeout(tick, 200);
        };
        if (!shapeRolled) {} else if (shipMoved) guardTimer = setTimeout(() => check(true), 1500); else check(false);
        refresh(); push(); syncRoll(); save();
    }

    /* the guardrails. Everything here is a look that is not worth showing Felix: water that breaks, a swell that strobes, two swells lying on top
       of each other, a wall that climbs out of frame, a sea with nothing drawn on it. The roll is free inside these. */
    function guard() {
        const rad = Math.PI / 180, g = get, st = (k, v) => set(k, INT.has(k) ? Math.round(v) : +v.toFixed(4));
        // the period: under 3 s the swell flickers, over 20 s it looks frozen
        const T = g('lambda') / Math.max(0.01, g('speed'));
        if (T < 3 || T > 20) st('speed', g('lambda') / clamp(T, 3, 20));
        // one swell leads: the others are answers to it, and the chop is texture on top rather than noise of its own
        st('amp2', Math.min(g('amp2'), 0.6 * g('amp')));
        st('x:amp3', Math.min(g('x:amp3'), 0.5 * g('amp')));
        st('x:chop', Math.min(g('x:chop'), 0.25 * g('amp')));
        // steepness: real swell runs 1:20 to 1:7 and breaks past that; below 1:40 the sea reads as a flat sheet
        const H = () => 2 * (g('amp') + g('amp2') + g('x:amp3') + g('x:chop')) * g('x:height');
        const steep = H() / g('lambda');
        if (steep > 1 / 8 || steep < 1 / 40) {
            const want = clamp(steep, 1 / 40, 1 / 8) === steep ? steep : (steep > 1 / 8 ? 1 / 8 : 1 / 30), f = want / Math.max(steep, 1e-5);
            for (const k of ['amp', 'amp2', 'x:amp3', 'x:chop']) st(k, g(k) * f);
        }
        // the swells have to cross: parallel ones only beat against each other, square ones read as a printed grid
        const main = g('axis') + g('x:swellRot'), s2 = side(g('dir2') - main, 20, 80);
        st('dir2', main + s2);
        st('x:dir3', main - Math.sign(s2 || 1) * Math.abs(side(g('x:dir3') - main, 30, 90)));
        // the wall: R × phiMax is the arc it climbs. Under 6 lab units it does not reach the top of the hero, over 14 it swallows the page
        const arc = g('R') * g('phiMax') * rad;
        if (arc < 6 || arc > 14) st('R', clamp(arc, 6, 14) / (g('phiMax') * rad));
        // the dissolves in order, or the sheet ends on a hard line (or never begins)
        st('solidB', Math.max(g('solidB'), g('solidA') + 8));
        st('farB', Math.max(g('farB'), g('farA') + 40));
        st('fogA', Math.min(g('fogA'), g('farA') - 10));
        st('nearB', Math.max(g('nearB'), g('nearA') + 2));
        // something has to be drawn on the flat sea
        if (g('lineGain') < 0.15 && g('dotGain') < 0.15) st('lineGain', 0.4);
        st('sat', Math.max(g('sat'), 0.5));   // below this the picked colour stops being the picked colour
        // a wall that starts part-way along its length rises over at least 10 lab units: shorter reads as a step cut into the water, not a wave building
        if (g('x:riseLen') !== 0 && Math.abs(g('x:riseLen')) < 10) st('x:riseLen', 10 * Math.sign(g('x:riseLen')));
    }
    /* fold an angle into ±[lo, hi] degrees, keeping the side it was on */
    function side(d, lo, hi) { d = ((d % 360) + 540) % 360 - 180; const sgn = d < 0 ? -1 : 1, a = clamp(Math.abs(d), lo, hi); return sgn * a; }

    // ── history, so a good roll is never one click from gone
    const hist = []; let hi = -1;
    const stateNow = () => { const o = {}; for (const k in rows) o[k] = get(k); return o; };
    function push() { hist.length = hi + 1; hist.push(stateNow()); if (hist.length > 60) hist.shift(); hi = hist.length - 1; }
    function step(n) { const i = hi + n; if (i < 0 || i >= hist.length) return; hi = i; applyState(hist[i]); }
    function applyState(st) { for (const k in rows) if (k in st) set(k, st[k]); refresh(); save(); }
    /* a stored look holds only what was changed; everything else goes back to what the module ships */
    function applyDelta(d) { const st = {}; for (const k in rows) st[k] = k in d ? d[k] : defaultOf(k); applyState(st); }
    function defaultOf(k) { return k === 'mesh' ? defaults.__seg : k.startsWith('x:') && !(k in defaults) ? EXT_DEFAULTS[k.slice(2)] : defaults[k]; }

    // ── the wall's composition: the group's keys as they stand, and the composed placement for this orientation
    function wallNow() { const o = {}; for (const [t, list] of GROUPS) if (t.startsWith('wall ·')) for (const [k] of list) if (k !== 'c:margin' && changed(k)) o[k] = get(k); return o; }
    function compose() {
        if (noSolid()) return true;   // nothing to place: the wall is not drawn
        if (innerHeight > innerWidth) {   // portrait: fit to the layout on screen, once there is a frame to measure
            if (!measureNow(null, true)) return false;
            push(); fitToText(true, 0.2); push(); save(); return true;
        }
        push();
        for (const [t, list] of GROUPS) if (t.startsWith('wall ·')) for (const [k] of list) if (k !== 'c:margin') set(k, k in COMPOSED ? COMPOSED[k] : defaultOf(k));
        refresh(); push(); save();
        return true;
    }

    // ── the shelf: looks worth coming back to
    let shelf = stored.shelf || [];
    const shelfEl = el.querySelector('[data-shelf]');
    function drawShelf() {
        shelfEl.innerHTML = shelf.length ? '<small>shelf</small>' + shelf.map((L, i) =>
            `<span class="chip"><button data-look="${i}" title="${esc(Object.entries(L.s).slice(0, 8).map(([k, v]) => k + ' ' + round(v)).join(', '))}">${esc(L.name)}</button><button data-del="${i}" title="forget it">×</button></span>`).join('') : '';
    }
    shelfEl.onclick = e => {
        const a = e.target.dataset.look, d = e.target.dataset.del;
        if (a !== undefined) { push(); applyDelta(shelf[+a].s); push(); }
        else if (d !== undefined) { shelf.splice(+d, 1); drawShelf(); save(); }
    };
    function keep() { shelf.push({ name: seed ? '#' + seed.toString(36) : 'look ' + (shelf.length + 1), s: snapshot() }); drawShelf(); save(); }

    let autoTimer = 0;
    rollEl.onclick = e => {
        const r = e.target.dataset.r, sc = e.target.dataset.scope;
        if (sc) { scopes.has(sc) ? scopes.delete(sc) : scopes.add(sc); syncRoll(); save(); }
        else if (r === 'roll') rollKeys(keysInScope(), amount());
        else if (r === 'auto') { autoTimer ? (clearInterval(autoTimer), autoTimer = 0) : (autoTimer = setInterval(() => rollKeys(keysInScope(), amount()), 4000)); syncRoll(); }
        else if (r === 'undo') step(-1);
        else if (r === 'redo') step(1);
        else if (r === 'keep') { keep(); flash(e.target); }
    };
    function syncRoll() {
        for (const [id] of SCOPES) rollEl.querySelector(`[data-scope="${id}"]`).classList.toggle('on', scopes.has(id));
        rb('auto').classList.toggle('on', !!autoTimer);
        rollEl.querySelector('[data-seed]').textContent = seed ? '#' + seed.toString(36) : '—';
    }
    syncRoll(); drawShelf();

    // ── tools
    const tools = el.querySelector('[data-tools]');
    tools.innerHTML = `<button data-t="copy">Copy for voyage-fold.js</button><button data-t="A">A</button><button data-t="B">B</button><button data-t="swap" title="switch between the two snapshots">A/B</button>
        <button data-t="reset" title="back to the module's own numbers — the wall as it ships today, across the headline">Reset</button><button data-t="hide" title="H — the pill at the bottom right brings it back">Hide</button>`
        + `<button data-t="composed" title="the wall placed round the text: the measured desktop composition in landscape, a fit to this layout in portrait">composed</button>`
        + Object.keys(PRESETS).map(p => `<button data-p="${p}">${p}</button>`).join('');
    const out = el.querySelector('[data-out]');
    const snaps = { A: stored.A || null, B: stored.B || null }; let which = 'A';
    tools.onclick = e => {
        const t = e.target.dataset.t, p = e.target.dataset.p;
        if (p) { push(); applyDelta({ ...wallNow(), ...PRESETS[p] }); push(); }
        else if (t === 'composed') compose();
        else if (t === 'copy') { const s = text(); out.value = s; navigator.clipboard && navigator.clipboard.writeText(s).catch(() => {}); }
        else if (t === 'A' || t === 'B') { snaps[t] = snapshot(); which = t; save(); flash(e.target); }
        else if (t === 'swap') { which = which === 'A' ? 'B' : 'A'; if (snaps[which]) applyDelta(snaps[which]); }
        else if (t === 'reset') { push(); applyDelta({}); seed = 0; syncRoll(); push(); }
        else if (t === 'hide') setHidden(true);
    };
    const flash = node => { node.classList.add('on'); setTimeout(() => node.classList.remove('on'), 400); };

    el.querySelector('[data-filter]').oninput = e => {
        const q = e.target.value.trim().toLowerCase();
        for (const k in rows) rows[k].row.style.display = !q || rows[k].row.dataset.q.includes(q) ? '' : 'none';
        for (const d of el.querySelectorAll('details')) { const any = [...d.querySelectorAll('.row')].some(r => r.style.display !== 'none'); d.style.display = any ? '' : 'none'; if (q && any) d.open = true; }
    };

    addEventListener('keydown', e => {
        if (e.target.matches('input, textarea')) return;
        if (e.key === 'h' || e.key === 'H') setHidden(!el.classList.contains('hid'));
        if (e.key === 'p' || e.key === 'P') { stage.timeScale = stage.timeScale === 0 ? 1 : 0; syncStage(); }
        if (e.key === 'r' || e.key === 'R') rollKeys(keysInScope(), amount());
        if (e.key === 'z' || e.key === 'Z') step(-1);
        if (e.key === 'y' || e.key === 'Y') step(1);
        if (e.key === 'k' || e.key === 'K') keep();
        if (e.key === 'c' || e.key === 'C') b('comp').click();
        if (e.key === 'f' || e.key === 'F') b('fit').click();
    });

    /* ── composition: the wall measured against the text, from the geometry (see measureWall) */
    const canvasEl = () => document.getElementById('ws-particles');
    function poseNow(over) {
        over = over || {};
        const p = clock.pose, cam = clock.camera, cv = canvasEl();
        if (!p || !cam || !cv || !p.at || !p.rotSea) return null;
        const x = Object.assign({}, EXT, over.x || {}), o = Object.assign({}, fold.opts, over.o || {});
        const m = THREE ? new THREE.Matrix3() : null; if (!m) return null;
        fold.rotation(p.rotSea, p.theta + x.seaTurn, m);
        const M = Array.from(m.elements);
        return { o, x, camera: cam, rect: cv.getBoundingClientRect(),
            pose: { M, k: p.k, S: slideAnchor(M, x.wallX, x.wallY), at: [p.at.x, p.at.y, p.at.z], cam: [p.cam.x, p.cam.y, p.cam.z], fold: p.fold, vis: Math.max(p.vis, 1e-3) } };
    }
    let lastComp = null;
    function measureNow(over, coarse) {
        const q = poseNow(over), boxes = textBoxes(); if (!q || !boxes) return null;
        return measureWall({ ...q, boxes, coarse });   // against the text itself: how much of it the wall covers, and how far the wall stays from it
    }

    // the overlay: the solid wall as it lands on screen (blue, red where it is inside the clearance), and the text with its clearance
    let overlay = null;
    function drawComposition() {
        if (!stage.compose.show) { if (overlay) overlay.style.display = 'none'; return; }
        if (!overlay) { overlay = document.createElement('canvas'); overlay.setAttribute('style', 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99998;pointer-events:none'); document.body.appendChild(overlay); }
        overlay.style.display = '';
        const dpr = devicePixelRatio || 1; overlay.width = innerWidth * dpr; overlay.height = innerHeight * dpr;
        const g = overlay.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
        const boxes = textBoxes(); if (!boxes || !lastComp) return;
        const m = stage.compose.margin, pads = boxes.map(b => [b[0] - m, b[1] - m, b[2] + m, b[3] + m]), { sx, sy, w, NA, NS } = lastComp;
        for (let i = 0; i + 1 < NA; i++) for (let j = 0; j + 1 < NS; j++) {
            const a = i * NS + j, bb = a + NS, c = a + 1, d = a + NS + 1;
            const wq = Math.min(w[a], w[bb], w[c], w[d]); if (wq <= 0.2) continue;
            const inside = [a, bb, c, d].some(n => pads.some(bx => sx[n] > bx[0] && sx[n] < bx[2] && sy[n] > bx[1] && sy[n] < bx[3]));
            g.fillStyle = inside ? 'rgba(255,90,70,.45)' : `rgba(90,190,255,${0.12 + 0.2 * wq})`;
            g.beginPath(); g.moveTo(sx[a], sy[a]); g.lineTo(sx[bb], sy[bb]); g.lineTo(sx[d], sy[d]); g.lineTo(sx[c], sy[c]); g.closePath(); g.fill();
        }
        g.setLineDash([5, 4]); g.lineWidth = 1;
        const bad = lastComp.overlap > 0 || (lastComp.clearance < m && !noSolid());
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i], bx = pads[i];
            g.strokeStyle = 'rgba(255,255,255,.55)'; g.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
            g.strokeStyle = bad ? 'rgba(255,120,90,.9)' : 'rgba(120,230,160,.9)'; g.strokeRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
        }
        const last = pads[pads.length - 1];
        g.setLineDash([]); g.font = '12px ui-monospace, Menlo, monospace'; g.fillStyle = bad ? 'rgba(255,120,90,.95)' : 'rgba(120,230,160,.95)';
        g.fillText(lastComp.overlap > 0 ? `the wall covers ${(lastComp.overlap * 100).toFixed(1)}% of the text` : lastComp.clearance === Infinity ? (noSolid() ? 'lines only: no wall to keep off the text' : 'no solid wall on screen') : `the wall clears the text by ${Math.round(lastComp.clearance)} px (wanted ${m})`, last[0], last[3] + 16);
    }
    const recent = [];   // [time, clearance or -overlap] over the last 10 s, so the readout shows the sway's worst case
    setInterval(() => {
        if (el.classList.contains('hid') && !stage.compose.show) return;
        lastComp = measureNow(); drawComposition();
        if (lastComp) { const now = performance.now(); recent.push([now, lastComp.overlap > 0 ? -lastComp.overlap : lastComp.clearance]); while (recent.length && now - recent[0][0] > 10000) recent.shift(); }
    }, 300);
    const swing = () => { if (recent.length < 4) return null; const v = recent.map(r => r[1]); return { min: Math.min(...v), max: Math.max(...v) }; };

    /* fit to text: shape and place the wall so it clears the text and still fills the hero. A coordinate descent over the wall's place (slide,
       turn, fold line) and its shape (crescent, S-bend, taper, where it starts rising), scored by, in order of weight:
         · how much of the text the solid wall covers,
         · how far short of the wanted clearance it stays (a pixel short outweighs a percent of the wall),
         · how much of the hero it gives up (its presence outside the text, against what it had when you pressed fit) — so hiding the wall edge-on
           in a corner is a bad answer, not a cheap one,
         · how far each control moved from where you started, turning the sea counted double (it changes the look the most).
       It starts from where you are and from a few reshaped variants (S-bent either way, rising from either side), and keeps the best. */
    const FIT = [['x:wallX', 1.5, -30, 30, 1], ['x:wallY', 1.5, -30, 30, 1], ['x:seaTurn', 5, -60, 60, 2], ['x0', 1.2, -10, 30, 1], ['bend', 0.04, -0.5, 0.5, 1],
        ['x:bend3', 0.03, -0.5, 0.5, 1], ['x:taper', 0.15, -1.5, 1.5, 1], ['x:riseAt', 6, -80, 80, 0.5], ['x:riseLen', 8, -80, 80, 0.5]];
    function fitToText(quiet, presFloor = 0, extra = 0) {
        if (noSolid()) { if (!quiet) console.info('fold lab: the sheet is lines only (solid 0) — there is no wall to fit'); return measureNow(); }
        const base = measureNow(null, true);
        if (!base) { if (!quiet) console.warn('fold lab: nothing to fit yet (the sea has not drawn a frame with the camera)'); return null; }
        const target = stage.compose.margin + SWAY + 10 + extra, pres0 = Math.max(base.presence, presFloor), start = FIT.map(([k]) => get(k));   // aimed past the clearance wanted by the sway, and 10 px more for the coarse grid it searches on
        const over = vals => { const x = {}, o = {}; FIT.forEach(([k], i) => { if (k.startsWith('x:')) x[k.slice(2)] = vals[i]; else o[k] = vals[i]; }); return { x, o }; };
        const score = vals => { const r = measureNow(over(vals), true); if (!r) return Infinity;
            const clear = r.overlap > 0 ? 0 : Math.min(r.clearance, 400);
            return r.overlap * 2e4 + Math.max(0, target - clear) * 40 + Math.max(0, pres0 - r.presence) * 3000
                + vals.reduce((sum, v, i) => sum + FIT[i][4] * ((v - start[i]) / FIT[i][1]) ** 2, 0); };
        const descend = from => {
            let cur = from.slice(), best = score(cur), steps = FIT.map(f => f[1] * 2);
            for (let it = 0; it < 60; it++) {
                let moved = false;
                for (let i = 0; i < FIT.length; i++) for (const dir of [1, -1]) {
                    const v = cur.slice(); v[i] = clamp(v[i] + dir * steps[i], FIT[i][2], FIT[i][3]);
                    if (FIT[i][0] === 'x:riseLen' && v[i] !== 0 && Math.abs(v[i]) < 10) v[i] = dir * 10 * (Math.sign(v[i]) === dir ? 1 : 0) || 0;   // a rise shorter than 10 is a step, as guard() has it: step over the gap
                    const sc = score(v); if (sc < best - 1e-6) { best = sc; cur = v; moved = true; }
                }
                if (!moved) { steps = steps.map(st => st / 2); if (steps.every((st, i) => st < FIT[i][1] / 8)) break; }
            }
            return { cur, best };
        };
        const idx = k => FIT.findIndex(f => f[0] === k), variant = patch => { const v = start.slice(); for (const k in patch) v[idx(k)] = patch[k]; return v; };
        const starts = [start, variant({ 'x:bend3': start[idx('x:bend3')] - 0.08 }), variant({ 'x:bend3': start[idx('x:bend3')] + 0.08 }),
            variant({ 'x:riseAt': -30, 'x:riseLen': 20 }), variant({ 'x:riseAt': 30, 'x:riseLen': -20 })];
        // in portrait the room is one band between the text blocks, and where it sits moves as the text reflows: start from slides spread up and
        // down the screen too, or the descent only ever looks near where the wall already is
        if (innerHeight > innerWidth) for (const y of [-14, -9, -5, 5, 9, 14]) for (const tp of [0, -0.3]) starts.push(variant({ 'x:wallY': y, 'x:taper': tp }));
        let win = null;
        for (const st of starts) { const r = descend(st); if (!win || r.best < win.best) win = r; }
        if (!quiet) push();
        FIT.forEach(([k], i) => set(k, +win.cur[i].toFixed(3)));
        refresh(); lastComp = measureNow(); drawComposition();
        if (!quiet) { push(); save(); }
        return lastComp;
    }

    // ── the readout: what the water actually measures, so "organic" can be checked and not only eyeballed
    const hud = el.querySelector('[data-hud]');
    setInterval(() => {
        if (el.classList.contains('hid')) return;
        const o = fold.opts, H = 2 * (o.amp + o.amp2 + EXT.amp3 + EXT.chop) * EXT.height;
        const T = o.speed > 0.001 ? o.lambda / (o.speed * (o.clock === undefined ? 1 : o.clock) * (stage.timeScale || 1e-9)) : Infinity, steep = H / o.lambda;
        const bad = steep > 1 / 7;
        hud.innerHTML = [
            `height <b>${H.toFixed(3)}</b> crest to trough · wavelength <b>${o.lambda.toFixed(2)}</b> · period <b>${T === Infinity ? '—' : T.toFixed(1) + ' s'}</b>`,
            `steepness <b class="${bad ? 'warn' : ''}">1 : ${(1 / Math.max(steep, 1e-4)).toFixed(0)}</b>${bad ? ' — steeper than water breaks at (1:7)' : ' · a real swell runs 1:20 to 1:7'}`,
            !lastComp ? 'text clearance <b>measuring…</b>' : lastComp.overlap > 0
                ? `text clearance <b class="warn">the wall covers ${(lastComp.overlap * 100).toFixed(1)}% of the text</b> — F fits it`
                : lastComp.clearance === Infinity ? (noSolid() ? `text clearance <b>—</b> the sheet is lines only (solid 0): nothing to keep off the text` : `text clearance <b class="warn">no solid wall on screen</b>`)
                : (sw => sw && sw.min < 0 ? `text clearance <b class="warn">${Math.round(lastComp.clearance)} px now, but the sway took the wall onto the text in the last 10 s</b>`
                    : `text clearance <b class="${(sw ? sw.min : lastComp.clearance) < stage.compose.margin ? 'warn' : ''}">${sw ? Math.round(sw.min) + '–' + Math.round(sw.max) : Math.round(lastComp.clearance)} px</b>${sw ? ' over the last 10 s' : ''} (wanted ${stage.compose.margin}) · wall fills <b>${Math.round(lastComp.presence * 100)}%</b> of the hero`)(swing()),
            `mesh <b>${stage.mesh || 'as built'}</b>${THREE ? '' : ' (three.js not reachable: mesh detail is off)'} · history <b>${hi + 1}/${hist.length}</b>${seed ? ' · roll <b>#' + seed.toString(36) + '</b>' : ''}`,
        ].join('\n');
    }, 250);

    // ── reading and writing one control
    function get(key) {
        if (key === 'mesh') return stage.mesh || (fold.sheet && fold.sheet.geometry.parameters ? fold.sheet.geometry.parameters.widthSegments : 440);
        if (key.startsWith('c:')) return stage.compose[key.slice(2)];
        if (key.startsWith('s:')) return getShip(key.slice(2));
        if (key.startsWith('x:')) return EXT[key.slice(2)];
        return fold.opts[key];
    }
    function set(key, v) {
        if (key === 'mesh') { if (v === get('mesh')) return; stage.mesh = v; setMesh(THREE, fold, v); return; }
        if (key.startsWith('c:')) { stage.compose[key.slice(2)] = v; return; }
        if (key.startsWith('s:')) return setShip(key.slice(2), v);
        if (key.startsWith('x:')) { EXT[key.slice(2)] = v; writeExt(U, fold.opts); return; }
        fold.set({ [key]: v });
    }
    function mark(key) { const r = rows[key]; if (r) r.row.classList.toggle('set', changed(key)); }
    function changed(key) {
        if (key === 'mesh') return !!stage.mesh;
        if (key.startsWith('x:')) return Math.abs(EXT[key.slice(2)] - EXT_DEFAULTS[key.slice(2)]) > 1e-9;
        return key in defaults && Math.abs(get(key) - defaults[key]) > 1e-9;
    }
    function refresh() { for (const k in rows) { const v = get(k); rows[k].range.value = v; rows[k].num.value = fmt(v, rows[k].step); mark(k); } syncStage(); }
    function apply(patch) {
        const n = {};
        for (const k in patch) { if (k.startsWith('x:')) EXT[k.slice(2)] = patch[k]; else if (k === 'mesh') { stage.mesh = patch[k]; setMesh(THREE, fold, patch[k]); } else n[k] = patch[k]; }
        if (Object.keys(n).length) fold.set(n);
        writeExt(U, fold.opts); refresh(); save();
    }
    function snapshot() { const s = {}; for (const k in rows) if (changed(k)) s[k] = get(k); return s; }

    // ── what to paste back into voyage-fold.js: everything the sea is drawn with, so what is on screen can be built again from the text alone —
    // every key of the module (the ones changed from what it ships named), what this file still patches in, the ship's pose, and the panel's
    // stage folded into the module's own keys (the fold slider into curl, "slow" into clock). The first version printed only the changed keys and
    // nothing of the stage, and a look that was flat and slow on screen came back as a wall at full speed (2026-09-21).
    function text() {
        const n = { ...fold.opts }, x = {}, sh = {}, ch = [];
        delete n.__seg;
        for (const k in rows) {
            if (k === 'mesh' || k.startsWith('c:')) continue;
            if (changed(k)) ch.push(k.replace(/^[xs]:/, ''));
            if (k.startsWith('x:')) { const kk = k.slice(2); if (kk in defaults) n[kk] = get(k); else x[kk] = get(k); } else if (k.startsWith('s:')) sh[k.slice(2)] = get(k); else n[k] = get(k);
        }
        const stageNotes = [];
        if ('curl' in n && stage.hold) { n.curl = round(n.curl * stage.fold); if (stage.fold !== 1) stageNotes.push(`the fold held at ${stage.fold} (in curl)`); }
        if ('clock' in n && stage.timeScale !== 1) { n.clock = round(n.clock * stage.timeScale); stageNotes.push(`the water ran at ${stage.timeScale}× (in clock)`); }
        const pairs = o => Object.entries(o).map(([k, v]) => `${k}: ${round(v)}`).join(', ');
        const attr = { x: 'data-boat-x', y: 'data-boat-y', size: 'data-boat-size', ride: 'data-fold-ride', seaScale: 'data-fold-scale' };
        const attrs = Object.entries(sh).filter(([k]) => attr[k]).map(([k, v]) => `${attr[k]}="${round(v)}"`).join(' ');
        const pose = Object.entries(sh).filter(([k]) => !attr[k]).map(([k, v]) => `${k}: ${round(v)}`).join(', ');
        const shipCh = ch.filter(k => k in SHIP);
        const pg = clock.pose || {};
        return [
            `/* DEFAULTS in js/voyage-fold.js — every key${ch.filter(k => !(k in SHIP) && k in n).length ? '; changed from what it ships: ' + ch.filter(k => !(k in SHIP) && k in n).join(', ') : '; nothing changed from what it ships'}${stageNotes.length ? '; ' + stageNotes.join('; ') : ''} */\n{ ${pairs(n)} }`,
            Object.keys(x).length ? `/* EXT in js/fold-lab.js (what this panel still patches in; bake it into voyage-fold.js to keep it) */\n{ ${pairs(x)} }` : '',
            `/* the hero ship: on <section data-work-spine> in index.html${shipCh.length ? ' (changed: ' + shipCh.join(', ') + ')' : ' (as it ships)'} */\n${attrs}`,
            `/* and waypoint 0 ('top') in work-spine.js's keyframeTables() */\n{ ${pose} }`,
            (x.bend3 || x.riseLen || x.taper) ? `/* the wall's shape (bend3, riseAt, riseLen, taper): bake RUNOF and DEFORM from js/fold-lab.js into voyage-fold.js's SEA, with their uniforms */` : '',
            x.seaTurn ? `/* the wall's turn: ${round(EXT.seaTurn)} deg added to foldTheta in work-spine.js */` : '',
            (x.wallX || x.wallY) ? `/* the wall's slide: LAB.S in voyage-fold.js moves to [${(clock.S || LAB_S).map(v => round(v)).join(', ')}] (the hero's camera; wallX ${round(EXT.wallX)}, wallY ${round(EXT.wallY)}) */` : '',
            `/* the page: ${innerWidth} x ${innerHeight}, scrolled ${Math.round(scrollY)} px; on screen — fold ${round(pg.fold || 0)}, sheet ${round(pg.vis || 0)}${stage.hold ? ' (held by the panel)' : ' (the page\'s own scroll)'}${faded ? '; "no fade" is on' : ''}${stage.timeScale === 0 ? '; paused' : ''} */`,
            (c => c ? `/* measured: ${c.overlap > 0 ? 'the solid wall covers ' + (c.overlap * 100).toFixed(1) + '% of the text' : c.clearance === Infinity ? (noSolid() ? 'lines only (solid 0), no wall on screen' : 'no solid wall on screen') : 'the solid wall clears the text by ' + Math.round(c.clearance) + ' px, and fills ' + Math.round(c.presence * 100) + '% of the hero outside it'} */` : '')(measureNow()),
            stage.mesh ? `/* sheetGeometry segments: ${stage.mesh} */` : '',
        ].filter(Boolean).join('\n\n');
    }

    function save() {
        const n = {}, x = {}, ship = {};
        for (const k in rows) { if (!changed(k) || k === 'mesh') continue; if (k.startsWith('x:')) x[k.slice(2)] = get(k); else if (k.startsWith('s:')) ship[k.slice(2)] = get(k); else n[k] = get(k); }
        try { localStorage.setItem(STORE, JSON.stringify({ n, x, ship, stage, A: snaps.A, B: snaps.B, shelf, scopes: [...scopes], amount: amount() })); } catch (e) {}
    }

    defaults['c:margin'] = MARGIN();
    rowsReady = true;
    setHidden(!!stage.hidden);
    for (const k in SHIP) defaults['s:' + k] = getShip(k);   // before the stored pose is applied: what Reset goes back to
    if (stored.ship) for (const k in stored.ship) if (k in SHIP) setShip(k, stored.ship[k]);
    refresh(); push();
    if (!stored.n && !stored.x && !stored.ship) {   // nothing stored: open on the composed wall, not on one across the headline
        let tries = 0; const go = () => { if (!compose() && ++tries < 30) setTimeout(go, 200); }; go();
    }
    // for the console (and for scripted checks): measure a candidate without applying it, e.g. foldLab.measure({ x: { riseLen: 20 } })
    window.foldLab = { measure: (over, coarse) => { const r = measureNow(over, coarse); return r && { overlap: r.overlap, clearance: r.clearance, presence: r.presence }; }, get, set: (k, v) => { set(k, v); refresh(); save(); }, fit: () => fitToText(), compose, apply: d => { push(); applyDelta(d); push(); } };
    console.info('fold lab: section.wsLayer.fold is live — the panel writes its uniforms. R rolls, Z / Y step back and forward, K keeps, H hides, P pauses.');
}

/* ── odds and ends ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = k => k[0].toUpperCase() + k.slice(1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
const round = v => Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : +v.toFixed(4);
/* a number shown at the control's own precision: a roll lands on 0.13384, the box has room for 0.134 */
const fmt = (v, step) => { const d = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step || 1)))); return (+v).toFixed(d); };
function read() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
function waitFor(fn, ms) {
    return new Promise(res => {
        const t0 = performance.now();
        (function tick() { const v = fn(); if (v) return res(v); if (performance.now() - t0 > ms) return res(null); setTimeout(tick, 120); })();
    });
}
