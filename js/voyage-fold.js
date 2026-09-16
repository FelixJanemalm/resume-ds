/* voyage-fold.js — the hero's sea: the Lottie's banded swell remade inside the particle layer's 3D world, and the silk sea it lays down into.
 *
 * One sheet of water. Flat round the ship, it curls up at a crescent-shaped fold line into a tall fan of bands in the picked colour (the
 * Lottie's look: a bright leading edge on each band, falling to dark, a glow at the foot, fine silky strands, a sheen where the sheet turns
 * edge-on). The bands ARE the swell: they run down the fold and out across the sea as thin crest lines (the silk lines), and the ship rides that
 * same swell (seaHeight below mirrors the shader, so the layer can read the water under the bow, the stern and both sides). Dots -> lines ->
 * solid in space: solid where the sheet has risen, crest lines on the flat sea, dots all over, and the fold's far end and lip dissolve. Scrolling
 * lays the fold down (fold 1 -> 0); the flat sheet's silk lines can stay as the sea the ship sails on (lines), streaming past it (flow).
 * mountSilk() draws the same silk sea as the animated ground of a page section.
 *
 * Built and tuned in the look-dev page (the exploration workspace's fold-lab/, 2026-09-15; Felix: "all the defaults are already great for this
 * new water"). Every length below is in that lab's world units; the layer places the lab's sea in the ship's own sea frame (its waterline
 * centre, the sea's tilt, a calm course, the scene's sway and bob) so that the fold sits on screen where it sat in the lab while the ship keeps
 * its own start-scene pose: world = at + rot * (p - S) * k, with S the lab ship's spot on its sea and k world units per lab unit.
 */

export const LAB = { S: [-0.447, 1.777], camDist: 13.61, yaw: 15 };   // the lab ship's spot on the sea at the hero (1722 x 899), its camera's distance to it, the lab camera's yaw (deg)

export const DEFAULTS = {
    sat: 0.92, lum: 0.55, hueDrift: -4, edge: 0.3, floor: 0.2, baseGlow: 0.35,
    axis: -5, x0: 6, bend: -0.1, R: 4, phiMax: 130, fan: 0.3, foldDamp: 0.9, wallDark: 0.7, farDark: 0.008,
    farA: 60, farB: 140, fogA: 30, lipLen: 4, lipSoft: 5, spray: 0.35, sprayLen: 6,   // the far end: fading into the page's ground from fogA, gone by farB (camera distance, lab units); the lab had 40 / 75 and faded to black
    nearA: 2.5, nearB: 7,                                                              // the wall dissolves as it comes this close in front of the camera (lab units): it can never sweep over the lens
    amp: 0.16, lambda: 3.6, speed: 0.45, amp2: 0.05, lambda2: 2.2, dir2: 35,
    bands: 2, bandPow: 2.5, strand: 0.25, strandFreq: 18, sheen: 0.55, sheenPow: 3.5, light: 0.45, grain: 1,
    solidA: 2, solidB: 30, lineGain: 0.55, lineWidth: 1.1, lineFar: 26, dotGain: 1.1, dotOnSolid: 0.25, dotPx: 2, dotFar: 30,
};

const SEA = `
    uniform float uTime, uFold, uX0, uR, uPhiMax, uFan, uAxis, uBend, uAmp, uLambda, uSpeed, uAmp2, uLambda2, uDir2, uFoldDamp;
    uniform vec3 uAt; uniform mat3 uRot; uniform float uK; uniform vec2 uS, uFlow;
    /* the run: distance along the swell's travel, measured from a crescent (bend), so the bands are arcs round the fold */
    float runOf(vec2 xz, out float across){ vec2 d = vec2(cos(uAxis), sin(uAxis)); across = dot(xz, vec2(-d.y, d.x)); return dot(xz, d) - uBend * across * across * 0.1; }
    /* the swell at a point of the sheet; uFlow streams the pattern past the ship (the fold itself stays where it is) */
    float swellH(vec2 xz, float t, out float q){
      xz += uFlow;
      float across; float run = runOf(xz, across); q = (run + uSpeed * t) / uLambda;
      vec2 d2 = vec2(cos(uDir2), sin(uDir2)); float q2 = (dot(xz, d2) + uSpeed * 0.8 * t) / uLambda2;
      return uAmp * cos(6.2831853 * q) + uAmp2 * cos(6.2831853 * q2); }
    /* the sheet: flat up to the fold line, then a curl of radius R to phiMax, then straight on along the tangent (beyond: how far). Arc length
       is preserved, so the swell's phase q (and the bands) run on up the fold unchanged. fold 1 -> 0 lays it down (the radius grows, the angle shrinks) */
    void deform(vec3 p0, out vec3 p, out vec3 n, out float q, out float phi, out float across, out float beyond){
      vec2 d = vec2(cos(uAxis), sin(uAxis)), xz = p0.xz;
      float s = runOf(xz, across) - uX0, h = swellH(xz, uTime, q);
      phi = 0.0; beyond = 0.0; n = vec3(0.0, 1.0, 0.0); p = vec3(xz.x, 0.0, xz.y);
      if (s > 0.0 && uFold > 0.001) {
        float R = max(0.5, uR * (1.0 + uFan * clamp(across / 12.0, -0.9, 3.0))) / uFold, pm = uPhiMax * uFold, along, up;
        if (s < R * pm) { phi = s / R; along = R * sin(phi); up = R * (1.0 - cos(phi)); }
        else { phi = pm; beyond = s - R * pm; along = R * sin(pm) + beyond * cos(pm); up = R * (1.0 - cos(pm)) + beyond * sin(pm); }
        p.xz = xz - d * s + d * along; p.y = up;
        n = vec3(-sin(phi) * d.x, cos(phi), -sin(phi) * d.y);
        h *= 1.0 - uFoldDamp * smoothstep(0.0, 0.8, phi); }
      p += n * h; }
    /* the lab's sea placed in the ship's sea frame */
    vec3 toWorld(vec3 p){ return uAt + uRot * ((p - vec3(uS.x, 0.0, uS.y)) * uK); }
    /* never clipped by the camera's far plane (the sea runs on far past it; it has faded out by then): depth held just inside */
    vec4 project(vec4 mv){ vec4 c = projectionMatrix * mv; c.z = min(c.z, c.w * 0.9999); return c; }
    vec3 hueShift(vec3 c, float a){ vec3 g = vec3(0.57735); vec3 pr = g * dot(g, c); vec3 U = c - pr; vec3 V = cross(g, U); return U * cos(a) + V * sin(a) + pr; }`;

/* the flat sea's normal from the swell's slope (finite differences), for the sun catching the lines and dots: smooth across the grid's triangles, where the
   derivatives of the drawn surface would light whole facets */
const SWELL_NORMAL = `
    vec3 swellNormal(vec2 xz){ float e = 0.08, qq; float hx = swellH(xz + vec2(e, 0.0), uTime, qq) - swellH(xz - vec2(e, 0.0), uTime, qq), hz = swellH(xz + vec2(0.0, e), uTime, qq) - swellH(xz - vec2(0.0, e), uTime, qq);
      return normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e))); }`;

const SHEET_VS = SEA + SWELL_NORMAL + `
    uniform float uGlint; varying vec3 vW, vN; varying float vQ, vPhi, vAcross, vBeyond;
    void main(){
      vec3 p, n; float q, phi, across, beyond;
      deform(position, p, n, q, phi, across, beyond);
      vW = p; vQ = q; vPhi = phi; vAcross = across; vBeyond = beyond;
      vN = uGlint > 0.0 ? swellNormal(position.xz) : n;
      gl_Position = project(viewMatrix * vec4(toWorld(p), 1.0)); }`;

/* shaded in the lab's own space (uCam, uCamFwd: the layer's camera mapped into it), so the light, the sheen and every fade are the lab's */
const SHEET_FS = `
    uniform vec3 uColor, uCam, uCamFwd, uGround; uniform float uTime, uBands, uBandPow, uHueDrift, uEdge, uFloor, uStrand, uStrandFreq, uSheen, uSheenPow, uLight, uGrain;
    uniform float uLineGain, uLineWidth, uLineFar, uWallDark, uFarDark, uPhiMax, uFold, uBaseGlow, uVis, uLines, uSolidA, uSolidB, uFarA, uFarB, uFogA, uLipLen, uLipSoft, uNearA, uNearB;
    uniform float uGlint; uniform vec3 uSun;
    varying vec3 vW, vN; varying float vQ, vPhi, vAcross, vBeyond;
    vec3 hueShift(vec3 c, float a){ vec3 g = vec3(0.57735); vec3 pr = g * dot(g, c); vec3 U = c - pr; vec3 V = cross(g, U); return U * cos(a) + V * sin(a) + pr; }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), f.x), f.y); }
    void main(){
      vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
      float qb = vQ * uBands, t = fract(qb), fw = fwidth(qb);
      vec2 sp = vec2(vAcross * uStrandFreq, vQ * 1.5); float sAA = 1.0 - smoothstep(0.35, 1.0, length(fwidth(sp)));   /* no strands where they would alias */
      float dist = length(uCam - vW);
      /* material first (cheap): solid where the sheet has risen (and is neither too far, past the lip, nor too near the lens), crest lines on the flat sea */
      float farK = 1.0 - smoothstep(uFarA, max(uFarA + 0.01, uFarB), dist), lipK = 1.0 - smoothstep(uLipLen, uLipLen + uLipSoft, vBeyond), nearK = smoothstep(uNearA, uNearB, dot(vW - uCam, uCamFwd));
      float sol = smoothstep(uSolidA, max(uSolidA + 0.01, uSolidB), degrees(vPhi)) * farK * lipK * nearK * uVis;
      /* the sun catching the lines (off unless uGlint): where the swell tilts the water to mirror a low sun (uSun: toward it) into the eye, a line flares
         toward white, drifting along it as the swell rolls through, as light glints on a real sea; nothing is drawn between the lines */
      float spec = 0.0;
      if (uGlint > 0.0) spec = pow(max(dot(reflect(-uSun, normalize(vN)), normalize(uCam - vW)), 0.0), 90.0) * exp(-dist / (uLineFar * 1.5));   /* a narrow mirror: the catches gather in a path under the sun */
      float line = (1.0 - smoothstep(0.0, uLineWidth * fw, min(t, 1.0 - t))) * uLineGain * exp(-dist / uLineFar) * (1.0 - sol) * uLines * (1.0 + 4.0 * uGlint * spec);
      float a = clamp(sol + line, 0.0, 1.0);
      if (a < 0.003) discard;
      vec3 V = normalize(uCam - vW); if (dot(N, V) < 0.0) N = -N;
      /* bands: bright at each band's leading edge, falling off across it (the Lottie's stepped copies) */
      float band = pow(1.0 - t, uBandPow) * smoothstep(0.0, max(fw, 0.004) * 1.5, t);
      vec3 C = hueShift(uColor, uHueDrift * vPhi);
      vec3 col = mix(C * uFloor, mix(C, vec3(1.0), uEdge * pow(band, 6.0)), band);
      float up = smoothstep(0.0, max(0.2, uPhiMax * max(uFold, 0.2)), vPhi + vBeyond * 0.15);
      col *= mix(1.0 + uBaseGlow, 1.0 - uWallDark * uFold, up);   /* as the fold lays down its dark top brightens: it dissolves as light, not as a shadow */
      col *= 1.0 + uStrand * sAA * (vnoise(sp) - 0.5) * 1.6;
      col *= mix(1.0, 0.55 + 0.75 * max(0.0, dot(N, normalize(vec3(-0.4, 0.75, 0.5)))), uLight);
      col += C * uSheen * pow(1.0 - abs(dot(N, V)), uSheenPow);
      col *= exp(-dist * uFarDark);
      /* every edge of the wall fades into the page's own ground before it turns transparent: the far end, the lip and the part near the lens leave
         no dark rim on a grey or light ground (on a dark one this is the lab's fade to dark) */
      float edgeK = max(max(smoothstep(uFogA, uFarB, dist), smoothstep(uLipLen - 1.0, uLipLen + uLipSoft, vBeyond)), 1.0 - nearK);
      col = mix(col, uGround, edgeK);
      vec3 lineCol = mix(mix(C, vec3(1.0), 0.25), vec3(1.0), min(1.0, uGlint * spec * 1.5));
      vec3 rgb = (col * sol + lineCol * line) / max(sol + line, 1e-4);
      rgb += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * 0.035;
      gl_FragColor = vec4(rgb, a);
      gl_FragDepthEXT = sol > 0.5 ? gl_FragCoord.z : 1.0; }`;   /* only the risen sheet hides what is behind it (the field's stars); the lines never cut into the ship or its reflection */

const DOTS_VS = SEA + SWELL_NORMAL + `
    uniform float uPx, uPR, uDotGain, uDotOnSolid, uDotFar, uBands, uBandPow, uHueDrift, uSpray, uSprayLen, uDots, uSolidA, uSolidB, uFarA, uFarB, uLipLen, uLipSoft; uniform vec3 uColor, uCam;
    uniform float uGlint, uTwinkle; uniform vec3 uSun;
    attribute float aSeed; varying float vB; varying vec3 vC;
    void main(){
      vec3 p, n; float q, phi, across, beyond;
      deform(position, p, n, q, phi, across, beyond);
      float band = pow(1.0 - fract(q * uBands), uBandPow);
      float past = max(0.0, beyond - uLipLen), r2 = fract(aSeed * 91.7), r3 = fract(aSeed * 417.3);   /* past the lip the sheet is spray: the dots lift off and thin out */
      p += (n * (0.3 + r2) + vec3(0.0, 0.6, 0.0)) * uSpray * past * (0.2 + r3) + vec3(sin(uTime * 0.7 + r2 * 40.0), cos(uTime * 0.5 + r3 * 40.0), 0.0) * 0.15 * min(past, 3.0) * uSpray;
      float dist = length(uCam - p);
      float sol = smoothstep(uSolidA, max(uSolidA + 0.01, uSolidB), degrees(phi)) * (1.0 - smoothstep(uFarA, max(uFarA + 0.01, uFarB), dist)) * (1.0 - smoothstep(uLipLen, uLipLen + uLipSoft, beyond));
      vB = uDots * uDotGain * (0.18 + 0.9 * band) * (0.45 + 1.1 * aSeed) * mix(1.0, uDotOnSolid, sol) * exp(-dist / uDotFar) * exp(-past / max(0.1, uSprayLen));
      /* the sun on the dots (off unless uGlint / uTwinkle): a dot where the water mirrors the sun flares; every dot breathes on its own slow clock */
      float flare = 0.0;
      if (uGlint > 0.0) flare = uGlint * pow(max(dot(reflect(-uSun, swellNormal(position.xz)), normalize(uCam - p)), 0.0), 60.0);
      vB *= (1.0 + 6.0 * flare) * mix(1.0, 0.25 + 1.5 * pow(0.5 + 0.5 * sin(uTime * (1.2 + 2.8 * r2) + r3 * 60.0), 3.0), uTwinkle);
      vC = mix(hueShift(uColor, uHueDrift * phi), vec3(1.0), 0.3 + 0.5 * min(1.0, flare));
      vec4 mv = viewMatrix * vec4(toWorld(p), 1.0);
      gl_PointSize = uPx * uPR * (0.6 + 0.9 * aSeed) * (1.0 + 0.6 * min(1.0, flare)) * 16.8 / max(1.0, -mv.z / uK);
      gl_Position = project(mv); }`;
const DOTS_FS = `
    varying float vB; varying vec3 vC;
    void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d); if (a * vB < 0.004) discard; gl_FragColor = vec4(min(vC * vB, vec3(1.0)), a); }`;   /* additive: the colour times the disc */

/* The sea in JS (the flat part: the ship never sails up the fold), for the ride. Lab units, the same clock and flow as the shader. */
export function seaHeight(o, x, z, t, fx = 0, fz = 0) {
    x += fx; z += fz;
    const a = o.axis * Math.PI / 180, across = -x * Math.sin(a) + z * Math.cos(a);
    const q = (x * Math.cos(a) + z * Math.sin(a) - o.bend * across * across * 0.1 + o.speed * t) / o.lambda;
    const a2 = o.dir2 * Math.PI / 180, q2 = (x * Math.cos(a2) + z * Math.sin(a2) + o.speed * 0.8 * t) / o.lambda2;
    return o.amp * Math.cos(2 * Math.PI * q) + o.amp2 * Math.cos(2 * Math.PI * q2);
}

/* the sheet's grid: fine (0.45 lab units a cell at full resolution) within 45 units of the lab's middle, where the fold, the ship and the near sea
   are, then cells growing smoothly out to 260 units, so the far end and the horizon never show an edge */
function sheetGeometry(THREE, seg) {
    const g = new THREE.PlaneGeometry(2, 2, seg, seg), pos = g.attributes.position, U0 = 0.45, LIN = 100, C = (260 - LIN) / Math.pow(1 - U0, 3) - 0;
    const warp = u => { const a = Math.abs(u), s = Math.sign(u); return s * (a <= U0 ? LIN * a : LIN * a + C * Math.pow(a - U0, 3)); };
    for (let i = 0; i < pos.count; i++) pos.setXY(i, warp(pos.getX(i)), warp(pos.getY(i)));
    g.rotateX(-Math.PI / 2); g.computeBoundingSphere();
    return g;
}

export function createFold(THREE, { scene, pixelRatio = 1, light = false, dots: withDots = true, dotsAt = [0, 0], dotsRadius = 34, opts = {} }) {   // dotsAt / dotsRadius: the dots' disc on the lab's sea
    const o = Object.assign({}, DEFAULTS, opts), R = Math.PI / 180;
    const U = {
        uTime: { value: 0 }, uFold: { value: 1 }, uVis: { value: 0 }, uLines: { value: 1 }, uDots: { value: 1 }, uFlow: { value: new THREE.Vector2() },
        uAt: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uK: { value: 1 }, uS: { value: new THREE.Vector2(LAB.S[0], LAB.S[1]) }, uCam: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uGround: { value: new THREE.Vector3(0.26, 0.26, 0.26) },
        uX0: { value: o.x0 }, uR: { value: o.R }, uPhiMax: { value: o.phiMax * R }, uFan: { value: o.fan }, uAxis: { value: o.axis * R }, uBend: { value: o.bend }, uFoldDamp: { value: o.foldDamp },
        uAmp: { value: o.amp }, uLambda: { value: o.lambda }, uSpeed: { value: o.speed }, uAmp2: { value: o.amp2 }, uLambda2: { value: o.lambda2 }, uDir2: { value: o.dir2 * R },
        uColor: { value: new THREE.Color() }, uBands: { value: o.bands }, uBandPow: { value: o.bandPow }, uHueDrift: { value: o.hueDrift * R }, uEdge: { value: o.edge }, uFloor: { value: o.floor }, uBaseGlow: { value: o.baseGlow },
        uStrand: { value: o.strand }, uStrandFreq: { value: o.strandFreq }, uSheen: { value: o.sheen }, uSheenPow: { value: o.sheenPow }, uLight: { value: o.light }, uGrain: { value: o.grain },
        uWallDark: { value: o.wallDark }, uFarDark: { value: o.farDark }, uSolidA: { value: o.solidA }, uSolidB: { value: o.solidB }, uFarA: { value: o.farA }, uFarB: { value: o.farB }, uFogA: { value: o.fogA },
        uLipLen: { value: o.lipLen }, uLipSoft: { value: o.lipSoft }, uSpray: { value: o.spray }, uSprayLen: { value: o.sprayLen }, uNearA: { value: o.nearA }, uNearB: { value: o.nearB },
        uLineGain: { value: o.lineGain }, uLineWidth: { value: o.lineWidth }, uLineFar: { value: o.lineFar },
        uPx: { value: o.dotPx }, uPR: { value: pixelRatio }, uDotGain: { value: o.dotGain }, uDotOnSolid: { value: o.dotOnSolid }, uDotFar: { value: o.dotFar },
        uGlint: { value: 0 }, uTwinkle: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.1, -1).normalize() },   // the sun catching the lines and dots, the dots' twinkle: off in the layer
    };
    const sheet = new THREE.Mesh(sheetGeometry(THREE, light ? 240 : 440), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SHEET_VS, fragmentShader: SHEET_FS, side: THREE.DoubleSide, transparent: true, depthWrite: true }));
    sheet.frustumCulled = false; sheet.renderOrder = -2; sheet.visible = false; scene.add(sheet);
    // the sea's dots: a disc of the same sheet, denser near the middle of the lab's sea (additive light that leaves the canvas's alpha alone: on a
    // transparent canvas an alpha written per dot would darken the page under every faint dot into a dark speck)
    let dots = null;
    if (withDots) {
        const ND = light ? 26000 : 60000, dp = new Float32Array(ND * 3), ds = new Float32Array(ND);
        for (let i = 0; i < ND; i++) { const r = dotsRadius * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2; dp[i * 3] = dotsAt[0] + Math.cos(a) * r; dp[i * 3 + 2] = dotsAt[1] + Math.sin(a) * r; ds[i] = Math.pow(Math.random(), 2.2); }
        const dotGeo = new THREE.BufferGeometry(); dotGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dotGeo.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
        dots = new THREE.Points(dotGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: DOTS_VS, fragmentShader: DOTS_FS, transparent: true, depthWrite: false,
            blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
        dots.frustumCulled = false; dots.renderOrder = -1; dots.visible = false; scene.add(dots);
    }
    const full = new THREE.Matrix3(), fullT = new THREE.Matrix3(), ry = new THREE.Matrix3(), v = new THREE.Vector3(), fwd = new THREE.Vector3();
    const ride = { heave: 0, pitch: 0, roll: 0 };
    let hue = 0.58;
    const DEG = ['axis', 'phiMax', 'dir2', 'hueDrift'], UKEY = { dotPx: 'uPx' };   // the keys the lab writes in degrees, and the one whose uniform is not named after it
    const view = {
        opts: o, uniforms: U, sheet, dots,
        // the picked colour's hue at the lab's saturation and lightness (raw sRGB into the shader, as the lab wrote it); the page's ground (sRGB 0..1)
        setHue(h) { hue = h; U.uColor.value.setHSL(h, o.sat, o.lum); },
        setGround(r, g, b) { U.uGround.value.set(r, g, b); },
        // a dev aid: retune live from the console, by the same keys the look-dev lab's panel and its "Copy JSON" use (the keys of DEFAULTS)
        set(p) { Object.assign(o, p); for (const k in p) { const u = U[UKEY[k] || ('u' + k[0].toUpperCase() + k.slice(1))]; if (u) u.value = DEG.indexOf(k) >= 0 ? p[k] * R : p[k]; } view.setHue(hue); },
        // the full rotation (lab -> world) for a sea pose (Matrix3: the sea's tilt and course) and theta (deg about the vertical: the hero's course minus the lab camera's yaw)
        rotation(rotSea, theta, out) { const c = Math.cos(theta * R), s = Math.sin(theta * R); ry.set(c, 0, s, 0, 1, 0, -s, 0, c); return out.multiplyMatrices(rotSea, ry); },
        // place the lab's sea: at = the ship's waterline centre, rotSea / theta as above, k = world units per lab unit, cam = the camera's position; fold 1 up .. 0 flat;
        // vis: the risen sheet, lines: the silk lines, dots: the sea's dots (0..1 each); flow: the pattern's offset (lab units); t in seconds; zoom: how far the
        // framing has pulled back from the hero's (k relative to the hero's): the lines keep their fade on screen and grow only a little fainter as they pack denser
        place({ at, rotSea, theta, k, cam, fold, vis, lines, dots: dotsVis = 0, flowX = 0, flowZ = 0, t, zoom = 1 }) {
            this.rotation(rotSea, theta, full); fullT.copy(full).transpose();
            U.uRot.value.copy(full); U.uAt.value.copy(at); U.uK.value = k;
            U.uLineFar.value = o.lineFar / Math.max(0.05, zoom); U.uLineGain.value = o.lineGain * Math.sqrt(Math.min(1, Math.max(0.1, zoom)));
            v.copy(cam).sub(at).applyMatrix3(fullT).multiplyScalar(1 / Math.max(1e-4, k));
            U.uCam.value.set(v.x + LAB.S[0], v.y, v.z + LAB.S[1]);
            U.uCamFwd.value.copy(fwd.set(0, 0, -1).applyMatrix3(fullT));   // the layer's camera looks down -z
            U.uFold.value = fold; U.uVis.value = vis; U.uLines.value = lines; U.uDots.value = dotsVis; U.uTime.value = t; U.uFlow.value.set(flowX, flowZ);
            sheet.visible = vis > 0.002 || lines > 0.002;
            if (dots) dots.visible = dotsVis > 0.002;
        },
        // the ship on this sea: the water's height under the bow, the stern and both sides, as heave (hull lengths), pitch (rad, bow up +) and roll
        // (deg, the layer's heel sign), followed at `rate` per second. bowX / bowZ: the hull's course in the lab's sea (unit); k as in place; L = hull length (world)
        ride({ bowX, bowZ, k, L, t, dt, flowX = 0, flowZ = 0, rate = 4 }) {
            const zx = -bowZ, zz = bowX;   // the hull's +z (toward the viewer at course 0) in the lab's sea
            const Ll = L / Math.max(1e-4, k), B = 0.3 * Ll, S0 = LAB.S[0], S1 = LAB.S[1];
            const hB = seaHeight(o, S0 + bowX * Ll * 0.45, S1 + bowZ * Ll * 0.45, t, flowX, flowZ), hS = seaHeight(o, S0 - bowX * Ll * 0.45, S1 - bowZ * Ll * 0.45, t, flowX, flowZ);
            const hP = seaHeight(o, S0 + zx * B * 0.5, S1 + zz * B * 0.5, t, flowX, flowZ), hM = seaHeight(o, S0 - zx * B * 0.5, S1 - zz * B * 0.5, t, flowX, flowZ);
            const f = 1 - Math.exp(-rate * dt);
            ride.heave += ((hB + hS + hP + hM) / 4 / Ll - ride.heave) * f;
            ride.pitch += (Math.atan2(hB - hS, 0.9 * Ll) - ride.pitch) * f;
            ride.roll += (-Math.atan2(hP - hM, B) * 180 / Math.PI - ride.roll) * f;
            return ride;
        },
    };
    return view;
}

/* a few motes drifting over the water, as the particle layer's field drifts over the hero's sea: depth-sorted into the view's frustum, each on its
   own slow course and twinkle, wrapping across the view; world units of the section's own camera (looking down -z from z = 12, fov 35) */
const MOTES_VS = `
    uniform float uTime, uPR, uAspect, uPlaneY, uPlaneTan; uniform vec3 uColor; attribute vec4 aMote; varying float vB; varying vec3 vC;
    void main(){
      float z = mix(9.0, -45.0, aMote.z), halfW = (12.0 - z) * 0.3153 * uAspect * 1.15;   /* 0.3153: tan(17.5 deg); ('half' is reserved in GLSL ES) */
      float x = (fract(aMote.x + uTime * (0.004 + 0.01 * aMote.w)) * 2.0 - 1.0) * halfW;
      float y = uPlaneY - z * uPlaneTan + 0.08 + aMote.y * aMote.y * 2.2 + 0.05 * sin(uTime * (0.3 + 0.4 * aMote.w) + aMote.w * 40.0);
      vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
      vB = (0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.8 + 1.6 * aMote.w) + aMote.w * 90.0), 4.0)) * smoothstep(0.0, 0.08, aMote.z) * (1.0 - smoothstep(0.7, 1.0, aMote.z));
      vC = mix(uColor, vec3(1.0), 0.55);
      gl_PointSize = uPR * (1.6 + 2.2 * aMote.w) * 10.0 / max(1.0, -mv.z);
      gl_Position = projectionMatrix * mv; }`;

/* 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence), for the ribbon's breathing and its threads */
const SNOISE2 = `
    vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; } vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
    float snoise(vec2 v){ const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx); vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0); m = m * m; m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw; return 130.0 * dot(m, g); }`;

/* The Stripe-style silk ribbon (after stripe.com's hero): one wide sheet of fine silk threads sweeping across the section. Its shape is made in
   the vertex shader from the plane's uv alone: a centre line (a diagonal with a bow, breathing on slow simplex noise) and a cross direction that
   turns about the line from rollA (1.57: edge-on to the viewer) to rollB (0: facing it) around `twistAt`, so the sheet opens out of a thin bright
   fold into its full face. Its light comes from its own geometry (it glows toward white where it turns edge-on, silk catching light at a fold), threads run along
   it, its edges are soft, grain on top. */
const RIBBON_VS = SNOISE2 + `
    uniform float uTime, uLength, uSlope, uLift, uArcY, uArcZ, uWidth, uTaper, uRollA, uRollB, uTwistAt, uTwistSpan, uAmp, uFreq, uSpeed, uRipple;
    varying vec2 vUv; varying vec3 vW;
    vec3 centre(float u){
      float x = (u - 0.5) * uLength, bow = sin(3.14159265 * u), t = uTime * uSpeed;
      return vec3(x, uLift - uSlope * x + uArcY * bow + uAmp * snoise(vec2(u * uFreq, t)), uArcZ * bow + uAmp * 0.8 * snoise(vec2(u * uFreq + 17.0, t * 0.8))); }
    void main(){
      vUv = uv; float u = uv.x, v = uv.y - 0.5;
      vec3 c = centre(u), T = normalize(centre(u + 0.002) - centre(u - 0.002));
      vec3 B0 = normalize(cross(T, vec3(0.0, 0.0, 1.0)));   /* across the sheet, in the view's plane: facing the viewer */
      float th = mix(uRollA, uRollB, smoothstep(uTwistAt - uTwistSpan, uTwistAt + uTwistSpan, u)) + 0.3 * snoise(vec2(u * 1.3 + 5.0, uTime * uSpeed * 0.6));
      vec3 B = B0 * cos(th) + cross(T, B0) * sin(th);        /* turned about the centre line */
      vec3 p = c + B * v * uWidth * mix(1.0, uTaper, u) + cross(T, B) * uRipple * sin(v * 6.0 + u * 9.0 + uTime * 0.3);
      vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`;
const RIBBON_FS = SNOISE2 + `
    uniform vec3 uColA, uColB, uColC; uniform float uTime, uThreads, uThreadFreq, uSheen, uEdge, uGrain, uShade, uAlpha;
    varying vec2 vUv; varying vec3 vW;
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      /* the colour: a gradient across the sheet, fanned out from the picked hue, deepening toward the calm end */
      vec3 col = mix(mix(uColA, uColB, smoothstep(0.0, 0.55, vUv.y)), uColC, smoothstep(0.45, 1.0, vUv.y));
      col *= mix(1.0, 0.55, smoothstep(0.35, 1.0, vUv.x) * uShade);
      /* silk threads along the sheet: fine noise stripes across it, their spacing wandering slowly, eased to their mean where they would alias */
      float n0 = snoise(vec2(vUv.x * 0.8 + uTime * 0.01, vUv.y * 0.5));
      vec2 sc = vec2(vUv.y * uThreadFreq * (1.0 + 0.35 * n0), vUv.x * 3.0);
      float th = 0.5 + 0.5 * snoise(sc), aa = 1.0 - smoothstep(0.3, 0.9, fwidth(sc.x));
      col *= 1.0 + uThreads * (mix(0.5, th, aa) - 0.5) * 1.6;
      /* light from its own shape: toward white where the sheet turns edge-on to the eye */
      vec3 N = normalize(cross(dFdx(vW), dFdy(vW))), V = normalize(cameraPosition - vW);
      col = mix(col, mix(col, vec3(1.0), 0.65), clamp(uSheen * pow(1.0 - abs(dot(N, V)), 3.0), 0.0, 1.0));
      col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * 0.04;
      /* soft along both long edges and at both ends, so it floats on the section's ground */
      float a = smoothstep(0.0, uEdge, vUv.y) * smoothstep(0.0, uEdge, 1.0 - vUv.y) * smoothstep(0.0, 0.1, vUv.x) * smoothstep(0.0, 0.1, 1.0 - vUv.x) * uAlpha;
      gl_FragColor = vec4(col, a); }`;

export const RIBBON = {   // world units of the section's camera (z = 12, fov 35: about 13 x 7.6 units across the section at z = 0); angles in radians; hues as fractions of the wheel
    length: 22, slope: -0.42, lift: -1.3, arcY: -0.6, arcZ: -2.5, width: 4.6, taper: 0.9, rollA: 0.1, rollB: 1.45, twistAt: 0.62, twistSpan: 0.35, amp: 0.5, freq: 1.2, speed: 0.08, ripple: 0.08,
    threads: 0.55, threadFreq: 90, sheen: 1.2, edge: 0.05, grain: 1, shade: 0.5, hueA: -0.07, hueC: 0.09,
};

function ribbonView(THREE, scene, o) {
    const U = { uTime: { value: 0 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() }, uAlpha: { value: Math.min(1, o.strength) } };
    for (const k of ['length', 'slope', 'lift', 'arcY', 'arcZ', 'width', 'taper', 'rollA', 'rollB', 'twistAt', 'twistSpan', 'amp', 'freq', 'speed', 'ripple', 'threads', 'threadFreq', 'sheen', 'edge', 'grain', 'shade']) U['u' + k[0].toUpperCase() + k.slice(1)] = { value: o[k] };
    const geo = new THREE.PlaneGeometry(1, 1, o.light ? 220 : 440, o.light ? 24 : 48);   // only its uv is used: u along the sheet, v across it
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, side: THREE.DoubleSide, transparent: true, depthWrite: true }));
    mesh.frustumCulled = false; scene.add(mesh);
    let hue = 0.58;
    const view = {
        uniforms: U, mesh, opts: o,
        setHue(h) { hue = h; U.uColA.value.setHSL((h + o.hueA + 1) % 1, 0.95, 0.66); U.uColB.value.setHSL(h, 0.95, 0.52); U.uColC.value.setHSL((h + o.hueC + 1) % 1, 0.9, 0.4); },
        // a dev aid: retune live (the keys of RIBBON)
        set(p) { Object.assign(o, p); for (const k in p) { const u = U['u' + k[0].toUpperCase() + k.slice(1)]; if (u) u.value = p[k]; } view.setHue(hue); },
        frame(t) { U.uTime.value = t; },
        resize() {},
    };
    return view;
}

/* the beach: the silk sea seen from the shore. Straight crests roll in toward the viewer below a horizon near the top (horizon: its height in the
   canvas, -1 bottom .. 1 top; eye: the eye's height over the water in lab units; scale: world units per lab unit), a low sun ahead catches the lines
   and the dots where the swell mirrors it (sun: [across, up] toward it; glint: how strongly), the dots twinkle and a few motes drift over the water */
function beachView(THREE, scene, { horizon = 0.62, eye = 2.6, scale = 0.45, sun = [0.28, 0.07], glint = 1, twinkle = 1, motes = 900, strength = 1, pixelRatio = 1, light = false }) {
    // straight crests (no crescent) running in toward the camera (the swell's run points away from it, down -z); the dots spread over the sea in
    // front of the viewer (the camera stands ~27 lab units up the lab's z axis from the lab ship's spot)
    const sea = createFold(THREE, { scene, pixelRatio, light, dotsAt: [LAB.S[0], LAB.S[1] - 18], dotsRadius: 46, opts: { lineGain: DEFAULTS.lineGain * strength, bend: 0, axis: -90, dotGain: DEFAULTS.dotGain * strength } });
    sea.uniforms.uGlint.value = glint; sea.uniforms.uTwinkle.value = twinkle; sea.uniforms.uSun.value.set(sun[0], sun[1], -1).normalize();
    // the view: tilted so the horizon sits at `horizon`, the water `eye` lab units below the eye
    const tilt = Math.atan(horizon * Math.tan(17.5 * Math.PI / 180)), planeY = (12 * Math.sin(tilt) - eye * scale) / Math.cos(tilt);
    const rot = new THREE.Matrix3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), at = new THREE.Vector3(0, planeY, 0), cam = new THREE.Vector3(0, 0, 12);
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt); rot.setFromMatrix4(m4.makeRotationFromQuaternion(q));
    let moteMat = null;
    if (motes > 0) {
        const n = light ? Math.floor(motes / 2) : motes, data = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) data.set([Math.random(), Math.random(), Math.pow(Math.random(), 0.7), Math.random()], i * 4);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aMote', new THREE.BufferAttribute(data, 4));
        moteMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio }, uAspect: { value: 1 }, uPlaneY: { value: planeY }, uPlaneTan: { value: Math.tan(tilt) }, uColor: sea.uniforms.uColor },
            vertexShader: MOTES_VS, fragmentShader: DOTS_FS, transparent: true, depthWrite: false,
            blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
        const pts = new THREE.Points(g, moteMat); pts.frustumCulled = false; scene.add(pts);
    }
    return {
        sea,
        setHue(h) { sea.setHue(h); },
        frame(t) { sea.place({ at, rotSea: rot, theta: 0, k: scale, cam, fold: 0, vis: 0, lines: 1, dots: 1, t }); if (moteMat) moteMat.uniforms.uTime.value = t; },   // the lab's own line fade: the lines thin out before they pack into the horizon
        resize(w, h) { if (moteMat) moteMat.uniforms.uAspect.value = w / h; },
    };
}

/* A section's animated ground (host): its own small canvas behind the section's content (style: 'ribbon', the Stripe-style silk ribbon, or 'beach',
   the silk sea seen from the shore). The picked colour is polled like the particle layer's; it draws only while the section is on screen. */
export function mountSilk(THREE, host, { style = 'ribbon', colorVar = '--primary-color', strength = 1, pixelRatio = Math.min(devicePixelRatio || 1, 1.5), light = false, ...rest } = {}) {
    if (!host || host.querySelector('.ws-silk')) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'ws-silk'; canvas.setAttribute('aria-hidden', 'true');
    host.classList.add('ws-silk-host'); host.insertBefore(canvas, host.firstChild);
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { canvas.remove(); host.classList.remove('ws-silk-host'); return null; }
    gl.setPixelRatio(pixelRatio); gl.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.5, 60); camera.position.set(0, 0, 12);
    const view = style === 'beach' ? beachView(THREE, scene, { pixelRatio, light, strength, ...rest }) : ribbonView(THREE, scene, { ...RIBBON, light, strength, ...rest });
    let key = '', visible = false, raf = 0, t0 = performance.now(), polled = 0;
    function color() {
        let c = ''; try { c = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim(); } catch (e) {}
        if (c === key) return; key = c;
        const col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 }; try { col.setStyle(c || '#1466B8'); } catch (e) { col.set(0x1466b8); } col.getHSL(hsl, THREE.SRGBColorSpace); view.setHue(hsl.h);
    }
    function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); view.resize(w, h); }
    function frame(now) {
        raf = 0; if (!visible) return;
        if (now - polled > 600) { polled = now; color(); }
        view.frame((now - t0) / 1000);
        gl.render(scene, camera);
        raf = requestAnimationFrame(frame);
    }
    size(); color();
    new ResizeObserver(size).observe(host);
    new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible && !raf) raf = requestAnimationFrame(frame); }, { rootMargin: '10% 0px' }).observe(host);
    host.wsSilk = view;   // a dev aid: the view's uniforms (and the ribbon's set()) are live for tuning in the console
    return { canvas, view };
}

/* Silk in the armada's ending (the particle layer's fleet frame: the copies' course along +x, across along z, the sea at y = 0; world units).
   Both styles are built the way the principles ribbon is — a centre line, and a cross direction turned about it — so the sheet has real form: its
   normal sweeps as it bends, and colour, threads and sheen vary over it instead of reading as a flat streak.
   style 'wake': behind every ship a sheet unfurls — a thin bright crease at the transom, rolling open into a wide silk fan astern and lifting off
   the sea as it opens, ripples running aft along it: a ripple opening rather than foam. Each grows in as its ship starts its loop and is gone
   before the ship wraps. style 'weave': one broad silk road laid along the course, climbing as it runs into the distance and banking a little, its
   selvedges rolling up into the light outside the ships' own band — and the armada rides its surface (rideAt mirrors the same shape in JS, so the
   ships are lifted and tilted by the silk they sail on). Both read the fleet's live uniforms by reference (copies, rotation, anchor, scroll lift),
   so they move exactly with the ships. */
/* the same sea shaped for a tall hero: the wide one's wall fills a phone's frame from edge to edge, and the headline ends up reading against the
   bands. A shallower curl (R, phiMax) set further from the ship (x0) keeps the swell just as big a piece of the picked colour while its mass sits
   low and to one side, the way the wide hero's does. Applied over DEFAULTS by the layer whenever the orientation changes. */
export const PORTRAIT = { R: 3, phiMax: 110, x0: 14 };

function armadaFleetGLSL(count) {
    return `
    uniform vec4 uFleet[${count}]; uniform mat3 uFleetRot; uniform vec3 uFleetBoat; uniform float uFleetScale; uniform vec2 uFleetLift, uRun;
    vec4 fleetCopy(float k){ int i = int(k + 0.5); vec4 c = uFleet[0]; for (int j = 1; j < ${count}; j++) { if (j == i) c = uFleet[j]; } return c; }
    vec3 fleetWorld(vec3 local){ vec3 W = uFleetBoat + uFleetRot * local * uFleetScale; W.y += uFleetLift.x * (uFleetLift.y - W.z) / uFleetLift.y; return W; }
    vec3 across(vec3 T, float th){ vec3 B0 = normalize(cross(T, vec3(0.0, 1.0, 0.0))); return B0 * cos(th) + cross(B0, T) * sin(th); }`;   /* the sheet's cross direction, turned about its centre line: th = 0 lies flat on the sea, th = 1.57 stands edge-on to it */
}
/* the road: its centre climbs as it runs away (held flat and still where the ships enter the frame, so none of them ever pops into view), breathing
   and meandering on slow sines — sines, not noise, so rideAt can mirror it exactly — and the whole sheet banks over as it goes */
const WEAVE_SHAPE = `
    uniform float uTime, uZ0, uZ1, uClimb, uClimbA, uClimbB, uBank, uBankA, uAmp, uFreq, uSpeed, uMeander, uWave, uCurl, uCurlAt, uTaper, uFade0, uFade1;
    vec3 weaveCentre(float u){
      float g = smoothstep(0.0, 0.22, u);
      return vec3(uRun.x + u * uRun.y,
                  uClimb * smoothstep(uClimbA, uClimbB, u) + g * uAmp * sin(u * uFreq * 6.2831 + uTime * uSpeed),
                  0.5 * (uZ0 + uZ1) + g * uMeander * sin(u * uFreq * 4.1 + uTime * uSpeed * 0.8 + 1.7)); }
    float weaveHalf(float u){ return 0.5 * (uZ1 - uZ0) * mix(1.0, uTaper, smoothstep(0.4, 1.0, u)); }
    vec3 weavePoint(float u, float v, out float e){
      vec3 c = weaveCentre(u), T = normalize(weaveCentre(u + 0.004) - weaveCentre(u - 0.004));
      vec3 B = across(T, uBank * smoothstep(uBankA, 1.0, u)), Nb = cross(B, T);
      e = smoothstep(uCurlAt, 1.0, abs(v));                                                  /* the selvedge: only the margin outside the ships' band rolls up */
      return c + B * (v * weaveHalf(u) - sign(v) * 0.45 * uCurl * e * e) + Nb * (uCurl * e * e + uWave * sin(u * 9.0 - uTime * 0.5 + v * 1.2) * (1.0 - e)); }`;
const WEAVE_VS = count => SNOISE2 + armadaFleetGLSL(count) + WEAVE_SHAPE + `
    varying vec2 vUv; varying vec3 vW; varying float vFade, vDist, vCurl;
    void main(){
      float u = uv.x, v = uv.y * 2.0 - 1.0, e;
      vec3 p = weavePoint(u, v, e); vW = fleetWorld(p);
      vFade = smoothstep(0.0, uFade0, u) * (1.0 - smoothstep(uFade1, 1.0, u));               /* fading at both ends of the run: it comes out of the dark and leads on into it */
      vUv = vec2(u, v); vDist = p.x; vCurl = e;
      gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
const WAKE_VS = count => SNOISE2 + armadaFleetGLSL(count) + `
    uniform float uTime, uLen, uHalf0, uSpread, uArc, uRollA, uRollB, uTwistAt, uTwistSpan, uRipple, uSwirl;
    attribute float aK; varying vec2 vUv; varying vec3 vW; varying float vFade, vDist, vCurl;
    vec3 wakeCentre(float u, vec4 c){ float L = c.w, d = u * uLen * L;
      return vec3(c.x - 0.48 * L - d, c.y + uArc * L * u * u, c.z + uSwirl * L * u * sin(d * 0.55 - uTime * 0.6 + aK * 2.1)); }   /* astern of the transom, lifting off the sea as it opens and swinging a little */
    void main(){
      vec4 c = fleetCopy(aK); float L = c.w, u = uv.x, v = uv.y * 2.0 - 1.0, d = u * uLen * L;
      vec3 p0 = wakeCentre(u, c), T = normalize(wakeCentre(min(u + 0.005, 1.0), c) - wakeCentre(max(u - 0.005, 0.0), c));
      float th = mix(uRollA, uRollB, smoothstep(uTwistAt - uTwistSpan, uTwistAt + uTwistSpan, u));   /* edge-on at the stern, rolling open astern */
      vec3 B = across(T, th), Nb = cross(B, T);
      float hw = L * uHalf0 + uSpread * d;                                                    /* and widening at the wake's angle as it opens */
      vec3 p = p0 + B * (v * hw) + Nb * uRipple * L * sin(d * 2.2 - uTime * 1.8 + aK * 1.7) * (1.0 - 0.5 * u);
      vW = fleetWorld(p);
      float runPos = (c.x - uRun.x) / max(1.0, uRun.y);
      vFade = smoothstep(0.02, 0.12, runPos) * (1.0 - smoothstep(0.8, 0.97, runPos)) * step(0.01, L);   /* grows in as the ship starts its loop, gone before it wraps */
      vUv = vec2(u, v); vDist = d / max(L, 0.001); vCurl = 1.0 - abs(cos(th));                 /* how far it still stands on edge: the bright crease */
      gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
const ARMADA_SILK_FS = SNOISE2 + `
    uniform vec3 uColA, uColB, uColC; uniform float uTime, uThreadFreq, uThreads, uSheen, uGain, uClipTop, uFlow, uWeave, uGrain, uEdge, uShade;
    varying vec2 vUv; varying vec3 vW; varying float vFade, vDist, vCurl;
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      if (gl_FragCoord.y > uClipTop) discard;
      float u = vUv.x, av = abs(vUv.y);
      /* the colour: a gradient across the sheet, fanned out from the picked hue, deepening along the run */
      vec3 col = mix(uColB, uColA, smoothstep(0.3, 1.0, av));
      col = mix(col, uColC, smoothstep(0.1, 1.0, u) * uShade);
      /* silk threads along it, their spacing wandering slowly, their pattern flowing (aft for a wake, on with the ships for the road), eased to their mean where they would alias */
      float n0 = snoise(vec2(u * 0.8 + uTime * 0.01, vUv.y * 0.5));
      vec2 sc = vec2(vUv.y * uThreadFreq * (1.0 + 0.35 * n0), vDist * 0.8 - uTime * uFlow);
      float th = 0.5 + 0.5 * snoise(sc), aa = 1.0 - smoothstep(0.3, 0.9, fwidth(sc.x));
      col *= 1.0 + uThreads * (mix(0.5, th, aa) - 0.5) * 1.6;
      col *= 0.86 + 0.28 * (0.5 + 0.5 * sin(vDist * 1.6 - uTime * uFlow * 2.0));               /* light running along it */
      /* light from its own shape: toward white where the sheet turns edge-on to the eye */
      vec3 N = normalize(cross(dFdx(vW), dFdy(vW))), V = normalize(cameraPosition - vW);
      col = mix(col, mix(col, vec3(1.0), 0.65), clamp(uSheen * pow(1.0 - abs(dot(N, V)), 3.0), 0.0, 1.0));
      col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * 0.04;
      float ends = mix(pow(1.0 - u, 1.5) * smoothstep(0.0, 0.05, u), 1.0, uWeave);             /* a wake thins astern; the road runs on */
      float form = mix(0.45 + 0.9 * vCurl + 0.5 * exp(-pow(av / 0.22, 2.0)), 0.4 + 1.2 * vCurl, uWeave);   /* the turned parts carry the light: a wake's crease and the churn straight astern, the road's selvedges — and the road stays quiet down its middle, where the ships sail */
      float a = uGain * vFade * ends * form * smoothstep(0.0, uEdge, 1.0 - av);                /* soft along both selvedges */
      if (a < 0.003) discard;
      gl_FragColor = vec4(col, a); }`;

export const ARMADA_SILK = {   // world units and radians in the fleet's frame (a hull is about one unit long); the wake's lengths are in hull lengths
    wake: { len: 9, half0: 0.12, spread: 0.42, arc: 0.3, rollA: 1.1, rollB: 0.06, twistAt: 0.34, twistSpan: 0.3, ripple: 0.05, swirl: 0.08,
        threadFreq: 34, threads: 0.7, sheen: 1.15, gain: 0.62, flow: 0.55, grain: 1, edge: 0.06, shade: 0.55 },   // gain: as strong as the wakes can be read against the testimonial's text (0.8 and up starts to swamp it)
    weave: { climb: 4, climbA: 0.12, climbB: 0.92, bank: 1.05, bankA: 0.1, amp: 0.1, freq: 0.9, speed: 0.5, meander: 0.35, wave: 0.12, curl: 3, margin: 2.4, taper: 1, fade0: 0.03, fade1: 0.92,
        gather: 0.2, ride: 1, rideBank: 0.4, threadFreq: 55, threads: 0.6, sheen: 1.5, gain: 0.24, flow: 0.25, grain: 1, edge: 0.05, shade: 0.5 },   // gather: how far the armada's scatter closes up across the course, so the fleet sails the road in procession and the road can be a band with edges instead of a sea; ride: how much of its lie the ships take; rideBank: how much of its bank in particular (the road can twist far more than a fleet can lean)
};
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function createArmadaSilk(THREE, { scene, style = 'wake', count, copies, rot, at, lift, light = false, opts = {} }) {
    const weave = style === 'weave', o = Object.assign({}, ARMADA_SILK[weave ? 'weave' : 'wake'], opts);
    const U = {
        uFleet: { value: copies }, uFleetRot: { value: rot }, uFleetBoat: { value: at }, uFleetLift: { value: lift }, uFleetScale: { value: 1 }, uRun: { value: new THREE.Vector2(0, 48) },
        uTime: { value: 0 }, uClipTop: { value: 1e9 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() }, uWeave: { value: weave ? 1 : 0 },
        uZ0: { value: -6 }, uZ1: { value: 3.4 }, uCurlAt: { value: 0.6 },
        uThreadFreq: { value: o.threadFreq }, uThreads: { value: o.threads }, uSheen: { value: o.sheen }, uGain: { value: o.gain }, uFlow: { value: o.flow }, uGrain: { value: o.grain }, uEdge: { value: o.edge }, uShade: { value: o.shade },
    };
    for (const k of weave ? ['climb', 'climbA', 'climbB', 'bank', 'bankA', 'amp', 'freq', 'speed', 'meander', 'wave', 'curl', 'taper', 'fade0', 'fade1'] : ['len', 'half0', 'spread', 'arc', 'rollA', 'rollB', 'twistAt', 'twistSpan', 'ripple', 'swirl']) U['u' + k[0].toUpperCase() + k.slice(1)] = { value: o[k] };
    let geo;
    if (weave) geo = new THREE.PlaneGeometry(1, 1, light ? 200 : 380, light ? 28 : 56);
    else {   // one sheet per ship, drawn as instances of the same grid
        const base = new THREE.PlaneGeometry(1, 1, light ? 48 : 96, light ? 14 : 26);
        geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
        geo.setAttribute('aK', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1)); geo.instanceCount = count;
    }
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: (weave ? WEAVE_VS : WAKE_VS)(count), fragmentShader: ARMADA_SILK_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: false }));
    mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.visible = false; scene.add(mesh);
    let hue = 0.58;
    const view = {
        mesh, uniforms: U, style: weave ? 'weave' : 'wake', opts: o,
        setHue(h) { hue = h; U.uColA.value.setHSL((h - 0.07 + 1) % 1, 0.95, 0.66); U.uColB.value.setHSL(h, 0.95, 0.52); U.uColC.value.setHSL((h + 0.09) % 1, 0.9, 0.4); },
        // a dev aid: retune live (the keys of ARMADA_SILK[style])
        set(p) { Object.assign(o, p); for (const k in p) { const u = U['u' + k[0].toUpperCase() + k.slice(1)]; if (u) u.value = p[k]; } view.setHue(hue); },
        // the run (start and length along the course) and the ARMADA scatter's reach across it: the road is laid a margin wider on both sides, so its
        // selvedges roll up outside the ships' own band and no ship is ever carried up one
        setRun(run0, runLen, zMin, zMax) {
            U.uRun.value.set(run0, runLen);
            const m = weave ? o.margin : 0; U.uZ0.value = zMin - m; U.uZ1.value = zMax + m;
            U.uCurlAt.value = Math.max(0.05, Math.min(0.95, (zMax - zMin) / Math.max(0.001, zMax - zMin + 2 * m)));
        },
        // where the road's surface is under a ship at (x, z) along the course, and how it lies there (the WEAVE_SHAPE above, mirrored: sines only, so
        // the two agree exactly); the slopes come by difference, so every term of the shape is in them
        rideY(x, z, t) {
            if (!weave) return 0;
            const run = U.uRun.value, u = Math.min(1, Math.max(0, (x - run.x) / Math.max(1, run.y))), g = ss(0, 0.22, u);
            const cy = o.climb * ss(o.climbA, o.climbB, u) + g * o.amp * Math.sin(u * o.freq * 6.2831 + t * o.speed);
            const cz = 0.5 * (U.uZ0.value + U.uZ1.value) + g * o.meander * Math.sin(u * o.freq * 4.1 + t * o.speed * 0.8 + 1.7);
            const th = o.bank * ss(o.bankA, 1, u), hw = 0.5 * (U.uZ1.value - U.uZ0.value) * (1 + (o.taper - 1) * ss(0.4, 1, u));
            const v = Math.min(1, Math.max(-1, (z - cz) / Math.max(0.001, hw * Math.cos(th))));
            return o.ride * (cy + o.rideBank * v * hw * Math.sin(th) + o.wave * Math.sin(u * 9 - t * 0.5 + v * 1.2));
        },
        rideAt(x, z, t) {
            const y = view.rideY(x, z, t), d = 0.5;
            return { y, pitch: Math.atan2(view.rideY(x + d, z, t) - view.rideY(x - d, z, t), 2 * d), bank: -Math.atan2(view.rideY(x, z + d, t) - view.rideY(x, z - d, t), 2 * d) };
        },
        // per frame: visible (the ending is on), t, the fleet's scale, the overlay clip
        update({ visible, t, scale, clipTop }) {
            mesh.visible = !!visible; if (!visible) return;
            U.uTime.value = t; U.uFleetScale.value = scale; U.uClipTop.value = clipTop;
        },
    };
    return view;
}
