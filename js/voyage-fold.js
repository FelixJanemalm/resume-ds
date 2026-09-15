/* voyage-fold.js — the hero's sea: the Lottie's banded swell remade inside the particle layer's 3D world.
 *
 * One sheet of water. Flat round the ship, it curls up at a crescent-shaped fold line into a tall fan of bands in the picked colour (the
 * Lottie's look: a bright leading edge on each band, falling to dark, a glow at the foot, fine silky strands, a sheen where the sheet turns
 * edge-on). The bands ARE the swell: they run down the fold and out across the sea as thin crest lines, and the ship rides that same swell
 * (seaHeight below mirrors the shader, so the layer can read the water under the bow, the stern and both sides). Dots -> lines -> solid in
 * space: solid where the sheet has risen, crest lines on the flat sea, dots all over, and the fold's far end and lip dissolve into dots.
 * Scrolling lays the fold down (fold 1 -> 0) and the layer fades it out as the ship gets under way.
 *
 * Built and tuned in the look-dev page (the exploration workspace's fold-lab/, 2026-09-15; Felix: "all the defaults are already great for this
 * new water"). Every length below is in that lab's world units; the layer places the lab's sea in the ship's own sea frame (its waterline
 * centre, the sea's tilt and course, the scene's sway and bob) so that the fold sits on screen where it sat in the lab while the ship keeps
 * its own start-scene pose: world = at + rot * (p - S) * k, with S the lab ship's spot on its sea and k world units per lab unit.
 */

export const LAB = { S: [-0.447, 1.777], camDist: 13.61, yaw: 15 };   // the lab ship's spot on the sea at the hero (1722 x 899), its camera's distance to it, the lab camera's yaw (deg)

export const DEFAULTS = {
    sat: 0.92, lum: 0.55, hueDrift: -4, edge: 0.3, floor: 0.2, baseGlow: 0.35,
    axis: -5, x0: 6, bend: -0.1, R: 4, phiMax: 130, fan: 0.3, foldDamp: 0.9, wallDark: 0.7, farDark: 0.008,
    farA: 40, farB: 75, lipLen: 4, lipSoft: 5, spray: 0.35, sprayLen: 6,
    amp: 0.16, lambda: 3.6, speed: 0.45, amp2: 0.05, lambda2: 2.2, dir2: 35,
    bands: 2, bandPow: 2.5, strand: 0.25, strandFreq: 18, sheen: 0.55, sheenPow: 3.5, light: 0.45, grain: 1,
    solidA: 2, solidB: 30, lineGain: 0.55, lineWidth: 1.1, lineFar: 26, dotGain: 1.1, dotOnSolid: 0.25, dotPx: 2, dotFar: 30,
};

const SEA = `
    uniform float uTime, uFold, uX0, uR, uPhiMax, uFan, uAxis, uBend, uAmp, uLambda, uSpeed, uAmp2, uLambda2, uDir2, uFoldDamp;
    uniform vec3 uAt; uniform mat3 uRot; uniform float uK; uniform vec2 uS;
    /* the run: distance along the swell's travel, measured from a crescent (bend), so the bands are arcs round the fold */
    float runOf(vec2 xz, out float across){ vec2 d = vec2(cos(uAxis), sin(uAxis)); across = dot(xz, vec2(-d.y, d.x)); return dot(xz, d) - uBend * across * across * 0.1; }
    float swellH(vec2 xz, float t, out float q){
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
    /* how solid the sheet is: risen (phi), not too far away, not past the lip (there it breaks into dots) */
    uniform float uSolidA, uSolidB, uFarA, uFarB, uLipLen, uLipSoft;
    float solidOf(float phi, float dist, float beyond){
      return smoothstep(uSolidA, max(uSolidA + 0.01, uSolidB), degrees(phi)) * (1.0 - smoothstep(uFarA, max(uFarA + 0.01, uFarB), dist)) * (1.0 - smoothstep(uLipLen, uLipLen + uLipSoft, beyond)); }
    vec3 hueShift(vec3 c, float a){ vec3 g = vec3(0.57735); vec3 pr = g * dot(g, c); vec3 U = c - pr; vec3 V = cross(g, U); return U * cos(a) + V * sin(a) + pr; }`;

const SHEET_VS = SEA + `
    varying vec3 vW; varying float vQ, vPhi, vAcross, vBeyond;
    void main(){
      vec3 p, n; float q, phi, across, beyond;
      deform(position, p, n, q, phi, across, beyond);
      vW = p; vQ = q; vPhi = phi; vAcross = across; vBeyond = beyond;
      gl_Position = projectionMatrix * viewMatrix * vec4(toWorld(p), 1.0); }`;

/* shaded in the lab's own space (uCam: the layer's camera mapped into it), so the light, the sheen and every fade are the lab's */
const SHEET_FS = `
    uniform vec3 uColor, uCam; uniform float uTime, uBands, uBandPow, uHueDrift, uEdge, uFloor, uStrand, uStrandFreq, uSheen, uSheenPow, uLight, uGrain;
    uniform float uLineGain, uLineWidth, uLineFar, uWallDark, uFarDark, uPhiMax, uFold, uBaseGlow, uVis, uSolidA, uSolidB, uFarA, uFarB, uLipLen, uLipSoft;
    varying vec3 vW; varying float vQ, vPhi, vAcross, vBeyond;
    float solidOf(float phi, float dist, float beyond){
      return smoothstep(uSolidA, max(uSolidA + 0.01, uSolidB), degrees(phi)) * (1.0 - smoothstep(uFarA, max(uFarA + 0.01, uFarB), dist)) * (1.0 - smoothstep(uLipLen, uLipLen + uLipSoft, beyond)); }
    vec3 hueShift(vec3 c, float a){ vec3 g = vec3(0.57735); vec3 pr = g * dot(g, c); vec3 U = c - pr; vec3 V = cross(g, U); return U * cos(a) + V * sin(a) + pr; }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), f.x), f.y); }
    void main(){
      vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
      float qb = vQ * uBands, t = fract(qb), fw = fwidth(qb);
      vec2 sp = vec2(vAcross * uStrandFreq, vQ * 1.5); float sAA = 1.0 - smoothstep(0.35, 1.0, length(fwidth(sp)));   /* no strands where they would alias */
      float dist = length(uCam - vW);
      /* material first (cheap): solid where the sheet has risen, crest lines on the flat sea; nothing else is shaded where both are zero */
      float sol = solidOf(vPhi, dist, vBeyond);
      float line = (1.0 - smoothstep(0.0, uLineWidth * fw, min(t, 1.0 - t))) * uLineGain * exp(-dist / uLineFar) * (1.0 - sol);
      float a = clamp(sol + line, 0.0, 1.0) * uVis;
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
      vec3 rgb = (col * sol + mix(C, vec3(1.0), 0.25) * line) / max(sol + line, 1e-4);
      rgb += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * 0.035;
      gl_FragColor = vec4(rgb, a);
      gl_FragDepthEXT = sol * uVis > 0.5 ? gl_FragCoord.z : 1.0; }`;   /* only the risen sheet hides what is behind it (the field's stars); the lines never cut into the ship or its reflection */

const DOTS_VS = SEA + `
    uniform float uPx, uPR, uDotGain, uDotOnSolid, uDotFar, uBands, uBandPow, uHueDrift, uSpray, uSprayLen, uVis; uniform vec3 uColor, uCam;
    attribute float aSeed; varying float vB; varying vec3 vC;
    void main(){
      vec3 p, n; float q, phi, across, beyond;
      deform(position, p, n, q, phi, across, beyond);
      float band = pow(1.0 - fract(q * uBands), uBandPow);
      float past = max(0.0, beyond - uLipLen), r2 = fract(aSeed * 91.7), r3 = fract(aSeed * 417.3);   /* past the lip the sheet is spray: the dots lift off and thin out */
      p += (n * (0.3 + r2) + vec3(0.0, 0.6, 0.0)) * uSpray * past * (0.2 + r3) + vec3(sin(uTime * 0.7 + r2 * 40.0), cos(uTime * 0.5 + r3 * 40.0), 0.0) * 0.15 * min(past, 3.0) * uSpray;
      float dist = length(uCam - p), sol = solidOf(phi, dist, beyond);
      vB = uVis * uDotGain * (0.18 + 0.9 * band) * (0.45 + 1.1 * aSeed) * mix(1.0, uDotOnSolid, sol) * exp(-dist / uDotFar) * exp(-past / max(0.1, uSprayLen));
      vC = mix(hueShift(uColor, uHueDrift * phi), vec3(1.0), 0.3);
      vec4 mv = viewMatrix * vec4(toWorld(p), 1.0);
      gl_PointSize = uPx * uPR * (0.6 + 0.9 * aSeed) * 16.8 / max(1.0, -mv.z / uK);
      gl_Position = projectionMatrix * mv; }`;
const DOTS_FS = `
    varying float vB; varying vec3 vC;
    void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d); if (a * vB < 0.004) discard; gl_FragColor = vec4(min(vC * vB, vec3(1.0)), a); }`;   /* additive: the colour times the disc */

/* The sea in JS (the flat part: the ship never sails up the fold), for the ride. Lab units, the same clock as the shader. */
export function seaHeight(o, x, z, t) {
    const a = o.axis * Math.PI / 180, across = -x * Math.sin(a) + z * Math.cos(a);
    const q = (x * Math.cos(a) + z * Math.sin(a) - o.bend * across * across * 0.1 + o.speed * t) / o.lambda;
    const a2 = o.dir2 * Math.PI / 180, q2 = (x * Math.cos(a2) + z * Math.sin(a2) + o.speed * 0.8 * t) / o.lambda2;
    return o.amp * Math.cos(2 * Math.PI * q) + o.amp2 * Math.cos(2 * Math.PI * q2);
}

export function createFold(THREE, { scene, pixelRatio = 1, light = false, opts = {} }) {
    const o = Object.assign({}, DEFAULTS, opts), R = Math.PI / 180;
    const U = {
        uTime: { value: 0 }, uFold: { value: 1 }, uVis: { value: 0 }, uAt: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uK: { value: 1 }, uS: { value: new THREE.Vector2(LAB.S[0], LAB.S[1]) }, uCam: { value: new THREE.Vector3() },
        uX0: { value: o.x0 }, uR: { value: o.R }, uPhiMax: { value: o.phiMax * R }, uFan: { value: o.fan }, uAxis: { value: o.axis * R }, uBend: { value: o.bend }, uFoldDamp: { value: o.foldDamp },
        uAmp: { value: o.amp }, uLambda: { value: o.lambda }, uSpeed: { value: o.speed }, uAmp2: { value: o.amp2 }, uLambda2: { value: o.lambda2 }, uDir2: { value: o.dir2 * R },
        uColor: { value: new THREE.Color() }, uBands: { value: o.bands }, uBandPow: { value: o.bandPow }, uHueDrift: { value: o.hueDrift * R }, uEdge: { value: o.edge }, uFloor: { value: o.floor }, uBaseGlow: { value: o.baseGlow },
        uStrand: { value: o.strand }, uStrandFreq: { value: o.strandFreq }, uSheen: { value: o.sheen }, uSheenPow: { value: o.sheenPow }, uLight: { value: o.light }, uGrain: { value: o.grain },
        uWallDark: { value: o.wallDark }, uFarDark: { value: o.farDark }, uSolidA: { value: o.solidA }, uSolidB: { value: o.solidB }, uFarA: { value: o.farA }, uFarB: { value: o.farB },
        uLipLen: { value: o.lipLen }, uLipSoft: { value: o.lipSoft }, uSpray: { value: o.spray }, uSprayLen: { value: o.sprayLen },
        uLineGain: { value: o.lineGain }, uLineWidth: { value: o.lineWidth }, uLineFar: { value: o.lineFar },
        uPx: { value: o.dotPx }, uPR: { value: pixelRatio }, uDotGain: { value: o.dotGain }, uDotOnSolid: { value: o.dotOnSolid }, uDotFar: { value: o.dotFar },
    };
    // the sheet: 120 x 120 lab units round the lab's origin (the fold, the near sea and the far dissolve all lie inside it), a third of a unit per cell
    const SIZE = 120, SEG = light ? 220 : 360;
    const sheetGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); sheetGeo.rotateX(-Math.PI / 2);
    const sheet = new THREE.Mesh(sheetGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SHEET_VS, fragmentShader: SHEET_FS, side: THREE.DoubleSide, transparent: true, depthWrite: true }));
    sheet.frustumCulled = false; sheet.renderOrder = -2; sheet.visible = false;
    // the sea's dots: a disc of the same sheet, denser near the middle of the lab's sea
    const ND = light ? 26000 : 60000, dp = new Float32Array(ND * 3), ds = new Float32Array(ND);
    for (let i = 0; i < ND; i++) { const r = 34 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2; dp[i * 3] = Math.cos(a) * r; dp[i * 3 + 2] = Math.sin(a) * r; ds[i] = Math.pow(Math.random(), 2.2); }
    const dotGeo = new THREE.BufferGeometry(); dotGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dotGeo.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
    // additive light that leaves the canvas's alpha alone: on the layer's transparent canvas an alpha written per dot would darken the page under
    // every faint dot (dark specks); this way the dots only ever add light, as they did on the lab's opaque ground
    const dots = new THREE.Points(dotGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: DOTS_VS, fragmentShader: DOTS_FS, transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    dots.frustumCulled = false; dots.renderOrder = -1; dots.visible = false;
    scene.add(sheet); scene.add(dots);
    const _rot = new THREE.Matrix3(), _rt = new THREE.Matrix3(), _ry = new THREE.Matrix3(), _v = new THREE.Vector3();
    const ride = { heave: 0, pitch: 0, roll: 0 };
    return {
        opts: o, uniforms: U, sheet, dots,
        // the picked colour's hue at the lab's saturation and lightness (raw sRGB into the shader, as the lab wrote it)
        setHue(h) { U.uColor.value.setHSL(h, o.sat, o.lum); },
        // place the lab's sea: at = the ship's waterline centre, rotSea = the sea's pose (Matrix3), theta = the hero's course minus the lab camera's yaw (deg),
        // k = world units per lab unit, cam = the layer camera's position; fold 1 up .. 0 flat; vis 0..1; t in seconds
        place(at, rotSea, theta, k, cam, fold, vis, t) {
            const c = Math.cos(theta * R), s = Math.sin(theta * R);
            _ry.set(c, 0, s, 0, 1, 0, -s, 0, c);   // about the vertical
            _rot.multiplyMatrices(rotSea, _ry);
            U.uRot.value.copy(_rot); U.uAt.value.copy(at); U.uK.value = k;
            _v.copy(cam).sub(at).applyMatrix3(_rt.copy(_rot).transpose()).multiplyScalar(1 / Math.max(1e-4, k));
            U.uCam.value.set(_v.x + LAB.S[0], _v.y, _v.z + LAB.S[1]);
            U.uFold.value = fold; U.uVis.value = vis; U.uTime.value = t;
            sheet.visible = dots.visible = vis > 0.002;
        },
        // the ship on this sea: the water's height under the bow, the stern and both sides, as heave (hull lengths), pitch (rad, bow up +) and roll
        // (deg, the layer's heel sign), followed at `rate` per second. bow = the hull's x axis in the sea frame [x, z]; theta, k as in place; L = hull length (world)
        ride(bow, theta, k, L, t, dt, rate = 4) {
            const c = Math.cos(theta * R), s = Math.sin(theta * R);
            const toLab = (x, z) => [c * x - s * z, s * x + c * z];   // the transpose of the rotation about the vertical, on (x, z)
            const [bx, bz] = toLab(bow[0], bow[1]), [zx, zz] = toLab(-bow[1], bow[0]);   // the bow, and the hull's +z (toward the viewer at course 0) in the lab's sea
            const Ll = L / Math.max(1e-4, k), B = 0.3 * Ll, S0 = LAB.S[0], S1 = LAB.S[1];
            const hB = seaHeight(o, S0 + bx * Ll * 0.45, S1 + bz * Ll * 0.45, t), hS = seaHeight(o, S0 - bx * Ll * 0.45, S1 - bz * Ll * 0.45, t);
            const hP = seaHeight(o, S0 + zx * B * 0.5, S1 + zz * B * 0.5, t), hM = seaHeight(o, S0 - zx * B * 0.5, S1 - zz * B * 0.5, t);
            const f = 1 - Math.exp(-rate * dt);
            ride.heave += ((hB + hS + hP + hM) / 4 / Ll - ride.heave) * f;
            ride.pitch += (Math.atan2(hB - hS, 0.9 * Ll) - ride.pitch) * f;
            ride.roll += (-Math.atan2(hP - hM, B) * 180 / Math.PI - ride.roll) * f;
            return ride;
        },
    };
}
