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

/* the flat sea's normal from the swell's slope (finite differences), for the sun's glitter: smooth across the grid's triangles, where the
   derivatives of the drawn surface would light whole facets */
const SWELL_NORMAL = `
    vec3 swellNormal(vec2 xz){ float e = 0.08, qq; float hx = swellH(xz + vec2(e, 0.0), uTime, qq) - swellH(xz - vec2(e, 0.0), uTime, qq), hz = swellH(xz + vec2(0.0, e), uTime, qq) - swellH(xz - vec2(0.0, e), uTime, qq);
      return normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e))); }`;

const SHEET_VS = SEA + SWELL_NORMAL + `
    uniform float uGlint, uGlitter; varying vec3 vW, vN; varying float vQ, vPhi, vAcross, vBeyond;
    void main(){
      vec3 p, n; float q, phi, across, beyond;
      deform(position, p, n, q, phi, across, beyond);
      vW = p; vQ = q; vPhi = phi; vAcross = across; vBeyond = beyond;
      vN = uGlint + uGlitter > 0.0 ? swellNormal(position.xz) : n;
      gl_Position = project(viewMatrix * vec4(toWorld(p), 1.0)); }`;

/* shaded in the lab's own space (uCam, uCamFwd: the layer's camera mapped into it), so the light, the sheen and every fade are the lab's */
const SHEET_FS = `
    uniform vec3 uColor, uCam, uCamFwd, uGround; uniform float uTime, uBands, uBandPow, uHueDrift, uEdge, uFloor, uStrand, uStrandFreq, uSheen, uSheenPow, uLight, uGrain;
    uniform float uLineGain, uLineWidth, uLineFar, uWallDark, uFarDark, uPhiMax, uFold, uBaseGlow, uVis, uLines, uSolidA, uSolidB, uFarA, uFarB, uFogA, uLipLen, uLipSoft, uNearA, uNearB;
    uniform float uGlint, uGlitter; uniform vec3 uSun;
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
      /* the sun's glitter (off unless uGlint / uGlitter): where the swell tilts the water to mirror a low sun (uSun: toward it) into the eye, the lines
         flare toward white and sparks catch between them, drifting as the swell rolls through, as light glints on a real sea */
      float spec = 0.0, glit = 0.0;
      if (uGlint + uGlitter > 0.0) {
        vec3 Vg = normalize(uCam - vW), Ng = normalize(vN);
        spec = pow(max(dot(reflect(-uSun, Ng), Vg), 0.0), 90.0) * exp(-dist / (uLineFar * 1.5));   /* a narrow mirror: glints gather in a path under the sun */
        glit = uGlitter * spec * pow(vnoise(vW.xz * 8.0 + uTime * vec2(0.6, -0.4)), 10.0) * 14.0 * smoothstep(4.0, 14.0, dist) * uLines;   /* pinpoint sparks, none smeared across the foreground */
      }
      float line = (1.0 - smoothstep(0.0, uLineWidth * fw, min(t, 1.0 - t))) * uLineGain * exp(-dist / uLineFar) * (1.0 - sol) * uLines * (1.0 + 4.0 * uGlint * spec);
      float a = clamp(sol + line + glit, 0.0, 1.0);
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
      vec3 lineCol = mix(mix(C, vec3(1.0), 0.25), vec3(1.0), min(1.0, uGlint * spec * 1.5)), glitCol = mix(C, vec3(1.0), 0.75);
      vec3 rgb = (col * sol + lineCol * line + glitCol * glit) / max(sol + line + glit, 1e-4);
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
      /* glitter (off unless uGlint / uTwinkle): a dot where the water mirrors the sun flares; every dot breathes on its own slow clock */
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
        uGlint: { value: 0 }, uGlitter: { value: 0 }, uTwinkle: { value: 0 }, uSun: { value: new THREE.Vector3(0.3, 0.1, -1).normalize() },   // the sun's glitter: off in the layer
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
    return {
        opts: o, uniforms: U, sheet, dots,
        // the picked colour's hue at the lab's saturation and lightness (raw sRGB into the shader, as the lab wrote it); the page's ground (sRGB 0..1)
        setHue(h) { U.uColor.value.setHSL(h, o.sat, o.lum); },
        setGround(r, g, b) { U.uGround.value.set(r, g, b); },
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

/* The silk sea as the animated ground of a page section (host): its own small canvas behind the section's content, seen as if standing on a beach
   looking out to sea. Straight crests roll in toward the viewer below a horizon near the top (horizon: its height in the canvas, -1 bottom .. 1 top;
   eye: the eye's height over the water in lab units), a low sun ahead glints on the swell (sun: [across, up] toward it; glint on the lines and dots,
   glitter between them), the dots twinkle and a few motes drift over the water. The picked colour is polled like the particle layer's; it draws only
   while the section is on screen. */
export function mountSilk(THREE, host, { colorVar = '--primary-color', horizon = 0.62, eye = 2.6, scale = 0.45, sun = [0.28, 0.07], glint = 1, glitter = 1, twinkle = 1, motes = 900, strength = 1, pixelRatio = Math.min(devicePixelRatio || 1, 1.5), light = false } = {}) {   // scale: world units per lab unit (smaller = finer lines)
    if (!host || host.querySelector('.ws-silk')) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'ws-silk'; canvas.setAttribute('aria-hidden', 'true');
    host.classList.add('ws-silk-host'); host.insertBefore(canvas, host.firstChild);
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { canvas.remove(); host.classList.remove('ws-silk-host'); return null; }
    gl.setPixelRatio(pixelRatio); gl.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.5, 60); camera.position.set(0, 0, 12);
    // the beach: crests straight (no crescent) and running in toward the camera (the swell's run points away from it, down -z), the dots spread over
    // the sea in front of the viewer (the camera stands ~27 lab units up the lab's z axis from the lab ship's spot)
    const sea = createFold(THREE, { scene, pixelRatio, light, dotsAt: [LAB.S[0], LAB.S[1] - 18], dotsRadius: 46, opts: { lineGain: DEFAULTS.lineGain * strength, bend: 0, axis: -90, dotGain: DEFAULTS.dotGain * strength } });
    sea.uniforms.uGlint.value = glint; sea.uniforms.uGlitter.value = glitter; sea.uniforms.uTwinkle.value = twinkle; sea.uniforms.uSun.value.set(sun[0], sun[1], -1).normalize();
    // the view: tilted so the horizon sits at `horizon`, the water `eye` lab units below the eye
    const tilt = Math.atan(horizon * Math.tan(17.5 * Math.PI / 180)), planeY = (12 * Math.sin(tilt) - eye * scale) / Math.cos(tilt);
    const rot = new THREE.Matrix3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), at = new THREE.Vector3(0, planeY, 0);
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
    let key = '', visible = false, raf = 0, t0 = performance.now(), last = t0, polled = 0;
    function color() {
        let c = ''; try { c = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim(); } catch (e) {}
        if (c === key) return; key = c;
        const col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 }; try { col.setStyle(c || '#1466B8'); } catch (e) { col.set(0x1466b8); } col.getHSL(hsl, THREE.SRGBColorSpace); sea.setHue(hsl.h);
    }
    function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (moteMat) moteMat.uniforms.uAspect.value = w / h; }
    function frame(now) {
        raf = 0; if (!visible) return;
        last = now;
        if (now - polled > 600) { polled = now; color(); }
        const t = (now - t0) / 1000;
        sea.place({ at, rotSea: rot, theta: 0, k: scale, cam: camera.position, fold: 0, vis: 0, lines: 1, dots: 1, t });   // the lab's own line fade: the lines thin out before they pack into the horizon
        if (moteMat) moteMat.uniforms.uTime.value = t;
        gl.render(scene, camera);
        raf = requestAnimationFrame(frame);
    }
    size(); color();
    new ResizeObserver(size).observe(host);
    new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { rootMargin: '10% 0px' }).observe(host);
    return { canvas, sea };
}
