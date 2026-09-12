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
 * videos and theme tokens keep working. Progressive: nothing here runs with reduced motion,
 * and if three.js fails to load the normal card list stays as it was.
 *
 * The voyage: a page-wide fixed canvas behind everything runs a GPU particle field; a share of
 * those particles is a ship (js/voyage-boat.js: four evolution levels sampled on 3D surfaces).
 * On load the ship is already formed and sails into the frame; as you scroll it sails with you,
 * keyframed against the page's own sections (hero pose, seen from above down the axis of the
 * work section where it replaces the beam, then on toward the footer), growing from a dinghy
 * to a tall ship on the way. Sails flutter, the hull bobs, ripples and the wake loop, and
 * scrolling advances the loop.
 *
 * Dev aid: append ?ws=0.5 to the URL to land at 50% of the section's scroll; ?tune=1 for sliders.
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
    boat: section.dataset.boat || 'voyage',                  // the ship of particles: 'voyage' (sails in at the top and down the page with you) | 'off'
    boatX: numAttr(section.dataset.boatX, -0.35), boatY: numAttr(section.dataset.boatY, -0.29), boatSize: numAttr(section.dataset.boatSize, 0.37),   // hero pose: waterline centre in NDC, hull length as a fraction of the visible width
    shipShare: numAttr(section.dataset.shipShare, coarse ? 0.3 : 0.2),   // share of the particles that belong to the ship
    shipEntry: numAttr(section.dataset.shipEntry, 3.2),                  // seconds the ship takes to sail into the frame on load
    shipWorkSize: numAttr(section.dataset.shipWorkSize, 0.16), shipWorkY: numAttr(section.dataset.shipWorkY, -0.68), shipWorkTilt: numAttr(section.dataset.shipWorkTilt, 68), shipWorkHeading: numAttr(section.dataset.shipWorkHeading, -90),   // pose in the work section: seen from above in the band under the cards, sailing down the axis, wake streaming up the column (size is the on-screen hull length; it does not grow with the level here)
    shipFlap: numAttr(section.dataset.shipFlap, 1), shipRipple: numAttr(section.dataset.shipRipple, 1), shipBob: numAttr(section.dataset.shipBob, 1),   // idle motion strengths
    shipSettle: numAttr(section.dataset.shipSettle, 7),     // how fast ship particles take their places (per second): 7 lands a recruit in about 0.4 s
    shipWay: numAttr(section.dataset.shipWay, 1),           // how fast the water streams past the hull under way (hull lengths per second at full wake)
    shipGrounds: section.dataset.shipGrounds || 'overlay',   // the bottom sections paint their own ground over the layer: 'translucent' (work-spine.css thins those grounds so the ship shows through, the concept's pick) | 'overlay' (the canvas flips above the page there with a screen blend) | 'none'
} : null;
if (pcfg) for (const [k, v] of new URLSearchParams(location.search)) if (k in pcfg && v !== '') pcfg[k] = Number.isNaN(+v) ? v : +v;   // dev aid: ?shipWorkTilt=45&boat=off
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
const WATERLINE = -0.37;   // boat space: hull length 1, bow at +x, y up, z toward the viewer; the ship pivots on its waterline
const SIM_SHARED = `
    uniform sampler2D tBoatA, tBoatB, tMetaA, tMetaB; uniform float uMix, uForm, uScroll, uH, uBob, uBoatScale, uTime, uFlap, uRipple, uFlow, uSettle, uWay, uReflect, uN, uStarForm, uSnap, uSnapBoat; uniform vec3 uBoat; uniform mat3 uRot; uniform vec4 uStarT[12];
    // the first 12 particles can be recruited as constellation stars: uStarT holds their targets (xyz) and an on flag (w)
    vec4 starOf(vec2 uv){ int idx = int(floor(uv.x * uN) + floor(uv.y * uN) * uN + 0.5); vec4 st = vec4(0.0); for (int k = 0; k < 12; k++) { if (k == idx) st = uStarT[k]; } return st; }
    // where a particle is drawn: the field wraps vertically and scrolls with depth-dependent parallax; a ship particle is drawn where it is
    vec3 drawPos(vec3 p, float bf){ float depthF = mix(0.3, 1.6, clamp((p.z + 4.0) / 8.0, 0.0, 1.0)); float off = uScroll * depthF * (1.0 - bf);
      vec3 pw = p; float wy = mod(p.y + off + uH * 0.5, uH) - uH * 0.5; pw.y = mix(wy, p.y, bf); return pw; }
    // the ship: two evolution levels A and B mixed by uMix. A particle belongs to a level when its shade (w) is > 0; one that is
    // absent at A and present at B eases in from its field home as uMix rises, so the ship grows out of the stars around it.
    float boatMixT(vec4 a, vec4 b){ float fa = step(0.01, a.w), fb = step(0.01, b.w); return fa * fb > 0.5 ? uMix : fb; }
    // a particle present at both levels morphs; one absent at A and present at B is recruited the moment uMix passes its own random
    // threshold r, so the ship grows out of the stars a few particles at a time and nothing ever hangs halfway between home and ship
    float boatFlag(vec4 a, vec4 b, float r){ float fa = step(0.01, a.w), fb = step(0.01, b.w); return fa * fb > 0.5 ? 1.0 : fb > 0.5 ? step(r, uMix) : fa > 0.5 ? step(uMix, r) : 0.0; }
    // The water. A lane of particles streams aft under the hull (uFlow = way made, in hull lengths; a crawl at rest). Every wave is
    // stationary in the ship's frame, as a real ship's wave pattern is, so the passing water is lifted and lit where the ship makes it:
    // parted along the hull, thrown up as spray at the stem, a bow wave along the forward shoulders with a trough amidships and a
    // stern wave at the quarter, the Kelvin wedge from the stem (divergent crests along 19.5 degrees, transverse crests inside, both
    // dying aft), churn just abaft the transom, and a strip of foam (its own particles) running out behind. All of it scales with
    // uWay; at rest the water is still specks with faint slow rings spreading from the hull.
    float hullBeam(float x){ return 0.16 * sqrt(max(0.0, 1.0 - pow((x - 0.02) / 0.56, 2.0))); }
    float hash1(float n){ return fract(sin(n) * 43758.5453); }
    vec3 flowLocal(vec3 q, vec4 md, float role, out float fade){
      fade = 1.0; float wake = step(6.5, role) * step(role, 7.5), water = step(5.5, role) * step(role, 6.5);
      if (wake > 0.5) {
        float d1 = fract(md.w + uFlow / 1.8), h = hash1(md.z * 91.7);
        q.x = -0.5 - d1 * 1.8; q.z = (h - 0.5) * (0.28 + 0.3 * d1); q.y = ${WATERLINE} + 0.004 * sin(uTime * 3.0 + h * 40.0);
        fade = pow(1.0 - d1, 1.6) * (0.35 + 0.65 * hash1(md.z * 17.3 + floor(uTime * 2.0 + h * 5.0))); }
      else if (water > 0.5) {
        float x0 = q.x, z0 = q.z, sgn = z0 < 0.0 ? -1.0 : 1.0;
        float x = -1.25 + mod(x0 + 1.25 - uFlow, 2.5); q.x = x; q.y = ${WATERLINE};
        float az = abs(z0), hb = hullBeam(x), s = 0.5 - x;
        float inHull = step(az, hb) * step(-0.5, x) * step(x, 0.55);
        float side = hb + 0.012 + 0.04 * uWay * hash1(md.z * 31.0) * smoothstep(0.4, 0.0, s);
        q.z = mix(z0, sgn * side, inHull); az = abs(q.z);
        float spray = inHull * smoothstep(0.45, 0.0, s) * uWay;
        q.y += spray * (0.02 + 0.03 * hash1(md.w * 53.0 + floor(uTime * 3.0)));
        float near = exp(-pow((az - hb) / 0.07, 2.0)) * step(-0.55, x) * step(x, 0.5);
        float along = 0.02 * cos(6.2832 * s) * exp(-s * 0.6);
        q.y += uWay * near * along;
        float crestNear = near * max(0.0, along) * 50.0;
        float wedge = 0.354 * s, edge = az - wedge, aft = step(0.0, s);
        float div = aft * exp(-pow(edge / (0.03 + 0.03 * s), 2.0)) / sqrt(0.3 + s);
        float divPhase = cos(6.2832 * s / 0.9 + 1.0);
        float inside = aft * (1.0 - smoothstep(wedge - 0.1, wedge, az));
        float trans = inside * cos(6.2832 * s / 0.9) * exp(-s / 2.0);
        q.y += uWay * (0.014 * div * divPhase + 0.008 * trans);
        float churn = step(x, -0.5) * (1.0 - smoothstep(0.0, 0.16, az)) * smoothstep(-1.4, -0.5, x);
        q.y += uWay * churn * 0.006 * sin(uTime * 4.0 + z0 * 30.0 + x * 10.0);
        float lit = uWay * (3.0 * spray + 1.6 * crestNear + 1.2 * div * max(0.0, divPhase) + 0.5 * max(0.0, trans) + 0.6 * churn * hash1(md.z * 7.7 + floor(uTime * 3.0)));
        fade = (1.0 - smoothstep(0.85, 1.25, abs(x))) * (0.55 + lit);
        float r = length(vec2(x, q.z * 1.6));
        fade *= 1.0 - (1.0 - uWay) * 0.18 * (0.5 - 0.5 * sin(r * 9.0 - uRipple * 0.6)); }
      return q; }
    vec3 boatTarget(vec4 a, vec4 b, vec4 ma, vec4 mb){
      float m = boatMixT(a, b); vec3 q = mix(a.xyz, b.xyz, m); vec4 md = mix(ma, mb, m); float role = floor(md.x + 0.5);
      q.z += md.y * uFlap * 0.03 * sin(uTime * 3.4 + md.w * 6.0 - q.y * 5.0);                      // sail flutter: a ripple running across the chord
      float fd; q = flowLocal(q, md, role, fd);
      q = uRot * (q - vec3(0.0, ${WATERLINE}, 0.0));                                          // uBoat is where the waterline centre sits
      return uBoat + q * uBoatScale + vec3(0.0, uBob, 0.0); }`;
const SIM_VEL = SIM_NOISE + SIM_SHARED + `
    uniform sampler2D tHome; uniform float uDelta, uCurl, uReturn, uDamp, uPull, uRadius; uniform vec3 uCam, uDir;
    void main(){ vec2 uv=gl_FragCoord.xy/resolution.xy; vec3 p=texture2D(tPos,uv).xyz; vec3 v=texture2D(tVel,uv).xyz; vec4 h=texture2D(tHome,uv);
      vec4 bA=texture2D(tBoatA,uv), bB=texture2D(tBoatB,uv), mA=texture2D(tMetaA,uv), mB=texture2D(tMetaB,uv);
      float bf=boatFlag(bA,bB,h.w)*uForm; vec4 st=starOf(uv); float sf=st.w*uStarForm;
      vec3 tgt=mix(mix(h.xyz, boatTarget(bA,bB,mA,mB), bf), st.xyz, sf);
      vec3 f=(tgt-p)*uReturn*(1.0+1.5*bf+2.5*sf);
      f+=curlNoise(p*0.28+vec3(0.0,uTime*0.05,0.0))*uCurl*(0.4+0.6*h.w)*(1.0-0.8*bf)*(1.0-0.7*sf);
      vec3 pw=drawPos(p,max(bf,sf));
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      float infl=smoothstep(uRadius,0.0,d)*step(0.5,along);
      vec3 toRay=-perp/max(d,1e-4);
      f+=toRay*infl*uPull+cross(uDir,toRay)*infl*uPull*0.6;
      v=v*uDamp+f*uDelta; gl_FragColor=vec4(v,1.0); }`;
const SIM_POS = SIM_SHARED + `
    uniform sampler2D tHome; uniform float uDelta;
    void main(){ vec2 uv=gl_FragCoord.xy/resolution.xy; vec4 p=texture2D(tPos,uv); vec3 v=texture2D(tVel,uv).xyz; float w=texture2D(tHome,uv).w;
      p.xyz+=v*uDelta;
      vec4 st=starOf(uv); float sf=st.w*uStarForm;
      if (sf > 0.5 && distance(p.xyz, st.xyz) > uSnap) p.xyz = st.xyz + (p.xyz - st.xyz) * 0.12;   // a far recruit snaps most of the way instead of flying across the screen
      vec4 bA=texture2D(tBoatA,uv), bB=texture2D(tBoatB,uv);
      if ((uSettle > 0.0 || uSnapBoat > 0.0) && boatFlag(bA,bB,w)*uForm > 0.5) { vec3 bt=boatTarget(bA,bB,texture2D(tMetaA,uv),texture2D(tMetaB,uv));
        p.xyz = mix(p.xyz, bt, uSettle);                                                            // ship particles settle fast: the shape is there at scrolling speed, the spring and curl add the life
        if (uSnapBoat > 0.0 && distance(p.xyz, bt) > uSnapBoat) p.xyz = bt + (p.xyz - bt) * 0.1; }   // on load the ship is already in place
      gl_FragColor=vec4(p.xyz,w); }`;
const PTS_VS = SIM_SHARED + `
    uniform sampler2D tPos, tVel; uniform float uSize, uDPR, uP, uRadius, uIntro, uWake, uBoatPx; uniform vec3 uCam, uDir; attribute vec2 ref; attribute float aSize;
    varying float vLit, vRand, vSpeed, vBoat, vShade, vStar, vFade;
    void main(){ vec4 p=texture2D(tPos,ref); vec3 v=texture2D(tVel,ref).xyz;
      vec4 bA=texture2D(tBoatA,ref), bB=texture2D(tBoatB,ref), mA=texture2D(tMetaA,ref), mB=texture2D(tMetaB,ref);
      float bf=boatFlag(bA,bB,p.w)*uForm; vBoat=bf; float m=boatMixT(bA,bB); vShade=clamp(mix(bA.w,bB.w,m),0.0,1.0); vec4 md=mix(mA,mB,m); float role=floor(md.x+0.5);
      float water=step(5.5,role)*step(role,6.5), wake=step(6.5,role)*step(role,7.5), refl=step(7.5,role)*step(role,8.5), fd;
      flowLocal(mix(bA.xyz,bB.xyz,m), md, role, fd);
      vShade=mix(vShade, 0.5, water+wake);                                              // the water's brightness is the flow's, not the model's baked rings
      vFade=mix(1.0, uWake*fd, bf*wake)*mix(1.0, fd, bf*water)*mix(1.0, uReflect, bf*refl);   // foam only under way; the water carries its own crest and lane fades; reflections only on calm water seen from the side
      vec4 st=starOf(ref); float sf=st.w*uStarForm; vStar=sf;
      vec3 pw=drawPos(p.xyz,max(bf,sf));
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      vLit=smoothstep(uRadius,0.0,d)*step(0.5,along); vRand=p.w; vSpeed=length(v);
      vec4 mv=modelViewMatrix*vec4(pw,1.0);
      gl_PointSize=uSize*uDPR*aSize*(1.0+0.9*vLit+bf*(uBoatPx-1.0)+2.4*sf)*uP/max(-mv.z,1.0)*uIntro;
      gl_Position=projectionMatrix*mv; }`;
const PTS_FS = `
    uniform vec3 uColorA, uColorB, uColorLit; uniform float uGlow; varying float vLit, vRand, vSpeed, vBoat, vShade, vStar, vFade;
    void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5||vFade<0.02) discard; float disc=smoothstep(0.5,0.08,d)*vFade;
      vec3 col=mix(uColorA,uColorB,smoothstep(0.25,0.85,vRand)); col=mix(col,uColorLit,clamp(vLit*0.9+smoothstep(0.8,3.0,vSpeed)*0.15+0.7*vBoat*vShade+0.6*vStar,0.0,1.0));
      float a=disc*(0.24+0.5*vLit)*(1.0+vBoat*(0.1+1.4*vShade)+1.6*vStar)*uGlow; gl_FragColor=vec4(col*(0.85+0.35*vLit+0.3*vBoat*vShade+0.3*vStar),a); }`;

/* The picked colour, pushed to a vivid tint: the page's --button-color is derived from the picker with
   lightness tweaks that can leave it muted, and additive blending over a grey ground washes it out further. */
function vividAccent(THREE, light) {
    const c = new THREE.Color();
    try { c.setStyle((getComputedStyle(document.body).getPropertyValue('--button-color') || '').trim() || '#4faad1'); } catch (e) { c.set(0x4faad1); }
    const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    return c.setHSL(hsl.h, Math.max(hsl.s, 0.8), light ? 0.38 : 0.6);
}

const FIGURES = [
    { pts: [[-0.45, -0.1], [-0.45, 0.25], [-0.2, 0.05], [0.05, 0.15], [0.05, -0.2], [0.32, 0.0], [0.48, 0.28]], edges: [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 6]] },
    (() => { const pts = [], edges = []; const layers = [[-0.4, [-0.25, 0, 0.25]], [0, [-0.36, -0.12, 0.12, 0.36]], [0.4, [-0.15, 0.15]]];
        layers.forEach(([x, ys]) => ys.forEach(y => pts.push([x, y])));
        let a = 0; for (let l = 0; l < 2; l++) { const na = layers[l][1].length, nb = layers[l + 1][1].length; for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) edges.push([a + i, a + na + j]); a += na; }
        return { pts, edges }; })(),
    (() => { const pts = [[0, 0]], edges = []; for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + k * 2 * Math.PI / 5; pts.push([Math.cos(a) * 0.38, Math.sin(a) * 0.38]); edges.push([0, k + 1]); edges.push([k + 1, (k + 1) % 5 + 1]); } return { pts, edges }; })(),
    (() => { const pts = [[0, 0.38], [-0.3, 0.05], [0, 0.05], [0.3, 0.05]], edges = [[0, 1], [0, 2], [0, 3]]; [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42].forEach((x, k) => { pts.push([x, -0.32]); edges.push([1 + Math.floor(k / 2), 4 + k]); }); return { pts, edges }; })(),
];

/* Page-wide particle layer: a fixed canvas behind everything (z-index -1, no pointer events), the same
   simulation as the lab, with the field wrapping vertically so it follows the page scroll with a little parallax. */
const STAR_N = 12;
function startParticleLayer(THREE, GPUC, BOAT) {
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
    const pos0 = gpu.createTexture(), vel0 = gpu.createTexture(), home = gpu.createTexture();
    for (let i = 0; i < COUNT; i++) {
        const x = (Math.random() * 2 - 1) * 10, y = (Math.random() - 0.5) * H, z = (Math.random() * 2 - 1) * 4, w = Math.random();
        home.image.data.set([x, y, z, w], i * 4);
        pos0.image.data.set([x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z, w], i * 4);
    }
    home.needsUpdate = true;
    // the ship: particles STAR_N .. STAR_N + boatCount (the first STAR_N are constellation recruits). Per evolution level, a target
    // texture (xyz + shade; shade 0 = not part of this level) and a meta texture (role, flap, phase, aux) from js/voyage-boat.js
    const shipOn = pcfg.boat !== 'off' && !!BOAT, boatCount = shipOn ? Math.min(COUNT - STAR_N, Math.floor(COUNT * pcfg.shipShare)) : 0;
    const dataTex = d => { const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
    const levels = [];
    if (shipOn) {
        const built = BOAT.buildBoatLevels(boatCount, 1);
        for (let L = 0; L < BOAT.LEVELS.length; L++) {
            const pos = new Float32Array(COUNT * 4), meta = new Float32Array(COUNT * 4);
            pos.set(built.pos[L].subarray(0, boatCount * 4), STAR_N * 4); meta.set(built.meta[L].subarray(0, boatCount * 4), STAR_N * 4);
            levels.push({ pos: dataTex(pos), meta: dataTex(meta), scale: BOAT.LEVEL_SCALE[L] });
        }
    }
    if (!levels.length) { const t = dataTex(new Float32Array(COUNT * 4)); levels.push({ pos: t, meta: t, scale: 1 }); }
    const starT = Array.from({ length: STAR_N }, () => new THREE.Vector4());   // shared by every material that needs the star targets
    const shipRot = new THREE.Matrix3(), shipAt = new THREE.Vector3();
    const boatU = () => ({ tBoatA: { value: levels[0].pos }, tBoatB: { value: levels[0].pos }, tMetaA: { value: levels[0].meta }, tMetaB: { value: levels[0].meta }, uMix: { value: 0 }, uForm: { value: shipOn ? 1 : 0 }, uBob: { value: 0 }, uBoatScale: { value: 1 }, uBoat: { value: shipAt }, uRot: { value: shipRot }, uTime: { value: 0 }, uFlap: { value: pcfg.shipFlap }, uRipple: { value: 0 }, uFlow: { value: 0 }, uSettle: { value: 0 }, uWay: { value: 0 }, uReflect: { value: 1 }, uStarT: { value: starT }, uN: { value: N }, uStarForm: { value: 0 }, uSnap: { value: 1.2 }, uSnapBoat: { value: 0.02 } });
    const velVar = gpu.addVariable('tVel', SIM_VEL, vel0), posVar = gpu.addVariable('tPos', SIM_POS, pos0);
    gpu.setVariableDependencies(velVar, [posVar, velVar]); gpu.setVariableDependencies(posVar, [posVar, velVar]);
    const velU = velVar.material.uniforms, posU = posVar.material.uniforms;
    Object.assign(velU, { tHome: { value: home }, uDelta: { value: 0 }, uCurl: { value: pcfg.pCurl }, uReturn: { value: pcfg.pReturn }, uDamp: { value: pcfg.pDamp }, uPull: { value: pcfg.pPull }, uRadius: { value: pcfg.pRadius }, uScroll: { value: 0 }, uH: { value: H }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, boatU());
    Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 } }, boatU());
    const err = gpu.init(); if (err) { console.warn('work-spine: particle layer', err); gl.dispose(); canvas.remove(); return; }
    const geo = new THREE.BufferGeometry(), ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.4 + Math.random() * 0.5 : 0.5 + Math.random() * 0.5; }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ tPos: { value: null }, tVel: { value: null }, uSize: { value: pcfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: pcfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: H }, uWake: { value: 0 }, uBoatPx: { value: 1.25 },
            uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uColorA: { value: new THREE.Color(0x4faad1) }, uColorB: { value: new THREE.Color(0x4faad1) }, uColorLit: { value: new THREE.Color(0xffffff) }, uGlow: { value: pcfg.pGlow } }, boatU()),
        vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const U = mat.uniforms;
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
    let visW = 1, visH = 1;
    // constellation lines between recruited stars: vertices sample the live position texture, so the lines follow the particles
    // each line vertex knows both endpoints (position texture refs and star indices) so the segment only shows once both stars are near their targets
    const LINE_VS = 'uniform sampler2D tPos; uniform vec4 uStarT[12]; attribute vec2 aRef, aRef2; attribute float aIdx, aIdx2, aT, aD, aA; varying float vT, vD, vA; '
        + 'vec4 tgt(float i){ int idx = int(i + 0.5); vec4 r = vec4(0.0); for (int k = 0; k < 12; k++) { if (k == idx) r = uStarT[k]; } return r; } '
        + 'void main(){ vec3 p = texture2D(tPos, aRef).xyz, q = texture2D(tPos, aRef2).xyz; float near = smoothstep(0.45, 0.12, distance(p, tgt(aIdx).xyz)) * smoothstep(0.45, 0.12, distance(q, tgt(aIdx2).xyz)); vT = aT; vD = aD; vA = aA * near; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }';
    const LINE_FS = 'uniform float uVis; uniform vec3 uColor; varying float vT, vD, vA; void main(){ if (vT > vD) discard; gl_FragColor = vec4(uColor, 0.55 * vA * uVis); }';
    const SEGS = 40, lg = new THREE.BufferGeometry();
    const lref = new Float32Array(SEGS * 4), lref2 = new Float32Array(SEGS * 4), lidx = new Float32Array(SEGS * 2), lidx2 = new Float32Array(SEGS * 2), lt = new Float32Array(SEGS * 2), ld = new Float32Array(SEGS * 2), la = new Float32Array(SEGS * 2);
    for (let k = 0; k < SEGS; k++) lt.set([0, 1], k * 2);
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGS * 6), 3));
    lg.setAttribute('aRef', new THREE.BufferAttribute(lref, 2)); lg.setAttribute('aRef2', new THREE.BufferAttribute(lref2, 2)); lg.setAttribute('aIdx', new THREE.BufferAttribute(lidx, 1)); lg.setAttribute('aIdx2', new THREE.BufferAttribute(lidx2, 1));
    lg.setAttribute('aT', new THREE.BufferAttribute(lt, 1)); lg.setAttribute('aD', new THREE.BufferAttribute(ld, 1)); lg.setAttribute('aA', new THREE.BufferAttribute(la, 1));
    const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: { tPos: { value: null }, uVis: { value: 0 }, uColor: { value: new THREE.Color(0x4faad1) }, uStarT: { value: starT } }, vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lines.frustumCulled = false; scene.add(lines);
    const starRef = i => [((i % N) + 0.5) / N, (Math.floor(i / N) + 0.5) / N];
    const stars = { fig: -1, cur: null, prev: null, curT: 0, prevA: 0, form: 0, last: -1e9, cx: 0, cy: 0, w: 1, h: 1, est: new Float32Array(STAR_N * 2), seed: new Float32Array(STAR_N) };
    for (let i = 0; i < STAR_N; i++) { stars.seed[i] = Math.random(); stars.est[i * 2] = (Math.random() - 0.5) * 1.2; stars.est[i * 2 + 1] = (Math.random() - 0.5) * 0.9; }
    function starsSetFigure(k) {
        const fig = FIGURES[k % FIGURES.length], used = new Set(), map = new Array(fig.pts.length);
        fig.pts.forEach((pt, j) => {   // nearest free star to each node, by the stars' last known targets
            let best = -1, bd = Infinity;
            for (let i = 0; i < STAR_N; i++) { if (used.has(i)) continue; const dx = stars.est[i * 2] - pt[0], dy = stars.est[i * 2 + 1] - pt[1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
            used.add(best); map[j] = best;
        });
        stars.prev = stars.cur; stars.prevA = stars.cur ? 1 : 0; stars.cur = { fig, map }; stars.curT = 0; stars.fig = k;
    }
    function starsFrame(t, dt) {
        const on = performance.now() - stars.last < 250 && stars.cur;
        stars.form += ((on ? 1 : 0) - stars.form) * Math.min(1, dt * 2);
        for (const u of [velU, U]) u.uStarForm.value = stars.form;
        lines.material.uniforms.uVis.value = stars.form; lines.material.uniforms.tPos.value = U.tPos.value;
        if (!stars.cur) return;
        // targets in this camera's world at z = 1, from the stage-projected centre and size in px
        const zs = 1, k = (camera.position.z - zs) / camera.position.z, wu = visW * k, hu = visH * k;
        const cx = ((stars.cx / innerWidth) - 0.5) * wu, cy = (0.5 - (stars.cy / innerHeight)) * hu, sw = stars.w / innerWidth * wu, sh = stars.h / innerHeight * hu;
        const inv = new Int8Array(STAR_N).fill(-1); stars.cur.map.forEach((si, j) => inv[si] = j);
        for (let i = 0; i < STAR_N; i++) {
            const sd = stars.seed[i] * 6.28; let u, v;
            if (inv[i] >= 0) { const pt = stars.cur.fig.pts[inv[i]]; u = pt[0] + 0.012 * Math.sin(t * 0.7 + sd); v = pt[1] + 0.012 * Math.cos(t * 0.9 + sd * 1.3); }
            else { const a = t * 0.12 + sd; u = Math.cos(a) * 0.62; v = Math.sin(a * 1.31 + sd) * 0.42; }
            stars.est[i * 2] = u; stars.est[i * 2 + 1] = v;
            starT[i].set(cx + u * sw, cy + v * sh, zs, inv[i] >= 0 ? 1 : 0.55);
        }
        // edges: the current figure draws in edge by edge; the previous figure's lines follow the stars out and fade
        stars.curT = Math.min(1, stars.curT + dt / 1.4); stars.prevA = Math.max(0, stars.prevA - dt / 0.7);
        const write = (set, offset, alphaOf, limitOf) => {
            for (let j = 0; j < 20; j++) {
                const k2 = offset + j, e = set && set.fig.edges[j];
                if (!e) { la[k2 * 2] = la[k2 * 2 + 1] = 0; continue; }
                const ia = set.map[e[0]], ib = set.map[e[1]], ra = starRef(ia), rb = starRef(ib);
                lref.set([ra[0], ra[1], rb[0], rb[1]], k2 * 4); lref2.set([rb[0], rb[1], ra[0], ra[1]], k2 * 4);
                lidx[k2 * 2] = ia; lidx[k2 * 2 + 1] = ib; lidx2[k2 * 2] = ib; lidx2[k2 * 2 + 1] = ia;
                ld[k2 * 2] = ld[k2 * 2 + 1] = limitOf(j); la[k2 * 2] = la[k2 * 2 + 1] = alphaOf(j);
            }
        };
        write(stars.cur, 0, () => 1, j => Math.min(1, Math.max(0, stars.curT * (stars.cur.fig.edges.length + 1) - j)));
        write(stars.prevA > 0 ? stars.prev : null, 20, () => stars.prevA, () => 1);
        for (const name of ['aRef', 'aRef2', 'aIdx', 'aIdx2', 'aD', 'aA']) lg.attributes[name].needsUpdate = true;
    }
    const raycaster = new THREE.Raycaster();
    const pointer = { ndc: new THREE.Vector2(), target: new THREE.Vector2(), active: false, last: 0 };
    addEventListener('pointermove', e => { pointer.target.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)); pointer.active = true; pointer.last = performance.now(); }, { passive: true });
    // point size = uSize * uP / depth; this world is in units (the stage's is in px), so the reference depth is the camera distance
    function resize() {
        const w = innerWidth, h = innerHeight; gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); U.uP.value = camera.position.z;
        visH = 2 * camera.position.z * Math.tan(M.degToRad(camera.fov) / 2); visW = visH * camera.aspect;
        ship.resolvedAt = -1e9;
    }
    addEventListener('resize', resize);

    /* The voyage. The ship's pose is keyframed against the page's own sections and resolved to scroll positions at runtime, so it
       adapts to any screen: 'top', 'end', 'stage-pin' / 'stage-release' / 'stage@f' (the work stage), or '<selector>:<edge>@<v>'
       (the scroll at which that element's top|center|bottom edge sits v viewport-heights down the screen); an optional +px / -px.
       Pose: x, y centre (NDC), size (hull length as a fraction of the visible width), heading (deg on screen: 0 bow to the right,
       -90 bow down the page), turn (deg, bow toward the viewer), tilt (deg: 0 seen from the side, 90 from straight above),
       heel (deg), level (0 dinghy, 1 sloop, 2 schooner, 3 tall ship), wake (0 at rest .. 1 under way). Between keyframes each
       value eases (smoothstep), so every keyframe is a moment of rest and the motion never overshoots. */
    const POSE_KEYS = ['x', 'y', 'size', 'heading', 'turn', 'tilt', 'heel', 'level', 'wake'];
    function keyframes() {
        const c = pcfg, LS = (BOAT && BOAT.LEVEL_SCALE) || [1, 1, 1, 1];
        // the work stage: top view in the band under the cards; the hull keeps one on-screen length while the ship evolves
        const work = L => ({ x: 0, y: c.shipWorkY, size: c.shipWorkSize / LS[Math.min(3, Math.round(L))], heading: c.shipWorkHeading, turn: 0, tilt: c.shipWorkTilt, heel: 14, level: L, wake: L > 1.5 ? 1 : 0.9 });
        const translucent = c.shipGrounds === 'translucent';
        return {
            landscape: [
                { at: 'top', x: c.boatX, y: c.boatY, size: c.boatSize, heading: 0, turn: 35, tilt: 0, heel: 9, level: 0, wake: 0 },              // at anchor behind the headline, bow toward the swell
                { at: 'top+250', x: c.boatX, y: c.boatY, size: c.boatSize, heading: 0, turn: 35, tilt: 0, heel: 9, level: 0, wake: 0 },          // hold: a wheel nudge does not disturb the hero
                { at: '#work:center@0.5', x: -0.12, y: -0.36, size: 0.3, heading: -45, turn: 20, tilt: 35, heel: 12, level: 0.5, wake: 0.7 },  // casts off under the Lottie's trailing edge, jib unfurling, bow swinging down-page
                { at: 'stage-pin', ...work(1) },
                { at: 'stage@0.14', ...work(1) },                                                                                              // rests while card 1 fronts
                { at: 'stage@0.3', ...work(2) },                                                                                               // schooner: morphed in transit, done before card 2 fronts
                { at: 'stage@0.47', ...work(2) },
                { at: 'stage@0.63', ...work(3) },                                                                                              // tall ship, done before card 3 fronts
                { at: 'stage@0.8', ...work(3) },
                { at: 'stage-release', x: 0.12, y: -0.55, size: 0.13, heading: -45, turn: 10, tilt: 50, heel: 12, level: 3, wake: 0.9 },       // levels out as the stage unpins
                { at: '#read:top@0.5', x: 0.5, y: -0.18, size: 0.16, heading: -15, turn: 28, tilt: 12, heel: 12, level: 3, wake: 1 },          // open water at the right margin: hardest heel, full sail
                { at: '#read:bottom@0.6', x: 0.7, y: -0.25, size: 0.15, heading: -5, turn: 32, tilt: 4, heel: 10, level: 3, wake: 0.9 },
                { at: '#scalability:top@0.6', x: 0.72, y: 0.55, size: 0.08, heading: 0, turn: -40, tilt: 8, heel: 4, level: 3, wake: 0.3 },    // horizon: stern quarter, hull-down, beside the heading
                ...(translucent ? [
                    { at: '.testimonials-wrapper:top@0.5', x: -0.62, y: -0.45, size: 0.2, heading: -30, turn: 70, tilt: 6, heel: -8, level: 3, wake: 0.6 },    // back around from the left, bow-on, left of the quotes
                    { at: '.tools:top@0.85', x: -0.2, y: -0.62, size: 0.16, heading: 0, turn: 40, tilt: 3, heel: 4, level: 3, wake: 0.3 },                     // along the quay (the tools band)
                    { at: 'end', x: -0.62, y: -0.68, size: 0.13, heading: 0, turn: 35, tilt: 3, heel: 0, level: 3, wake: 0 },                                  // landfall: moored beside the Los Angeles pin, bottom-left
                ] : [
                    { at: '.testimonials-wrapper:center@0.5', x: 0.85, y: -0.28, size: 0.09, heading: 0, turn: 38, tilt: 0, heel: 5, level: 3, wake: 0.3 },  // small and far along the right edge, clear of the quotes
                    { at: 'end', x: 0.85, y: -0.28, size: 0.09, heading: 0, turn: 40, tilt: 3, heel: 2, level: 3, wake: 0 },
                ]),
            ],
            portrait: [
                { at: 'top', x: 0.55, y: 0.42, size: 0.36, heading: -180, turn: 35, tilt: 0, heel: 9, level: 0, wake: 0 },                     // beside the headline, bow left toward the flipped swell (sails in from the right)
                { at: 'top+200', x: 0.55, y: 0.42, size: 0.36, heading: -180, turn: 35, tilt: 0, heel: 9, level: 0, wake: 0 },
                { at: '#work:center@0.5', x: 0.15, y: -0.2, size: 0.32, heading: -120, turn: 20, tilt: 35, heel: 12, level: 0.5, wake: 0.7 },  // dives down-left toward the sea, behind the picker glass
                { at: 'stage-pin', ...work(1), y: -0.66, size: 0.3 },
                { at: 'stage@0.14', ...work(1), y: -0.66, size: 0.3 },
                { at: 'stage@0.3', ...work(2), y: -0.66, size: 0.24 },
                { at: 'stage@0.47', ...work(2), y: -0.66, size: 0.24 },
                { at: 'stage@0.63', ...work(3), y: -0.66, size: 0.2 },
                { at: 'stage@0.8', ...work(3), y: -0.66, size: 0.2 },
                { at: 'stage-release', x: 0.05, y: -0.62, size: 0.22, heading: -45, turn: 10, tilt: 50, heel: 12, level: 3, wake: 0.9 },
                { at: '#read:top@0.5', x: 0.3, y: -0.62, size: 0.28, heading: -20, turn: 30, tilt: 10, heel: 16, level: 3, wake: 1 },          // below the manifesto text
                { at: '#read:bottom@0.6', x: 0.45, y: -0.6, size: 0.26, heading: -5, turn: 32, tilt: 4, heel: 12, level: 3, wake: 0.9 },
                { at: '#scalability:top@0.6', x: 0.6, y: 0.6, size: 0.12, heading: 0, turn: -40, tilt: 8, heel: 4, level: 3, wake: 0.3 },
                ...(translucent ? [
                    { at: '.testimonials-wrapper:top@0.5', x: -0.3, y: -0.55, size: 0.26, heading: -30, turn: 70, tilt: 6, heel: -8, level: 3, wake: 0.6 },
                    { at: 'end', x: -0.3, y: -0.7, size: 0.2, heading: 0, turn: 35, tilt: 3, heel: 0, level: 3, wake: 0 },
                ] : [
                    { at: '.testimonials-wrapper:center@0.5', x: 0.7, y: -0.6, size: 0.14, heading: 0, turn: 38, tilt: 0, heel: 5, level: 3, wake: 0.3 },
                    { at: 'end', x: 0.7, y: -0.6, size: 0.14, heading: 0, turn: 40, tilt: 3, heel: 2, level: 3, wake: 0 },
                ]),
            ],
        };
    }
    function resolveAt(at) {
        const vh = innerHeight, maxY = Math.max(0, document.documentElement.scrollHeight - vh);
        const m = /^(.*?)([+-]\d+(?:\.\d+)?)?$/.exec(at), key = m[1], off = +(m[2] || 0);
        let y;
        if (key === 'top') y = 0;
        else if (key === 'end') y = maxY;
        else if (key === 'stage-pin' || key === 'stage-release' || key.startsWith('stage@')) {
            const st = section.querySelector('.work-spine__stage'), pin = section.offsetTop, total = Math.max(0, section.offsetHeight - ((st && st.clientHeight) || vh));
            y = key === 'stage-pin' ? pin : key === 'stage-release' ? pin + total : pin + total * parseFloat(key.slice(6));
        } else {
            const mm = /^(.+):(top|center|bottom)@([\d.]+)$/.exec(key), el = mm && document.querySelector(mm[1]);
            if (!el) return null;
            const r = el.getBoundingClientRect(), top = r.top + scrollY, edge = mm[2] === 'top' ? top : mm[2] === 'bottom' ? top + r.height : top + r.height / 2;
            y = edge - parseFloat(mm[3]) * vh;
        }
        return M.clamp(y + off, 0, maxY);
    }
    const ship = { sy: scrollY, keys: [], resolvedAt: -1e9, t0: -1, ripple: 0, flow: 0, wind: 0, lastScroll: scrollY, lo: -1, pose: {}, overlay: false, overlayY: Infinity, flipping: false };
    const isLight = () => document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
    // the principles, testimonials, tools and footer paint an opaque ground over the layer; there the canvas moves above the page with a screen
    // blend (multiply in the light theme) behind a quick dip to black, so the voyage can end at the harbour instead of behind a wall
    function setOverlay(on) {
        if (on === ship.overlay || ship.flipping) return;
        ship.flipping = true; canvas.style.transition = 'opacity 0.22s ease'; canvas.style.opacity = '0';
        setTimeout(() => { ship.overlay = on; canvas.style.zIndex = on ? '12' : '-1'; canvas.style.mixBlendMode = on ? (isLight() ? 'multiply' : 'screen') : ''; canvas.style.opacity = '1'; setTimeout(() => { ship.flipping = false; }, 240); }, 240);
    }
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    function shipFrame(t, dt, now) {
        if (!shipOn) return;
        if (now - ship.resolvedAt > 1000) {   // sections move as media loads and carousels initialise: re-resolve every second
            ship.resolvedAt = now;
            const src = innerHeight > innerWidth ? keyframes().portrait : keyframes().landscape;
            ship.keys = src.map(k => ({ y: resolveAt(k.at), k })).filter(e => e.y !== null).sort((a, b) => a.y - b.y);
            const oy = pcfg.shipGrounds === 'overlay' ? resolveAt('#scalability:top@0.55') : null; ship.overlayY = oy === null ? Infinity : oy;   // from the principles down: their grounds are opaque
        }
        setOverlay(scrollY > ship.overlayY);
        const keys = ship.keys; if (!keys.length) return;
        ship.sy += (scrollY - ship.sy) * Math.min(1, dt * 10);
        let i = 0; while (i < keys.length - 2 && ship.sy >= keys[i + 1].y) i++;
        const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], f = b.y > a.y ? M.smoothstep(ship.sy, a.y, b.y) : 1;
        const P = ship.pose; for (const key of POSE_KEYS) P[key] = a.k[key] + (b.k[key] - a.k[key]) * f;
        // sailing in: on load the ship is already formed off the left edge, under way, and eases into its first pose
        if (ship.t0 < 0) { ship.t0 = now; ship.entry = scrollY < 200; }   // a page that opens already scrolled shows the ship where it is
        const e = ship.entry ? Math.min(1, (now - ship.t0) / 1000 / Math.max(0.1, pcfg.shipEntry)) : 1, entry = Math.pow(1 - e, 3);
        if (Math.abs(P.heading) > 90) P.x += entry * (1 + P.size * 0.9 - P.x); else P.x -= entry * (P.x + 1 + P.size * 0.9);   // bow first, from whichever edge it points away from
        P.wake = Math.max(P.wake, entry); P.heel += entry * 4;
        // idle: bob, a slow heel and yaw wander; sails flutter and the water loops in the shader, and scrolling advances the loop
        const bob = pcfg.shipBob, dScroll = Math.abs(scrollY - ship.lastScroll); ship.lastScroll = scrollY;
        ship.ripple += (dt * 1.5 + dScroll * 0.01) * pcfg.shipRipple;
        // way on: scroll speed is the wind (quick to rise, slow to fall); with the pose's wake it sets how fast the water streams past the hull
        const wt = Math.min(1, dScroll / Math.max(dt, 1e-3) / 1500);
        ship.wind += (wt - ship.wind) * Math.min(1, dt / (wt > ship.wind ? 0.25 : 1.4));
        const way = Math.max(P.wake, ship.wind);
        ship.flow += dt * (0.015 + 1.5 * way) * pcfg.shipWay;   // a crawl at rest
        const heel = P.heel + 4 * ship.wind + bob * (2.5 * Math.sin(t * 0.6) + 1.2 * Math.sin(t * 1.7)), turn = P.turn + bob * 4 * Math.sin(t * 0.21), tilt = P.tilt + bob * 1.2 * Math.sin(t * 0.47);
        // evolution: the two level textures around the fractional level, mixed in the shader
        const L = M.clamp(P.level, 0, levels.length - 1), lo = Math.min(levels.length - 1, Math.floor(L)), hi = Math.min(levels.length - 1, lo + 1), mix = L - lo;
        if (lo !== ship.lo) { ship.lo = lo; for (const u of [velU, posU, U]) { u.tBoatA.value = levels[lo].pos; u.tMetaA.value = levels[lo].meta; u.tBoatB.value = levels[hi].pos; u.tMetaB.value = levels[hi].meta; } }
        const scale = P.size * visW * (levels[lo].scale + (levels[hi].scale - levels[lo].scale) * mix);
        // pose matrix: heel about the keel, turn toward the viewer, tilt toward a top view, then the heading on screen
        _qa.setFromAxisAngle(Z, M.degToRad(P.heading)).multiply(_qb.setFromAxisAngle(X, M.degToRad(tilt))).multiply(_qb.setFromAxisAngle(Y, -M.degToRad(turn))).multiply(_qb.setFromAxisAngle(X, M.degToRad(heel)));
        shipRot.setFromMatrix4(_m4.makeRotationFromQuaternion(_qa));
        shipAt.set(P.x * visW / 2, P.y * visH / 2, 0);
        const snap = now - ship.t0 < 700 ? 0.02 : 0;
        const settle = 1 - Math.exp(-dt * pcfg.shipSettle);
        for (const u of [velU, posU, U]) { u.uMix.value = mix; u.uBoatScale.value = scale; u.uBob.value = bob * 0.012 * scale * Math.sin(t * 0.8); u.uTime.value = t; u.uRipple.value = ship.ripple; u.uFlow.value = ship.flow; u.uSettle.value = settle; u.uWay.value = way; u.uFlap.value = pcfg.shipFlap * (1 + 0.6 * ship.wind); u.uSnapBoat.value = snap; }
        U.uWake.value = way; U.uReflect.value = (1 - way) * (1 - M.clamp((tilt - 10) / 30, 0, 1)); U.uBoatPx.value = M.clamp(0.6 + 0.25 * scale, 1.0, 2.2);   // a bigger ship is sparser: bigger dots
    }
    resize();
    function applyTheme() {
        const light = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
        const v = vividAccent(THREE, light);
        U.uColorA.value.copy(v);
        U.uColorB.value.copy(v).lerp(new THREE.Color(light ? 0x000000 : 0xffffff), light ? 0.15 : 0.2);
        U.uColorLit.value.copy(v).lerp(new THREE.Color(0xffffff), light ? 0.2 : 0.55);
        U.uGlow.value = pcfg.pGlow * (light ? 1.6 : 1);
        lines.material.uniforms.uColor.value.copy(v).lerp(new THREE.Color(0xffffff), light ? 0 : 0.2);
        mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; mat.needsUpdate = true;
        if (ship.overlay) canvas.style.mixBlendMode = light ? 'multiply' : 'screen';
    }
    applyTheme();
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let last = performance.now(), shown = false;
    // adaptive quality: after the first 2.5 s, a slow device gets a lower pixel ratio, half the drawn particles and a half-rate simulation
    const qual = { acc: 0, frames: 0, done: false, half: false, tick: 0, simDt: 0 };
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; const t = now * 0.001;
        const stale = !pointer.active || now - pointer.last > 2500;
        if (stale) pointer.target.set(0.55 * Math.sin(t * 0.23), 0.35 * Math.sin(t * 0.31 + 1.0));
        pointer.ndc.lerp(pointer.target, stale ? 0.03 : 0.12);
        raycaster.setFromCamera(pointer.ndc, camera);
        velU.uCam.value.copy(raycaster.ray.origin); velU.uDir.value.copy(raycaster.ray.direction);
        U.uCam.value.copy(raycaster.ray.origin); U.uDir.value.copy(raycaster.ray.direction);
        velU.uScroll.value = U.uScroll.value = -scrollY * pcfg.pParallax;
        shipFrame(t, dt, now);
        if (!qual.done) { qual.acc += dt; qual.frames++; if (qual.acc > 2.5) { qual.done = true; const ms = qual.acc / qual.frames * 1000; if (ms > 20) { qual.half = true; gl.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); geo.setDrawRange(0, Math.floor(COUNT / 2)); resize(); console.info('work-spine: slow device (' + ms.toFixed(1) + ' ms/frame), reduced quality'); } } }
        starsFrame(t, dt);
        qual.simDt += dt;
        if (!qual.half || (qual.tick++ % 2 === 0)) { velU.uDelta.value = qual.simDt; posU.uDelta.value = qual.simDt; qual.simDt = 0; gpu.compute(); }
        U.tPos.value = gpu.getCurrentRenderTarget(posVar).texture; U.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
        U.uIntro.value = Math.min(1, U.uIntro.value + dt * 0.5);
        gl.render(scene, camera);
        if (!shown) { shown = true; canvas.style.opacity = '1'; }
        requestAnimationFrame(frame);
    }
    let running = true; last = performance.now(); requestAnimationFrame(frame);   // a hidden tab simply stops getting animation frames
    layer = {
        // called by the work section every frame while it is active: figure index and where the figure sits on screen (px)
        setStars(k, cx, cy, w, h) { if (k !== stars.fig) starsSetFigure(k); stars.cx = cx; stars.cy = cy; stars.w = w; stars.h = h; stars.last = performance.now(); },
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
    let BOAT = null;
    if (pcfg.boat !== 'off') { try { BOAT = await import('./voyage-boat.js'); } catch (e) { console.warn('work-spine: no ship model, particles only', e); } }
    if (pcfg.mode === 'page') startParticleLayer(THREE, GPUC, BOAT);
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
        glass: num(ds.glass, 1),                    // translucent glass cards (experiment)
        constellations: num(ds.constellations, 0),  // star figures drawn behind each card as it comes to front (experiment, off: the ship is the centrepiece now)
        // GPU particles: shared settings (see pcfg at the top; data-p-* attributes)
        ...pcfg,
        // what sits on the helix axis: 'ship' (nothing here: the page-wide ship sails down the axis) | 'none' | 'axis' (a line with
        // a node per card) | 'spine' (their vertebrae) | 'polystar' (the hero Lottie's language: 22 rounded pentagons with a fat gradient stroke)
        centerpiece: new URLSearchParams(location.search).get('centerpiece') || ds.centerpiece || 'ship',
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
    const needGL = cfg.mode === 'stage' || ['spine', 'axis', 'polystar'].includes(cfg.centerpiece);   // 'ship' and 'none' draw nothing here: no second WebGL context
    if (!needGL) glCanvas.remove();
    else try {
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
        const noBoat = () => ({ tBoatA: { value: home }, tBoatB: { value: home }, tMetaA: { value: home }, tMetaB: { value: home }, uMix: { value: 0 }, uForm: { value: 0 }, uBob: { value: 0 }, uBoatScale: { value: 1 }, uBoat: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uTime: { value: 0 }, uFlap: { value: 0 }, uRipple: { value: 0 }, uFlow: { value: 0 }, uSettle: { value: 0 }, uWay: { value: 0 }, uReflect: { value: 1 }, uStarT: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, uN: { value: N }, uStarForm: { value: 0 }, uSnap: { value: 1.2 }, uSnapBoat: { value: 0 } });
        Object.assign(velU, { tHome: { value: home }, uDelta: { value: 0 }, uCurl: { value: cfg.pCurl }, uReturn: { value: cfg.pReturn }, uDamp: { value: cfg.pDamp }, uPull: { value: cfg.pPull }, uRadius: { value: cfg.pRadius }, uScroll: { value: 0 }, uH: { value: 1e5 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, noBoat());
        Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 } }, noBoat());
        const err = gpu.init(); if (err) throw new Error(err);
        const geo = new THREE.BufferGeometry();
        const ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.8 + Math.random() * 1.0 : 0.5 + Math.random() * 0.6; }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
        geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: Object.assign(noBoat(), { tPos: { value: null }, tVel: { value: null }, uSize: { value: cfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: cfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: 1e5 }, uWake: { value: 0 }, uBoatPx: { value: 1.25 },
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

    /* Centerpiece 'axis': one quiet beam down the helix, lit above the camera and dim below.
       Optional (data-axis-orbs="1"): chrome iridescent nodes off the environment map with additive
       halos, rings and satellites on the lit node, and a hanger to its card. */
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
            float a = edge * uIntro;
            if (uRibbon > 0.5) { float w = pow(sin(vUv.x * 3.14159), 2.4); a *= w * 0.16 * lit; }
            else { a *= 0.55 + 0.45 * lit; }
            gl_FragColor = vec4(uColor, a);
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
        axis = { orbs, core, ribbon, coreMat, ribbonMat, nodes, halos, nodeMat, ringMat, flare, rings, sats, callout, nodeY: [], intro: 0 };
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
    const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
    function updateAxis(now, dt) {
        const t = now * 0.001, camY = camGroup.position.y / S, cx = camera.position.x / S, cz = camera.position.z / S;
        axis.intro = Math.min(1, axis.intro + dt * 0.8);
        for (const mat of [axis.coreMat, axis.ribbonMat]) { mat.uniforms.uTime.value = t; mat.uniforms.uCamY.value = camY; mat.uniforms.uIntro.value = axis.intro; }
        axis.ribbon.lookAt(cx, axis.ribbon.position.y, cz);
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
            axis.callout.material.color.copy(accent);
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
    /* Constellations: one small figure per card on a plane just behind it (toward the axis), stars as soft
       points and lines that draw themselves in edge by edge as the card comes to front, fading as it leaves.
       Figures are unit-square coordinates (y up) matched to the case studies: a traceability chain, a small
       neural net, a hub with five spokes, a token tree. They cycle if there are more cards than figures. */
    /* Constellations live in the page-wide particle layer (recruited field particles); the section only reports
       which figure is current and where it sits on screen. FIGURES is defined at module scope. */
    const _proj = new THREE.Vector3();

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
    const _look = new THREE.Vector3();
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
        const seg = sv * (n - 1);
        // the camera rides the outer helix itself: constant radius, azimuth and height continuous in seg.
        // (interpolating between per-card targets cut chords, pulling the camera in and out once per card)
        const stepRad = M.degToRad(portrait ? cfg.stepPortrait : cfg.step), az = -stepRad * seg, Rcam = cfg.radius * 2 * S;
        target.position.set(Rcam * Math.cos(az), -yStep * seg * S + (portrait && cfg.centerpiece === 'axis' && cfg.axisOrbs > 0.5 ? 0.45 : portrait ? -0.7 : 0) * S, Rcam * Math.sin(az));
        _look.set(target.position.x * 2, target.position.y, target.position.z * 2);   // face outward, like the cards
        target.lookAt(_look);
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
            frontIndex = front;
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
        const srect = stage.getBoundingClientRect();
        if (layer && cfg.constellations > 0.5 && srect.bottom > 0 && srect.top < innerHeight) {
            const stepRad2 = M.degToRad(portrait ? cfg.stepPortrait : cfg.step), az2 = -stepRad2 * seg, rr = (cfg.radius - 1.3) * S;
            _proj.set(rr * Math.cos(az2), -yStep * seg * S, rr * Math.sin(az2)).project(camera);   // the point just behind the current view, in this camera
            layer.setStars(Math.round(seg), srect.left + (_proj.x * 0.5 + 0.5) * srect.width, srect.top + (0.5 - _proj.y * 0.5) * srect.height, lastCardW * S * 1.3, lastCardH * S * 1.3);
        }
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
    queueMicrotask(applyTheme);
    section.classList.toggle('is-glass', cfg.glass > 0.5);

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
            ['boatX', 'ship: hero x (ndc)', -1, 1, 0.01], ['boatY', 'ship: hero y (ndc)', -1, 1, 0.01], ['boatSize', 'ship: hero size', 0.05, 0.6, 0.005],
            ['shipWorkSize', 'ship: size in work', 0.06, 0.5, 0.005], ['shipWorkY', 'ship: y in work (ndc)', -1, 1, 0.01], ['shipWorkTilt', 'ship: tilt in work (deg)', 0, 90, 1], ['shipWorkHeading', 'ship: heading in work', -180, 180, 5],
            ['shipEntry', 'ship: sail-in (s)', 0.5, 8, 0.1], ['shipFlap', 'ship: sail flutter', 0, 3, 0.05], ['shipRipple', 'ship: ripples', 0, 3, 0.05], ['shipBob', 'ship: bob', 0, 3, 0.05],
            ['shipSettle', 'ship: settle speed (/s)', 1, 20, 0.5], ['shipWay', 'ship: water flow', 0, 3, 0.05],
            ['spineScale', 'spine scale', 0.4, 1.8, 0.02], ['spineSpacing', 'vertebra gap', 0.3, 1.2, 0.01], ['spineTwist', 'vertebra twist', 0, 1, 0.01],
        ];
        const el = document.createElement('div');
        el.setAttribute('style', 'position:fixed;left:12px;top:96px;z-index:99999;width:292px;max-height:calc(100vh - 120px);overflow:auto;box-sizing:border-box;padding:10px 12px;background:rgba(10,12,16,.92);color:#e8ecf1;font:12px/1.4 ui-monospace,Menlo,monospace;text-align:left;border-radius:8px;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px)');
        el.innerHTML = '<div style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">work-spine tune</div>'
            + rows.map(([k, l, min, max, st]) => `<label style="display:grid;grid-template-columns:1fr 96px 46px;gap:8px;align-items:center;margin:3px 0"><span>${l}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${cfg[k]}" style="width:96px"><output style="text-align:right">${cfg[k]}</output></label>`).join('')
            + '<div style="display:flex;gap:8px;margin:10px 0 6px"><button type="button" data-copy style="position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;flex:1;padding:6px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer">Copy as data-attributes</button><button type="button" data-reset style="position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;padding:6px 10px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer">Reset</button></div>'
            + '<textarea readonly rows="4" style="width:100%;box-sizing:border-box;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.35);color:#cfd6df;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px" placeholder="paste these onto <section class=&quot;work-spine&quot; …>"></textarea>'
            + '<div style="margin-top:8px;display:flex;gap:6px;align-items:center"><span>centerpiece</span>' + ['ship', 'none', 'polystar', 'axis', 'spine'].map(c => `<a href="#" data-cp="${c}" style="color:${c === cfg.centerpiece ? '#fff' : '#9aa4b2'};text-decoration:${c === cfg.centerpiece ? 'underline' : 'none'}">${c}</a>`).join('') + '</div>'
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
