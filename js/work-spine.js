/* work-spine.js — the case-study cards orbit a spine as you scroll.
 *
 * A port of the layout logic in Active Theory's "Work" page (activetheory.net):
 *   - cards sit on a descending helix, radius 3.8, 50° apart (35° portrait), facing outward
 *   - a camera target is stored per card: twice the card's position, same orientation,
 *     plus the camera's own 2-unit offset, so the camera rides an outer helix looking inward
 *   - section scroll progress (0..1) is smoothstepped inside a 6% edge, mapped to the
 *     segment between two camera targets, and the camera lerps toward it at 0.2 per frame
 *   - the camera enters from one unit above and leaves one unit below
 *   - cards scale in with a 200 ms stagger; the nearest card is "front" and plays its video
 *
 * The cards stay real DOM (three's CSS3DRenderer positions them), so links, hover states,
 * videos and theme tokens keep working. The spine and particles are WebGL on a transparent
 * canvas behind them, rendered with the same camera. Progressive: nothing here runs with
 * reduced motion, and if three.js fails to load the normal card list stays as it was.
 *
 * Dev aid: append ?ws=0.5 to the URL to land at 50% of the section's scroll.
 */

const section = document.querySelector('[data-work-spine]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const numAttr = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(+v)) ? +v : d;
const coarse = matchMedia('(pointer: coarse)').matches;

// Particle settings, shared by the page-wide layer and the tune panel (data-p-* on the section)
const pcfg = section ? {
    mode: new URLSearchParams(location.search).get('particles') || section.dataset.particles || 'page',   // 'page': one fixed layer behind the whole page | 'stage': inside the work stage | 'none'
    pCount: numAttr(section.dataset.pCount, coarse ? 128 : 256),
    pCurl: numAttr(section.dataset.pCurl, 1.4), pReturn: numAttr(section.dataset.pReturn, 1.2), pPull: numAttr(section.dataset.pPull, 3), pDamp: numAttr(section.dataset.pDamp, 0.92),
    pSize: numAttr(section.dataset.pSize, 1.7), pGlow: numAttr(section.dataset.pGlow, 1.0), pRadius: numAttr(section.dataset.pRadius, 1.6),
    pParallax: numAttr(section.dataset.pParallax, 0.004),    // units of field per scrolled pixel at mid depth; near particles move faster, far ones slower
    boat: section.dataset.boat || 'scroll',                  // sailboat of particles in the hero: 'scroll' (formed at the top, dissolves as you scroll) | 'always' | 'hover' | 'off'
    boatX: numAttr(section.dataset.boatX, 0.1), boatY: numAttr(section.dataset.boatY, -0.56), boatSize: numAttr(section.dataset.boatSize, 0.21),   // centre in NDC, hull width as a fraction of the visible width
} : null;
let layer = null;

const SIM_NOISE = `
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){ const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m; return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
    vec3 curlNoise(vec3 p){ const float e=0.08; vec3 dx=vec3(e,0,0), dy=vec3(0,e,0), dz=vec3(0,0,e); vec3 o1=vec3(31.4), o2=vec3(62.8);
      float pz_y=snoise(p+dy+o2)-snoise(p-dy+o2), py_z=snoise(p+dz+o1)-snoise(p-dz+o1);
      float px_z=snoise(p+dz)-snoise(p-dz), pz_x=snoise(p+dx+o2)-snoise(p-dx+o2);
      float py_x=snoise(p+dx+o1)-snoise(p-dx+o1), px_y=snoise(p+dy)-snoise(p-dy);
      return vec3(pz_y-py_z, px_z-pz_x, py_x-px_y)/(2.0*e); }`;
const SIM_SHARED = `
    uniform sampler2D tBoat; uniform float uForm, uScroll, uScrollFull, uH, uBob, uBoatScale, uYaw, uRoll; uniform vec3 uBoat;
    // where a particle is drawn: the field wraps vertically and scrolls with depth-dependent parallax; a formed boat particle scrolls with the page instead
    vec3 drawPos(vec3 p, float bf){ float depthF = mix(0.3, 1.6, clamp((p.z + 4.0) / 8.0, 0.0, 1.0)); float off = uScroll * depthF * (1.0 - bf);
      vec3 pw = p; float wy = mod(p.y + off + uH * 0.5, uH) - uH * 0.5; pw.y = mix(wy, p.y, bf); return pw; }
    vec3 boatTarget(vec4 b){ vec3 q = b.xyz - vec3(0.0, -0.37, 0.0);
      float cy = cos(uYaw), sy = sin(uYaw); q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);      // yaw: turn the boat toward the viewer
      float cr = cos(uRoll), sr = sin(uRoll); q = vec3(q.x, q.y * cr - q.z * sr, q.y * sr + q.z * cr);    // heel, pivoting on the waterline
      q += vec3(0.0, -0.37, 0.0);
      return vec3(uBoat.x + q.x * uBoatScale, uBoat.y + q.y * uBoatScale - uScrollFull + uBob, uBoat.z + q.z * uBoatScale); }
    float boatFlag(vec4 b){ return step(0.01, b.w); }`;
const SIM_VEL = SIM_NOISE + SIM_SHARED + `
    uniform sampler2D tHome; uniform float uTime, uDelta, uCurl, uReturn, uDamp, uPull, uRadius; uniform vec3 uCam, uDir;
    void main(){ vec2 uv=gl_FragCoord.xy/resolution.xy; vec3 p=texture2D(tPos,uv).xyz; vec3 v=texture2D(tVel,uv).xyz; vec4 h=texture2D(tHome,uv); vec4 b=texture2D(tBoat,uv);
      float bf=boatFlag(b)*uForm;
      vec3 tgt=mix(h.xyz, boatTarget(b), bf);
      vec3 f=(tgt-p)*uReturn*(1.0+1.5*bf);
      f+=curlNoise(p*0.28+vec3(0.0,uTime*0.05,0.0))*uCurl*(0.4+0.6*h.w)*(1.0-0.8*bf);
      vec3 pw=drawPos(p,bf);
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      float infl=smoothstep(uRadius,0.0,d)*step(0.5,along);
      vec3 toRay=-perp/max(d,1e-4);
      f+=toRay*infl*uPull+cross(uDir,toRay)*infl*uPull*0.6;
      v=v*uDamp+f*uDelta; gl_FragColor=vec4(v,1.0); }`;
const SIM_POS = `
    uniform sampler2D tHome; uniform float uDelta;
    void main(){ vec2 uv=gl_FragCoord.xy/resolution.xy; vec4 p=texture2D(tPos,uv); vec3 v=texture2D(tVel,uv).xyz; float w=texture2D(tHome,uv).w;
      p.xyz+=v*uDelta; gl_FragColor=vec4(p.xyz,w); }`;
const PTS_VS = SIM_SHARED + `
    uniform sampler2D tPos, tVel; uniform float uSize, uDPR, uP, uRadius, uIntro; uniform vec3 uCam, uDir; attribute vec2 ref; attribute float aSize;
    varying float vLit, vRand, vSpeed, vBoat, vShade;
    void main(){ vec4 p=texture2D(tPos,ref); vec3 v=texture2D(tVel,ref).xyz; vec4 b=texture2D(tBoat,ref); float bf=boatFlag(b)*uForm; vBoat=bf; vShade=clamp(b.w,0.0,1.0);
      vec3 pw=drawPos(p.xyz,bf);
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      vLit=smoothstep(uRadius,0.0,d)*step(0.5,along); vRand=p.w; vSpeed=length(v);
      vec4 mv=modelViewMatrix*vec4(pw,1.0);
      gl_PointSize=uSize*uDPR*aSize*(1.0+0.9*vLit+0.25*bf)*uP/max(-mv.z,1.0)*uIntro;
      gl_Position=projectionMatrix*mv; }`;
const PTS_FS = `
    uniform vec3 uColorA, uColorB, uColorLit; uniform float uGlow; varying float vLit, vRand, vSpeed, vBoat, vShade;
    void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; float disc=smoothstep(0.5,0.08,d);
      vec3 col=mix(uColorA,uColorB,smoothstep(0.25,0.85,vRand)); col=mix(col,uColorLit,clamp(vLit*0.9+smoothstep(0.8,3.0,vSpeed)*0.15+0.7*vBoat*vShade,0.0,1.0));
      float a=disc*(0.24+0.5*vLit)*(1.0+vBoat*(0.1+1.4*vShade))*uGlow; gl_FragColor=vec4(col*(0.85+0.35*vLit+0.3*vBoat*vShade),a); }`;

/* The picked colour, pushed to a vivid tint: the page's --button-color is derived from the picker with
   lightness tweaks that can leave it muted, and additive blending over a grey ground washes it out further. */
function vividAccent(THREE, light) {
    const c = new THREE.Color();
    try { c.setStyle((getComputedStyle(document.body).getPropertyValue('--button-color') || '').trim() || '#4faad1'); } catch (e) { c.set(0x4faad1); }
    const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    return c.setHSL(hsl.h, Math.max(hsl.s, 0.8), light ? 0.38 : 0.6);
}

/* A sailboat sampled as 3D surfaces, in boat space (hull length 1, y up, z toward the viewer):
   hull with elliptical cross-sections and a pointed bow, deck and gunwale, mast and boom, main and jib
   with a belly, ripples on the water, and a dim mirrored reflection below the waterline.
   Returns [x, y, z, shade]; shade is a baked Lambert term from the surface normal (light upper-left-front). */
const WATERLINE = -0.37;
function sampleBoat() {
    const L = [-0.45, 0.72, 0.53];                                      // normalised-ish light direction
    const shade = n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; const d = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / l; return Math.min(1, 0.3 + 0.7 * Math.max(0, d)); };
    const beam = x => 0.14 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 0.02) / 0.54, 2)));
    const depth = x => 0.11 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 0.02) / 0.54, 2))) + 0.02;
    const tri = (A, B, C) => { let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; } return [A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v]; };
    const onEdge = (A, B) => { const t = Math.random(); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; };
    // sails: a belly toward +z, strongest mid-chord near the foot; the normal tilts with the belly
    const sail = (head, tack, clew, edges) => {
        let [x, y] = Math.random() < 0.22 ? onEdge(...edges[Math.floor(Math.random() * edges.length)]) : tri(head, tack, clew);
        const hFrac = Math.min(1, Math.max(0, (y - tack[1]) / (head[1] - tack[1])));
        const luffX = head[0] + (tack[0] - head[0]) * (1 - hFrac), leechX = head[0] + (clew[0] - head[0]) * (1 - hFrac);
        const across = leechX === luffX ? 0 : Math.min(1, Math.max(0, (x - luffX) / (leechX - luffX)));
        const belly = 0.11 * (0.35 + 0.65 * (1 - hFrac));
        const z = belly * Math.sin(Math.PI * across);
        const n = [-Math.cos(Math.PI * across) * belly * 4, 0.15, 1];
        return [x, y, z, shade(n)];
    };
    const main = { head: [-0.05, 0.64], tack: [-0.05, -0.23], clew: [0.47, -0.23] };
    const jib = { head: [-0.08, 0.46], tack: [-0.5, -0.27], clew: [-0.1, -0.24] };
    const r = Math.random();
    if (r < 0.26) return sail(main.head, main.tack, main.clew, [[main.head, main.tack], [main.head, main.clew], [main.tack, main.clew]]);
    if (r < 0.39) return sail(jib.head, jib.tack, jib.clew, [[jib.head, jib.tack], [jib.head, jib.clew], [jib.tack, jib.clew]]);
    if (r < 0.57) {                                                       // hull above the waterline, plus gunwale
        for (let k = 0; k < 8; k++) {
            const x = -0.52 + 1.04 * Math.random(), th = (Math.random() * 2 - 1) * Math.PI / 2, b = beam(x), d = depth(x);
            const gun = Math.random() < 0.25;
            const y = gun ? -0.30 : -0.30 - d * Math.cos(th), z = gun ? (Math.random() < 0.5 ? b : -b) : b * Math.sin(th);
            if (y < WATERLINE - 0.005) continue;
            const bow = x > 0.25 ? -(x - 0.25) * 1.5 : 0;
            return [x, y, z, shade(gun ? [0, 1, 0] : [bow, -Math.cos(th) * 0.6, Math.sin(th)])];
        }
        return [0, -0.30, 0, 0.6];
    }
    if (r < 0.62) {                                                       // deck
        const x = -0.52 + 1.04 * Math.random(), z = beam(x) * (Math.random() * 2 - 1) * 0.92;
        return [x, -0.30, z, shade([0, 1, 0]) * 0.9];
    }
    if (r < 0.66) {                                                       // mast and boom
        if (Math.random() < 0.7) return [-0.06 + (Math.random() - 0.5) * 0.01, -0.30 + Math.random() * 0.96, 0, 0.75];
        const t = Math.random(); return [-0.06 + 0.53 * t, -0.235, 0.01, 0.7];
    }
    if (r < 0.84) {                                                       // water: ripples denser near the hull
        const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.6);
        const x = Math.cos(a) * rr * 1.25, z = Math.sin(a) * rr * 0.75;
        const rip = 0.5 + 0.5 * Math.sin(rr * 26 - a * 2);
        return [x, WATERLINE - 0.004 + 0.008 * rip, z, 0.35 + 0.35 * rip];
    }
    // reflection: mirror a sail or hull sample under the waterline, rippled and dim
    const src = Math.random() < 0.65 ? sail(main.head, main.tack, main.clew, [[main.head, main.tack], [main.head, main.clew], [main.tack, main.clew]]) : sail(jib.head, jib.tack, jib.clew, [[jib.head, jib.tack], [jib.head, jib.clew], [jib.tack, jib.clew]]);
    return [src[0] + 0.02 * Math.sin(src[1] * 32), 2 * WATERLINE - src[1], src[2], Math.max(0.05, src[3] * 0.3)];
}

/* Page-wide particle layer: a fixed canvas behind everything (z-index -1, no pointer events), the same
   simulation as the lab, with the field wrapping vertically so it follows the page scroll with a little parallax. */
function startParticleLayer(THREE, GPUC) {
    if (!GPUC) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'ws-particles'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1.6s ease';
    document.body.appendChild(canvas);   // appended last: z-index does the layering, and nothing else on the page sees it as the first canvas
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' }); } catch (e) { canvas.remove(); return; }
    if (!gl.capabilities.isWebGL2) { gl.dispose(); canvas.remove(); return; }
    gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); gl.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.5, 60);
    camera.position.set(0, 0, 12);
    const M = THREE.MathUtils, N = Math.max(32, Math.round(pcfg.pCount)), COUNT = N * N, H = 11;
    const gpu = new GPUC.GPUComputationRenderer(N, N, gl);
    if (coarse) gpu.setDataType(THREE.HalfFloatType);
    const pos0 = gpu.createTexture(), vel0 = gpu.createTexture(), home = gpu.createTexture(), boat = gpu.createTexture();
    const boatCount = pcfg.boat === 'off' ? 0 : Math.floor(COUNT * 0.18);
    for (let i = 0; i < COUNT; i++) {
        const x = (Math.random() * 2 - 1) * 10, y = (Math.random() - 0.5) * H, z = (Math.random() * 2 - 1) * 4, w = Math.random();
        home.image.data.set([x, y, z, w], i * 4);
        pos0.image.data.set([x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z, w], i * 4);
        if (i < boatCount) { const [bx, by, bz, sh] = sampleBoat(); boat.image.data.set([bx, by, bz, Math.max(0.02, sh)], i * 4); }
    }
    home.needsUpdate = true; boat.needsUpdate = true;
    const boatU = () => ({ tBoat: { value: boat }, uForm: { value: 0 }, uScrollFull: { value: 0 }, uBob: { value: 0 }, uBoatScale: { value: 1 }, uBoat: { value: new THREE.Vector3() }, uYaw: { value: 0 }, uRoll: { value: 0 } });
    const velVar = gpu.addVariable('tVel', SIM_VEL, vel0), posVar = gpu.addVariable('tPos', SIM_POS, pos0);
    gpu.setVariableDependencies(velVar, [posVar, velVar]); gpu.setVariableDependencies(posVar, [posVar, velVar]);
    const velU = velVar.material.uniforms, posU = posVar.material.uniforms;
    Object.assign(velU, { tHome: { value: home }, uTime: { value: 0 }, uDelta: { value: 0 }, uCurl: { value: pcfg.pCurl }, uReturn: { value: pcfg.pReturn }, uDamp: { value: pcfg.pDamp }, uPull: { value: pcfg.pPull }, uRadius: { value: pcfg.pRadius }, uScroll: { value: 0 }, uH: { value: H }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, boatU());
    Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 } });
    const err = gpu.init(); if (err) { console.warn('work-spine: particle layer', err); gl.dispose(); canvas.remove(); return; }
    const geo = new THREE.BufferGeometry(), ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.4 + Math.random() * 0.5 : 0.5 + Math.random() * 0.5; }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ tPos: { value: null }, tVel: { value: null }, uSize: { value: pcfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: pcfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: H },
            uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uColorA: { value: new THREE.Color(0x4faad1) }, uColorB: { value: new THREE.Color(0x4faad1) }, uColorLit: { value: new THREE.Color(0xffffff) }, uGlow: { value: pcfg.pGlow } }, boatU()),
        vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const U = mat.uniforms;
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
    let visW = 1, visH = 1;
    const raycaster = new THREE.Raycaster();
    const pointer = { ndc: new THREE.Vector2(), target: new THREE.Vector2(), active: false, last: 0 };
    addEventListener('pointermove', e => { pointer.target.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)); pointer.active = true; pointer.last = performance.now(); }, { passive: true });
    // point size = uSize * uP / depth; this world is in units (the stage's is in px), so the reference depth is the camera distance
    function resize() {
        const w = innerWidth, h = innerHeight; gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); U.uP.value = camera.position.z;
        visH = 2 * camera.position.z * Math.tan(M.degToRad(camera.fov) / 2); visW = visH * camera.aspect;
        const portrait = h > w, bx = portrait ? 0 : pcfg.boatX, by = portrait ? -0.5 : pcfg.boatY, size = (portrait ? 0.6 : pcfg.boatSize) * visW;
        for (const u of [velU, U]) { u.uBoat.value.set(bx * visW / 2, by * visH / 2, 0); u.uBoatScale.value = size; }
    }
    addEventListener('resize', resize); resize();
    function applyTheme() {
        const light = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
        const v = vividAccent(THREE, light);
        U.uColorA.value.copy(v);
        U.uColorB.value.copy(v).lerp(new THREE.Color(light ? 0x000000 : 0xffffff), light ? 0.15 : 0.2);
        U.uColorLit.value.copy(v).lerp(new THREE.Color(0xffffff), light ? 0.2 : 0.55);
        U.uGlow.value = pcfg.pGlow * (light ? 1.6 : 1);
        mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; mat.needsUpdate = true;
    }
    applyTheme();
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let last = performance.now(), shown = false, form = pcfg.boat === 'off' ? 0 : 1;
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; const t = now * 0.001;
        const stale = !pointer.active || now - pointer.last > 2500;
        if (stale) pointer.target.set(0.55 * Math.sin(t * 0.23), 0.35 * Math.sin(t * 0.31 + 1.0));
        pointer.ndc.lerp(pointer.target, stale ? 0.03 : 0.12);
        raycaster.setFromCamera(pointer.ndc, camera);
        velU.uCam.value.copy(raycaster.ray.origin); velU.uDir.value.copy(raycaster.ray.direction);
        U.uCam.value.copy(raycaster.ray.origin); U.uDir.value.copy(raycaster.ray.direction);
        velU.uScroll.value = U.uScroll.value = -scrollY * pcfg.pParallax;
        // the boat: formed at the top of the page, dissolving into the field over the first 380 px of scroll
        const settled = 1 - M.smoothstep(scrollY, 60, 380);
        const formTarget = pcfg.boat === 'always' ? 1 : pcfg.boat === 'hover' ? (stale ? 0 : settled) : pcfg.boat === 'scroll' ? settled : 0;
        form += (formTarget - form) * 0.04;
        const fullSpeed = pcfg.boat === 'always' ? 0 : scrollY * visH / innerHeight;   // page speed in units at the boat's depth
        for (const u of [velU, U]) { u.uForm.value = form; u.uScrollFull.value = fullSpeed; u.uBob.value = 0.04 * Math.sin(t * 0.8) * form; u.uYaw.value = -0.62 + 0.09 * Math.sin(t * 0.21); u.uRoll.value = 0.16 + 0.06 * Math.sin(t * 0.6); }
        velU.uTime.value = t; velU.uDelta.value = dt; posU.uDelta.value = dt;
        gpu.compute();
        U.tPos.value = gpu.getCurrentRenderTarget(posVar).texture; U.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
        U.uIntro.value = Math.min(1, U.uIntro.value + dt * 0.5);
        gl.render(scene, camera);
        if (!shown) { shown = true; canvas.style.opacity = '1'; }
        requestAnimationFrame(frame);
    }
    let running = true; last = performance.now(); requestAnimationFrame(frame);   // a hidden tab simply stops getting animation frames
    layer = {
        sync() { velU.uCurl.value = pcfg.pCurl; velU.uReturn.value = pcfg.pReturn; velU.uDamp.value = pcfg.pDamp; velU.uPull.value = pcfg.pPull; velU.uRadius.value = pcfg.pRadius; U.uSize.value = pcfg.pSize; U.uRadius.value = pcfg.pRadius; applyTheme(); resize(); },
    };
}

if (section && !reduced && 'IntersectionObserver' in window) boot();

async function boot() {
    const cards = [...section.querySelectorAll('.case-study-teaser')];

    // three loads after the page has loaded and the browser is idle, so it never competes with the hero
    await new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
    await new Promise(r => ('requestIdleCallback' in window) ? requestIdleCallback(r, { timeout: 2000 }) : setTimeout(r, 400));

    let THREE, CSS3D, ENV, GPUC = null;
    try {
        [THREE, CSS3D, ENV] = await Promise.all([
            import('three'),
            import('three/addons/renderers/CSS3DRenderer.js'),
            import('three/addons/environments/RoomEnvironment.js'),
        ]);
    } catch (err) {
        console.warn('work-spine: three.js did not load, keeping the flat list.', err);
        return;
    }
    try { GPUC = await import('three/addons/misc/GPUComputationRenderer.js'); } catch (e) { console.warn('work-spine: no GPU particles', e); }
    if (pcfg.mode === 'page') startParticleLayer(THREE, GPUC);
    if (cards.length < 2) return;
    // the work section itself waits until it is within 1.5 viewports
    await new Promise(resolve => {
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) { io.disconnect(); resolve(); }
        }, { rootMargin: '150% 0px' });
        io.observe(section);
    });
    init(THREE, CSS3D, ENV, GPUC, cards);
}

function init(THREE, { CSS3DRenderer, CSS3DObject }, { RoomEnvironment }, GPUC, cards) {
    const stage = section.querySelector('.work-spine__stage');
    const glCanvas = stage.querySelector('.work-spine__gl');
    const cssHost = stage.querySelector('.work-spine__css');
    const rail = stage.querySelector('.work-spine__rail');
    const count = stage.querySelector('.work-spine__count');
    const n = cards.length;
    const ds = section.dataset;

    // Their numbers. Override any of them with data-* attributes on the section.
    const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(+v)) ? +v : d;
    const cfg = {
        radius: num(ds.radius, 3.8),
        step: num(ds.step, 50),                 // degrees between cards
        stepPortrait: num(ds.stepPortrait, 45),   // theirs is 35; 45 lets phone cards keep their width under the clearance cap
        fov: num(ds.fov, 35),
        fovPortrait: num(ds.fovPortrait, 55),
        camOffset: num(ds.camOffset, 2),        // camera's local z offset inside its group
        edge: num(ds.edge, 0), edgePortrait: 0,        // scroll dead zone at both ends; 0 keeps the motion continuous with the page scroll
        lerp: num(ds.lerp, 0.2),
        blend: num(ds.blend, 0.45),            // end blend, as a fraction of the viewport height: over this much scroll after the pin the card keeps
                                                // moving up at page speed and decelerates to centre (velocity-matched), and the reverse before release; 0 = hard stop
        cardFrac: num(ds.cardFrac, 0.6),        // card width as a fraction of the visible width (upper bound; see layout())
        gap: num(ds.gap, 0.45),                 // minimum clearance between neighbouring cards, in units
        cardFracPortrait: 0.86,
        spineScale: num(ds.spineScale, 1),
        spineSpacing: num(ds.spineSpacing, 0.65),   // their SpineInstancer: y = 4 - 0.65 i
        spineTwist: num(ds.spineTwist, 0.4),        // rotation.y = 0.4 i
        scrollPerCard: num(ds.scrollPerCard, 60),   // vh of scrolling per card
        polyScale: num(ds.polyScale, 1),            // polystar size multiplier
        polyOpacity: num(ds.polyOpacity, 0.9),      // polystar opacity (dark theme; light theme uses 0.8 of it)
        axisOrbs: num(ds.axisOrbs, 0),              // 'axis': 1 adds a chrome node per card with rings, satellites, flare and a hanger
        // GPU particles: shared settings (see pcfg at the top; data-p-* attributes)
        ...pcfg,
        // what sits on the helix axis: 'none' | 'axis' (a line with a node per card) | 'spine' (their vertebrae)
        // | 'polystar' (the hero Lottie's language: 22 rounded pentagons with a fat gradient stroke)
        centerpiece: new URLSearchParams(location.search).get('centerpiece') || ds.centerpiece || 'none',
    };

    const { MathUtils: M } = THREE;
    const smooth = (x, a, b) => M.smoothstep(x, a, b);

    /* ---------- CSS3D layer: the cards ---------- */
    const cssScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cfg.fov, 1, 1, 10000);
    const cssRenderer = new CSS3DRenderer({ element: cssHost });

    const items = cards.map((card, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'ws-card';
        wrap.appendChild(card);
        const obj = new CSS3DObject(wrap);
        cssScene.add(obj);
        return { obj, wrap, card, video: card.querySelector('video'), intro: 0, index: i };
    });

    rail.innerHTML = items.map(() => '<i></i>').join('');
    const dots = [...rail.children];

    section.style.setProperty('--ws-count', n);
    section.style.setProperty('--ws-vh', cfg.scrollPerCard + 'vh');
    section.classList.add('is-3d');

    /* ---------- WebGL layer: the spine ---------- */
    let gl = null, glScene = null, spineParts = [], particles = null, keyLight = null;
    const world = new THREE.Group();          // spine + particles, scaled to S each layout
    try {
        gl = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        glScene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(gl);
        glScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        glScene.add(world);
        queueMicrotask(() => {        // runs after the declarations below
            if (cfg.centerpiece === 'spine') buildSpine();
            else if (cfg.centerpiece === 'axis') buildAxis();
            else if (cfg.centerpiece === 'polystar') buildPolystar();
            if (cfg.mode === 'stage') buildParticles();
            applyTheme();
        });
    } catch (err) {
        console.warn('work-spine: WebGL unavailable, cards only.', err);
        gl = null;
        glCanvas.remove();
    }

    function buildSpine() {
        // A vertebra from primitives: a spool-shaped body plus three processes.
        const profile = [[0, -0.24], [0.34, -0.24], [0.4, -0.19], [0.3, -0.05], [0.3, 0.05], [0.4, 0.19], [0.34, 0.24], [0, 0.24]]
            .map(([x, y]) => new THREE.Vector2(x, y));
        const body = new THREE.LatheGeometry(profile, 48);
        const proc = new THREE.CapsuleGeometry(0.065, 0.42, 4, 14);
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xc3ccd8, metalness: 1, roughness: 0.26,
            iridescence: 0.35, iridescenceIOR: 1.4, iridescenceThicknessRange: [140, 420],
            envMapIntensity: 1,
        });
        const COUNT = 40, SPACING = 0.65, TOP = 8;
        const bodies = new THREE.InstancedMesh(body, mat, COUNT);
        const procs = new THREE.InstancedMesh(proc, mat, COUNT * 3);
        spine = { bodies, procs, count: COUNT, top: TOP };
        layoutSpine();
        world.add(bodies, procs);
        spineParts = [bodies, procs];

        keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(4, 6, 5);
        glScene.add(keyLight, new THREE.HemisphereLight(0xffffff, 0x223344, 0.35));

    }

    // Particles. With GPUComputationRenderer: the lab's "antimatter" system — positions and velocities in
    // ping-pong float textures, curl noise, a spring to a home position, and the cursor's ray pulling and
    // swirling particles toward it while lighting up everything along its depth. Fallback: a drifting cloud.
    const raycaster = new THREE.Raycaster();
    const pointer = { ndc: new THREE.Vector2(), target: new THREE.Vector2(), active: false, last: 0 };
    addEventListener('pointermove', e => {
        const r = stage.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
        if (x >= -1 && x <= 1 && y >= -1 && y <= 1) { pointer.target.set(x, y); pointer.active = true; pointer.last = performance.now(); }
    }, { passive: true });
    function buildParticles() {
        if (GPUC && gl.capabilities.isWebGL2) { try { buildGPUParticles(); return; } catch (e) { console.warn('work-spine: GPU particles failed, using the simple cloud', e); } }
        const P = 500, pos = new Float32Array(P * 3);
        for (let i = 0; i < P; i++) {
            const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 2.6, h = 9 - Math.random() * 28;
            pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
        }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x4faad1, size: 0.045 * S, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
        particles.userData.legacy = true;
        world.add(particles);
    }
    function buildGPUParticles() {
        const N = Math.max(32, Math.round(cfg.pCount)), COUNT = N * N;
        const gpu = new GPUC.GPUComputationRenderer(N, N, gl);
        if (matchMedia('(pointer: coarse)').matches) gpu.setDataType(THREE.HalfFloatType);
        const pos0 = gpu.createTexture(), vel0 = gpu.createTexture(), home = gpu.createTexture();
        const span = yStep * (n - 1);
        for (let i = 0; i < COUNT; i++) {
            const a = Math.random() * Math.PI * 2, r = 1.2 + 6.6 * Math.sqrt(Math.random()), y = 4 - Math.random() * (span + 8), w = Math.random();
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            home.image.data.set([x, y, z, w], i * 4);
            pos0.image.data.set([x + (Math.random() - 0.5), y + (Math.random() - 0.5), z + (Math.random() - 0.5), w], i * 4);
        }
        home.needsUpdate = true;
        const velVar = gpu.addVariable('tVel', SIM_VEL, vel0), posVar = gpu.addVariable('tPos', SIM_POS, pos0);
        gpu.setVariableDependencies(velVar, [posVar, velVar]); gpu.setVariableDependencies(posVar, [posVar, velVar]);
        const velU = velVar.material.uniforms, posU = posVar.material.uniforms;
        const noBoat = () => ({ tBoat: { value: home }, uForm: { value: 0 }, uScrollFull: { value: 0 }, uBob: { value: 0 }, uBoatScale: { value: 1 }, uBoat: { value: new THREE.Vector3() }, uYaw: { value: 0 }, uRoll: { value: 0 } });
        Object.assign(velU, { tHome: { value: home }, uTime: { value: 0 }, uDelta: { value: 0 }, uCurl: { value: cfg.pCurl }, uReturn: { value: cfg.pReturn }, uDamp: { value: cfg.pDamp }, uPull: { value: cfg.pPull }, uRadius: { value: cfg.pRadius }, uScroll: { value: 0 }, uH: { value: 1e5 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, noBoat());
        Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 } });
        const err = gpu.init(); if (err) throw new Error(err);
        const geo = new THREE.BufferGeometry();
        const ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.8 + Math.random() * 1.0 : 0.5 + Math.random() * 0.6; }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
        geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: Object.assign(noBoat(), { tPos: { value: null }, tVel: { value: null }, uSize: { value: cfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: cfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: 1e5 },
                uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uColorA: { value: new THREE.Color(0x4faad1) }, uColorB: { value: new THREE.Color(0xbfe6ff) }, uColorLit: { value: new THREE.Color(0xe6f4ff) }, uGlow: { value: cfg.pGlow } }),
            vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        particles = new THREE.Points(geo, mat); particles.frustumCulled = false;
        particles.userData = { gpu, velVar, posVar, velU, posU, ptsU: mat.uniforms, isGPU: true };
        world.add(particles);
        layoutParticles();
    }
    function layoutParticles() {
        if (!particles || !particles.userData.isGPU) return;
        particles.userData.ptsU.uP.value = stage.clientHeight / (2 * Math.tan(M.degToRad(camera.fov) / 2));
    }
    function syncParticles() {
        if (!particles || !particles.userData.isGPU) return;
        const { velU, ptsU } = particles.userData;
        velU.uCurl.value = cfg.pCurl; velU.uReturn.value = cfg.pReturn; velU.uDamp.value = cfg.pDamp; velU.uPull.value = cfg.pPull; velU.uRadius.value = cfg.pRadius;
        ptsU.uSize.value = cfg.pSize; ptsU.uGlow.value = cfg.pGlow; ptsU.uRadius.value = cfg.pRadius;
    }
    function updateParticles(now, dt) {
        const u = particles.userData, t = now * 0.001;
        const stale = !pointer.active || now - pointer.last > 2500;
        if (stale) pointer.target.set(0.55 * Math.sin(t * 0.23), 0.35 * Math.sin(t * 0.31 + 1.0));   // idle: the light wanders
        pointer.ndc.lerp(pointer.target, stale ? 0.03 : 0.12);
        raycaster.setFromCamera(pointer.ndc, camera);
        u.velU.uCam.value.copy(raycaster.ray.origin).divideScalar(S); u.velU.uDir.value.copy(raycaster.ray.direction);
        u.ptsU.uCam.value.copy(u.velU.uCam.value); u.ptsU.uDir.value.copy(raycaster.ray.direction);
        u.velU.uTime.value = t; u.velU.uDelta.value = dt; u.posU.uDelta.value = dt;
        u.gpu.compute();
        u.ptsU.tPos.value = u.gpu.getCurrentRenderTarget(u.posVar).texture;
        u.ptsU.tVel.value = u.gpu.getCurrentRenderTarget(u.velVar).texture;
        u.ptsU.uIntro.value = Math.min(1, u.ptsU.uIntro.value + dt * 0.6);
    }

    /* Centerpiece 'polystar': the hero's Lottie, rebuilt in 3D. The Lottie is one 5-point polygon
       (outer roundness 30%) with a gradient stroke almost as wide as its radius (371 on r 384),
       a repeater of 22 copies each offset (-14, 16) and rotated 5°, the whole thing turning
       360° per 60 s. Here each copy is a flat ring mesh with the same gradient, billboarded to the
       camera and parked on the helix axis, so the figure follows you into the work section. */
    let polystar = null;
    function roundedPolygon(sides, R, roundness, seg) {
        // corner rounding as tangent arcs; roundness 0..1 of the max radius that fits
        const pts = [], corner = [];
        for (let i = 0; i < sides; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / sides; corner.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R)); }
        const side = corner[0].distanceTo(corner[1]), half = Math.PI / sides;
        const t = Math.min(side / 2, roundness * side / 2), rho = t * Math.tan(half);   // tangent length, arc radius
        for (let i = 0; i < sides; i++) {
            const V = corner[i], A = corner[(i + sides - 1) % sides], B = corner[(i + 1) % sides];
            const a = A.clone().sub(V).normalize(), b = B.clone().sub(V).normalize();
            const p0 = V.clone().addScaledVector(a, t), p1 = V.clone().addScaledVector(b, t);
            const bis = a.clone().add(b).normalize(), c = V.clone().addScaledVector(bis, rho / Math.sin(half * 2 / 2 + (Math.PI / 2 - half)));
            const a0 = Math.atan2(p0.y - c.y, p0.x - c.x); let a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
            while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
            for (let k = 0; k <= seg; k++) { const ang = a0 + (a1 - a0) * k / seg; pts.push(new THREE.Vector2(c.x + Math.cos(ang) * rho, c.y + Math.sin(ang) * rho)); }
        }
        return pts;
    }
    function buildPolystar() {
        const COPIES = 22, R = 1.0, W = 0.97 * R;                    // their 371 / 384
        const outer = roundedPolygon(5, R + W / 2, 0.3, 8), inner = roundedPolygon(5, R - W / 2, 0.3, 8);
        // ring as a strip between the two outlines, with a stroke coordinate: 0 at the inner edge, 1 at the outer
        const N = outer.length, pos = new Float32Array(N * 2 * 3), t = new Float32Array(N * 2), idx = [];
        for (let i = 0; i < N; i++) {
            pos.set([inner[i].x, inner[i].y, 0], i * 6); pos.set([outer[i].x, outer[i].y, 0], i * 6 + 3); t[i * 2] = 0; t[i * 2 + 1] = 1;
            const j = (i + 1) % N; idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('t', new THREE.BufferAttribute(t, 1)); geo.setIndex(idx);
        const mat = new THREE.ShaderMaterial({
            uniforms: { uA: { value: new THREE.Color(0x4faad1) }, uB: { value: new THREE.Color(0x0d1a22) }, uOpacity: { value: 0.9 }, uR: { value: R + W / 2 } },
            vertexShader: 'attribute float t; varying vec2 vP; varying float vT; void main(){ vP = position.xy; vT = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            // vertical fade like the Lottie's gradient, times a bright outer edge: each copy shows its outer sliver as a light arc over the previous copy's dark body
            fragmentShader: 'uniform vec3 uA, uB; uniform float uOpacity, uR; varying vec2 vP; varying float vT; void main(){ float v = clamp((vP.y + uR * 1.1) / (uR * 2.2), 0.0, 1.0); float edge = pow(vT, 6.0); vec3 c = mix(uB, uA, edge * (0.35 + 0.65 * v)); gl_FragColor = vec4(c, uOpacity * (0.55 + 0.45 * edge)); }',
            transparent: true, depthWrite: false, side: THREE.DoubleSide,
        });
        const group = new THREE.Group(), copies = [];
        for (let k = 0; k < COPIES; k++) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(-0.05 * k, 0.057 * k, 0.002 * k);          // their (-14, 16) per copy, relative to r 384, opened up a little
            m.rotation.z = M.degToRad(5 * k);
            m.renderOrder = k;
            group.add(m); copies.push(m);
        }
        world.add(group);
        polystar = { group, copies, mat, scale: 1 };
        layoutPolystar();
    }
    function layoutPolystar() {
        if (!polystar) return;
        // roughly two cards tall, parked up and to the right so only the fan's lower-left arcs sweep behind the cards (the hero crops it the same way)
        polystar.scale = (portrait ? 1.6 : 2.0) * cfg.polyScale * lastCardW * 0.65 / 2;
        polystar.group.scale.setScalar(polystar.scale);
    }

    /* Centerpiece 'axis': one line down the helix, one node per card. Cheap tricks only:
       sprites with canvas-drawn glows, additive ribbons, a shader with travelling pulses, chrome
       iridescent nodes off the environment map, rings and satellites on the lit node, a spark that
       jumps node to node when the front card changes, a callout to the card, a faint dot grid behind. */
    let axis = null;
    function glowTexture(kind) {
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
        const rad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        rad.addColorStop(0, 'rgba(255,255,255,1)'); rad.addColorStop(0.18, 'rgba(255,255,255,0.55)'); rad.addColorStop(0.5, 'rgba(255,255,255,0.12)'); rad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rad; g.fillRect(0, 0, 256, 256);
        if (kind === 'flare') {
            const h = g.createLinearGradient(0, 128, 256, 128);
            h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,0.9)'); h.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = h; g.fillRect(0, 124, 256, 8);
            g.globalAlpha = 0.5; g.fillRect(0, 126, 256, 4); g.globalAlpha = 1;
            g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 78, 0, Math.PI * 2); g.stroke();
        }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const LINE_VS = 'varying float vY; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }';
    const LINE_FS = `uniform vec3 uColor; uniform float uTime, uCamY, uTop, uBottom, uS, uRibbon, uIntro;
        varying float vY; varying vec2 vUv;
        void main(){
            float y = vY / uS;
            float edge = smoothstep(uBottom, uBottom + 2.5, y) * smoothstep(uTop, uTop - 2.5, y);
            float lit = mix(0.22, 1.0, smoothstep(uCamY - 0.45, uCamY + 0.25, y));          // above you: visited and bright
            float pulse = 0.0;
            for (int k = 0; k < 3; k++) { float pk = fract(uTime * 0.09 + float(k) * 0.37); float py = uTop - pk * (uTop - uBottom); pulse += exp(-pow((y - py) * 4.5, 2.0)); }
            pulse = min(pulse, 1.0);
            vec3 c = mix(uColor, vec3(1.0), pulse * 0.85);
            float a = edge * uIntro;
            if (uRibbon > 0.5) { float w = pow(sin(vUv.x * 3.14159), 2.4); a *= w * (0.16 * lit + 0.45 * pulse); }
            else { a *= 0.55 + 0.45 * lit + pulse; }
            gl_FragColor = vec4(c, a);
        }`;
    function buildAxis() {
        const accent = new THREE.Color(0x4faad1);
        const uni = () => ({ uColor: { value: accent.clone() }, uTime: { value: 0 }, uCamY: { value: 0 }, uTop: { value: 6 }, uBottom: { value: -6 }, uS: { value: S }, uRibbon: { value: 0 }, uIntro: { value: 0 } });
        const coreMat = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false });
        const ribbonMat = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        ribbonMat.uniforms.uRibbon.value = 1;
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 10, 1, true), coreMat);
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1, 1, 1), ribbonMat);
        world.add(core, ribbon);

        const haloTex = glowTexture('halo'), flareTex = glowTexture('flare');
        const orbs = cfg.axisOrbs > 0.5;
        const nodeMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe8f2, metalness: 1, roughness: 0.16, iridescence: 0.7, iridescenceIOR: 1.5, iridescenceThicknessRange: [120, 420], envMapIntensity: 1.1 });
        const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd9e6, metalness: 1, roughness: 0.22, iridescence: 0.6, envMapIntensity: 1 });
        const nodes = [], halos = [];
        for (let i = 0; i < n && orbs; i++) {
            const nd = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 20), nodeMat); world.add(nd); nodes.push(nd);
            const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: accent.clone(), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
            h.scale.setScalar(0.55); world.add(h); halos.push(h);
        }
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: accent.clone().lerp(new THREE.Color(0xffffff), 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        flare.scale.setScalar(1.15); if (orbs) world.add(flare);
        const rings = !orbs ? [] : [0, 1].map(k => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 + k * 0.08, 0.005, 10, 96), ringMat); r.scale.setScalar(0.001); world.add(r); return r; });
        const sats = !orbs ? [] : [0, 1, 2].map(k => {
            const g = new THREE.Group();
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.5) }));
            const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: accent.clone(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.setScalar(0.16);
            g.add(m, h); g.visible = false; world.add(g); return g;
        });
        const callout = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), new THREE.MeshBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        if (orbs) world.add(callout);
        const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: new THREE.Color(0xffffff), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        spark.scale.set(orbs ? 0.4 : 0.14, orbs ? 0.4 : 0.9, 1); world.add(spark);   // without orbs the spark is a dash of light on the line
        // dot grid backdrop, like the hero's grid canvas: a billboard behind the axis, fading out radially
        const gridMat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: accent.clone() }, uAlpha: { value: 0.16 }, uTime: { value: 0 } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform vec3 uColor; uniform float uAlpha, uTime; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 24.0; vec2 f = fract(q + vec2(0.0, uTime * 0.02)) - 0.5; float d = length(f); float dot = smoothstep(0.09, 0.03, d); float fade = 1.0 - smoothstep(0.15, 0.5, length(vUv - 0.5)); gl_FragColor = vec4(uColor, dot * fade * uAlpha); }',
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        const grid = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), gridMat); world.add(grid);
        axis = { orbs, core, ribbon, coreMat, ribbonMat, nodes, halos, nodeMat, ringMat, flare, rings, sats, callout, spark, grid, gridMat, nodeY: [], sparkT: 1, sparkFrom: 0, sparkTo: 0, intro: 0 };
        layoutAxis();
    }
    function layoutAxis() {
        if (!axis) return;
        const span = yStep * (n - 1), pad = 6, top = pad, bottom = -span - pad;
        for (const m of [axis.core, axis.ribbon]) { m.scale.y = top - bottom; m.position.y = (top + bottom) / 2; }
        for (const mat of [axis.coreMat, axis.ribbonMat]) { mat.uniforms.uTop.value = top; mat.uniforms.uBottom.value = bottom; mat.uniforms.uS.value = S; }
        // the node sits on the axis, farther from the camera than the card plane, so a gap above the card's top
        // edge must be scaled by that depth ratio to still clear the edge on screen
        const crown = (lastCardH / 2 + 0.15) * (2 * cfg.radius + cfg.camOffset) / (cfg.radius + cfg.camOffset);
        axis.nodeY = items.map((_, i) => -yStep * i + (axis.orbs ? crown : 0));
        axis.nodes.forEach((nd, i) => { nd.position.y = axis.nodeY[i]; axis.halos[i].position.y = nd.position.y; });
    }
    function axisSpark(from, to) {
        if (!axis || from < 0 || from === to) return;
        axis.sparkFrom = from; axis.sparkTo = to; axis.sparkT = 0;
    }
    const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
    function updateAxis(now, dt) {
        const t = now * 0.001, camY = camGroup.position.y / S, cx = camera.position.x / S, cz = camera.position.z / S;
        axis.intro = Math.min(1, axis.intro + dt * 0.8);
        for (const mat of [axis.coreMat, axis.ribbonMat]) { mat.uniforms.uTime.value = t; mat.uniforms.uCamY.value = camY; mat.uniforms.uIntro.value = axis.intro; }
        axis.ribbon.lookAt(cx, axis.ribbon.position.y, cz);
        axis.grid.lookAt(cx, axis.grid.position.y, cz); axis.grid.position.y = camY; axis.gridMat.uniforms.uTime.value = t;
        const fi = frontIndex < 0 ? 0 : frontIndex, fn = axis.nodes[fi];
        if (axis.orbs) axis.nodes.forEach((nd, i) => {
            const k = i === fi ? 1 : 0, visited = nd.position.y > camY - 0.2 ? 1 : 0;
            nd.scale.lerp(_s.setScalar((0.8 + 0.2 * visited + k * 0.9) * axis.intro), 0.1);
            const h = axis.halos[i]; h.material.opacity += ((k ? 0.55 + 0.1 * Math.sin(t * 2.2) : 0.12 + 0.12 * visited) * axis.intro - h.material.opacity) * 0.1;
            h.scale.setScalar((k ? 1.1 + 0.05 * Math.sin(t * 2.2) : 0.5) * axis.intro);
        });
        // front node dressing: flare, rings, satellites
        if (axis.orbs) {
        axis.flare.position.copy(fn.position); axis.flare.material.opacity += ((0.5 + 0.12 * Math.sin(t * 1.7)) * axis.intro - axis.flare.material.opacity) * 0.08;
        axis.flare.material.rotation = t * 0.05;
        axis.rings.forEach((r, k) => {
            r.position.copy(fn.position); r.scale.lerp(_s.setScalar(axis.intro), 0.08);
            r.rotation.set(1.1 + 0.5 * k + t * (0.15 + 0.1 * k), t * (0.35 - 0.2 * k), 0.4 * k);
        });
        axis.sats.forEach((g, k) => {
            g.visible = axis.intro > 0.05;
            const a = t * (0.9 + 0.15 * k) + k * 2.094, r = 0.15 + 0.04 * k, tilt = 0.5 + 0.5 * k;
            g.position.set(fn.position.x + Math.cos(a) * r, fn.position.y + Math.sin(a) * r * Math.sin(tilt), fn.position.z + Math.sin(a) * r * Math.cos(tilt));
            g.scale.setScalar(axis.intro);
        });
        // callout: from the lit node to its card (the DOM card is drawn on top, so the line disappears behind it)
        const card = items[fi].obj.position;
        _dir.set(card.x / S, card.y / S + lastCardH / 2, card.z / S).sub(fn.position);   // to the card's top edge: the card hangs from its node
        const len = _dir.length();
        axis.callout.position.copy(fn.position).addScaledVector(_dir, 0.5);
        axis.callout.quaternion.setFromUnitVectors(_up, _dir.normalize());
        axis.callout.scale.set(1, len, 1);
        axis.callout.material.opacity += (0.35 * axis.intro - axis.callout.material.opacity) * 0.08;
        }
        // spark: shoots along the line when the front card changes
        if (axis.sparkT < 1) {
            axis.sparkT = Math.min(1, axis.sparkT + dt * 1.8);
            const e = axis.sparkT < 0.5 ? 2 * axis.sparkT * axis.sparkT : 1 - Math.pow(-2 * axis.sparkT + 2, 2) / 2;
            axis.spark.position.set(0, M.lerp(axis.nodeY[axis.sparkFrom], axis.nodeY[axis.sparkTo], e), 0);
            axis.spark.material.opacity = Math.sin(axis.sparkT * Math.PI);
            const sz = 0.35 + 0.25 * Math.sin(axis.sparkT * Math.PI);
            if (axis.orbs) axis.spark.scale.setScalar(sz); else axis.spark.scale.set(0.14, 0.9 * sz / 0.6, 1);
        } else axis.spark.material.opacity = 0;
    }

    let spine = null;
    function layoutSpine() {
        if (!spine) return;
        const { bodies, procs, count, top } = spine;
        const d = new THREE.Object3D(), sc = cfg.spineScale;
        const angles = [Math.PI / 2, Math.PI / 2 + 2.15, Math.PI / 2 - 2.15];
        for (let i = 0; i < count; i++) {
            const y = top - cfg.spineSpacing * i, rot = cfg.spineTwist * i;
            d.position.set(0, y, 0); d.rotation.set(0, rot, 0); d.scale.setScalar(sc); d.updateMatrix();
            bodies.setMatrixAt(i, d.matrix);
            angles.forEach((a, k) => {
                const ang = a + rot, len = (k === 0 ? 0.62 : 0.5) * sc;
                d.position.set(Math.cos(ang) * len, y - 0.03 * sc, Math.sin(ang) * len);
                d.rotation.set(0, -ang, Math.PI / 2 - 0.15);
                d.scale.set(sc, (k === 0 ? 1.15 : 1) * sc, sc);
                d.updateMatrix();
                procs.setMatrixAt(i * 3 + k, d.matrix);
            });
        }
        bodies.instanceMatrix.needsUpdate = true; procs.instanceMatrix.needsUpdate = true;
    }

    /* ---------- theme: follow the page's light / dark tokens ---------- */
    function cssVar(name, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
    }
    function applyTheme() {
        if (!gl) return;
        const light = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
        const accent = new THREE.Color();
        try { accent.setStyle(cssVar('--button-color', cssVar('--sysPrimaryDefault', '#4faad1'))); } catch (e) { accent.set(0x4faad1); }
        const mat = spineParts[0]?.material;
        if (mat) {
            mat.color.set(light ? 0x9aa6b6 : 0xc3ccd8);
            mat.roughness = light ? 0.32 : 0.26;
            mat.envMapIntensity = light ? 0.75 : 1;
        }
        if (keyLight) keyLight.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.5);
        if (particles && particles.userData.isGPU) {
            const u = particles.userData.ptsU, v = vividAccent(THREE, light);
            u.uColorA.value.copy(v);
            u.uColorB.value.copy(v).lerp(new THREE.Color(light ? 0x000000 : 0xffffff), light ? 0.15 : 0.2);
            u.uColorLit.value.copy(v).lerp(new THREE.Color(0xffffff), light ? 0.3 : 0.55);
            particles.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; particles.material.needsUpdate = true;
        } else if (particles) { particles.material.color.copy(accent); particles.material.opacity = light ? 0.55 : 0.75; }
        if (axis) {
            const soft = accent.clone().lerp(new THREE.Color(0xffffff), light ? 0.0 : 0.25);
            for (const mat of [axis.coreMat, axis.ribbonMat]) mat.uniforms.uColor.value.copy(soft);
            axis.halos.forEach(h => h.material.color.copy(accent));
            axis.flare.material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.4);
            axis.sats.forEach(g => { g.children[0].material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.5); g.children[1].material.color.copy(accent); });
            axis.callout.material.color.copy(accent); axis.spark.material.color.set(0xffffff);
            axis.gridMat.uniforms.uColor.value.copy(accent); axis.gridMat.uniforms.uAlpha.value = light ? 0.28 : 0.16;
            axis.nodeMat.color.set(light ? 0xb9c6d6 : 0xdfe8f2); axis.ringMat.color.set(light ? 0xa9b7c8 : 0xcfd9e6);
            if (light) { [axis.ribbonMat].forEach(m => m.blending = THREE.NormalBlending); axis.halos.forEach(h => h.material.blending = THREE.NormalBlending); }
        }
        if (polystar) {
            const bg = new THREE.Color(); try { bg.setStyle(cssVar('--bg', light ? '#ffffff' : '#101012')); } catch (e) { bg.set(light ? 0xffffff : 0x101012); }
            polystar.mat.uniforms.uA.value.copy(accent);
            polystar.mat.uniforms.uB.value.copy(accent).lerp(bg, light ? 0.55 : 0.8);   // accent fading toward the page ground, like the Lottie's fade to black
            polystar.mat.uniforms.uOpacity.value = cfg.polyOpacity * (light ? 0.8 : 1);
        }
    }
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    /* ---------- layout: helix + camera targets ---------- */
    const targets = [];
    let portrait = false, S = 240, yStep = 0, lastCardW = 0, lastCardH = 0, lastCap = '';
    function layout() {
        const w = stage.clientWidth, h = stage.clientHeight;
        portrait = h > w;
        camera.fov = portrait ? cfg.fovPortrait : cfg.fov;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        const dist = cfg.radius + cfg.camOffset;                       // camera-to-card distance, in their units
        S = h / (2 * dist * Math.tan(M.degToRad(camera.fov) / 2));     // px per unit: puts the card plane exactly at the CSS perspective distance, so cards raster 1:1
        camera.near = 0.2 * S; camera.far = 60 * S; camera.updateProjectionMatrix();
        const visW = w / S;                                            // visible width in units at the card
        const visH = h / S;
        const step = M.degToRad(portrait ? cfg.stepPortrait : cfg.step);
        // Card size in units. Three caps, take the smallest:
        //  1. the wanted share of the viewport width
        //  2. neighbours must clear each other in the mid-swing view, when both are turned step/2 toward
        //     the camera: half-width * cos(step/2) < radius * sin(step/2) - gap/2  =>  W < 2 R tan(step/2) - gap
        //  3. the card must fit the viewport height with room above and below
        const ratio = portrait ? 1.2 : 0.65;                           // height / width (their pane is 4 x 2.6)
        const wantW = visW * (portrait ? cfg.cardFracPortrait : cfg.cardFrac);
        const clearW = 2 * cfg.radius * Math.tan(step / 2) - cfg.gap;
        const fitW = (visH * (portrait ? 0.62 : 0.72)) / ratio;
        const cardW = Math.max(0.8, Math.min(wantW, clearW, fitW));
        lastCardW = cardW; lastCap = cardW === wantW ? 'width share' : cardW === clearW ? 'neighbour clearance' : 'height fit';
        const cardH = cardW * ratio;
        lastCardH = cardH;
        section.style.setProperty('--ws-s', S + 'px');
        section.classList.toggle('ws-compact', cardH * S < 420);     // not enough pixels for the summary line
        yStep = (portrait ? 0.16 : 0.12) * Math.min(7, n);
        targets.length = 0;
        let angle = 0;
        items.forEach(({ obj, wrap }, i) => {
            wrap.style.width = Math.round(cardW * S) + 'px';
            wrap.style.height = Math.round(cardH * S) + 'px';
            obj.position.set(cfg.radius * S * Math.cos(angle), 0, cfg.radius * S * Math.sin(angle));
            const out = obj.position.clone().multiplyScalar(2);
            obj.lookAt(out);                                            // face outward, away from the spine
            angle -= step;
            obj.position.y = out.y = -yStep * i * S;
            const t = { position: out, quaternion: obj.quaternion.clone() };
            if (portrait) t.position.y += (cfg.centerpiece === 'axis' && cfg.axisOrbs > 0.5 ? 0.45 : -0.7) * S;   // axis: camera a little above the card so its node clears the header; otherwise theirs
            targets.push(t);
        });
        world.scale.setScalar(S);
        if (particles && particles.userData.legacy) particles.material.size = 0.045 * S;
        layoutParticles();
        layoutAxis(); layoutPolystar();

        cssRenderer.setSize(w, h);
        if (gl) gl.setSize(w, h, false);
        dirty = true;
    }

    /* ---------- scroll → camera ---------- */
    const camGroup = new THREE.Object3D();
    const _s = new THREE.Vector3();
    const target = new THREE.Object3D();
    const offset = new THREE.Vector3();
    let first = true, dirty = true, running = false, active = false, tStart = performance.now(), frontIndex = -1, tuneLive = null, frames = 0, lastNow = performance.now();

    function progress() {
        const total = section.offsetHeight - stage.clientHeight;
        if (total <= 0) return 0;
        return M.clamp(-section.getBoundingClientRect().top / total, 0, 1);
    }

    function update(now) {
        const p = progress();
        const edge = portrait ? cfg.edgePortrait : cfg.edge;
        const sv = smooth(p, edge, 1 - edge);
        const seg = sv * (n - 1), i0 = Math.floor(seg), i1 = Math.min(i0 + 1, n - 1), f = seg - i0;
        target.position.copy(targets[i0].position).lerp(targets[i1].position, f);
        target.quaternion.copy(targets[i0].quaternion).slerp(targets[i1].quaternion, f);
        // end blend: camera offset (scene px move the card 1:1 on screen) of (D/2)(1 - s/D)^2, whose slope at s = 0 is exactly -1,
        // i.e. the card continues at page speed the instant the stage pins and eases to rest; mirrored at the release
        const total = section.offsetHeight - stage.clientHeight, sPx = p * total, D = cfg.blend * stage.clientHeight;
        if (D > 0 && total > 0) {
            const a = Math.max(0, 1 - sPx / D), b = Math.max(0, 1 - (total - sPx) / D);
            target.position.y += (D / 2) * (a * a) - (D / 2) * (b * b);
        }
        if (tuneLive && (frames++ % 10 === 0)) tuneLive.textContent = 'progress ' + p.toFixed(3) + ' · front ' + (Math.round(seg) + 1) + ' · S ' + S.toFixed(0) + 'px · card ' + lastCardW.toFixed(2) + 'u (' + lastCap + ') · ' + (portrait ? 'portrait' : 'landscape');
        if (first) { camGroup.position.copy(target.position); camGroup.quaternion.copy(target.quaternion); first = false; }
        else { camGroup.position.lerp(target.position, cfg.lerp); camGroup.quaternion.slerp(target.quaternion, cfg.lerp); }
        offset.set(0, 0, cfg.camOffset * S).applyQuaternion(camGroup.quaternion);
        camera.position.copy(camGroup.position).add(offset);
        camera.quaternion.copy(camGroup.quaternion);

        // staggered scale-in (their tween: 1200 ms easeOutQuint, 200 ms apart)
        const elapsed = now - tStart;
        items.forEach(item => {
            const k = M.clamp((elapsed - 200 - 200 * item.index) / 1200, 0, 1);
            item.intro = 1 - Math.pow(1 - k, 5);
            item.obj.scale.setScalar(Math.max(0.001, item.intro));
        });

        const front = Math.round(seg);
        if (front !== frontIndex) {
            const prevFront = frontIndex; frontIndex = front;
            if (axis) axisSpark(prevFront, front);
            items.forEach((item, i) => {
                item.wrap.classList.toggle('is-front', i === front);
                if (item.video) { if (i === front) item.video.play?.().catch?.(() => {}); else item.video.pause?.(); }
            });
            dots.forEach((d, i) => d.classList.toggle('is-on', i === front));
            if (count) count.textContent = String(front + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
        }

        const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
        if (particles && particles.userData.legacy) particles.rotation.y = p * Math.PI * 1.2 + now * 0.00004;
        if (particles && particles.userData.isGPU) updateParticles(now, dt);
        if (polystar) {
            // billboard to the camera, sit on the axis at the camera's height, offset up-right in view space
            const g = polystar.group;
            g.quaternion.copy(camera.quaternion);
            g.rotation.z += 0; g.rotateZ(M.degToRad(15.66) + now * 0.000105);              // their layer tilt + 360° per 60 s
            _s.set((portrait ? 0.7 : 1.0) * polystar.scale, (portrait ? 1.0 : 0.75) * polystar.scale, -0.6 * polystar.scale).applyQuaternion(camera.quaternion);
            g.position.set(_s.x, camGroup.position.y / S + _s.y, _s.z);
        }
        if (axis) updateAxis(now, dt);
        lastNow = now;
        cssRenderer.render(cssScene, camera);
        if (gl) gl.render(glScene, camera);
    }

    function loop(now) {
        if (!active) { running = false; return; }
        update(now);
        requestAnimationFrame(loop);
    }
    function wake() {
        if (!running && active) { running = true; requestAnimationFrame(loop); }
    }

    new IntersectionObserver(entries => {
        active = entries.some(e => e.isIntersecting);
        if (active) { if (first) tStart = performance.now(); wake(); }
        else items.forEach(item => item.video?.pause?.());
    }, { rootMargin: '20% 0px' }).observe(section);

    let resizeTimer;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); wake(); }, 120); });

    // Keyboard users: focusing a card scrolls the window so that card comes to the front.
    section.addEventListener('focusin', e => {
        const item = items.find(it => it.card.contains(e.target));
        if (!item) return;
        const x = item.index / (n - 1);
        const inv = x + (x - x * x * (3 - 2 * x));                     // their invSmooth
        const edge = portrait ? cfg.edgePortrait : cfg.edge;
        const p = edge + inv * (1 - 2 * edge);
        const total = section.offsetHeight - stage.clientHeight;
        window.scrollTo({ top: section.offsetTop + p * total, behavior: 'auto' });
    });

    layout();

    /* ---------- ?tune=1: sliders for every number, copy them out as data-attributes ---------- */
    const params = new URLSearchParams(location.search);
    if (params.has('tune')) tunePanel();
    function tunePanel() {
        const rows = [
            ['radius', 'helix radius', 2, 8, 0.05], ['step', 'step (deg)', 15, 90, 1], ['stepPortrait', 'step portrait', 15, 90, 1],
            ['fov', 'fov', 20, 70, 1], ['fovPortrait', 'fov portrait', 30, 90, 1], ['camOffset', 'camera offset', 0, 5, 0.05],
            ['cardFrac', 'card width', 0.3, 0.95, 0.01], ['gap', 'card gap', 0, 1.5, 0.05], ['blend', 'end blend (vh)', 0, 1, 0.05], ['lerp', 'camera lerp', 0.02, 0.5, 0.01],
            ['edge', 'scroll edge', 0, 0.2, 0.005], ['scrollPerCard', 'scroll per card (vh)', 25, 120, 5],
            ['polyScale', 'polystar size', 0.4, 3, 0.05], ['polyOpacity', 'polystar opacity', 0, 1, 0.02],
            ['pCurl', 'particles: curl', 0, 5, 0.05], ['pReturn', 'particles: home spring', 0, 5, 0.05], ['pPull', 'particles: cursor pull', 0, 30, 0.5], ['pDamp', 'particles: damping', 0.7, 0.99, 0.005],
            ['pSize', 'particles: size (px)', 0.3, 6, 0.05], ['pGlow', 'particles: glow', 0, 3, 0.05], ['pRadius', 'particles: light radius', 0.3, 6, 0.05], ['pParallax', 'particles: scroll parallax', 0, 0.012, 0.0002],
            ['boatX', 'boat: x (ndc)', -1, 1, 0.01], ['boatY', 'boat: y (ndc)', -1, 1, 0.01], ['boatSize', 'boat: size', 0.05, 0.6, 0.005],
            ['spineScale', 'spine scale', 0.4, 1.8, 0.02], ['spineSpacing', 'vertebra gap', 0.3, 1.2, 0.01], ['spineTwist', 'vertebra twist', 0, 1, 0.01],
        ];
        const el = document.createElement('div');
        el.setAttribute('style', 'position:fixed;left:12px;top:96px;z-index:99999;width:292px;max-height:calc(100vh - 120px);overflow:auto;box-sizing:border-box;padding:10px 12px;background:rgba(10,12,16,.92);color:#e8ecf1;font:12px/1.4 ui-monospace,Menlo,monospace;text-align:left;border-radius:8px;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px)');
        el.innerHTML = '<div style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">work-spine tune</div>'
            + rows.map(([k, l, min, max, st]) => `<label style="display:grid;grid-template-columns:1fr 96px 46px;gap:8px;align-items:center;margin:3px 0"><span>${l}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${cfg[k]}" style="width:96px"><output style="text-align:right">${cfg[k]}</output></label>`).join('')
            + '<div style="display:flex;gap:8px;margin:10px 0 6px"><button type="button" data-copy style="position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;flex:1;padding:6px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer">Copy as data-attributes</button><button type="button" data-reset style="position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;padding:6px 10px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer">Reset</button></div>'
            + '<textarea readonly rows="4" style="width:100%;box-sizing:border-box;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.35);color:#cfd6df;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px" placeholder="paste these onto <section class=&quot;work-spine&quot; …>"></textarea>'
            + '<div style="margin-top:8px;display:flex;gap:6px;align-items:center"><span>centerpiece</span>' + ['none', 'polystar', 'axis', 'spine'].map(c => `<a href="#" data-cp="${c}" style="color:${c === cfg.centerpiece ? '#fff' : '#9aa4b2'};text-decoration:${c === cfg.centerpiece ? 'underline' : 'none'}">${c}</a>`).join('') + '</div>'
            + '<small data-live style="display:block;margin-top:6px;color:#9aa4b2"></small>';
        const attrs = () => rows.map(([k]) => `data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${cfg[k]}"`).join(' ') + ` data-scroll-per-card="${cfg.scrollPerCard}" data-centerpiece="${cfg.centerpiece}"`;
        const ta = el.querySelector('textarea');
        el.addEventListener('input', e => {
            const k = e.target.dataset.k; if (!k) return;
            cfg[k] = +e.target.value; e.target.nextElementSibling.value = cfg[k];
            if (k === 'scrollPerCard') section.style.setProperty('--ws-vh', cfg.scrollPerCard + 'vh');
            if (k in pcfg) { pcfg[k] = cfg[k]; layer?.sync(); }
            layout(); layoutSpine(); applyTheme(); syncParticles(); ta.value = attrs(); wake();
        });
        el.querySelector('[data-copy]').addEventListener('click', () => { ta.value = attrs(); ta.select(); navigator.clipboard?.writeText(ta.value).catch(() => {}); });
        el.querySelectorAll('[data-cp]').forEach(a => a.addEventListener('click', e => {
            e.preventDefault(); const u = new URL(location.href); u.searchParams.set('centerpiece', a.dataset.cp); u.searchParams.set('ws', String(progress().toFixed(3))); location.href = u.toString();
        }));
        el.querySelector('[data-reset]').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('ws', String(progress().toFixed(3))); location.href = u.toString(); });
        document.body.appendChild(el);
        tuneLive = el.querySelector('[data-live]');
    }

    // ?ws=0.5 lands at 50% of the section (handy while tuning)
    const ws = parseFloat(params.get('ws'));
    if (!Number.isNaN(ws)) {
        document.documentElement.style.scrollBehavior = 'auto';
        const total = section.offsetHeight - stage.clientHeight;
        window.scrollTo(0, section.offsetTop + M.clamp(ws, 0, 1) * total);
    }
}
