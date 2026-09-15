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
 * to a tall ship on the way. Sails fill and luff with the apparent wind, the hull rolls, pitches
 * and heaves on a swell the water shows, the bow wave, spray, wake and foam all follow one speed,
 * and scrolling is the wind.
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
    pCount: numAttr(section.dataset.pCount, coarse ? 192 : 256),   // phones: 192 x 192 (the ship, the fleet and the armada need the particles; the adaptive quality halves it on a slow device)
    pCurl: numAttr(section.dataset.pCurl, 1.4), pReturn: numAttr(section.dataset.pReturn, 1.2), pPull: numAttr(section.dataset.pPull, 3), pDamp: numAttr(section.dataset.pDamp, 0.92),
    pSize: numAttr(section.dataset.pSize, 1.7), pGlow: numAttr(section.dataset.pGlow, 1.0), pRadius: numAttr(section.dataset.pRadius, 1.6),
    pParallax: numAttr(section.dataset.pParallax, 0.004),    // units of field per scrolled pixel at mid depth; near particles move faster, far ones slower
    boat: section.dataset.boat || 'voyage',                  // the ship of particles: 'voyage' (sails in at the top and down the page with you) | 'off'
    boatX: numAttr(section.dataset.boatX, -0.35), boatY: numAttr(section.dataset.boatY, -0.47), boatSize: numAttr(section.dataset.boatSize, 0.53),   // hero pose: waterline centre in NDC, hull length as a fraction of the visible width
    shipShare: numAttr(section.dataset.shipShare, coarse ? 0.3 : 0.2),   // share of the particles that belong to the ship
    shipEntry: numAttr(section.dataset.shipEntry, 0),                    // seconds the ship takes to ride in on the swell on load (0 = it loads in place, the default)
    shipWorkSize: numAttr(section.dataset.shipWorkSize, 0.15), shipWorkY: numAttr(section.dataset.shipWorkY, -0.38), shipWorkTilt: numAttr(section.dataset.shipWorkTilt, 68),   // pose in the work section: seen from above in the band under the cards, sailing down the axis, wake streaming up the column (size is the on-screen hull length; it does not grow with the level here)
    shipFlap: numAttr(section.dataset.shipFlap, 1.2), shipRipple: numAttr(section.dataset.shipRipple, 0), shipBob: numAttr(section.dataset.shipBob, 1),   // sail flutter amplitude | rest rings (0 = none) | motion: swell, pitch, heave, sea roll
    shipHeelWind: numAttr(section.dataset.shipHeelWind, 12),   // deg of heel from the wind at full way on the sloop (per level x 0.58 dinghy, 1.3 schooner, 1.1 tall ship)
    shipSwell: numAttr(section.dataset.shipSwell, 1), shipSwellDir: numAttr(section.dataset.shipSwellDir, 0),   // the sea's swell: height (1 = default) and the direction it runs relative to the hull (0 = along it, 90 = across it)
    shipWave: numAttr(section.dataset.shipWave, 1), shipSpray: numAttr(section.dataset.shipSpray, 1), shipFoam: numAttr(section.dataset.shipFoam, 1),   // wave heights and crest brightness | spray | foam
    shipSway: numAttr(section.dataset.shipSway, 1),
    shipSoft: numAttr(section.dataset.shipSoft, 1),                     // the ship's particles chase the pose through a weak spring alone (lagging, bending: barely existing) until the ketch; solid from there. 0 = always carried rigidly
    shipSoftUntil: numAttr(section.dataset.shipSoftUntil, 2),           // the level by which the ship has become solid (the softness fades over the level before it)
    shipRings: numAttr(section.dataset.shipRings, 1),                   // at rest: the speed (rad/s) of the very faint ripple rings spreading from the hull; 0 = none                     // at anchor the WHOLE scene (ship and water) heels and yaws slowly on a long quiet swell, as step 1 did; 0 = the sea stays level
    shipDotsRest: numAttr(section.dataset.shipDotsRest, 1.25),         // the ship's dot size factor at rest (the Sept-10 build drew the boat's dots a quarter larger than the field's); under way the size-dependent boost
    shipAnchor: numAttr(section.dataset.shipAnchor, 1.5), shipAnchorOut: numAttr(section.dataset.shipAnchorOut, 3),   // stopping is dropping anchor: seconds of no scrolling before the way starts to die (0 = the ship sails on while you read), and the seconds it takes to die after that; scrolling is the wind again
    shipCursorWind: numAttr(section.dataset.shipCursorWind, 1),       // at anchor the cursor is the wind: the sails fill away from it, the ship heels away from it (0 = off)
    shipBurgee: numAttr(section.dataset.shipBurgee, 1),               // the pennant at the masthead (0 = none)
    shipLines: numAttr(section.dataset.shipLines, 1), shipSolid: numAttr(section.dataset.shipSolid, 1),   // dots -> lines -> solid: the wireframe's and the surfaces' strength (x the module's per-level tables)
    shipFleet: numAttr(section.dataset.shipFleet, 1), shipFleetSize: numAttr(section.dataset.shipFleetSize, 1),   // the fleet (the route's `fleet` key): field particles form three small copies of the ship in formation round it; strength (0 = none) and the copies' size (x)
    shipTrail: numAttr(section.dataset.shipTrail, 5),                   // the wake as a chart line: foam dropped at the transom stays in the sea and fades over this many seconds, so the ship draws its own dotted route (0 = the short foam strip behind the hull instead)
    shipStorm: numAttr(section.dataset.shipStorm, 0), shipRain: numAttr(section.dataset.shipRain, 3),   // the passage through weather (the route's `storm` key, 0..1): its strength, and how fast the field falls as rain at full storm (world units per second; 0 = none)
    shipSettle: numAttr(section.dataset.shipSettle, 7),     // how fast ship particles take their places (per second): 7 lands a recruit in about 0.4 s
    shipLag: numAttr(section.dataset.shipLag, 0.9), shipLagPos: numAttr(section.dataset.shipLagPos, 0.6), shipLagSize: numAttr(section.dataset.shipLagSize, 0.8),   // seconds the drawn pose takes to close 95% of a scroll jump: angles / position (x, y, wake) / framing (size and level share one lag so the hull length holds while the ship evolves)
    shipLean: numAttr(section.dataset.shipLean, 0.02),                   // banking: deg of heel per deg/s of turn, capped at 5 (negative carves into the turn instead)
    shipSoftStart: numAttr(section.dataset.shipSoftStart, 0.3),          // the route's velocity at the very first pixel of scroll, relative to the first leg's mean: motion begins at once, gently
    shipCurrent: numAttr(section.dataset.shipCurrent, 1),                // the field as the sea: how much of the water's speed the whole field streams past at while the camera holds the ship (x the route's cam)
    shipFieldDim: numAttr(section.dataset.shipFieldDim, 0.35),           // how much the field dims under way while the camera holds the ship (0 = not at all)
    shipTheme: section.dataset.shipTheme || 'atlantic',                 // the ship's lineage: 'atlantic' (skiff to clipper) | 'norse' (faering to the Long Serpent); the picker's icon row and ?theme= override it
    shipOverlayAt: section.dataset.shipOverlayAt !== undefined ? section.dataset.shipOverlayAt : '.testimonials-wrapper:top@1',   // with opaque grounds: the scroll mark from which the canvas is drawn ABOVE the page, clipped to that element's top edge downward (the armada is the background of the testimonials-to-footer block: it scrolls in with the block, no fade); '' = never
    shipWay: numAttr(section.dataset.shipWay, 1),           // how fast the water streams past the hull under way (hull lengths per second at full wake)
    shipGrounds: section.dataset.shipGrounds || 'opaque',   // the bottom sections paint their own ground over the layer: 'opaque' (the ship stays at the quote and the sections below cover it) | 'translucent' (work-spine.css thins those grounds so the ship shows through, the concept's pick) | 'overlay' (the canvas flips above the page there with a screen blend) | 'none'
} : null;
if (pcfg) for (const [k, v] of new URLSearchParams(location.search)) if (k in pcfg && v !== '') pcfg[k] = Number.isNaN(+v) ? v : +v;   // dev aid: ?shipWorkTilt=45&boat=off
let layer = null;
const THEME_ROW = false;   // the ship-style icon row under the colour picker (and the stored choice it writes): off for now
const MOD_V = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '?t=' + Date.now() : '?v=2026-09-15c';   // cache-buster for the modules imported after the page has loaded (a hard refresh does not reach them: they load after the idle callback, from the browser's cache): never cached on a local server, versioned elsewhere (bump when they change)
import('./ink-cursor.js' + MOD_V).catch(e => console.warn('ink cursor', e));   // the pointer as a trail of ink in the picked colour (it checks for a real mouse and reduced motion itself)

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
    float hash1(float n){ return fract(sin(n) * 43758.5453); }
    uniform sampler2D tBoatA, tBoatB, tMetaA, tMetaB; uniform vec2 uDrift; uniform float uW, uRocket, uSoft, uLoose; float ROCK, TRAIL; /* ROCK / TRAIL: uRocket / uTrail for the ship, 0 for the fleet's copies (set at the start of every main and inside fleetTarget) */ uniform vec3 uSqN; uniform float uMix, uForm, uScroll, uH, uBoatScale, uTime, uRipple, uFlow, uSettle, uWay, uReflect, uN, uStarForm, uSnap, uSnapBoat; uniform vec3 uBoat; uniform mat3 uRot; uniform vec4 uStarT[12];
    uniform vec4 uWave, uSea, uMotion, uSail, uClock, uHull, uMisc, uSail2; uniform float uBeam[17];   // uSail2: (spare, billow amplitude, billow phase, spare)
    uniform mat3 uRot0; uniform vec3 uBoat0; uniform float uScale0; uniform vec4 uSwell; uniform mat3 uRotSea; uniform vec2 uSeaD; uniform float uSoftLane; uniform float uTrail, uTrailClk, uTrailClk0;
    uniform vec2 uFleetLift; /* x: the page offset of the ending in world units at the z = 0 plane, y: the camera's z */ uniform sampler2D tFleet, tFleetPos, tFleetMeta; uniform vec4 uFleet[32]; uniform float uFleetForm, uFleetScale; uniform vec3 uFleetBoat; uniform mat3 uFleetRot;   // nine copies in three waves; the form runs 0..3; the copies are built from the fleet's own level textures (the lineage's last ship) and posed in the fleet's own frame
    vec4 fleetCopy(float k){ int i = int(k + 0.5); vec4 c = uFleet[0]; for (int j = 1; j < 32; j++) { if (j == i) c = uFleet[j]; } return c; }
    uniform float uSmoke, uSmokeClk, uPaddle, uAnchor, uAnchorSide; uniform vec4 uFunnel;   // uAnchor: 0 the anchor stowed at the hawse .. 1 down   // funnel smoke (0..1, a share of the foam), its clock (1 per lifetime), the paddle wheels' angle; the funnels: first top (x, y), spacing (x), count
    float isSmoke(vec4 md){ return step(hash1(md.w * 13.7), 0.6 * uSmoke); }   // which foam particles are smoke (60% of them at full smoke)   // the fleet: per particle (source ref u, v, copy 1..3 or 0, recruit threshold); per copy (x aft, lift, z across in hull lengths, size); the form 0..1   // the wake trail: on/off, its age clock (1 per lifetime) now and at the previous sim step   // uRotSea: the sea's pose (its course follows the hull's slowly at rest, tightly under way); uSeaD: (cos, sin) of sea course - hull course; uSoftLane: at rest the water is spring-held like the hull (1), under way placed (0)   // uSwell: the swell's direction in the hull frame (cos, sin), spare
    // a solid ship particle's position was last written relative to the pose of the last sim step (uRot0, uBoat0, uScale0); carried into
    // the current pose it follows heading, tilt, turn, position and scale exactly, and the settle only has to close changes of shape
    vec3 rideAlong(vec3 p){ vec3 v = (p - uBoat0) / uScale0; vec3 rel = vec3(dot(uRot0[0], v), dot(uRot0[1], v), dot(uRot0[2], v)); return uBoat + uRot * rel * uBoatScale; }
    // the story of the ship: from barely existing to solid. While uSoft is 1 (the first levels) its particles are NOT carried rigidly: they
    // chase the moving target through a weak spring alone, lagging and bending as the Sept-10 sailboat did (uLoose weakens the spring further
    // at anchor); the rigid carry and the settle fade in over the sloop -> ketch stretch, and from the ketch on the ship holds its shape
    vec3 carry(vec3 p){ return mix(rideAlong(p), p, uSoft); }
    // the first 12 particles can be recruited as constellation stars: uStarT holds their targets (xyz) and an on flag (w)
    vec4 starOf(vec2 uv){ int idx = int(floor(uv.x * uN) + floor(uv.y * uN) * uN + 0.5); vec4 st = vec4(0.0); for (int k = 0; k < 12; k++) { if (k == idx) st = uStarT[k]; } return st; }
    // where a particle is drawn: the field wraps (uW by uH) and moves with depth-dependent parallax, by the scroll and by the sea's drift
    // (uDrift: the whole field is the water the ship sails through, streamed past astern while the camera holds the ship); a ship particle is drawn where it is
    vec2 fieldOff(float z){ float depthF = mix(0.3, 1.6, clamp((z + 4.0) / 8.0, 0.0, 1.0)); return (vec2(0.0, uScroll) + uDrift) * depthF; }   // the field's display offset at a depth (drawPos, bf = 0)
    vec3 drawPos(vec3 p, float bf){ float depthF = mix(0.3, 1.6, clamp((p.z + 4.0) / 8.0, 0.0, 1.0)); float k = depthF * (1.0 - bf); vec2 off = (vec2(0.0, uScroll) + uDrift) * k;
      vec3 pw = p; float wy = mod(p.y + off.y + uH * 0.5, uH) - uH * 0.5, wx = mod(p.x + off.x + uW * 0.5, uW) - uW * 0.5; pw.y = mix(wy, p.y, bf); pw.x = mix(wx, p.x, bf); return pw; }
    // the ship: two evolution levels A and B mixed by uMix. A particle belongs to a level when its shade (w) is > 0; one that is
    // absent at A and present at B eases in from its field home as uMix rises, so the ship grows out of the stars around it.
    float boatMixT(vec4 a, vec4 b){ float fa = step(0.01, a.w), fb = step(0.01, b.w); return fa * fb > 0.5 ? uMix : fb; }
    // a particle present at both levels morphs; one absent at A and present at B is recruited the moment uMix passes its own random
    // threshold r, so the ship grows out of the stars a few particles at a time and nothing ever hangs halfway between home and ship
    float boatFlag(vec4 a, vec4 b, float r){ float fa = step(0.01, a.w), fb = step(0.01, b.w); return fa * fb > 0.5 ? 1.0 : fb > 0.5 ? step(r, uMix) : fa > 0.5 ? step(uMix, r) : 0.0; }
    // The hull's waterline, measured from the model per level at layer init (measureHull) and mixed on the CPU: uBeam[k] is the
    // half-beam at x = -0.5 + k / 16 and uHull = (stem x, stern x, entry fullness, transom half-width). Linear between stations,
    // zero beyond the stem and the stern, so s = uHull.x - x is the distance aft of the real stem at every level.
    float hullBeam(float x){
      float u = clamp((x + 0.5) * 16.0, 0.0, 15.999); int i = int(u); float f = u - float(i), a = 0.0, b = 0.0;
      for (int k = 0; k < 16; k++) { if (k == i) { a = uBeam[k]; b = uBeam[k + 1]; } }
      return mix(a, b, f) * step(uHull.y, x) * step(x, uHull.x); }
    float fall(float a, float b, float v){ return 1.0 - smoothstep(a, b, v); }                     // 1 below a, 0 above b (a < b)
    // the ambient swell in the hull frame (uSea: amplitude, wavenumber, phase): the very wave the hull's pitch and heave answer
    float swellAt(float x, float z){ float ph = uSea.y * (x * uSwell.x + z * uSwell.y) + uSea.z; return uSea.x * (cos(ph) + 0.35 * cos(1.83 * ph + 1.1)) / 1.35; }
    // The water (role 6) and the foam (role 7) are PLACED, never chased. Each is a lane streaming aft by uFlow with a lane phase of
    // its own per particle, and each lane's fade is exactly zero at both of its ends, so a wrap is a teleport between two invisible
    // points. Every wave is stationary in the hull frame and follows the one speed scalar: heights and wavelength with way^2 (uWave),
    // foam, spray and churn past thresholds (uWave.z, uClock.zw), the bow wave and spray pulsing as the stem buries (uSea.w), the
    // churn as the stern squats (uMotion.w). Every clock is a uniform accumulated on the CPU; uTime only drives constant-rate jitter.
    vec3 flowLocal(vec3 q, vec4 md, float role, out float fade){
      fade = 1.0; float wake = step(6.5, role) * step(role, 7.5), water = step(5.5, role) * step(role, 6.5);
      if (wake > 0.5) {
        float h = hash1(md.z * 91.7), ha = hash1(md.z * 5.3);
        if (isSmoke(md) > 0.5) {   // funnel smoke: from a funnel's top, rising, blown aft by the way, spreading and thinning; on its own clock, so it rises at anchor too
          float d1 = fract(hash1(md.z * 13.1) + uSmokeClk), j = floor(h * uFunnel.w);
          vec2 o = vec2(uFunnel.x + j * uFunnel.z, uFunnel.y);
          q.x = o.x - d1 * (0.12 + 0.6 * uWay) + 0.015 * sin(uTime * 0.9 + h * 6.2832) * d1;
          q.y = o.y + 0.24 * pow(d1, 0.7) + 0.02 * sin(uTime * 1.3 + ha * 6.2832) * d1;
          q.z = (ha - 0.5) * 2.0 * (0.012 + 0.08 * d1) + 0.01 * sin(uTime * 1.1 + h * 3.0) * d1;
          fade = 0.65 * uSmoke * smoothstep(0.0, 0.06, d1) * pow(1.0 - d1, 1.4) * (0.35 + 0.65 * hash1(md.z * 17.3));
          return q; }
        float d1 = TRAIL > 0.5 ? fract(hash1(md.z * 13.1) + uTrailClk) : fract(hash1(md.z * 13.1) + uFlow / 1.4), d = TRAIL > 0.5 ? 0.0 : 1.4 * d1;   // the strip: 1.4 L long, streaming at the water's speed; the trail: born at the transom, aged by its own clock
        q.x = uHull.y - d;
        q.z = (h - 0.5) * 2.0 * (uHull.w + 0.03 + (0.12 + 0.3 * ROCK) * d + 0.02 * uMotion.w) + 0.01 * sin(uTime * 2.0 + h * 20.0);   // born the transom's width, spreading at ~7 deg (wider for the rocket's exhaust), breathing with the squat
        q.y = ${WATERLINE} + swellAt(q.x, q.z) * (1.0 - ROCK) + 0.004 * sin(uTime * 3.0 + h * 40.0) + ROCK * (hash1(md.z * 3.3) - 0.5) * 0.2 * d;   // the exhaust is a cone, not a strip
        float alive = smoothstep(ha * 0.9 - 0.08, ha * 0.9 + 0.08, uWave.z);                       // the COUNT of foam grows with the way, each particle easing in over its own band ('active' is reserved in GLSL ES 1.0)
        fade = uWave.z * alive * smoothstep(0.0, 0.05, d1) * exp(-d / (0.45 * uWave.w * (1.0 + 1.5 * ROCK))) * fall(0.9, 1.0, d1)   // zero at birth (d1 = 0) and at the far end (d1 = 1); the length follows the way (x2.5 for the rocket)
             * (0.4 + 0.6 * hash1(md.z * 17.3 + floor(uClock.x + h * 5.0))) * (1.0 + 2.0 * ROCK * exp(-d / 0.5));   // the rocket's exhaust burns brightest at the nozzle
        if (TRAIL > 0.5) fade = 1.1 * uWave.z * alive * smoothstep(0.0, 0.04, d1) * pow(1.0 - d1, 1.1) * (0.6 + 0.4 * hash1(md.z * 17.3)); }   // the trail: a steady dot that fades with age
      else if (water > 0.5 && ROCK > 0.5) {
        // the rocket: the same particles are the air tearing past the body (streaks from ahead of the nose to past the tail, hugging the
        // skin) and sparks thrown from the nozzle in a cone; both stream at uFlow, which the CPU runs 4x faster for the rocket
        float h1 = hash1(md.z * 5.3), h2 = hash1(md.z * 31.0), h3 = hash1(md.w * 77.0), h4 = hash1(md.z * 91.7), h5 = hash1(md.w * 13.7);
        float sgn = h5 < 0.5 ? -1.0 : 1.0, flick = 0.5 + 0.5 * hash1(md.z * 17.3 + floor(uClock.x * 2.0 + h4 * 7.0));
        if (h3 < 0.45) {   // air streaks
          float d1 = fract(h1 * 4.0 + uFlow / 1.6); q.x = uHull.x + 0.3 - 1.6 * d1;
          float rad = max(hullBeam(q.x), 0.02) + 0.015 + 0.06 * h2, ang = (h4 - 0.5) * 0.9;   // along the skin on the two flanks (never in front of the body on screen)
          q.z = sgn * rad * cos(ang); q.y = ${WATERLINE} + rad * sin(ang);
          fade = 1.4 * smoothstep(0.0, 0.08, d1) * fall(0.85, 1.0, d1) * (0.35 + 0.65 * h2) * flick; }
        else {             // sparks
          float d2 = fract(h1 * 3.0 + uFlow / 1.2 + h2), d = 1.3 * d2; q.x = uHull.y - 0.05 - d;
          float sp = 0.05 + 0.32 * d; q.z = (h2 - 0.5) * 2.0 * sp; q.y = ${WATERLINE} + (h4 - 0.5) * 2.0 * sp * 0.8;
          fade = 2.2 * smoothstep(0.0, 0.04, d2) * pow(1.0 - d2, 2.0) * (0.3 + 0.7 * flick); }
        return q; }
      else if (water > 0.5) {
        float h1 = hash1(md.z * 5.3), h2 = hash1(md.z * 31.0), h3 = hash1(md.w * 77.0), h4 = hash1(md.z * 91.7), h5 = hash1(md.w * 13.7);
        float qz = abs(h5 - 0.5) * 2.0, sgn = h5 < 0.5 ? -1.0 : 1.0, zl = sgn * mix(0.62 * pow(qz, 1.4), 0.78 * pow(qz, 0.75), uSwell.z);   // the lane's cross section: denser at the hull under way; at rest (uSwell.z) the Sept-10 disc, 1.5 L wide and even
        float xl = 0.75 - mod(h1 * 2.6 + uFlow, 2.6), x = xl + 0.55 * uSwell.z, azl = abs(zl);   // the lane, in the SEA frame: 0.25 L ahead of the stem .. 1.85 L astern, streaming aft; at rest (uSwell.z) it slides forward to sit centred on the hull, as step 1's disc did
        // the same point in the HULL frame (the sea's course lags the hull's at rest, so the hull turns through a disc that stays put):
        // everything the hull does to the water (parting, bow wave, wedge, churn) is measured here, then the point goes back to the sea frame
        float cD = uSeaD.x, sD = uSeaD.y, hx = x * cD - zl * sD, hz = x * sD + zl * cD;
        float hb = hullBeam(hx), s = uHull.x - hx, az = abs(hz);
        // parted along the real waterline: a thin rim on the hull, thrown wider at the stem under way
        float inHull = step(az, hb + 0.008) * step(uHull.y, hx) * step(hx, uHull.x);
        float side = hb + 0.01 + 0.02 * h2 + 0.04 * uWave.x * fall(0.0, 0.4, s);
        hz = mix(hz, (hz < 0.0 ? -1.0 : 1.0) * side, inHull); az = abs(hz);
        q.x = hx * cD + hz * sD; q.z = -hx * sD + hz * cD;
        q.y = ${WATERLINE} + swellAt(q.x, q.z) * (1.0 - uSwell.z);   // at rest the specks lie still: no swell heave
        // the bow wave: a crest just abaft the stem, a trough at half a wavelength, the stern crest at the quarter; height ~ way^2 x entry fullness
        float eb = (az - hb) / 0.06, nearB = exp(-eb * eb) * smoothstep(-0.03, 0.02, s) * smoothstep(uHull.y - 0.12, uHull.y - 0.02, hx);
        float waveS = cos(6.2832 * s / uWave.y) * exp(-s / 0.8);
        q.y += nearB * 0.025 * uWave.x * uHull.z * (0.85 + 0.3 * uSea.w) * waveS;
        float crest = nearB * max(0.0, waveS);
        // spray: droplets tossed from the parted water at the stem, each on its own cycle at the flicker rate, hardest as the bow plunges
        float zone = inHull * fall(0.0, 0.3, s);
        float ph = fract(h4 + uClock.x * 0.5), toss = 4.0 * ph * (1.0 - ph), pulse = 0.35 + 0.65 * uSea.w;
        q.y += zone * 0.05 * uClock.z * pulse * (0.4 + 0.6 * h2) * toss;
        q.z += sgn * zone * 0.05 * ph * h2;
        float spray = zone * uClock.z * pulse * (1.0 - ph);
        // the Kelvin wedge: divergent crests from the stem (a crest AT the apex, a continuous arm), transverse crests inside, astern
        float wedge = 0.354 * s, edge = az - wedge, aft = smoothstep(-0.05, 0.05, s);
        float ew = edge / (0.025 + 0.03 * s), div = aft * exp(-ew * ew) * exp(-s / 1.6) * smoothstep(hb, hb + 0.03, az);
        float divPh = cos(6.2832 * s / (0.8 * uWave.y));
        q.y += 0.012 * uWave.x * div * divPh;
        float divLit = div * (0.35 + 0.65 * max(0.0, divPh));
        float inside = aft * fall(wedge - 0.1, wedge, az) * smoothstep(0.95, 1.1, s);
        float trans = inside * cos(6.2832 * (s - 1.05) / uWave.y) * exp(-(s - 1.0) / 1.5);
        q.y += 0.008 * uWave.x * trans;
        // the transom: the rooster hump where the flow closes, churn as wide as the transom spreading aft and pulsing with the squat
        float dd = uHull.y - hx, d = max(0.0, dd), astern = smoothstep(-0.05, 0.05, dd), T = uHull.w;
        float churn = astern * fall(0.0, 1.5 * T + 0.05 + 0.12 * d, az) * exp(-d / 0.45) * (0.75 + 0.5 * uMotion.w);
        float er = (d - 0.15) / 0.12, ez = az / (T + 0.05), rooster = 0.03 * uWave.x * astern * exp(-er * er) * exp(-ez * ez);
        q.y += rooster + 0.006 * uWay * churn * sin(uClock.y + h4 * 6.2832 + hx * 10.0);
        float churnLit = churn * uClock.w * (0.55 + 0.45 * hash1(h4 * 7.7 + floor(uClock.x + h4 * 3.0)));
        // brightness: crests catch light, spray is brightest at launch, the swell only from low viewpoints (uMisc.y is 0 in the top view)
        float swellLit = uMisc.y * max(0.0, cos(uSea.y * (q.x * uSwell.x + q.z * uSwell.y) + uSea.z));
        float lit = 3.0 * spray + 1.6 * crest * uWave.x * uHull.z + 1.2 * divLit * uWave.x + 0.35 * max(0.0, trans) * uWave.x
                  + 0.7 * churnLit + 0.8 * clamp(rooster / 0.02, 0.0, 1.0) + swellLit;
        // the window: exactly zero at both lane ends (x = 0.75 and x = -1.85, where mod wraps), soft across, dithered per particle
        float win = fall(0.45, 0.75, xl) * smoothstep(-1.85, -1.45, xl) * fall(mix(0.38, 0.7, uSwell.z), mix(0.62, 0.9, uSwell.z), azl) * (mix(0.6, 0.8, uSwell.z) + mix(0.4, 0.2, uSwell.z) * h3);   // at rest the dither is lighter: the specks read more evenly
        win *= mix(1.0, fall(0.85, 1.15, length(vec2(q.x / 1.25, q.z / 0.78))), uSwell.z);                 // at rest the sheet is the Sept-10 disc round the hull (2.5 x 1.5 L), not a lane
        float r = length(vec2(q.x, q.z * 1.6));
        float rcrest = 0.5 + 0.5 * sin(r * 20.8 - 2.0 * atan(q.z * 1.6, q.x) - uRipple), ring = uMisc.z * (1.0 - rcrest);   // at anchor only: the Sept-10 speckle disc, a two-armed spiral of brighter, lifted crests, drifting only as slowly as shipRipple says
        q.y += 0.014 * uMisc.z * rcrest;
        float rings = 0.5 + 0.5 * sin(r * 14.0 - uSwell.w), ringW = 0.12 * uSwell.z * fall(0.35, 1.3, r);   // at anchor only: very faint ripple rings spreading from the hull (shipRings), a brightness shimmer, the specks themselves still
        // the calm sheet (still specks all round the hull) belongs to the ship at anchor; under way it would slide along as a loose
        // rectangle of dots, so it fades out with the way and the sea then shows only where the ship disturbs it: the lit features,
        // plus a faint body of broken water inside the wedge so the wake reads as a surface and not as a few bright arms
        float calm = fall(0.06, 0.45, uWay);
        float body = aft * fall(wedge - 0.08, wedge + 0.02, az) * exp(-s / 1.6) * (0.4 + 0.6 * h2);
        fade = win * (1.0 * calm + (1.0 - calm) * (0.16 * body + 0.35 * min(lit, 2.2)) + calm * min(lit, 2.2)) * (1.0 - ring) * (1.0 + ringW * (2.0 * rings - 1.0)); }   // at rest as bright as the hull's dots, the rings a +-16% shimmer
      return q; }
    // The ship's target for one particle, and for the water and foam their lane fade. Sails fill and luff in boat space along their
    // belly normal; the solid roles (hull, deck, sails, spars, rigging, and the reflection with every motion mirrored) roll, pitch
    // and heave about the pivot on the waterline (uMisc.x, WATERLINE, 0); the water and foam are placed by flowLocal on the level sea
    // and get none of that. Then the sea pose uRot (heading, tilt, turn: no heel, no pitch), the scale and the anchor.
    vec3 boatTarget(vec4 a, vec4 b, vec4 ma, vec4 mb, out float fade){
      float m = boatMixT(a, b); vec3 q = mix(a.xyz, b.xyz, m); vec4 md = mix(ma, mb, m); float role = floor(md.x + 0.5);
      float sail = max(step(2.5, role) * step(role, 3.5), step(8.5, role)), lane = step(5.5, role) * step(role, 7.5), refl = step(7.5, role) * step(role, 8.5);   // role 9: the burgee, cloth like a sail
      if (sail > 0.5) {
        // md.z: the baked belly along the belly normal (tagSailBellies / the module): > 0 fore-and-aft (normal +z), < 0 square (normal uSqN = (cos b, 0, -sin b) for a brace b, the wind from astern)
        vec3 n = md.z < 0.0 ? uSqN : vec3(0.0, 0.0, 1.0);   // uSqN: the lineage's square-sail belly normal (the yard's brace)
        float hs = hash1(md.w * 9.1 + md.y * 3.7);
        float toLeech = md.z < 0.0 ? abs(2.0 * md.w - 1.0) : md.w, leech = mix(1.0, 0.35 + 0.65 * toLeech, uSail.w);            // a drawing sail only shakes at the leech (a square sail has two)
        float ripple = (sin(uSail.z + md.w * 6.0 - q.y * 5.0 + hs * 1.3) + 0.35 * sin(2.3 * uSail.z + md.w * 11.0 + hs * 4.0)) / 1.35;   // a ripple running across the chord, two harmonics
        float billow = (sin(uSail2.z + md.w * 2.2 - q.y * 2.0 + hs * 0.8) + 0.5 * sin(0.53 * uSail2.z + md.w * 3.7 + q.y * 1.5 + hs * 2.1)) / 1.5;   // a slow, long wave rolling over the cloth (zero at the edges: it scales with the baked belly)
        q += n * (abs(md.z) * (uSail.x - 1.0 + uSail2.y * billow) + md.y * uSail.y * leech * ripple); }                          // fill: the belly scaled (breathing on the CPU); billow; luff: the flutter
      else if (abs(role - 5.0) < 0.5 && md.y > 1.5) {   /* the anchor: the chain pays out from its run on deck through the hawse (0.4 L of it), the anchor hangs from its end; it leads a little forward as it goes down (the ship lies back on it), and it hangs on the side that faces the camera */
        float LC = 0.4, P = pow(uAnchor, 1.6) * LC;
        if (md.z < 0.5) { float s = md.w * LC, hang = max(0.0, P - s), deck = max(0.0, s - P), onDeck = smoothstep(0.0, 0.015, deck);
          q.y += -hang + 0.017 * onDeck; q.x += 0.12 * hang * hang / LC - 0.55 * deck; q.z *= mix(1.0, 0.4, onDeck); }
        else { q.y -= P; q.x += 0.12 * P * P / LC; }
        q.z = abs(q.z) * uAnchorSide; }   // the anchor and its chain run out from the hawse as the ship comes to rest (a little aft: the ship lies back on it)
      else if (md.y > 0.001 && (abs(role - 2.0) < 0.5 || abs(role - 4.0) < 0.5)) {   // a paddle wheel part (deck or spar with the spin meta): turns about its axle (md.zw) with the water's flow, paddles moving aft at the bottom
        float th = -uPaddle * md.y; vec2 c = vec2(md.z, md.w), d = q.xy - c; float cs = cos(th), sn = sin(th); q.xy = c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
      q = flowLocal(q, md, role, fade);
      if (lane < 0.5) {
        float sg = 1.0 - 2.0 * refl;
        float hb = hash1(md.w * 41.0 + md.y * 7.0);   // the rocket vibrates: a coherent 10 Hz shake of the whole body plus a per-particle buzz, both along and across
        q.x += ROCK * (0.004 * sin(uTime * 61.0) + 0.0025 * sin(uTime * 97.0 + hb * 6.2832));
        q.z += ROCK * (0.007 * sin(uTime * 71.0 + 0.7) + 0.003 * sin(uTime * 113.0 + hb * 6.2832));                                                                                          // the reflection is the mirror image: every motion reversed
        q -= vec3(uMisc.x, ${WATERLINE}, 0.0);
        float cp = cos(sg * uMotion.y), sp = sin(sg * uMotion.y); q = vec3(q.x * cp - q.y * sp, q.x * sp + q.y * cp, q.z);   // pitch about the beam axis, bow up for +
        float ch = cos(sg * uMotion.x), sh = sin(sg * uMotion.x); q = vec3(q.x, q.y * ch - q.z * sh, q.y * sh + q.z * ch);   // heel about the keel line at the waterline
        q.y += sg * uMotion.z;                                                                                                // heave along the ship's up
        q.x += uMisc.x; }
      else { q.y -= ${WATERLINE}; }                                                                                           // the sea: level, at the waterline, no heel, no pitch, no heave
      q = (lane > 0.5 ? uRotSea : uRot) * q;                                                                                  // the hull's pose, or the sea's for the water and foam; uBoat is where the waterline centre sits
      return uBoat + q * uBoatScale; }
    // the fleet: a field particle recruited (its threshold passed by uFleetForm) takes the place of its source ship particle in a small copy
    // of the ship, scaled about the big ship's waterline centre and set out on the sea (the sea's pose) in formation. fl.z = 0: not a member
    float fleetOn(vec4 fl){ return fl.z > 0.5 ? step(fl.w, uFleetForm) : 0.0; }   // fl.w: the copy's wave + its particle's threshold
    vec3 fleetTarget(vec4 fl, out float fade, out float shade, out vec4 mdOut){
      vec4 sA = texture2D(tFleetPos, fl.xy), sMA = texture2D(tFleetMeta, fl.xy);
      float pres = step(0.01, sA.w); shade = clamp(sA.w, 0.0, 1.0) * pres; mdOut = sMA;
      ROCK = 0.0; TRAIL = 0.0; vec3 bt = boatTarget(sA, sA, sMA, sMA, fade); ROCK = uRocket; TRAIL = uTrail; fade *= pres;   // a ship, whatever the main ship is
      vec3 rel = (bt - uBoat) / uBoatScale; rel = vec3(dot(uRot[0], rel), dot(uRot[1], rel), dot(uRot[2], rel));   // the ship's own pose undone (uRot is orthonormal: its columns dotted)
      float kq = fl.z, solidQ = 1.0 - step(5.5, floor(sMA.x + 0.5)) * step(floor(sMA.x + 0.5), 7.5);
      float ro = solidQ * (0.045 * sin(uTime * (0.61 + 0.043 * kq) + kq * 2.1) + 0.02 * sin(uTime * (1.13 + 0.031 * kq) + kq * 4.7)), cr = cos(ro), sr = sin(ro);   /* a roll of its own per copy, about the keel line */
      rel = vec3(rel.x, (rel.y - (${WATERLINE})) * cr - rel.z * sr + (${WATERLINE}), (rel.y - (${WATERLINE})) * sr + rel.z * cr);
      vec4 c = fleetCopy(fl.z - 1.0);
      vec3 W = uFleetBoat + uFleetRot * (rel * c.w + c.xyz) * uFleetScale; W.y += uFleetLift.x * (uFleetLift.y - W.z) / uFleetLift.y;   /* the ending scrolls with the page: the same pixel shift at every depth */
      return W; }`;
const SIM_VEL = SIM_NOISE + SIM_SHARED + `
    uniform sampler2D tHome; uniform float uDelta, uCurl, uReturn, uDamp, uPull, uRadius; uniform vec3 uCam, uDir;
    void main(){ ROCK = uRocket; TRAIL = uTrail; vec2 uv=gl_FragCoord.xy/resolution.xy; vec3 p=texture2D(tPos,uv).xyz; vec3 v=texture2D(tVel,uv).xyz; vec4 h=texture2D(tHome,uv);
      vec4 bA=texture2D(tBoatA,uv), bB=texture2D(tBoatB,uv), mA=texture2D(tMetaA,uv), mB=texture2D(tMetaB,uv);
      float bf=boatFlag(bA,bB,h.w)*uForm; vec4 st=starOf(uv); float sf=st.w*uStarForm;
      float roleV=floor(mix(mA,mB,boatMixT(bA,bB)).x+0.5), laneV=step(5.5,roleV)*step(roleV,7.5);
      if (bf > 0.5 && laneV > 0.5 && (uSoftLane < 0.5 || (uTrail > 0.5 && roleV > 6.5))) { gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }   // under way the water and foam carry no velocity (placed); at rest they are spring-held exactly like the hull's dots; a trail dot never moves on its own
      float fdv; vec3 tgt=mix(mix(h.xyz, boatTarget(bA,bB,mA,mB,fdv), bf), st.xyz, sf);
      vec4 fl=texture2D(tFleet,uv); float ff=fleetOn(fl);
      if (ff > 0.5) { float ffd, fsh; vec4 fmd; vec3 ft=fleetTarget(fl,ffd,fsh,fmd); ff*=step(0.001,fsh); tgt=mix(tgt,ft,ff); }   // a fleet member's target is its place in the small copy (unless its source is absent at this level)
      if (bf > 0.5) p = carry(p);                                                                     // the spring sees the particle where the pose has carried it (rigidly under way, not at rest)
      float bfx=max(bf,ff);
      if (bfx < 0.5 && sf < 0.5 && distance(p, h.xyz) > 2.5) { gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }   /* (the cursor and the curl never push a field particle more than ~1 unit from home) */   /* a particle just released far from home (the armada, the fleet, a level's absent part): no velocity, SIM_POS puts it home */
      vec3 f=(tgt-p)*uReturn*(1.0+0.15*bfx+2.5*sf)*(1.0-0.5*bf*uLoose);   // the ship's spring is barely stiffer than the field's (and weaker while loose), so the cursor can stir it
      f+=curlNoise(p*0.28+vec3(0.0,uTime*0.05,0.0))*uCurl*(0.4+0.6*h.w)*(1.0-0.8*bfx*(1.0-0.2*uSoft))*(1.0-0.7*sf);   // the curl wanders the loose ship's dots a little more
      vec3 pw=drawPos(p,max(bfx,sf));
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      float infl=(1.0-smoothstep(0.0,uRadius,d))*step(0.5,along)*(1.0-0.3*bfx);   // the hull answers the light; the sea (above) not at all
      vec3 toRay=-perp/max(d,1e-4);
      f+=toRay*infl*uPull+cross(uDir,toRay)*infl*uPull*0.6;
      v=v*uDamp+f*uDelta;
      if (bfx < 0.5 && sf < 0.5) { float sp=length(v); if (sp > 3.0) v*=3.0/sp; }   /* a free field particle never whips: its speed is capped (a released fleet copy drifts home instead of streaking) */
      gl_FragColor=vec4(v,1.0); }`;
const SIM_POS = SIM_SHARED + `
    uniform sampler2D tHome; uniform float uDelta;
    void main(){ ROCK = uRocket; TRAIL = uTrail; vec2 uv=gl_FragCoord.xy/resolution.xy; vec4 p=texture2D(tPos,uv); vec3 v=texture2D(tVel,uv).xyz; vec4 hm=texture2D(tHome,uv); float w=hm.w; float heldP=0.0;
      p.xyz+=v*uDelta;
      vec4 st=starOf(uv); float sf=st.w*uStarForm;
      if (sf > 0.5 && distance(p.xyz, st.xyz) > uSnap) p.xyz = st.xyz + (p.xyz - st.xyz) * 0.12;   // a far recruit snaps most of the way instead of flying across the screen
      vec4 bA=texture2D(tBoatA,uv), bB=texture2D(tBoatB,uv);
      vec4 fl=texture2D(tFleet,uv);
      if (uSettle > 0.0 && fleetOn(fl) > 0.5) { float ffd, fsh; vec4 fmd; vec3 ft=fleetTarget(fl,ffd,fsh,fmd); if (fsh > 0.001) { p.xyz = mix(p.xyz, ft, max(uSettle * 0.6, uRocket)); heldP = 1.0; } }   // the fleet streams in and settles on its copy (a little slower than the ship, so the recruits are seen arriving); the rocket swarm is placed outright (its copies move too fast to be chased)
      if ((uSettle > 0.0 || uSnapBoat > 0.0) && boatFlag(bA,bB,w)*uForm > 0.5) {
        vec4 mA=texture2D(tMetaA,uv), mB=texture2D(tMetaB,uv); float fdp; vec3 bt=boatTarget(bA,bB,mA,mB,fdp);
        float roleP=floor(mix(mA,mB,boatMixT(bA,bB)).x+0.5), laneP=step(5.5,roleP)*step(roleP,7.5);
        vec4 mdP = mix(mA,mB,boatMixT(bA,bB));
        if (uTrail > 0.5 && roleP > 6.5 && roleP < 7.5 && isSmoke(mdP) < 0.5) {   // the wake trail: born at the transom when its age wraps (since the last sim step), stored without the field's offset so it drifts with the sea, then left where it fell (smoke is placed like the strip)
          float hz = hash1(mdP.z * 13.1);
          if (fract(hz + uTrailClk) < fract(hz + uTrailClk0) || uSnapBoat > 0.0) p.xyz = bt - vec3(fieldOff(bt.z), 0.0); }   // (on load every trail dot starts at the transom)
        else {
        p.xyz = mix(carry(p.xyz), p.xyz, laneP);                                                       // solids ride the rigid pose first (not at rest: uSoft)
        p.xyz = mix(mix(p.xyz, bt, uSettle * (1.0 - 0.9 * uSoft)), bt, laneP * (1.0 - uSoftLane));   // the water is placed under way, spring-held at rest   // solid roles settle (uSettle from the simulated step) and keep their spring life; water and foam are PLACED: p == target every step, so a lane wrap is a one-step teleport between two points where the lane's fade is zero
        if (uSnapBoat > 0.0 && distance(p.xyz, bt) > uSnapBoat) p.xyz = bt + (p.xyz - bt) * 0.1; } }   // on load the ship is already in place
      if (heldP < 0.5 && boatFlag(bA,bB,w)*uForm < 0.5 && sf < 0.5 && distance(p.xyz, hm.xyz) > 2.5) p.xyz = hm.xyz + (p.xyz - hm.xyz) * 0.02;   /* released far from home: back home at once (unseen: the armada lets go behind the testimonials) */
      gl_FragColor=vec4(p.xyz,w); }`;
const PTS_VS = SIM_SHARED + `
    uniform sampler2D tPos, tVel, tHomeP; uniform float uSize, uDPR, uP, uRadius, uIntro, uWake, uBoatPx, uFieldDim, uFlag; uniform vec3 uCam, uDir; attribute vec2 ref; attribute float aSize;
    varying float vLit, vRand, vSpeed, vBoat, vShade, vStar, vFade, vFlag;
    void main(){ ROCK = uRocket; TRAIL = uTrail; vec4 p=texture2D(tPos,ref); vec3 v=texture2D(tVel,ref).xyz;
      vec4 bA=texture2D(tBoatA,ref), bB=texture2D(tBoatB,ref), mA=texture2D(tMetaA,ref), mB=texture2D(tMetaB,ref);
      float bf=boatFlag(bA,bB,p.w)*uForm; vBoat=bf; float m=boatMixT(bA,bB); vShade=clamp(mix(bA.w,bB.w,m),0.0,1.0); vec4 md=mix(mA,mB,m); float role=floor(md.x+0.5);
      float laneR=step(5.5,role)*step(role,7.5), refl=step(7.5,role)*step(role,8.5), flagR=step(8.5,role)*bf; vFlag=flagR*uFlag;   // the burgee: its own colour, brighter
      vec4 st=starOf(ref); float sf=st.w*uStarForm; vStar=sf;
      vec3 pw; float fd=1.0, nearT=1.0;
      vec4 fl=texture2D(tFleet,ref); float ff=fleetOn(fl);
      if (ff > 0.5) {   // the fleet: drawn where the sim put it; the source's shade, role and lane fade; arrives dark and lights up in place
        float fsh; vec4 fmd; vec3 ft=fleetTarget(fl,fd,fsh,fmd); ff*=step(0.001,fsh); pw=p.xyz; vShade=fsh; role=floor(fmd.x+0.5); laneR=step(5.5,role)*step(role,7.5); vShade=mix(vShade,0.5,laneR);
        float fs=fleetCopy(fl.z-1.0).w;
        nearT=1.0-smoothstep(0.12,0.5,distance(pw,ft)/max(0.05,uFleetScale*fs)); bf=0.85*ff; vBoat=bf; fd*=mix(1.0,mix(1.25,1.4,laneR),uRocket); fd=mix(1.0,fd,laneR)*mix(1.0,uReflect,step(7.5,role)*step(role,8.5)); }
      else if (bf > 0.5 && laneR > 0.5) { pw=mix(boatTarget(bA,bB,mA,mB,fd), p.xyz, uSoftLane);          // water and foam: drawn from the lane under way (position and fade from ONE evaluation); at rest from the spring-held position, the lane's fade kept
        if (uTrail > 0.5 && role > 6.5 && role < 7.5 && isSmoke(md) < 0.5) { float age = fract(hash1(md.z * 13.1) + uTrailClk); pw = drawPos(p.xyz, 0.0); pw.xy += (vec2(hash1(md.z * 3.1), hash1(md.z * 7.9)) - 0.5) * age * 0.3 * uBoatScale; } }   // the trail: where it fell in the sea, dispersing slowly
      else if (bf > 0.5) { pw=carry(p.xyz); float fdn; vec3 bt=boatTarget(bA,bB,mA,mB,fdn); float rec=1.0-step(0.01,bA.w)*step(0.01,bB.w); nearT=mix(1.0, 1.0-smoothstep(0.12,0.5,distance(pw,bt)/uBoatScale), rec); }   // solids ride the pose; a recruit (absent at one of the two levels) arrives dark and lights up in place
      else { pw=drawPos(p.xyz,sf); nearT=mix(1.0-smoothstep(1.2,2.5,distance(p.xyz,texture2D(tHomeP,ref).xyz)),1.0,sf); }   /* a field particle on its way home (released by the ship, a fleet or the armada) stays dark until it is back: no streaks across the screen */
      vShade=mix(vShade, 0.5, laneR*(1.0-ff));
      vFade=min(uMisc.w, mix(1.0, fd, max(bf*laneR, ff))*mix(1.0, uReflect, bf*refl)*mix(1.0, nearT, max(bf*(1.0-laneR), ff*(1.0-laneR))))*mix(uFieldDim, 1.0, max(max(bf, sf), ff))*mix(1.0, uFlag, flagR)*mix(nearT, 1.0, max(max(bf, sf), ff))*mix(1.0, smoothstep(0.03, 0.25, uAnchor), bf*step(4.5,role)*step(role,5.5)*step(1.5,md.y));   /* the anchor and its chain only show once it is being lowered: hidden while the ship is under way */   // the field (not the ship, not a star) dims a little under way; the burgee can be switched off
      vec3 rel=pw-uCam; float along=dot(rel,uDir); vec3 perp=rel-uDir*along; float d=length(perp);
      vLit=(1.0-smoothstep(0.0,uRadius,d))*step(0.5,along)*(1.0-bf*laneR)*(1.0-0.65*bf); vRand=p.w; vSpeed=length(v);   // the light barely touches the ship and not the sea
      vec4 mv=modelViewMatrix*vec4(pw,1.0);
      gl_PointSize=uSize*uDPR*aSize*(1.0+0.9*vLit+bf*(uBoatPx-1.0)+2.4*sf+0.25*bf*laneR*clamp(fd-1.0,0.0,1.5)+0.5*bf*laneR*uTrail*step(6.5,role)*step(role,7.5)+bf*laneR*uSwell.z*(1.1*hash1(md.z*7.7)-0.3)+0.3*vFlag+0.15*ff*uRocket+0.4*bf*step(4.5,role)*step(role,5.5)*step(1.5,md.y))*uP/max(-mv.z,1.0)*uIntro;   // the rest disc's specks vary in size (0.7x .. 1.8x)
      gl_Position=projectionMatrix*mv; }`;
const PTS_FS = `
    uniform vec3 uColorA, uColorB, uColorLit, uColorFlag; uniform float uGlow, uClipTop; varying float vLit, vRand, vSpeed, vBoat, vShade, vStar, vFade, vFlag;
    void main(){ if (gl_FragCoord.y > uClipTop) discard; vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5||vFade<0.02) discard; float disc=(1.0-smoothstep(0.08,0.5,d))*vFade;
      vec3 col=mix(uColorA,uColorB,smoothstep(0.25,0.85,vRand)); col=mix(col,uColorLit,clamp(vLit*0.9+smoothstep(0.8,3.0,vSpeed)*0.15+0.7*vBoat*vShade+0.6*vStar,0.0,1.0)); col=mix(col,uColorFlag,vFlag);
      float a=disc*(0.24+0.5*vLit)*(1.0+vBoat*(0.1+1.4*vShade)+1.6*vStar+0.8*vFlag)*uGlow; gl_FragColor=vec4(col*(0.85+0.35*vLit+0.3*vBoat*vShade+0.3*vStar),a); }`;

/* dots -> lines -> solid. The wireframe's vertices and the surfaces' vertices are ship particles: each samples the live position texture
   at its particle's coordinates and rides the pose exactly as the dots do (carry), so the lines bend with the soft ship and follow every
   motion; a vertex whose particle has not arrived (a recruit) fades its line. Alpha from the level (uAlpha, the crossfade included). */
const WIRE_VS = SIM_SHARED + `
    uniform sampler2D tPos; attribute vec2 aRef; attribute float aW; varying float vA, vShade;
    void main(){ ROCK = uRocket; TRAIL = uTrail; vec4 p = texture2D(tPos, aRef); vec4 bA = texture2D(tBoatA, aRef), bB = texture2D(tBoatB, aRef), mA = texture2D(tMetaA, aRef), mB = texture2D(tMetaB, aRef);
      float bf = boatFlag(bA, bB, p.w) * uForm; vec3 pw = carry(p.xyz); float fd; vec3 bt = boatTarget(bA, bB, mA, mB, fd);
      float near = 1.0 - smoothstep(0.04, 0.2, distance(pw, bt) / max(0.05, uBoatScale)); float m = boatMixT(bA, bB);
      vShade = clamp(mix(bA.w, bB.w, m), 0.0, 1.0); vA = aW * near * bf * step(0.01, vShade);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pw, 1.0); }`;
const WIRE_FS = `uniform vec3 uColor; uniform float uAlpha, uClipTop; varying float vA, vShade; void main(){ if (gl_FragCoord.y > uClipTop) discard; gl_FragColor = vec4(uColor, uAlpha * vA * (0.55 + 0.45 * vShade)); }`;
const MESH_FS = `uniform vec3 uColor; uniform float uAlpha, uClipTop; varying float vA, vShade; void main(){ if (gl_FragCoord.y > uClipTop) discard; gl_FragColor = vec4(uColor, uAlpha * vA * (0.35 + 0.65 * vShade)); }`;

/* The picked colour, pushed to a vivid tint: the page's --button-color is derived from the picker with
   lightness tweaks that can leave it muted, and additive blending over a grey ground washes it out further. */
function vividAccent(THREE, light, lightness) {
    const c = new THREE.Color();
    try { c.setStyle((getComputedStyle(document.body).getPropertyValue('--button-color') || '').trim() || '#4faad1'); } catch (e) { c.set(0x4faad1); }
    const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    return c.setHSL(hsl.h, Math.max(hsl.s, 0.8), lightness !== undefined ? lightness : light ? 0.38 : 0.6);
}
/* The page ground's relative luminance (0 black .. 1 white), from the body's computed background: the picker can land on a mid
   or pale ground while the body class still says "dark" (its threshold is the picked colour's lightness, not the ground's). */
function groundLum() {
    try {
        const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(getComputedStyle(document.body).backgroundColor || ''); if (!m) return 0.05;
        const f = v => { v = Math.min(255, +v) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
    } catch (e) { return 0.05; }
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
function startParticleLayer(THREE, GPUC, BOAT, THEMES) {
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
    // The hull's waterline per level, measured from the model itself (voyage-boat.js untouched): the half-beam at 17 stations from the
    // stern (k = 0, x = -0.5) to the stem (k = 16, x = +0.5), the stem and stern x at the waterline, the entry's fullness (half-beam gained
    // over the first 0.125 L abaft the stem, normalised to the sloop) and the transom's half-width. Sampled from HULL particles in the
    // first 1.8% of hull length above the waterline; the max |z| per station, scaled by 0.96 because those points sit a hair outboard.
    // Measured (seed 1): max half-beam 0.150 / 0.125 / 0.102 / 0.127, stem 0.500, stern -0.496..-0.499, entryGain 0.83 / 1.00 / 0.72 / 1.16.
    function measureHull(built, boatCount) {
        const R = BOAT.ROLE, WL = BOAT.WATERLINE, out = [];
        for (let L = 0; L < BOAT.LEVELS.length; L++) {
            const given = BOAT.waterlineOf && BOAT.waterlineOf(L); if (given) { out.push(given); continue; }   // a hull that flies (the foiler) names its own waterline: the foils' struts
            const pos = built.pos[L], beam = new Float32Array(17), n = new Uint16Array(17);
            let stem = -Infinity, stern = Infinity;
            for (let i = 0; i < boatCount; i++) {
                const o = i * 4; if (built.role[i] !== R.HULL || pos[o + 3] <= 0) continue;
                const x = pos[o], y = pos[o + 1], az = Math.abs(pos[o + 2]);
                if (y - WL > 0.018) continue;
                const k = Math.max(0, Math.min(16, Math.round((x + 0.5) * 16)));
                if (az > beam[k]) beam[k] = az; n[k]++;
                if (x > stem) stem = x; if (x < stern) stern = x;
            }
            let total = 0; for (let k = 0; k < 17; k++) total += n[k];
            if (total < 17 || !Number.isFinite(stem) || !Number.isFinite(stern)) {   // too few particles to measure (tiny budgets): the sloop's analytic waterline
                for (let k = 0; k < 17; k++) { const x = -0.5 + k / 16; beam[k] = 0.15 * Math.sqrt(Math.max(0, 1 - Math.pow((x + 0.02) / 0.48, 2))); }
                stem = 0.5; stern = -0.5;
            } else {
                for (let k = 0; k < 17; k++) if (!n[k]) { let a = k, b = k; while (a > 0 && !n[a]) a--; while (b < 16 && !n[b]) b++; beam[k] = n[a] && n[b] ? (beam[a] + beam[b]) * 0.5 : n[a] ? beam[a] : beam[b]; }   // fill gaps from the nearest measured stations
                for (let k = 0; k < 17; k++) beam[k] *= 0.96;
            }
            out.push({ beam, stem: Math.min(0.5, stem), stern: Math.max(-0.5, stern), entry: (beam[14] - beam[16]) / 0.125, sternHalf: Math.max(0.01, 0.7 * beam[0]) });
        }
        const ref = out[1].entry || 1;
        for (const h of out) h.entryGain = Math.min(1.6, Math.max(0.6, h.entry / ref));
        return out;
    }
    // Sails: the belly each particle was baked with, along its belly normal, goes into meta.z (0 for sails today) so the shader can fill and
    // luff it: > 0 for a fore-and-aft sail (the baked z IS the belly, normal +z), < 0 for a square sail (belly along (cos b, 0, -sin b) from
    // the mast at x = mx, b = -14 deg). Square sails are the SAIL particles present at level 3 but absent at level 2, plus the schooner's
    // fore sail (level-2 x in (-0.1, 0.225)) which becomes the fore course; mx is the nearest of the three masts. Must run BEFORE the meta
    // arrays are copied into the level textures. The fore sail's value crosses zero between levels 2 and 3 with amplitude ~0, so its belly
    // direction swings continuously as the ship evolves.
    function tagSailBellies(built, boatCount) {
        const CB = Math.cos(-14 * Math.PI / 180), SB = Math.sin(-14 * Math.PI / 180), NL = BOAT.LEVELS.length;
        for (let i = 0; i < boatCount; i++) {
            if (built.role[i] !== BOAT.ROLE.SAIL) continue;
            const o = i * 4, at2 = built.pos[2][o + 3] > 0, x2 = built.pos[2][o], fore = at2 && x2 > -0.1 && x2 < 0.225;
            for (let L = 0; L < NL; L++) {
                const p = built.pos[L]; if (p[o + 3] <= 0) continue;
                if (!(L === 3 && (!at2 || fore))) { built.meta[L][o + 2] = p[o + 2] + 1e-3; continue; }
                const x = p[o], mx = x > 0.19 ? 0.27 : x > -0.085 ? 0.0 : -0.28;
                built.meta[L][o + 2] = -(Math.max(0, (x - mx) * CB - p[o + 2] * SB) + 1e-3);
            }
        }
    }
    const levels = [];
    let hullWL = null, shipRole = null;   // shipRole: each ship particle's role (from the module), for choosing what the armada's copies are made of
    // dots -> lines -> solid: the wireframe (an edge list per level from the module) and the surfaces (the hull's grid, one mesh at every
    // level since its vertices simply morph; a sail mesh per level, of the sails that level has). Empty for a module without them
    const wire = { lines: [], sails: [], hull: null, empty: new THREE.BufferGeometry() };
    const refOf = i => [(((STAR_N + i) % N) + 0.5) / N, (Math.floor((STAR_N + i) / N) + 0.5) / N];
    function lineGeo(e) {
        const n = e.idx.length, pos = new Float32Array(n * 3), ref = new Float32Array(n * 2), w = new Float32Array(n);
        for (let k = 0; k < n; k++) { const r = refOf(e.idx[k]); ref[k * 2] = r[0]; ref[k * 2 + 1] = r[1]; w[k] = e.w[k >> 1]; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2)); g.setAttribute('aW', new THREE.BufferAttribute(w, 1)); return g;
    }
    function gridGeo(grids) {   // grids: [{ idx, nu, nv, sides }]: vertices in grid order per grid (sides x nu x nv), two triangles per cell
        const verts = [], tris = []; let base = 0;
        for (const gd of grids) {
            const S = gd.sides || 1, per = gd.nu * gd.nv;
            for (let k = 0; k < S * per; k++) verts.push(gd.idx[k]);
            for (let s = 0; s < S; s++) for (let iv = 0; iv < gd.nv - 1; iv++) for (let iu = 0; iu < gd.nu - 1; iu++) { const a = base + s * per + iv * gd.nu + iu, b = a + 1, c = a + gd.nu, d = c + 1; tris.push(a, b, c, b, d, c); }
            base += S * per;
        }
        const pos = new Float32Array(verts.length * 3), ref = new Float32Array(verts.length * 2), w = new Float32Array(verts.length).fill(1);
        verts.forEach((i, k) => { const r = refOf(i); ref[k * 2] = r[0]; ref[k * 2 + 1] = r[1]; });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2)); g.setAttribute('aW', new THREE.BufferAttribute(w, 1)); g.setIndex(tris); return g;
    }
    function buildWire(mod, built) {
        for (const g of wire.lines) g.dispose(); for (const g of wire.sails) g.dispose(); if (wire.hull) wire.hull.dispose();
        wire.lines = []; wire.sails = []; wire.hull = null;
        const NLv = mod.LEVELS.length;
        for (let L = 0; L < NLv; L++) {
            wire.lines.push(built.edges && built.edges[L] && built.edges[L].idx.length ? lineGeo(built.edges[L]) : wire.empty);
            const parts = built.mesh ? built.mesh.sails.filter(sd => sd.levels[L]) : [];
            wire.sails.push(parts.length ? gridGeo(parts.map(sd => ({ idx: sd.idx, nu: sd.na, nv: sd.nup }))) : wire.empty);
        }
        if (built.mesh && built.mesh.hull) wire.hull = gridGeo([{ idx: built.mesh.hull.idx, nu: built.mesh.hull.nu, nv: built.mesh.hull.nv, sides: 2 }]);
    }
    let LEVEL_HEEL = (shipOn && BOAT.LEVEL_HEEL) || [0.58, 1.0, 1.3, 1.1], LEVEL_PIVOT = (shipOn && BOAT.LEVEL_PIVOT) || [-0.03, -0.02, -0.01, -0.04];   // per level; the four-level module predates these exports
    // the level textures for a lineage module (a theme): built at init and again when the picker's icon row swaps the theme; the same
    // particle count and roles per slot are not guaranteed across themes, so the particles simply re-form (spring + settle) on a swap
    function buildLevels(mod) {
        BOAT = mod;
        const built = mod.buildBoatLevels(boatCount, 1);
        if (!mod.LEVEL_HEEL) tagSailBellies(built, boatCount);   // the six-level module bakes the sail bellies itself
        hullWL = measureHull(built, boatCount); shipRole = built.role;
        buildWire(mod, built);
        const old = levels.splice(0, levels.length);
        for (let L = 0; L < mod.LEVELS.length; L++) {
            const pos = new Float32Array(COUNT * 4), meta = new Float32Array(COUNT * 4);
            pos.set(built.pos[L].subarray(0, boatCount * 4), STAR_N * 4); meta.set(built.meta[L].subarray(0, boatCount * 4), STAR_N * 4);
            levels.push({ pos: dataTex(pos), meta: dataTex(meta), scale: mod.LEVEL_SCALE[L] });
        }
        LEVEL_HEEL = mod.LEVEL_HEEL || [0.58, 1.0, 1.3, 1.1]; LEVEL_PIVOT = mod.LEVEL_PIVOT || [-0.03, -0.02, -0.01, -0.04];
        return old;
    }
    if (shipOn) buildLevels(BOAT);

    if (!levels.length) { const t = dataTex(new Float32Array(COUNT * 4)); levels.push({ pos: t, meta: t, scale: 1 }); }
    const starT = Array.from({ length: STAR_N }, () => new THREE.Vector4());   // shared by every material that needs the star targets
    // the fleet: three small copies of the ship, each a strided 40% sample of the ship's particles, formed by field particles (the first
    // ones after the ship). Per member: the source particle's texture coordinates, the copy (1..3) and a recruit threshold, so the copies
    // form a few particles at a time as the route's fleet key rises, and dissolve the same way
    const FLEET_K = 9, ARMADA_K = 32, FLEET_WAVE = [0, 0, 0, 1, 1, 1, 2, 2, 2], FLEET_SAMPLE = [0.4, 0.4, 0.4, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22];   // three waves at the quote (40% / 22% samples); the armada at the ending has its own texture (ARMADA_K copies)
    const fieldN = Math.max(0, COUNT - STAR_N - boatCount), fleetShare = Math.min(1, fieldN / (boatCount * FLEET_SAMPLE.reduce((a, b) => a + b, 0) * 1.05));   // scaled down if the field is small
    const fleetData = new Float32Array(COUNT * 4);
    let f = 0;
    for (let k = 0; k < FLEET_K; k++) {
        const cnt = Math.floor(boatCount * FLEET_SAMPLE[k] * fleetShare);
        for (let j = 0; j < cnt; j++, f++) { const i = STAR_N + boatCount + f, src = STAR_N + Math.floor(j * boatCount / cnt); fleetData.set([((src % N) + 0.5) / N, (Math.floor(src / N) + 0.5) / N, k + 1, FLEET_WAVE[k] + 0.999 * Math.random()], i * 4); }
    }
    // the formation on the sea per copy (x aft, lift, z across, size in hull lengths) and the launch swarm (phase, speed in L/s, z across, size)
    const FLEET_POS = [[-1.1, 0.30, -0.8, 0.30], [-1.2, 0.55, 0.8, 0.24], [0.9, 0.45, 0.9, 0.26], [-2.3, 0.80, -1.4, 0.18], [-0.4, 0.95, 1.9, 0.16], [2.0, 0.85, -1.2, 0.17], [-3.2, 1.10, 0.4, 0.13], [1.2, 1.20, 2.6, 0.12], [3.1, 1.15, 1.6, 0.12]];
    // the ending: the armada sailing off into the distance, seen from a high angle. Five ranks of three, staggered; per copy the position along
    // the course (world units, wrapping over ARMADA_RUN, both ends out of the frame: entering below the screen near the camera, leaving past the
    // top far away), across the course (world units) and the hull length (world units). One speed for all, so the ranks never collide
    // Solved for the layer's camera (scratchpad armada-solve.mjs): a course of 318 deg seen from 33 deg above puts the hulls at ~32 deg on screen with
    // the masts upright, a rear-quarter view in which every ship reads as a ship; they enter at the bottom-left near the camera and leave at the
    // right, far off, at ~40% size. On very wide screens the far ranks would still show at the wrap: every ship shrinks away over the run's last 6 units
    const ARMADA_LOOP = 48;   // the scatter's loop (world units along the course); stretched to the screen's own loop when that is longer
    const ARMADA = (() => {   // a loose, random scatter (a fixed seed, so it is the same on every visit), no two ships closer than 3 world units (the run wraps, so
        // distance along it is measured round the loop): per ship its phase along the run, offset across the course, hull length (world units,
        // desktop) and a seed for its own surge, drift and roll
        let a = 20260915; const rnd = () => (a = (a * 16807) % 2147483647) / 2147483647, out = [], L = ARMADA_LOOP;
        for (let tries = 0; out.length < ARMADA_K && tries < 80000; tries++) {
            const sAlong = rnd() * L, zAcross = -5.8 + rnd() * 9;
            if (out.every(o => { const ds = Math.abs(o[0] - sAlong), dl = Math.min(ds, L - ds); return Math.hypot(dl, o[1] - zAcross) > 2.8; })) out.push([sAlong, zAcross, 0.84 + 0.22 * rnd(), rnd()]);
        }
        while (out.length < ARMADA_K) out.push([0, 0, 0.001, 0]);   // (a crowded seed: the rest simply do not sail)
        return out; })();
    const ARMADA_SPEED = 0.6;   // world units per second, one speed for all so no two ships ever meet
    const ARMADA_VIEW = { wide: { turn: 313, tilt: 34, x: -0.1, y: -0.7, unit: null }, tall: { turn: 292, tilt: 40, x: 0, y: -0.75, unit: 0.62 } };   // per view also the anchor's NDC y and the ships' scale (null: from the screen width); phones: a course more up the screen so the fleet fills a band from the bottom to ~70% up (solved: scratchpad phone-armada.mjs)   // the course (deg: 270 straight away, 360 to the right), the camera's angle down onto the sea, the anchor's NDC x
    // the armada's loop for this screen, measured with the layer's own camera: it starts just before the first ship can enter the frame and ends
    // only after every ship (hull, bowsprit, masts, wake) has left it, so a ship always sails out of view before it wraps. Cached per screen size
    let armadaWinKey = '', armadaWinVal = null;
    function armadaWin(tall, unit) {
        const key = innerWidth + 'x' + innerHeight + ':' + unit.toFixed(3);   // (the block's clip moves with the armada as it rises, so the frame's own edges are the only bound) if (key === armadaWinKey) return armadaWinVal;
        const V = tall ? ARMADA_VIEW.tall : ARMADA_VIEW.wide, qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), M.degToRad(V.tilt)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -M.degToRad(V.turn)));
        const C = new THREE.Vector3(1, 0, 0).applyQuaternion(qa), Zc = new THREE.Vector3(0, 0, 1).applyQuaternion(qa), Uc = new THREE.Vector3(0, 1, 0).applyQuaternion(qa);
        const A = new THREE.Vector3(V.x * visW / 2, V.y * visH / 2, 0), tanH = Math.tan(M.degToRad(camera.fov) / 2), cz = camera.position.z, P = new THREE.Vector3();
        const on = (sAl, a, dAl, dUp, hl) => { P.copy(A).addScaledVector(C, sAl + dAl * hl).addScaledVector(Zc, a).addScaledVector(Uc, dUp * hl); const d = cz - P.z; const ny = P.y / (d * tanH); return d > 0.5 && Math.abs(P.x / (d * tanH * camera.aspect)) < 1.12 && ny > -1.12 && ny < 1.12; };
        let first = Infinity, last = -Infinity;
        for (const S of ARMADA) {
            const a = S[1] * unit, hl = S[2] * unit;
            for (let sAl = -40; sAl <= 160; sAl += 0.25) if (on(sAl, a, 0, 0.5, hl) || on(sAl, a, 1.0, 0, hl) || on(sAl, a, -0.5, 0, hl) || on(sAl, a, 0, 1.4, hl) || on(sAl, a, -1.9, 0, hl)) { if (sAl < first) first = sAl; if (sAl > last) last = sAl; }
        }
        if (!Number.isFinite(first)) { first = -12; last = 28; }
        armadaWinKey = key; armadaWinVal = { s0: first - 2, len: Math.max(ARMADA_LOOP * Math.max(unit, 0.6), last - first + 4), first, last };   // a narrow screen's ships are smaller: its loop shrinks with them, so the fleet is as dense   // 2 units of margin at each end (the surge is under 0.5)
        return armadaWinVal;
    }
    // the armada has its own fleet texture: fifteen equal copies (the quote's waves are 40% / 22% / 12% samples, which would make the ranks uneven)
    // its members include the main ship's own particles, which are free at the ending (the ship is not drawn there), so every copy is denser
    const armadaTotal = Math.min(COUNT - STAR_N, Math.max(Math.floor((COUNT - STAR_N) * 0.9), COUNT - STAR_N - 4500)), armadaCnt = Math.floor(armadaTotal / ARMADA_K);   // most of the particles: the sea keeps ~4500
    // a copy far off is made of the ship's solid parts (hull, deck, sails, spars, rigging, the burgee), half its foam and a fifth of its water: its
    // particles go where the silhouette is. Rebuilt with the levels on a theme swap (the roles per slot differ between lineages)
    function buildArmadaTex() {
        const pick = [];
        for (let i = 0; i < boatCount; i++) { const r = shipRole ? shipRole[i] : 1; if (r === 8 || (r === 6 && i % 5) || (r === 7 && i % 2)) continue; pick.push(i); }
        if (!pick.length) for (let i = 0; i < boatCount; i++) pick.push(i);
        const data = new Float32Array(COUNT * 4);
        for (let k = 0, g = 0; k < ARMADA_K; k++) for (let j = 0; j < armadaCnt; j++, g++) { const i = STAR_N + g, src = STAR_N + pick[Math.floor(j * pick.length / armadaCnt)]; data.set([((src % N) + 0.5) / N, (Math.floor(src / N) + 0.5) / N, k + 1, 0.999 * Math.random()], i * 4); }
        return dataTex(data);
    }
    let armadaTex = buildArmadaTex();
    const fleetTex = dataTex(fleetData), fleetU = Array.from({ length: ARMADA_K }, () => new THREE.Vector4(0, 0, 0, 0.001));
    const shipRot = new THREE.Matrix3(), shipAt = new THREE.Vector3(), shipRot0 = new THREE.Matrix3(), shipAt0 = new THREE.Vector3();
    const shipRotSea = new THREE.Matrix3();   // the sea's pose: the hull's tilt, the sea's own course (lags the hull's at rest)
    const fleetRot = new THREE.Matrix3(), fleetAt = new THREE.Vector3();   // the fleet's frame: the ship's while it sails, its own at the launch (the yachts stay on the sea as the backdrop while the ship is the rocket)
    const shipU = { sail2: new THREE.Vector4(0, 0, 0, 0), wave: new THREE.Vector4(0, 0.3, 0, 0.15), sea: new THREE.Vector4(0, 2.618, 0, 0), motion: new THREE.Vector4(0, 0, 0, 0), sail: new THREE.Vector4(1, 0, 0, 0), clock: new THREE.Vector4(0, 0, 0, 0), hull: new THREE.Vector4(0.5, -0.5, 1, 0.02), misc: new THREE.Vector4(-0.02, 0, 0, 1.6), beam: new Float32Array(17), swell: new THREE.Vector4(1, 0, 0, 0), funnel: new THREE.Vector4(0, 0, 0, 1) };
    const boatU = () => ({ tBoatA: { value: levels[0].pos }, tBoatB: { value: levels[0].pos }, tMetaA: { value: levels[0].meta }, tMetaB: { value: levels[0].meta }, uMix: { value: 0 }, uForm: { value: shipOn ? 1 : 0 }, uBoatScale: { value: 1 }, uBoat: { value: shipAt }, uRot: { value: shipRot }, uTime: { value: 0 }, uRipple: { value: 0 }, uFlow: { value: 0 }, uSettle: { value: 0 }, uWay: { value: 0 }, uReflect: { value: 1 }, uStarT: { value: starT }, uN: { value: N }, uStarForm: { value: 0 }, uSnap: { value: 1.2 }, uSnapBoat: { value: 0.02 }, uRocket: { value: 0 }, uSoft: { value: 0 }, uLoose: { value: 0 }, uSoftLane: { value: 0 }, uRotSea: { value: shipRotSea }, uSeaD: { value: new THREE.Vector2(1, 0) }, uSqN: { value: new THREE.Vector3().fromArray((shipOn && BOAT.SQUARE_NORMAL) || [0.970, 0, 0.242]) }, uTrail: { value: 0 }, uTrailClk: { value: 0 }, uTrailClk0: { value: 0 }, tFleet: { value: fleetTex }, tFleetPos: { value: levels[0].pos }, tFleetMeta: { value: levels[0].meta }, uFleet: { value: fleetU }, uFleetForm: { value: 0 }, uFleetScale: { value: 1 }, uFleetBoat: { value: fleetAt }, uFleetRot: { value: fleetRot }, uFleetLift: { value: new THREE.Vector2(0, 12) }, uSmoke: { value: 0 }, uSmokeClk: { value: 0 }, uPaddle: { value: 0 }, uAnchor: { value: 0 }, uAnchorSide: { value: 1 }, uFunnel: { value: shipU.funnel },
        uWave: { value: shipU.wave }, uSea: { value: shipU.sea }, uMotion: { value: shipU.motion }, uSail: { value: shipU.sail }, uClock: { value: shipU.clock }, uHull: { value: shipU.hull }, uMisc: { value: shipU.misc }, uSail2: { value: shipU.sail2 }, uBeam: { value: shipU.beam }, uRot0: { value: shipRot0 }, uBoat0: { value: shipAt0 }, uScale0: { value: 1 }, uSwell: { value: shipU.swell } });
    const velVar = gpu.addVariable('tVel', SIM_VEL, vel0), posVar = gpu.addVariable('tPos', SIM_POS, pos0);
    gpu.setVariableDependencies(velVar, [posVar, velVar]); gpu.setVariableDependencies(posVar, [posVar, velVar]);
    const velU = velVar.material.uniforms, posU = posVar.material.uniforms;
    Object.assign(velU, { tHome: { value: home }, uDelta: { value: 0 }, uCurl: { value: pcfg.pCurl }, uReturn: { value: pcfg.pReturn }, uDamp: { value: pcfg.pDamp }, uPull: { value: pcfg.pPull }, uRadius: { value: pcfg.pRadius }, uScroll: { value: 0 }, uH: { value: H }, uW: { value: 20 }, uDrift: { value: new THREE.Vector2() }, uRocket: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, boatU());
    Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 }, uScroll: { value: 0 }, uH: { value: H }, uW: { value: 20 }, uDrift: { value: new THREE.Vector2() } }, boatU());   // the position step needs the field's offset for the wake trail
    const err = gpu.init(); if (err) { console.warn('work-spine: particle layer', err); gl.dispose(); canvas.remove(); return; }
    const geo = new THREE.BufferGeometry(), ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.4 + Math.random() * 0.5 : 0.5 + Math.random() * 0.5; }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ tPos: { value: null }, tVel: { value: null }, tHomeP: { value: home }, uSize: { value: pcfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: pcfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: H }, uW: { value: 20 }, uDrift: { value: new THREE.Vector2() }, uRocket: { value: 0 }, uFieldDim: { value: 1 }, uWake: { value: 0 }, uBoatPx: { value: 1.25 },
            uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uColorA: { value: new THREE.Color(0x4faad1) }, uColorB: { value: new THREE.Color(0x4faad1) }, uColorLit: { value: new THREE.Color(0xffffff) }, uColorFlag: { value: new THREE.Color(0xffffff) }, uFlag: { value: pcfg.shipBurgee }, uClipTop: { value: 1e9 }, uGlow: { value: pcfg.pGlow } }, boatU()),
        vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const U = mat.uniforms;
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
    const wireMat = (fs, dbl) => new THREE.ShaderMaterial({ uniforms: Object.assign({ tPos: { value: null }, uColor: { value: new THREE.Color(0x4faad1) }, uAlpha: { value: 0 }, uClipTop: { value: 1e9 } }, boatU()), vertexShader: WIRE_VS, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: dbl ? THREE.DoubleSide : THREE.FrontSide });
    const wireLo = new THREE.LineSegments(wire.empty, wireMat(WIRE_FS)), wireHi = new THREE.LineSegments(wire.empty, wireMat(WIRE_FS));
    const hullMesh = new THREE.Mesh(wire.hull || wire.empty, wireMat(MESH_FS, true)), sailLo = new THREE.Mesh(wire.empty, wireMat(MESH_FS, true)), sailHi = new THREE.Mesh(wire.empty, wireMat(MESH_FS, true));
    const WIRES = [wireLo, wireHi, hullMesh, sailLo, sailHi];
    for (const o of WIRES) { o.frustumCulled = false; scene.add(o); }
    const ALLU = [velU, posU, U, ...WIRES.map(o => o.material.uniforms)];   // every material that reads the ship's uniforms
    let visW = 1, visH = 1;
    // constellation lines between recruited stars: vertices sample the live position texture, so the lines follow the particles
    // each line vertex knows both endpoints (position texture refs and star indices) so the segment only shows once both stars are near their targets
    const LINE_VS = 'uniform sampler2D tPos; uniform vec4 uStarT[12]; attribute vec2 aRef, aRef2; attribute float aIdx, aIdx2, aT, aD, aA; varying float vT, vD, vA; '
        + 'vec4 tgt(float i){ int idx = int(i + 0.5); vec4 r = vec4(0.0); for (int k = 0; k < 12; k++) { if (k == idx) r = uStarT[k]; } return r; } '
        + 'void main(){ vec3 p = texture2D(tPos, aRef).xyz, q = texture2D(tPos, aRef2).xyz; float near = (1.0 - smoothstep(0.12, 0.45, distance(p, tgt(aIdx).xyz))) * (1.0 - smoothstep(0.12, 0.45, distance(q, tgt(aIdx2).xyz))); vT = aT; vD = aD; vA = aA * near; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }';
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
       value follows a monotone cubic (holds stay flat, nothing overshoots, velocity is continuous through every key), and the
       drawn pose trails that target through a critically damped follower (pcfg.shipLag*), so a fast scroll parks the target
       ahead and the ship catches up over about a second, like a camera operator following a mark. */
    const POSE_KEYS = ['x', 'y', 'size', 'turn', 'tilt', 'heel', 'level', 'wake', 'cam', 'storm', 'fleet'];
    const POSE_DEFAULTS = { storm: 0, fleet: 0 };   // keys a waypoint may leave out: storm (0 calm .. 1 the passage through weather), fleet (0 .. 3: three waves of small copies of the ship in formation; at the launch a swarm of rockets)
    /* The route. Waypoints carry a position (NDC, the waterline centre) and the pose at that point: size (hull length as a fraction of
       the visible width), turn (course: 0 bow to the right, 90 toward the viewer, 180 bow left), tilt (0 seen from the side, 90 from
       straight above), heel, level (0 dinghy .. 3 tall ship), wake (0 at rest .. 1 under way) and cam (0..1: how far the course should
       follow the direction of travel on screen; 1 where the camera holds still and the ship really sails across the frame, 0 where the
       camera is the one moving, as it cranes up over the stern on the way into the work section). Positions travel along one smooth
       curve through the waypoints (buildRoute); everything else eases through a monotone cubic over scroll. */
    // ?route=1 mounts the path editor (js/voyage-editor.js): its edits live in localStorage and apply only with that parameter, until they are baked into the tables below
    const routeStore = 'ws-route-v1';
    // ?at=<route mark> (dev aid, e.g. ?at=stage-release+450 or ?at=footer:top@1): the page opens scrolled to that mark. Re-applied for a few
    // seconds while the layout settles (the work section only takes its scroll height once it has initialised), until you scroll yourself
    const jumpTo = (() => { const a = new URLSearchParams(location.search).get('at'); return a ? { at: a.replace(/ /g, '+'), t0: performance.now(), touched: false } : null; })();   // a literal + in a query string arrives as a space
    if (jumpTo) for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, () => { jumpTo.touched = true; }, { passive: true, once: true });
    let routeOverride = null;
    try { if (new URLSearchParams(location.search).get('route') === '1') routeOverride = JSON.parse(localStorage.getItem(routeStore) || 'null'); } catch (e) { routeOverride = null; }
    function keyframes() {
        const base = keyframeTables();
        if (routeOverride) for (const o of ['landscape', 'portrait']) if (Array.isArray(routeOverride[o]) && routeOverride[o].length > 1) base[o] = routeOverride[o];
        return base;
    }
    function keyframeTables() {
        const c = pcfg, LS = (BOAT && BOAT.LEVEL_SCALE) || [1, 1, 1, 1], NL = LS.length;
        // the evolution marks along the route: a level per case study, the finale in open water (with a four-level module the last two coincide)
        const RK = BOAT && BOAT.ROCKET !== undefined && BOAT.ROCKET < NL ? BOAT.ROCKET : -1;   // the rocket level, when the module has one
        const LV = k => Math.min(k, (RK < 0 ? NL : RK) - 1), L1 = LV(1), L2 = LV(2), L3 = LV(3), L4 = LV(4), L5 = LV(5), L6 = LV(6);   // a lineage with fewer ships holds its last one
        // the work stage: seen from above in the column, bow down the page; the hull keeps one on-screen length while the ship evolves
        return {
            landscape: [   // Felix's route (baked from the editor, 2026-09-12) with the exit reworked the same night: the skiff at the foot of the swell, a wide
                           // sweep up and round into the column, one arc out of the column down to a side shot beside the quote, where the ship levels up
                           // ketch -> schooner -> barque -> clipper -> yacht as the words are revealed (the reveal runs from #read's top over ~5 px per character)
                { at: 'top', x: c.boatX, y: c.boatY, size: c.boatSize, turn: 215.5, tilt: 9.2, heel: 0, level: 0, wake: 0, cam: 0 },                   // the Sept-10 hero, copied: its yaw -0.62 rad about the vertical (bow at -x there, so turn = 180 + 35.5), its roll 0.16 rad about
                                                                                                                                                       // the screen's horizontal axis on the WHOLE scene = tilt 9.2 (water included), pivot on the waterline; sway and bob at rest (shipSway, shipBob)
                // the cast-off: a real turn with way on. The boat sails off up-left along its bow, turns to starboard through "away" as the camera
                // lifts, and comes round right and down into the column; cam is high so the course follows the path's tangent (the numbers
                // continue round, 215 -> 430, and every later course carries the +360, so the cubic never unwinds the yaw the wrong way)
                { at: '#work:center@0.72', x: -0.5, y: -0.3, size: 0.46, turn: 240, tilt: 12, heel: 4, level: 0, wake: 0.35, cam: 0.7 },   // the skiff casts off; it becomes the sloop on the way up
                { at: '#work:center@0.5', x: -0.48, y: 0.05, size: 0.36, turn: 270, tilt: 24, heel: 5, level: L1, wake: 0.65, cam: 0.8 },
                { at: '#work:center@0.25', x: -0.28, y: 0.14, size: 0.33, turn: 325, tilt: 50, heel: 5, level: L1, wake: 0.85, cam: 0.85 },              // authored heel stays small: the wind adds its own and the sum is soft-limited at 18
                { at: 'stage@0.14', x: 0, y: -0.38, size: 0.26, turn: 430, tilt: 54, heel: 4, level: L1, wake: 0.9, cam: 1 },                           // the crane keeps rising into the top view
                { at: 'stage@0.92', x: -0.05, y: -0.36, size: 0.1, turn: 444, tilt: 63, heel: 4, level: L2, wake: 1, cam: 0.8 },
                { at: 'stage-release', x: -0.06, y: -0.38, size: 0.12, turn: 438, tilt: 56, heel: 7, level: L2, wake: 0.95, cam: 0.8, storm: 0 },     // one left-hand arc out of the column, into weather
                { at: 'stage-release+450', x: -0.17, y: -0.5, size: 0.14, turn: 405, tilt: 26, heel: 7, level: L2, wake: 0.9, cam: 0.8, storm: 0 },   // the passage through the storm: swell, roll, spray, rain, lightning
                // the side shot and the level-ups: Felix's timings (2026-09-13), pixel offsets from the stage release
                { at: 'stage-release+1100', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L2, wake: 0.5, cam: 1 },   // calm at the quote: the ketch (Felix's timings, 2026-09-13)
                { at: 'stage-release+1200', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L3, wake: 1, cam: 1 },     // the schooner
                { at: 'stage-release+1400', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L4, wake: 1, cam: 1 },     // the barque
                { at: 'stage-release+1425', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L4, wake: 1, cam: 1 },
                { at: 'stage-release+1525', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 0 },     // the clipper (175 px earlier than Felix's +1700, 2026-09-15)
                { at: 'stage-release+1650', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 1 },
                { at: 'stage-release+1750', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 2 },
                { at: 'stage-release+1850', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 3 },     // every wave lands before the principles reach the ship    // the clipper sails on; "teams to scale": the fleet forms out of the field (the yacht, L6, stays in the module unused)
                // (the fleet's waves used to wait for '#scalability:top@0.75' / '@0.55', by when the principles had covered the ship)
                // the launch: the clipper holds until the principles have covered it, becomes the rocket out of sight, and the rocket rises with the
                // footer (the canvas flips above the page at shipOverlayAt), standing over the footer's edge nose-up (turn -90 / tilt 90), plume down
                ...(RK < 0 ? [] : [
                    { at: '#scalability:top@0.55', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 3 },
                    { at: '#scalability:top@0.18', x: -0.08, y: -0.625, size: 0.2, turn: 360, tilt: 0, heel: 18.5, level: L5, wake: 1, cam: 1, fleet: 3 },   // the principles cover the fleet's highest copies (about 165 px from the top)   // the principles have covered the quote: the clipper fleet holds until they have left the screen
                    { at: '.testimonials-wrapper:top@1', x: -0.45, y: -0.9, size: 0.15, turn: 270, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },   // the block's edge enters the screen: the armada, as its background   // the switch to the armada, behind the testimonials' ground   // the ending: the whole armada (a fourth wave joins) sails off into the distance
                    { at: 'footer:top@1', x: -0.45, y: -0.77, size: 0.15, turn: 270, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },
                    { at: 'end', x: -0.45, y: -0.5, size: 0.15, turn: 270, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },
                ]),
            ],
            portrait: [   // phones (reworked 2026-09-15): the same voyage sized up for a narrow screen (size is a fraction of the visible WIDTH). The ship rests
                          // at the bottom-right of the hero, climbs past the Work heading, sits in the gap below the cards in the column, then levels up
                          // below the sticky quote as its words reveal (#read's top .. +540), and the fleet's three waves land while the quote still holds
                          // the screen (by +780; the principles reach the ship at about #read's top + 900)
                { at: 'top', x: 0.36, y: -0.84, size: 0.56, turn: 35, tilt: 0, heel: 2, level: 0, wake: 0, cam: 0 },
                { at: '#work:center@0.72', x: 0.22, y: -0.45, size: 0.56, turn: 60, tilt: 8, heel: 5, level: 0, wake: 0.35, cam: 0.2 },
                { at: '#work:center@0.5', x: 0.05, y: -0.1, size: 0.54, turn: 85, tilt: 24, heel: 5, level: L1, wake: 0.65, cam: 0.3 },
                { at: '#work:center@0.25', x: -0.05, y: 0.12, size: 0.5, turn: 92, tilt: 50, heel: 5, level: L1, wake: 0.85, cam: 0.5 },
                { at: 'stage@0.14', x: 0, y: -0.62, size: 0.42, turn: 70, tilt: 54, heel: 4, level: L1, wake: 0.9, cam: 1 },                                             // the column: in the gap below the cards
                { at: 'stage@0.92', x: 0, y: -0.64, size: 0.34, turn: 84, tilt: 63, heel: 4, level: L2, wake: 1, cam: 0.8 },
                { at: 'stage-release', x: 0, y: -0.64, size: 0.36, turn: 78, tilt: 56, heel: 7, level: L2, wake: 0.95, cam: 0.8 },
                { at: 'stage-release+450', x: -0.1, y: -0.7, size: 0.38, turn: 45, tilt: 26, heel: 7, level: L2, wake: 0.9, cam: 0.8 },
                { at: '#read:top@0', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L2, wake: 0.85, cam: 1 },                                           // the side shot below the sticky quote
                { at: '#read:top@0+180', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L3, wake: 0.9, cam: 1 },
                { at: '#read:top@0+360', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L4, wake: 0.95, cam: 1 },
                { at: '#read:top@0+540', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L5, wake: 1, cam: 1, fleet: 0 },
                { at: '#read:top@0+620', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L5, wake: 1, cam: 1, fleet: 1 },
                { at: '#read:top@0+700', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L5, wake: 1, cam: 1, fleet: 2 },
                { at: '#read:top@0+780', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L5, wake: 1, cam: 1, fleet: 3 },
                ...(RK < 0 ? [] : [
                    { at: '#scalability:top@0.6', x: -0.02, y: -0.8, size: 0.32, turn: 0, tilt: 0, heel: 3, level: L5, wake: 1, cam: 1, fleet: 3 },
                    { at: '.testimonials-wrapper:top@1', x: 0.5, y: -0.95, size: 0.3, turn: -90, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },
                    { at: 'footer:top@1', x: 0.5, y: -0.95, size: 0.3, turn: -90, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },
                    { at: 'end', x: 0.5, y: -0.6, size: 0.3, turn: -90, tilt: 90, heel: 0, level: RK, wake: 1, cam: 1, fleet: 4 },
                ]),
            ],
        };
    }
    /* The ride-in on load: a time-driven curve that ends exactly at the first waypoint. On desktop the hero's Lottie swell sits top-right
       and the layer is drawn above it while the hero is on screen, so the ship comes in from the right along the foot of the wave,
       lifts over the crest line and settles at its foot; the crossing is placed from the swell's real rectangle. On phones the swell is
       flipped to the bottom-left and the ship rests on it, so it rides in from the left. Any other layout: a plain entry from the side. */
    function lottieRect() {   // the swell's box in document space (its parallax translate removed), or null until it has laid out
        const el = document.querySelector('.hero-wrapper dotlottie-player'); if (!el) return null;
        const r = el.getBoundingClientRect(); if (!(r.width > 0.1 * innerWidth && r.height > 0.1 * innerHeight)) return null;
        return { left: r.left, top: r.top + scrollY, width: r.width, height: r.height };
    }
    function entryPoints(w0) {
        const r = lottieRect();
        const toN = (fx, fy) => ({ x: ((r.left + fx * r.width) / innerWidth) * 2 - 1, y: 1 - ((r.top + fy * r.height) / innerHeight) * 2 });   // rect fractions -> NDC at scroll 0
        const rest = { x: w0.x, y: w0.y };
        if (r && innerWidth > 1200 && innerWidth >= innerHeight) {   // the unflipped swell, top-right
            const foot = toN(0.78, 0.74), crest = toN(0.46, 0.63);
            return [{ at: 0, x: 1.18, y: foot.y - 0.02 }, { at: 380, x: foot.x, y: foot.y }, { at: 700, x: crest.x, y: crest.y + 0.02 }, { at: 1000, ...rest }];
        }
        if (innerHeight > innerWidth) return [{ at: 0, x: -1.2, y: rest.y + 0.02 }, { at: 450, x: -0.5, y: rest.y + 0.05 }, { at: 760, x: 0.05, y: rest.y - 0.02 }, { at: 1000, ...rest }];
        const fromRight = Math.abs(w0.turn) > 90;
        return [{ at: 0, x: fromRight ? 1.2 : -1.2, y: rest.y }, { at: 500, x: rest.x + (fromRight ? 0.35 : -0.35), y: rest.y + 0.03 }, { at: 1000, ...rest }];
    }
    function resolveAt(at) {
        const vh = innerHeight, maxY = Math.max(0, document.documentElement.scrollHeight - vh);
        const m = /^(.*?)([+-]\d+(?:\.\d+)?)?$/.exec(String(at)), key = m[1], off = +(m[2] || 0);
        let y;
        if (key === 'top') y = 0;
        else if (key === 'end') y = maxY;
        else if (key === 'stage-pin' || key === 'stage-release' || key.startsWith('stage@')) {
            const st = section.querySelector('.work-spine__stage'), pin = section.offsetTop, total = Math.max(0, section.offsetHeight - ((st && st.clientHeight) || vh));
            y = key === 'stage-pin' ? pin : key === 'stage-release' ? pin + total : pin + total * parseFloat(key.slice(6));
        } else {
            const mm = /^(.+):(top|center|bottom)@([\d.]+)$/.exec(key); let el = null;
            if (mm) { try { el = document.querySelector(mm[1]); } catch (e) { el = null; } }   // an editor typo must never throw out of the frame loop
            if (!el) return null;
            const r = el.getBoundingClientRect(), top = r.top + scrollY, edge = mm[2] === 'top' ? top : mm[2] === 'bottom' ? top + r.height : top + r.height / 2;
            y = edge - parseFloat(mm[3]) * vh;
        }
        return Number.isFinite(y + off) ? M.clamp(y + off, 0, maxY) : null;
    }
    let shown = false;
    const lottieEl = document.querySelector('.hero-wrapper dotlottie-player');
    function lottiePhase() { try { const l = lottieEl && lottieEl.getLottie && lottieEl.getLottie(); return l && l.totalFrames ? (l.currentFrame % l.totalFrames) / l.totalFrames : -1; } catch (e) { return -1; } }
    const ship = { sy: scrollY, keys: [], resolvedAt: -1e9, t0: -1, ripple: 0, flow: 0, wind: 0, way: 0, gust: 0, still: 0, anchor: 0, cw: 0, cwOn: 0, flash: 0, flash2: 0, trail: 0, smokeClk: 0, paddle: 0, anchorDrop: 0, fleetLevel: 0, fleetLo: -1, heel: null, heelVel: 0, phiE: 0, phiR: 0, flutPh: 0, flick: 0, churnPh: 0, lambda: 0.3, lastMix: 0, settleGain: 1, rings: 0, turnSea: null, billowPh: 0, driftX: 0, driftY: 0, camW: 0, par: -scrollY * pcfg.pParallax, parScroll: scrollY, lastScroll: scrollY, lo: -1, pose: {}, follow: null, route: null, entryRoute: null, entryEnd: null, seen: -1, speedAvg: 0, heroY: -1, overlay: false, overlayY: Infinity, layerZ: '', flipping: false };
    /* Pose evaluation. Scroll -> target pose: a monotone cubic (Fritsch-Butland tangents) through the keyframes. A value only moves
       inside segments whose two keys differ, so holds stay perfectly flat and nothing overshoots, yet velocity is continuous through
       every keyframe: positions travel on arcs and the angles never stop dead at a key. Tangents are prepared once per resolve. */
    function prepKeys(keys) {
        for (let i = 0; i < keys.length; i++) {
            const m = keys[i].m = {}, a = keys[i - 1], b = keys[i], c = keys[i + 1];
            for (const key of POSE_KEYS) {
                let t = 0;
                if (a && c) {
                    const h0 = b.y - a.y, h1 = c.y - b.y, d0 = h0 > 0 ? (b.k[key] - a.k[key]) / h0 : 0, d1 = h1 > 0 ? (c.k[key] - b.k[key]) / h1 : 0;
                    if (d0 * d1 > 0) { const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0; t = (w0 + w1) / (w0 / d0 + w1 / d1); }   // weighted harmonic mean: bounded by the smaller slope, hence monotone; zero at any hold or extremum
                }
                m[key] = t;   // value per scroll px
            }
        }
    }
    const segAt = s => { const keys = ship.keys; let i = 0; while (i < keys.length - 2 && s >= keys[i + 1].y) i++; return i; };
    function poseAt(s, out) {   // the keyframe pose at scroll s (cubic Hermite per property)
        const keys = ship.keys, i = segAt(s), a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], h = b.y - a.y;
        const u = h > 0 ? M.clamp((s - a.y) / h, 0, 1) : 1, u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = (u3 - 2 * u2 + u) * h, h11 = (u3 - u2) * h;
        for (const key of POSE_KEYS) out[key] = h00 * a.k[key] + h10 * a.m[key] + (1 - h00) * b.k[key] + h11 * b.m[key];
        return out;
    }
    // route.mjs — scroll-driven route for the particle ship (pure ES2020, no DOM).
    // The position travels along ONE spatial curve through the waypoints (centripetal
    // Catmull-Rom, arc-length tabulated); scroll is mapped to distance along it by a
    // separate monotone cubic. Everything lives inside buildRoute (no top-level state),
    // so it can be pasted as a plain inner function — just drop the `export`.
    //
    //   buildRoute(points, aspect, { softStart = 0.3, samplesPerSegment = 24, alpha = 0.5 })
    //     points: [{ at, x, y, ... }] sorted by `at` (may repeat); x,y in NDC, aspect = w / h.
    //     -> { sample(scroll, out), length, distAt(i) }
    //     sample writes out.x/out.y (NDC), out.tx/out.ty (unit on-screen direction of travel,
    //     (0,0) where the curve is stationary), out.dist, out.vel (d dist / d scroll, >= 0).
    function buildRoute(points, aspect, opts = {}) {
      const { softStart = 0.3, samplesPerSegment = 24, alpha = 0.5 } = opts;
      const n = points.length, segs = n - 1, S = Math.max(1, samplesPerSegment | 0);
    
      // 1. Control points in screen-true space (x * aspect), so distances and directions are
      //    what the eye sees. Ends are duplicated as phantom neighbours.
      const px = new Float64Array(n + 2), py = new Float64Array(n + 2);
      for (let i = 0; i < n; i++) { px[i + 1] = points[i].x * aspect; py[i + 1] = points[i].y; }
      px[0] = px[1]; py[0] = py[1]; px[n + 1] = px[n]; py[n + 1] = py[n];
      const gap = (a, b) => Math.pow((px[b] - px[a]) ** 2 + (py[b] - py[a]) ** 2, alpha / 2);
    
      // 2. Catmull-Rom in cubic-Hermite form: per segment, end tangents m1/m2 (d/du, u in [0,1]).
      //    Why Hermite: the usual Barry-Goldman recursion divides by knot gaps, which vanish on
      //    coincident points. Here a zero *neighbour* gap is replaced by the segment's own gap —
      //    that is what turns the duplicated phantom end into the classic half-chord end tangent —
      //    and a zero *own* gap is a hold: the segment collapses to its point with zero tangents.
      //    Adjacent segments share the same tangent expression at their common waypoint, so the
      //    direction of travel is continuous there (only its d/du scale differs).
      const m1x = new Float64Array(segs), m1y = new Float64Array(segs);
      const m2x = new Float64Array(segs), m2y = new Float64Array(segs);
      for (let j = 0; j < segs; j++) {
        const a = j, b = j + 1, c = j + 2, d = j + 3, g1 = gap(b, c);
        if (g1 < 1e-12) continue;                                       // hold: tangents stay 0
        let g0 = gap(a, b), g2 = gap(c, d);
        if (g0 < 1e-12) g0 = g1;
        if (g2 < 1e-12) g2 = g1;
        m1x[j] = g1 * ((px[b] - px[a]) / g0 - (px[c] - px[a]) / (g0 + g1) + (px[c] - px[b]) / g1);
        m1y[j] = g1 * ((py[b] - py[a]) / g0 - (py[c] - py[a]) / (g0 + g1) + (py[c] - py[b]) / g1);
        m2x[j] = g1 * ((px[c] - px[b]) / g1 - (px[d] - px[b]) / (g1 + g2) + (px[d] - px[c]) / g2);
        m2y[j] = g1 * ((py[c] - py[b]) / g1 - (py[d] - py[b]) / (g1 + g2) + (py[d] - py[c]) / g2);
      }
      const ev = (j, u, o) => {                       // segment j at u -> o.x, o.y, o.dx, o.dy (aspect space)
        const uu = u * u, uuu = uu * u, x1 = px[j + 1], y1 = py[j + 1], x2 = px[j + 2], y2 = py[j + 2];
        const h00 = 2 * uuu - 3 * uu + 1, h10 = uuu - 2 * uu + u, h01 = 3 * uu - 2 * uuu, h11 = uuu - uu;
        const k00 = 6 * uu - 6 * u, k10 = 3 * uu - 4 * u + 1, k01 = 6 * u - 6 * uu, k11 = 3 * uu - 2 * u;
        o.x = h00 * x1 + h10 * m1x[j] + h01 * x2 + h11 * m2x[j];
        o.y = h00 * y1 + h10 * m1y[j] + h01 * y2 + h11 * m2y[j];
        o.dx = k00 * x1 + k10 * m1x[j] + k01 * x2 + k11 * m2x[j];
        o.dy = k00 * y1 + k10 * m1y[j] + k01 * y2 + k11 * m2y[j];
      };
    
      // 3. Arc-length table: cumulative distance `cum`, with the curve parameter (= segment + u)
      //    at which it is first reached (`pa`) and last reached (`pb`); they differ only where a
      //    hold follows. Interpolating from pb[k] to pa[k+1] keeps every interval on moving curve,
      //    so a hold resolves to the start of its departing segment (and that direction) while the
      //    arrival stays exact, and every span is strictly positive — no zero divisions later.
      //    Hold segments are skipped outright (rounding would otherwise give them a 1e-16 length).
      const T = segs * S + 1, cum = new Float64Array(T), pa = new Float64Array(T), pb = new Float64Array(T), dAt = new Float64Array(n);
      const tmp = { x: 0, y: 0, dx: 0, dy: 0 };
      let len = 1, lx = px[1], ly = py[1];
      for (let j = 0; j < segs; j++) {
        if (gap(j + 1, j + 2) < 1e-12) { pb[len - 1] = j + 1; dAt[j + 1] = cum[len - 1]; continue; }
        for (let k = 1; k <= S; k++) {
          ev(j, k / S, tmp);
          const step = Math.hypot(tmp.x - lx, tmp.y - ly), p = j + k / S;
          lx = tmp.x; ly = tmp.y;
          if (step > 0) { cum[len] = cum[len - 1] + step; pa[len] = pb[len] = p; len++; }
          else pb[len - 1] = p;
        }
        dAt[j + 1] = cum[len - 1];
      }
    
      // 4. Scroll -> distance: monotone cubic through (at_i, dAt_i) with Fritsch-Butland
      //    (weighted harmonic mean) tangents; those never exceed 3x either neighbouring slope, so
      //    the cubic is non-decreasing and C1. Slopes are >= 0, hence a zero slope on either side
      //    (a hold, or equal `at`) forces a zero tangent — what monotone cubics require. The ends
      //    get softStart x the adjacent mean slope: not zero, so the ship moves on the very first
      //    pixel, but gently, and it eases into the final mooring the same way.
      const at = new Float64Array(n), h = new Float64Array(segs), del = new Float64Array(segs), m = new Float64Array(n);
      for (let i = 0; i < n; i++) at[i] = points[i].at;
      for (let j = 0; j < segs; j++) { h[j] = at[j + 1] - at[j]; del[j] = h[j] > 0 ? (dAt[j + 1] - dAt[j]) / h[j] : 0; }
      m[0] = softStart * del[0]; m[n - 1] = softStart * del[segs - 1];
      for (let i = 1; i < segs; i++) {
        const a = del[i - 1], b = del[i];
        if (a > 0 && b > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / a + w2 / b); }
      }
    
      const upper = (arr, hi, v) => {                 // largest k <= hi with arr[k] <= v (arr[0] <= v holds)
        let lo = 0;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; }
        return lo;
      };
      function sample(scroll, out) {
        if (!out) out = {};
        const s = scroll > at[0] ? (scroll < at[n - 1] ? scroll : at[n - 1]) : at[0];   // clamp; NaN -> start
        const i = upper(at, segs - 1, s), hs = h[i];   // del[i] > 0 implies hs > 0
        let dist, vel = 0;
        if (del[i] > 0) {                              // Hermite cubic and its analytic derivative
          const t = (s - at[i]) / hs, tt = t * t, ttt = tt * t;
          dist = (2 * ttt - 3 * tt + 1) * dAt[i] + (ttt - 2 * tt + t) * hs * m[i] + (3 * tt - 2 * ttt) * dAt[i + 1] + (ttt - tt) * hs * m[i + 1];
          vel = del[i] * (6 * t - 6 * tt) + m[i] * (3 * tt - 4 * t + 1) + m[i + 1] * (3 * tt - 2 * t);
        } else dist = dAt[i + 1];                     // hold or equal `at`: exact, no rounding drift off the table entry
        const k = upper(cum, len > 1 ? len - 2 : 0, dist), span = cum[k + 1] - cum[k];
        let f = span > 0 ? (dist - cum[k]) / span : 0; f = f > 1 ? 1 : f > 0 ? f : 0;
        const g = pb[k] + f * (pa[k + 1] - pb[k]);
        let j = Math.floor(g); j = j > segs - 1 ? segs - 1 : j > 0 ? j : 0;
        const u = g - j;
        ev(j, u, tmp);
        let L = Math.hypot(tmp.dx, tmp.dy);
        if (L < 1e-12 && u === 0 && j > 0) { ev(j - 1, 1, tmp); L = Math.hypot(tmp.dx, tmp.dy); }  // moored at the end of a run: keep the arrival heading
        out.x = tmp.x / aspect; out.y = tmp.y;
        out.tx = L > 1e-12 ? tmp.dx / L : 0; out.ty = L > 1e-12 ? tmp.dy / L : 0;
        out.dist = dist; out.vel = vel > 0 ? vel : 0;
        return out;
      }
      return { sample, length: dAt[n - 1], distAt: (i) => dAt[i] };
    }
    /* Target -> drawn pose: a critically damped follower per channel. It closes 95% of a jump in `lag` seconds, trails a moving
       target by about 0.4 lag, and is clamped so it can never pass the mark. Angles are followed on their plain continuous values
       (the key table never wraps), so there is no seam at 180. */
    function follow(f, key, target, lag, dt) {
        const w = 4.7 / Math.max(0.05, lag), x = w * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const d = f.p[key] - target, tmp = (f.v[key] + w * d) * dt;
        let v = (f.v[key] - w * tmp) * ex, out = target + (d + tmp) * ex;
        if ((d < 0) === (out > target)) { out = target; v = 0; }   // never past the mark
        f.v[key] = v; f.p[key] = out;
    }
    const LAG_OF = { x: 'shipLagPos', y: 'shipLagPos', wake: 'shipLagPos', cam: 'shipLagPos', size: 'shipLagSize', level: 'shipLagSize', turn: 'shipLag', tilt: 'shipLag', heel: 'shipLag', storm: 'shipLagPos', fleet: 'shipLagPos' };
    const _tgt = {}, _rs = {}, _er = {};
    const isLight = () => document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
    // the principles, testimonials, tools and footer paint an opaque ground over the layer; there the canvas moves above the page with a screen
    // blend (multiply in the light theme) behind a quick dip to black, so the voyage can end at the harbour instead of behind a wall
    // where the layer sits: -1 behind the page; 1 above the hero's swell and grid but under its text and picker (while the hero is on
    // screen); 12 above the page with a screen blend in overlay mode at the bottom. A change happens behind a quick dip to black.
    function applyLayer() {
        const overlay = scrollY > ship.overlayY, z = overlay ? '12' : scrollY < ship.heroY ? '1' : '-1';
        if (z === ship.layerZ || ship.flipping) return;
        const apply = () => { ship.layerZ = z; ship.overlay = overlay; canvas.style.zIndex = z; canvas.style.mixBlendMode = overlay ? (isLight() || groundLum() > 0.2 ? 'multiply' : 'screen') : ''; };
        if (!shown || overlay !== ship.overlay) { apply(); return; }   // the first frame, and the flip above the page at the block's edge (fully clipped then): no dip
        ship.flipping = true; const prev = canvas.style.transition; canvas.style.transition = 'opacity 0.22s ease'; canvas.style.opacity = '0';
        setTimeout(() => { apply(); canvas.style.opacity = '1'; setTimeout(() => { ship.flipping = false; canvas.style.transition = prev; }, 240); }, 240);
    }
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    // the waypoints resolved against the page as it is now, the route through them, and the two scroll marks the layer switches at.
    // Never throws (an editor typo keeps the previous route); keys that land on the same scroll are nudged apart so none is unreachable.
    function resolveRoute(now) {
        ship.resolvedAt = now;
        try {
            const src = innerHeight > innerWidth ? keyframes().portrait : keyframes().landscape;
            const keys = src.map(k => ({ y: resolveAt(k.at), k: Object.assign({}, POSE_DEFAULTS, k) })).filter(e => Number.isFinite(e.y)).sort((a, b) => a.y - b.y);
            for (let i = 1; i < keys.length; i++) if (keys[i].y <= keys[i - 1].y) keys[i].y = keys[i - 1].y + 1;
            if (keys.length < 2) { ship.keys = keys; ship.route = null; return; }
            prepKeys(keys);
            ship.route = buildRoute(keys.map(k => ({ at: k.y, x: k.k.x, y: k.k.y })), visW / visH, { softStart: pcfg.shipSoftStart });
            ship.keys = keys;
            const RKq = BOAT && BOAT.ROCKET !== undefined ? BOAT.ROCKET : Infinity, sail = keys.map(e => e.k.level).filter(l => l < RKq - 0.01);
            ship.fleetLevel = sail.length ? Math.round(Math.max(...sail)) : 0;   // the fleet is the ship the route ends on (its last level before the launch)
            const oy = pcfg.shipGrounds === 'overlay' ? resolveAt('#scalability:top@0.55') : pcfg.shipGrounds === 'opaque' && pcfg.shipOverlayAt ? resolveAt(pcfg.shipOverlayAt) : null; ship.overlayY = oy === null ? Infinity : oy;   // 'overlay': from the principles down; 'opaque': from shipOverlayAt (the rocket over the footer)
            const hy = resolveAt('.hero-wrapper:bottom@0.6'); ship.heroY = hy === null ? -1 : hy;
        } catch (e) { console.warn('work-spine: route', e); }
    }
    function shipFrame(t, dt, now) {
        if (!shipOn) return;
        if (jumpTo && !jumpTo.touched && now - jumpTo.t0 < 9000) {
            const y = section.classList.contains('is-3d') ? resolveAt(jumpTo.at) : section.offsetTop;   // first to the work section so it initialises, then to the mark
            if (y !== null && Math.abs(scrollY - y) > 2) { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, y); ship.follow = null; ship.lastScroll = scrollY; ship.still = 0; ship.resolvedAt = -1e9; }
        }
        if (now - ship.resolvedAt > 1000) resolveRoute(now);   // sections move as media loads and carousels initialise: re-resolve every second
        applyLayer();
        if (!ship.keys.length || !ship.route) return;
        ship.sy = scrollY;   // scroll is the timeline; the follower below supplies all of the time smoothing
        const T = poseAt(ship.sy, _tgt);
        ship.route.sample(ship.sy, _rs); T.x = _rs.x; T.y = _rs.y;   // the position comes from the one curve through the waypoints; the rest from the property cubics
        const F = ship.follow || (ship.follow = { p: { ...T }, v: Object.fromEntries(POSE_KEYS.map(k => [k, 0])) });   // first frame: snap
        // the course: the authored turn, drawn toward the direction of travel on screen where the camera holds still (cam) and the ship
        // is really moving. Down the screen at a low camera is toward the viewer, so the screen tangent is read through the tilt.
        const speed = Math.hypot(F.v.x * visW, F.v.y * visH) / (2 * visH);   // viewport heights per second, from the follower's own velocity: exactly zero at rest
        ship.speedAvg += (speed - ship.speedAvg) * Math.min(1, dt / (speed > ship.speedAvg ? 0.6 : 1.6));   // a slow average: a scroll burst must not swing the bow toward the track and back
        if (_rs.tx * _rs.tx + _rs.ty * _rs.ty > 1e-8) {
            const sinT = Math.max(0.35, Math.sin(M.degToRad(Math.max(0, T.tilt)))), psi = Math.atan2(-_rs.ty, _rs.tx * sinT) * 180 / Math.PI;
            let d = ((psi - T.turn) % 360 + 540) % 360 - 180; if (d > 90) d -= 180; else if (d < -90) d += 180;   // the nearest end of the tangent line: scrolling up is the same film run backwards
            T.turn += d * M.clamp(T.cam, 0, 1) * M.smoothstep(ship.speedAvg, 0.02, 0.2);
        }
        for (const key of POSE_KEYS) follow(F, key, T[key], pcfg[LAG_OF[key]], dt);
        const P = ship.pose; for (const key of POSE_KEYS) P[key] = F.p[key]; P.heading = 0;
        // banking: heel with the rate of turn (positive leans out of the turn like a displacement hull), mostly once seen from above
        P.heel += M.clamp(pcfg.shipLean * F.v.turn, -5, 5) * (0.35 + 0.65 * M.clamp(P.tilt / 60, 0, 1));
        // the ride-in: on load the ship comes in along the entry curve (on the swell where there is one), under way, and its course
        // follows that curve; the curve ends at the first waypoint, and scrolling during the ride simply adds the route's offset
        if (ship.t0 < 0) {
            if (ship.seen < 0) ship.seen = now;
            const wantSwell = pcfg.shipEntry > 0 && innerWidth > 1200 && innerWidth >= innerHeight && scrollY < 200;
            if (wantSwell && !lottieRect() && now - ship.seen < 2500) { P.x += 2.6; ship.crest = 0; }   // the swell has not laid out yet: wait a little, ship kept off the right edge
            else { ship.t0 = now; ship.entry = pcfg.shipEntry > 0 && scrollY < 200; const w0 = ship.keys[0].k; ship.entryEnd = { x: w0.x, y: w0.y }; ship.entryRoute = buildRoute(entryPoints(w0), visW / visH, { softStart: 1 }); }   // a page that opens already scrolled shows the ship where it is
        }
        const e = ship.t0 < 0 ? 0 : ship.entry ? Math.min(1, (now - ship.t0) / 1000 / Math.max(0.1, pcfg.shipEntry)) : 1, entry = ship.t0 < 0 ? 0 : 1 - e;
        if (entry > 0 && ship.entryRoute) {
            const k = 1 - Math.pow(1 - e, 2.2);   // eases off as it arrives
            ship.entryRoute.sample(k * 1000, _er);
            P.x += _er.x - ship.entryEnd.x; P.y += _er.y - ship.entryEnd.y;
            if (_er.tx * _er.tx + _er.ty * _er.ty > 1e-8) { const psiE = Math.atan2(-_er.ty, _er.tx * 0.35) * 180 / Math.PI, dE = ((psiE - P.turn) % 360 + 540) % 360 - 180; P.turn += dE * Math.pow(entry, 0.7); }
            const crest = Math.max(0, Math.sin(Math.PI * M.clamp((k - 0.52) / 0.32, 0, 1)));   // the lift over the crest line
            P.y += 0.035 * crest; P.heel += 5 * crest;
            P.wake = Math.max(P.wake, Math.min(1, entry * 1.6)); P.heel += entry * 3;
            ship.crest = crest;
        } else ship.crest = 0;
        // ---- the ship's dynamics (replaces everything from `// idle: bob, ...` to the uniform writes at the end of shipFrame). One speed
        //      scalar, ship.way, from the pose's wake and the scroll wind with hull inertia; every clock that depends on it is accumulated
        //      here (never sin(uTime * f(way)) in the shader) so a change of speed never snaps a phase. Units: hull lengths (L), seconds,
        //      degrees on the CPU; radians, L and 0..1 gains go to the shader. ----
        const dScroll = Math.abs(scrollY - ship.lastScroll); ship.lastScroll = scrollY;
        // stopping is dropping anchor: after shipAnchor seconds without a scroll the designed way dies over shipAnchorOut seconds (the hull
        // still carries its way over its own tau below), the sails go slack, the sea stops streaming; the first scroll is the wind again
        ship.still = dScroll > 0.5 ? 0 : ship.still + dt;
        const anchorT = pcfg.shipAnchor > 0 ? M.smoothstep(ship.still, pcfg.shipAnchor, pcfg.shipAnchor + Math.max(0.1, pcfg.shipAnchorOut)) : 0;
        ship.anchor += (anchorT - ship.anchor) * Math.min(1, dt / (anchorT > ship.anchor ? 0.5 : 0.25));
        // evolution: the two level textures around the fractional level, mixed in the shader
        const L = M.clamp(P.level, 0, levels.length - 1), lo = Math.min(levels.length - 1, Math.floor(L)), hi = Math.min(levels.length - 1, lo + 1), mix = L - lo;
        const mixRate = Math.abs(mix - ship.lastMix) / Math.max(dt, 1e-3); ship.lastMix = mix;   // wraps of mix at a level boundary count as a morph too, which is right
        ship.settleGain += (0.3 + 0.7 * Math.min(1, mixRate * 2) - ship.settleGain) * Math.min(1, dt / (mixRate > 0.1 ? 0.05 : 0.6));   // the settle holds at full rate through a morph and relaxes after it
        const FL = M.clamp(ship.fleetLevel, 0, levels.length - 1); if (FL !== ship.fleetLo) { ship.fleetLo = FL; for (const u of ALLU) { u.tFleetPos.value = levels[FL].pos; u.tFleetMeta.value = levels[FL].meta; } }
        if (lo !== ship.lo) { ship.lo = lo; for (const u of ALLU) { u.tBoatA.value = levels[lo].pos; u.tMetaA.value = levels[lo].meta; u.tBoatB.value = levels[hi].pos; u.tMetaB.value = levels[hi].meta; }
            wireLo.geometry = wire.lines[lo] || wire.empty; wireHi.geometry = wire.lines[hi] || wire.empty; sailLo.geometry = wire.sails[lo] || wire.empty; sailHi.geometry = wire.sails[hi] || wire.empty; hullMesh.geometry = wire.hull || wire.empty; }
        const LS = levels[lo].scale + (levels[hi].scale - levels[lo].scale) * mix, scale = P.size * visW * LS;
        const NL = levels.length, lvl = M.clamp(P.level, 0, NL - 1), lvi = Math.min(NL - 2, Math.floor(lvl)), lvf = lvl - lvi, tbl = T => T[lvi] + (T[lvi + 1] - T[lvi]) * lvf;   // per-level tables, linear between whole levels
        const lvn = 3 * M.clamp((LS - 0.7) / 0.8, 0, 1);   // the "size" on the old 0..3 scale (skiff 0 .. clipper 3), from the level's scale, for the inertia and the size-dependent constants below
        const hw = hullWL, hwA = hw && hw[lo], hwB = hw && hw[hi];
        const RKL = BOAT && BOAT.ROCKET !== undefined ? BOAT.ROCKET : -1, rocketMix = RKL < 0 ? 0 : lo === RKL ? 1 : hi === RKL ? mix : 0;   // 0 ship .. 1 rocket
        // wind: the scroll speed (1 at 1500 px/s), quick to rise, slow to fall
        const wt = Math.min(1, dScroll / Math.max(dt, 1e-3) / 1500);
        ship.wind += (wt - ship.wind) * Math.min(1, dt / (wt > ship.wind ? 0.2 : 1.2));
        // way: the pose's wake is the designed speed (0.72 at full wake, so a scroll burst still has headroom to 1.2), the wind adds to it;
        // the hull gathers way over tauUp and carries it over tauDn, both longer for a bigger ship
        const anchor = ship.anchor * (1 - rocketMix) * (1 - entry);   // never the rocket, never the ride-in
        const storm = M.clamp(P.storm, 0, 1) * pcfg.shipStorm * (1 - rocketMix);   // the passage through weather (the route's storm key)
        const wayT = M.clamp(0.72 * P.wake * (1 - anchor) + 0.55 * ship.wind, 0, 1.2), tauW = wayT > ship.way ? 0.35 + 0.15 * lvn : 1.3 + 0.5 * lvn;
        ship.way += (wayT - ship.way) * (1 - Math.exp(-dt / tauW));
        const way = ship.way, amp = way * way, sea = 0.3 + 0.7 * way, restW = 1 - M.smoothstep(way, 0.05, 0.4);   // restW: 1 at anchor .. 0 under way
        // gust: wind the sails feel before the hull has answered it (sails shake, the ship luffs and heels), smoothed and floored so a one-notch wheel does not twitch the sails
        const squall = storm * 0.6 * (0.5 + 0.5 * Math.sin(t * 1.1 + 0.6 * Math.sin(t * 0.37)));   // the storm's gusts: the sails shake, the ship luffs and heels, in squalls
        ship.gust += (M.clamp(ship.wind - 0.6 * way + squall, 0, 1) - ship.gust) * Math.min(1, dt / 0.08);
        const gust = Math.max(0, ship.gust - 0.03) / 0.97;
        // the wave pattern: wavelength from the Froude number (eased so the crests do not stretch visibly), heights ~ way^2, foam / spray / churn past thresholds
        const Fr = 0.15 + 0.25 * way, lamT = M.clamp(6.2832 * Fr * Fr, 0.3, 1.1); ship.lambda += (lamT - ship.lambda) * Math.min(1, dt / 1.5);
        const entryGain = hw ? hwA.entryGain + (hwB.entryGain - hwA.entryGain) * mix : 1;
        const foamGain = Math.min(1, M.smoothstep(way, 0.2, 0.65) * pcfg.shipFoam * (1 + 1.2 * storm)), foamLen = 0.15 + 1.3 * way, churnGain = Math.pow(way, 1.5) * (1 + storm), sprayGain = M.smoothstep(way, 0.35, 1.0) * entryGain * pcfg.shipSpray * (1 + 2 * storm);   // in the storm: more foam, churn and spray
        // flow and the clocks, all wrapped at exact periods: 18.2 L is 7 water lanes (2.6) and 13 foam lanes (1.4); the phases at 2pi x 1000, an integer number of periods for every harmonic used (1.83, 1.7, 2.3)
        const Vflow = (0.02 * (1 - restW) + 1.3 * way) / Math.sqrt(LS) * pcfg.shipWay;   // no creep at anchor: the disc lies still   // Froude: a bigger ship makes fewer hull lengths per second; the rocket's exhaust runs 4x
        ship.flow = (ship.flow + dt * Vflow) % 18.2;
        ship.flick = (ship.flick + dt * (1.5 + 3.5 * way)) % 1000;
        ship.churnPh = (ship.churnPh + dt * (3 + 3 * way)) % 6.2832;
        ship.ripple = (ship.ripple + dt * 1.5 * (1 - way) * pcfg.shipRipple) % 6283.185;
        ship.rings = (ship.rings + dt * pcfg.shipRings * (1 - way)) % 6283.185;   // the rest rings' clock
        ship.trail = (ship.trail + dt / Math.max(0.5, pcfg.shipTrail)) % 1000;    // the wake trail's age clock: one per lifetime (wrapped at an integer, so no dot is reborn by the wrap)
        ship.smokeClk = (ship.smokeClk + dt * (0.22 + 0.3 * way)) % 1000;         // funnel smoke: one lifetime per ~4 s, quicker under way
        ship.paddle = (ship.paddle + dt * Vflow / ((BOAT && BOAT.PADDLE_R) || 0.09)) % 6433.98;   // the paddle wheels: rim speed = the water's flow (wrapped at 1024 turns)
        // the sea the hull rides: a swell of 2.4 L (fundamental + a 1.83x harmonic so it is never a metronome) met at the encounter rate;
        // pitch and heave are the quasi-static response of a hull that averages the wave over its length (sinc), bigger on a smaller ship
        const omegaE = (0.9 + 1.5 * way) * (1.2 - 0.15 * lvn) * (1 + 0.5 * storm); ship.phiE = (ship.phiE + dt * omegaE) % 6283.185;
        if (ship.crest > 0) { const lp = lottiePhase(); if (lp >= 0) ship.phiE = 6.2832 * lp * 12; }   // on the wave, the ship breathes with the swell's own animation
        const ks = 6.2832 / (2.4 - 0.7 * storm), sinc = Math.sin(ks / 2) / (ks / 2), A = (0.008 + 0.010 * Math.min(amp, 1)) / LS * pcfg.shipSwell * (1 + 2.5 * storm);   // the swell's height (a short, steep sea in the storm); the hull's answer to it scales with shipBob below
        shipU.swell.set(Math.cos(M.degToRad(pcfg.shipSwellDir)), Math.sin(M.degToRad(pcfg.shipSwellDir)), 1 - M.smoothstep(way, 0.05, 0.4), ship.rings);   // .z: at rest (1) .. under way (0): the water sheet sits as a disc round the hull; .w: the rest rings' clock
        const lift = 1 + 0.3 * M.smoothstep(P.tilt, 50, 60);   // from above the heave reads small: a little more of it there (pitch stays under 4 degrees)
        const thetaA = 1.4 * A * ks * sinc * pcfg.shipBob, hA = A * sinc * lift * pcfg.shipBob, ph = ship.phiE;
        const pitch = -thetaA * (Math.sin(ph) + 0.35 * Math.sin(1.83 * ph + 1.1)) / 1.35, heave = hA * (Math.cos(ph) + 0.35 * Math.cos(1.83 * ph + 1.1)) / 1.35;
        // where in the cycle the stem is deepest (plunge: spray and the bow wave) and the stern (squat: churn), from the bow's immersion in the fundamental
        const C = A * Math.cos(ks / 2) - hA, D = 0.5 * thetaA - A * Math.sin(ks / 2), psi = Math.atan2(D, C);
        const plunge = Math.max(Math.pow(0.5 + 0.5 * Math.cos(ph - psi), 3), ship.crest || 0), squat = Math.pow(0.5 + 0.5 * Math.cos(ph + psi), 3);
        // heel: the keyframe's heel plus the wind's, per level (sail area x height over stiffness: the schooner heels most, the deep tall ship less),
        // as a damped roll that over-swings on a gust and settles in a roll period; the sea adds a slow roll on top
        const side = P.heel < 0 ? -1 : 1;   // the wind heels the ship the way the pose was authored
        // the cursor is the wind at anchor: where the pointer sits across the hull (along the hull's z axis as it projects on the screen,
        // half a hull length for full wind) the sails fill away from it, the ship heels away from it, and they flog as it crosses the bow
        const zsx = -Math.sin(M.degToRad(P.turn)), zsy = -Math.cos(M.degToRad(P.turn)) * Math.sin(M.degToRad(P.tilt));
        const cwT = M.clamp(((pointer.ndc.x - P.x) * visW / 2 * zsx + (pointer.ndc.y - P.y) * visH / 2 * zsy) / (0.45 * Math.max(0.05, scale)), -1, 1);
        ship.cw += (cwT - ship.cw) * Math.min(1, dt / 0.7);
        const cwOnT = pcfg.shipCursorWind * restW * (pointer.active && now - pointer.last < 2500 ? 1 : 0) * (1 - rocketMix);
        ship.cwOn += (cwOnT - ship.cwOn) * Math.min(1, dt / 1.0);
        const cwOn = M.clamp(ship.cwOn, 0, 1), cw = ship.cw;
        let heelT = P.heel + side * (pcfg.shipHeelWind * tbl(LEVEL_HEEL) * Math.pow(way, 1.3) + 2.5 * gust + 6 * storm) - 8 * cw * cwOn;
        heelT = 18 * Math.tanh(heelT / 18);   // soft limit, so the roll never pins flat on a clamp
        if (ship.heel === null) { ship.heel = heelT; ship.heelVel = 0; shipRot0.copy(shipRot); shipAt0.copy(shipAt); }
        const omegaR = 6.2832 / (2.6 + 1.6 * lvn);
        ship.heelVel += dt * (omegaR * omegaR * (heelT - ship.heel) - 1.9 * omegaR * ship.heelVel); ship.heel += dt * ship.heelVel;   // near critical damping: the roll settles, it does not ring
        ship.phiR = (ship.phiR + dt * 0.6 * omegaE) % 6283.185;
        const pF = (1.5 - 0.33 * lvn) * pcfg.shipBob * pcfg.shipSwell * (1 + 2.5 * storm), rollSea = (0.8 + 1.4 * sea) * pF * (Math.sin(ship.phiR) + 0.4 * Math.sin(1.7 * ship.phiR + 0.9)) / 1.4;
        const sway = pcfg.shipSway * pcfg.shipBob * restW;   // at anchor: the long quiet swell rocks the whole scene (step 1's idle), gone under way where the sea must stay level
        const sceneTilt = sway * 3.44 * Math.sin(t * 0.6);   // at rest the whole scene sways on the long swell, as the Sept-10 build did: 0.06 rad at 0.6 rad/s on its roll (today's tilt) and 0.09 rad at 0.21 on its yaw (today's turn)
        const swayYaw = (1.5 + 3.7 * sway) * Math.sin(t * 0.21);
        const heel = 24 * Math.tanh((ship.heel + rollSea) / 24), turn = P.turn + swayYaw + 1.2 * gust, tilt = P.tilt + 0.8 * Math.sin(t * 0.47) * (1 - restW) + sceneTilt;
        // the sails: apparent wind from the weather (the pose's wake), the gust and the ship's own speed; a sail with wind fills, one with wind but not
        // drawing luffs (flogs), one with no wind hangs still; a gust shakes it. The flutter phase accumulates at a rate that follows the apparent wind.
        const Wt = 0.09 + 0.6 * P.wake * (1 - anchor) + 0.5 * ship.wind, Wa = Math.min(1, Math.sqrt(Wt * Wt + 0.45 * Wt * way + 0.2 * way * way) / 1.28);   // a light air at anchor: the sails stir, they do not flog
        const fill = M.smoothstep(Wa, 0.08, 0.3), luff = M.smoothstep(Wa, 0.03, 0.12) * (1 - fill);
        const flapAmp = 0.03 * pcfg.shipFlap * (0.25 + 0.6 * luff + 1.2 * gust + 0.7 * (1 - Math.abs(cw)) * cwOn);   // head to the cursor's wind the cloth flogs
        // organic cloth: the belly breathes slowly (most when the sail is not drawing), and a slow billow rolls over it; both scale with shipFlap
        const breath = 0.22 * pcfg.shipFlap * (1 - 0.6 * fill) * (Math.sin(t * 0.37) + 0.5 * Math.sin(t * 0.61 + 1.0)) / 1.5;
        const bellyMul = M.lerp((0.6 + 0.6 * fill) * (1 + breath), -1.6 * cw * (1 + breath), cwOn);   // the cursor's wind: the belly signed, away from the pointer
        ship.billowPh = (ship.billowPh + dt * (0.5 + 0.8 * Wa + 0.6 * gust)) % 6283.185;
        shipU.sail2.set(0, 0.35 * pcfg.shipFlap * (0.5 + 0.5 * luff + 0.4 * gust) * (1 - 0.4 * fill), ship.billowPh, 0);
        ship.flutPh = (ship.flutPh + dt * (1.8 + 4.0 * Wa + 2.5 * gust)) % 6283.185;
        // the sea pose: heading, tilt, turn only. Heel, pitch and heave are applied per role in the shader about the waterline pivot, so the water stays level
        _qa.setFromAxisAngle(X, M.degToRad(tilt)).multiply(_qb.setFromAxisAngle(Y, -M.degToRad(turn)));   // the hull's pose: tilt (a rotation of the whole scene about the screen's horizontal axis, the Sept-10 build's roll) and course; the ship's roll, pitch and heave are per role in the shader
        shipRot.setFromMatrix4(_m4.makeRotationFromQuaternion(_qa));
        // the sea's course: at anchor it stays where it is while the hull turns through it (a very slow follow, so it never drifts far);
        // under way it tracks the hull tightly, with a short lag that bends the wake behind a turning ship. The yaw sway is shared
        const turnBase = turn - swayYaw, seaTau = M.lerp(0.25, 45, restW);
        if (ship.turnSea === null) ship.turnSea = turnBase;
        ship.turnSea += (turnBase - ship.turnSea) * (1 - Math.exp(-dt / seaTau));
        const turnSea = ship.turnSea + swayYaw;
        _qa.setFromAxisAngle(X, M.degToRad(tilt)).multiply(_qb.setFromAxisAngle(Y, -M.degToRad(turnSea)));
        shipRotSea.setFromMatrix4(_m4.makeRotationFromQuaternion(_qa));
        const dSea = M.degToRad(turnSea - turn); for (const u of ALLU) { u.uSeaD.value.set(Math.cos(dSea), Math.sin(dSea)); u.uSoftLane.value = pcfg.shipSoft * restW; }   // at rest the water is spring-held like the hull
        shipAt.set(P.x * visW / 2, P.y * visH / 2 + restW * pcfg.shipBob * 0.04 * Math.sin(t * 0.8), 0);   // at rest the whole scene bobs (Sept 10: 0.04 units at 0.8 rad/s)
        const snap = now - ship.t0 < 700 ? 0.02 : 0;
        // the field is the sea: while the camera holds the ship (the route's cam), the whole field streams past astern at the water's speed,
        // along the hull's x axis as it projects on the screen (so from above the sea runs along the course, from the side it runs along the
        // horizon, and a ship sailing into the depth leaves the field still); a still field belongs to a ship at anchor or to a camera
        // that stands while the ship crosses the frame. Nearer particles stream faster (drawPos parallax), and the field dims a little
        const launchW = rocketMix > 0.5 ? 1 : 0;   // the ending: the camera stands still over the armada, so the sea stands still too (the ships sail, their wakes trail)
        const camW = M.clamp(P.cam, 0, 1) * Math.min(1, pcfg.shipCurrent) * (1 - launchW), hx = Math.cos(M.degToRad(turn)), hy = -Math.sin(M.degToRad(turn)) * Math.sin(M.degToRad(tilt));
        const VflowDesign = (0.02 * (1 - restW) + 1.3 * Math.min(way, 0.72 * P.wake + 0.05)) / Math.sqrt(LS) * pcfg.shipWay;   // the field streams at the designed speed: a fast scroll (the wind) does not whip the whole screen
        const Vsea = VflowDesign * scale * camW;   // world units per second: the lane's flow in hull lengths x the hull's on-screen length
        const vxT = Vsea * hx * Math.max(1, pcfg.shipCurrent), vyT = Vsea * hy * Math.max(1, pcfg.shipCurrent), kS = 1 - Math.exp(-dt / 0.9);
        ship.vsx = (ship.vsx || 0) + (vxT - (ship.vsx || 0)) * kS; ship.vsy = (ship.vsy || 0) + (vyT - (ship.vsy || 0)) * kS;   // its velocity eases (0.9 s): a quick change of course, or scrolling back through the turns, never snaps its direction
        ship.driftX -= dt * (ship.vsx + 0.25 * pcfg.shipRain * storm); ship.driftY -= dt * (ship.vsy + pcfg.shipRain * storm); ship.camW = camW;   // in the storm the field falls as rain, slanted
        velU.uCurl.value = pcfg.pCurl * (1 + 2 * storm);   // the field churns
        if (storm > 0.25 && Math.random() < dt * 0.6 * storm) { ship.flash = 1; ship.flash2 = Math.random() < 0.6 ? 0.13 : 0; }   // lightning: a Poisson process, often a double flash
        if (ship.flash2 > 0) { ship.flash2 -= dt; if (ship.flash2 <= 0) ship.flash = 1; }
        ship.flash *= Math.exp(-dt / 0.1);
        velU.uDrift.value.set(ship.driftX, ship.driftY); U.uDrift.value.set(ship.driftX, ship.driftY); posU.uDrift.value.set(ship.driftX, ship.driftY);
        // the fleet in formation on the sea, in hull lengths: two astern on either quarter, one ahead, the far ones smaller and lifted (in the side view
        // the lift is distance toward the horizon; from above it is depth, invisible); each wanders a little so they are not glued to the ship
        // three waves (the route's fleet key 0..3): the first close round the ship, the next two farther out and higher toward the horizon, smaller
        const fsz = pcfg.shipFleetSize;
        const launch = ship.overlay || rocketMix > 0.5;   // the switch: at the block's edge (the canvas flips above the page there, fully clipped) or mid-morph behind the principles, whichever comes first
        const tall = innerHeight > innerWidth, unit = (tall ? ARMADA_VIEW.tall : ARMADA_VIEW.wide).unit || Math.max(0.4, Math.min(1, visW / 12));   // on a narrow screen the ranks close up and the hulls shrink
        const AW = launch ? armadaWin(tall, unit) : null, RUN0 = AW ? AW.s0 : 0, RUNLEN = AW ? AW.len : ARMADA_LOOP; ship.armadaWin = AW;   // world units along the course: both ends out of the frame for this screen
        const fTex = launch ? armadaTex : fleetTex; if (U.tFleet.value !== fTex) for (const u of ALLU) u.tFleet.value = fTex;
        for (let k = 0; k < ARMADA_K; k++) {
            if (launch) {   // the armada: along the course, wrapping out of the frame at both ends; each ship surges and drifts on its own clock
                const A = ARMADA[k], h = A[3], rel = ((A[0] * RUNLEN / ARMADA_LOOP + t * ARMADA_SPEED) % RUNLEN + RUNLEN) % RUNLEN;
                fleetU[k].set(RUN0 + rel + 0.45 * Math.sin(t * (0.05 + 0.04 * h) + 6.283 * h), 0.02 * Math.sin(t * (0.8 + 0.3 * h) + 9 * h), A[1] * unit + 0.08 * Math.sin(t * (0.04 + 0.04 * h) + 4.1 * h), Math.max(0.001, A[2] * unit * fsz));
            } else if (k >= FLEET_K) fleetU[k].set(0, 0, 0, 0.001);
            else {
                const F = FLEET_POS[k], wob = 0.06 * Math.sin(t * (0.19 + 0.02 * k) + k);
                fleetU[k].set(F[0] + wob, F[1] + 0.015 * Math.sin(t * 0.23 + k), F[2] + 0.05 * Math.sin(t * 0.17 + 2 * k), F[3] * fsz);
            }
        }
        if (launch) {   // the shot: a camera high over the sea looking down at ARMADA_TILT, the fleet heading away from it and a little to the right, with real
            // perspective (the far ranks are deeper in the scene, so they draw smaller and slower); the frame hovers a touch, like a crane holding the shot
            const AV = tall ? ARMADA_VIEW.tall : ARMADA_VIEW.wide, aTurn = AV.turn + 1.2 * Math.sin(t * 0.07), aTilt = AV.tilt + 0.8 * Math.sin(t * 0.05 + 1.0);
            _qa.setFromAxisAngle(X, M.degToRad(aTilt)).multiply(_qb.setFromAxisAngle(Y, -M.degToRad(aTurn))); fleetRot.setFromMatrix4(_m4.makeRotationFromQuaternion(_qa));
            fleetAt.set(AV.x * visW / 2, AV.y * visH / 2, 0); U.uFleetScale.value = 1;
            const below = Math.max(0, document.documentElement.scrollHeight - innerHeight - scrollY);   // px of page still below the viewport: the armada is part of the page's bottom, so it rises into place with the footer
            for (const u of ALLU) u.uFleetLift.value.set(-below * visH / innerHeight, camera.position.z);   // world units: the table is in them
        } else { fleetRot.copy(shipRotSea); fleetAt.copy(shipAt); U.uFleetScale.value = scale; for (const u of ALLU) u.uFleetLift.value.set(0, camera.position.z); }
        for (const u of ALLU) u.uFleetScale.value = U.uFleetScale.value;
        let clipTop = 1e9;   // above the page the canvas draws only from the block's top edge down (below it the block's own ground; above it the page covers the canvas anyway)
        if (ship.overlay) { const sel = /^(.+):(top|center|bottom)@/.exec(pcfg.shipOverlayAt || ''), el = sel ? document.querySelector(sel[1]) : null; if (el) clipTop = Math.max(0, innerHeight - el.getBoundingClientRect().top) * (canvas.height / Math.max(1, innerHeight)); }
        U.uClipTop.value = clipTop; for (const o of WIRES) o.material.uniforms.uClipTop.value = clipTop;
        const fleetForm = M.clamp(P.fleet, 0, 4) * M.clamp(pcfg.shipFleet, 0, 1);
        for (const u of ALLU) u.uFleetForm.value = fleetForm;
        const smoke = BOAT && BOAT.SMOKE ? tbl(BOAT.SMOKE) * (1 - rocketMix) : 0, FN = BOAT && BOAT.FUNNELS;   // funnel smoke and the funnels' tops, mixed between the two levels
        if (FN) shipU.funnel.set(FN[lo][0] + (FN[hi][0] - FN[lo][0]) * mix, FN[lo][1] + (FN[hi][1] - FN[lo][1]) * mix, FN[lo][2] + (FN[hi][2] - FN[lo][2]) * mix, FN[lo][3] + (FN[hi][3] - FN[lo][3]) * mix);
        // the anchor goes down once the ship has come to rest (at the hero, or wherever the reader stopped), and comes up as the wind returns
        const dropT = restW * M.smoothstep(ship.anchor, 0.3, 0.8) * (1 - rocketMix) * M.smoothstep(lvl, 0.5, 1);   // not on the skiff (the hero's little boat): the sloop is the first to carry one
        ship.anchorDrop += M.clamp(dropT - ship.anchorDrop, -dt / 1.3, dt / 2.2);   // lowered over 2.2 s (eased as a fall in the shader), weighed in 1.3 s
        if (ship.anchorDrop < 0.02) ship.anchorSide = shipRot.elements[8] >= 0 ? 1 : -1;   // the side that faces the camera, chosen while it is stowed (it never jumps sides while down)
        for (const u of ALLU) { u.uSmoke.value = smoke; u.uSmokeClk.value = ship.smokeClk; u.uPaddle.value = ship.paddle; u.uAnchor.value = ship.anchorDrop; u.uAnchorSide.value = ship.anchorSide || 1; }
        // dots -> lines -> solid: the wireframe and the surfaces fade in with the level (the module's tables), crossfaded through a morph
        // (both levels' edges are gone in the middle of it and the dots carry the change); the hull's mesh simply morphs and stays
        const linesG = BOAT && BOAT.LINES ? tbl(BOAT.LINES) * pcfg.shipLines : 0, solidG = BOAT && BOAT.SOLID ? tbl(BOAT.SOLID) * pcfg.shipSolid : 0;
        const wLo = 1 - M.smoothstep(mix, 0.05, 0.4), wHi = M.smoothstep(mix, 0.6, 0.95), lit = isLight() ? 0.6 : 1;
        wireLo.material.uniforms.uAlpha.value = 0.32 * linesG * wLo * lit; wireHi.material.uniforms.uAlpha.value = 0.32 * linesG * wHi * lit;
        hullMesh.material.uniforms.uAlpha.value = 0.16 * solidG * lit; sailLo.material.uniforms.uAlpha.value = 0.12 * solidG * wLo * lit; sailHi.material.uniforms.uAlpha.value = 0.12 * solidG * wHi * lit;
        for (const o of WIRES) o.visible = o.material.uniforms.uAlpha.value > 0.002;
        const trailOn = pcfg.shipTrail > 0 && rocketMix < 0.5 ? 1 : 0;   // the rocket's plume is the strip
        for (const u of ALLU) { u.uTrail.value = trailOn; u.uTrailClk.value = ship.trail; }
        const fieldGone = Number.isFinite(ship.overlayY) ? M.smoothstep(scrollY, ship.overlayY - 0.8 * innerHeight, ship.overlayY) : 0;   // the field is gone by the overlay mark (the footer): the rocket stands alone
        U.uFieldDim.value = fieldTheme * (1 - 0.55 * fieldGone) * (1 - pcfg.shipFieldDim * M.clamp(P.cam, 0, 1) * M.smoothstep(way, 0.1, 0.5)) * (1 + 3 * ship.flash);   // at the ending the field stays as the sea the fleet sails on, dimmed
        U.uGlow.value = glowBase * (1 + 1.2 * ship.flash);
        // uniforms: the vec4s and uBeam are shared instances across the three materials (see boatU), written once; uSettle is set in frame() from the simulated step
        shipU.wave.set(amp * pcfg.shipWave * (1 + 1.5 * storm), ship.lambda, foamGain, foamLen);
        shipU.sea.set(A, ks, ph, plunge);
        shipU.motion.set(M.degToRad(heel), pitch, heave, squat);
        shipU.sail.set(bellyMul, flapAmp, ship.flutPh, fill);
        shipU.clock.set(ship.flick, ship.churnPh, sprayGain, churnGain);
        if (hw) { shipU.hull.set(hwA.stem + (hwB.stem - hwA.stem) * mix, hwA.stern + (hwB.stern - hwA.stern) * mix, entryGain, hwA.sternHalf + (hwB.sternHalf - hwA.sternHalf) * mix); for (let k = 0; k < 17; k++) shipU.beam[k] = hwA.beam[k] + (hwB.beam[k] - hwA.beam[k]) * mix; }
        shipU.misc.set(tbl(LEVEL_PIVOT), 0.25 * way * (1 - M.smoothstep(tilt, 45, 65)), restW * 0.5, isLight() ? 1.3 : 1.6);   // .z: the rest disc's shading contrast (Sept 10: crests at twice the troughs)
        const soft = pcfg.shipSoft * (1 - M.smoothstep(lvl, pcfg.shipSoftUntil - 1, pcfg.shipSoftUntil)) * (0.3 + 0.5 * restW);   /* at rest 0.8 (was 0.87, 2026-09-15) */   // under way as before (0.3); at rest 0.87 (was 1.0): the hero a tad tighter   // soft at anchor, a lean toward soft while moving through the first levels, solid by shipSoftUntil
        for (const u of ALLU) { u.uSoft.value = soft; u.uLoose.value = 0.15 * soft * (1 - 0.33 * restW); u.uRocket.value = ship.overlay ? 1 : rocketMix; u.uForm.value = rocketMix < 0.5 && !ship.overlay ? 1 : 0; u.uMix.value = mix; u.uBoatScale.value = scale; u.uTime.value = t; u.uRipple.value = ship.ripple; u.uFlow.value = ship.flow; u.uWay.value = way; u.uSnapBoat.value = snap; }   // uLoose: the spring a touch weaker while soft
        U.uWake.value = foamGain; U.uReflect.value = (1 - M.smoothstep(way, 0, 0.5)) * (1 - M.clamp((tilt - 10) / 30, 0, 1)); U.uBoatPx.value = M.lerp(M.clamp(0.6 + 0.25 * scale, 1.0, 2.2), pcfg.shipDotsRest, restW);   // a bigger ship is sparser: bigger dots; at rest a fixed small factor so the ship's dots read like the field's
    }
    resize();
    // Theme from the ground the dots are actually drawn on: additive light dots only on a dark ground; as the picked colour lightens
    // the ground (pale: 0 at luminance 0.06 .. 1 at 0.4) the dots turn into dark, opaque, normally blended ink of the same hue, a
    // little bigger and denser, so the ship and the field stay readable on every colour the picker can produce. Re-applied on a class
    // change and whenever the body's background changes (polled in frame(): the picker sets variables, not classes, within a mode).
    let groundKey = '', fieldTheme = 1, glowBase = pcfg.pGlow;
    function applyTheme() {
        const cls = document.body.classList.contains('default-light') || document.body.classList.contains('default-light-colorblind');
        const lum = groundLum(), pale = M.smoothstep(lum, 0.06, 0.4), light = cls || pale > 0.5;
        const v = vividAccent(THREE, light, 0.6 - 0.38 * pale);   // the hue kept, the lightness from 0.6 (dark ground) to 0.22 (pale ground)
        U.uColorA.value.copy(v);
        U.uColorB.value.copy(v).lerp(new THREE.Color(0xffffff), 0.2 * (1 - pale)).lerp(new THREE.Color(0x000000), 0.25 * pale);
        U.uColorLit.value.copy(v).lerp(new THREE.Color(0xffffff), 0.55 * (1 - pale)).lerp(new THREE.Color(0x000000), 0.15 * pale);
        U.uColorFlag.value.copy(v).lerp(new THREE.Color(0xffffff), 0.85 * (1 - pale)).lerp(new THREE.Color(0x000000), 0.6 * pale);   // the burgee: near white on a dark ground, near black on a pale one
        for (const o of WIRES) { o.material.uniforms.uColor.value.copy(v).lerp(new THREE.Color(0xffffff), (o.material.fragmentShader === WIRE_FS ? 0.35 : 0.1) * (1 - pale)).lerp(new THREE.Color(0x000000), 0.3 * pale); o.material.blending = pale > 0.3 ? THREE.NormalBlending : THREE.AdditiveBlending; o.material.needsUpdate = true; }
        U.uGlow.value = glowBase = pcfg.pGlow * (1 + 1.3 * pale);
        U.uSize.value = pcfg.pSize * (1 + 0.3 * pale);
        fieldTheme = 1 - 0.45 * pale;   // the boost is for the ship: the field keeps about its dark-ground weight (applied through uFieldDim in shipFrame)
        lines.material.uniforms.uColor.value.copy(v).lerp(new THREE.Color(0xffffff), 0.2 * (1 - pale));
        mat.blending = pale > 0.3 ? THREE.NormalBlending : THREE.AdditiveBlending; mat.needsUpdate = true;
        if (ship.overlay) canvas.style.mixBlendMode = light ? 'multiply' : 'screen';
        try { groundKey = getComputedStyle(document.body).backgroundColor; } catch (e) {}
    }
    applyTheme();
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let groundAt = 0;
    function watchGround(now) { if (now - groundAt < 600) return; groundAt = now; let k = ''; try { k = getComputedStyle(document.body).backgroundColor; } catch (e) {} if (k !== groundKey) applyTheme(); }
    let last = performance.now();
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
        // the field's scroll parallax, accumulated so it can hand over to the sea: while the camera holds the ship (ship.camW, from the
        // last shipFrame) the scroll does not move the field at all, only the water's flow does (drawPos: uDrift), so the two never fight
        ship.par -= (scrollY - ship.parScroll) * pcfg.pParallax * (1 - ship.camW); ship.parScroll = scrollY;
        velU.uScroll.value = U.uScroll.value = posU.uScroll.value = ship.par;
        watchGround(now);
        shipFrame(t, dt, now);
        if (!qual.done) { qual.acc += dt; qual.frames++; if (qual.acc > 2.5) { qual.done = true; const ms = qual.acc / qual.frames * 1000; if (ms > 20) { qual.half = true; gl.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); geo.setDrawRange(0, Math.floor(COUNT / 2)); resize(); console.info('work-spine: slow device (' + ms.toFixed(1) + ' ms/frame), reduced quality'); } } }
        starsFrame(t, dt);
        qual.simDt += dt;
        if (!qual.half || (qual.tick++ % 2 === 0)) { velU.uDelta.value = qual.simDt; posU.uDelta.value = qual.simDt; posU.uSettle.value = shipOn ? 1 - Math.exp(-qual.simDt * pcfg.shipSettle * ship.settleGain) : 0; qual.simDt = 0; gpu.compute();
            shipRot0.copy(shipRot); shipAt0.copy(shipAt); for (const u of ALLU) u.uScale0.value = U.uBoatScale.value; posU.uTrailClk0.value = posU.uTrailClk.value; }   // solids were just written against this pose; the trail's clock as this step saw it
        U.tPos.value = gpu.getCurrentRenderTarget(posVar).texture; U.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
        for (const o of WIRES) o.material.uniforms.tPos.value = U.tPos.value;
        U.uIntro.value = Math.min(1, U.uIntro.value + dt * 0.5);
        gl.render(scene, camera);
        if (!shown) { shown = true; canvas.style.opacity = '1'; }
        requestAnimationFrame(frame);
    }
    let running = true; last = performance.now(); requestAnimationFrame(frame);   // a hidden tab simply stops getting animation frames
    // ---- the theme (lineage) switch and the icon row under the colour picker
    const themeStore = 'ws-ship-theme';
    let themeId = (shipOn && BOAT.THEME && BOAT.THEME.id) || 'atlantic', themeRow = null;
    function setTheme(id, persist = true) {
        const mod = THEMES && THEMES[id]; if (!shipOn || !mod || id === themeId) return false;
        themeId = id;
        const old = buildLevels(mod), sq = mod.SQUARE_NORMAL || [0.970, 0, 0.242];
        const oldArmada = armadaTex; armadaTex = buildArmadaTex(); for (const u of ALLU) if (u.tFleet.value === oldArmada) u.tFleet.value = armadaTex; setTimeout(() => oldArmada.dispose(), 500);
        for (const u of ALLU) u.uSqN.value.set(sq[0], sq[1], sq[2]);   // the lineage's square-sail belly normal
        ship.lo = -1; ship.fleetLo = -1; ship.settleGain = 1;   // re-upload the level textures on the next frame; the particles re-form quickly
        resolveRoute(performance.now());
        setTimeout(() => { for (const t of old) { t.pos.dispose(); t.meta.dispose(); } }, 500);
        if (persist) { try { localStorage.setItem(themeStore, id); } catch (e) {} }
        if (themeRow) for (const b of themeRow.querySelectorAll('[data-theme]')) b.setAttribute('aria-pressed', b.dataset.theme === id ? 'true' : 'false');
        return true;
    }
    const THEME_ICONS = {
        atlantic: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16.5h18l-2 3H5z"/><path d="M12 3v13"/><path d="M12 4c4 2.5 6 6 6 10H12"/><path d="M12 7c-3 2-4.5 5-4.5 9"/></svg>',
        norse: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 14.5c3 2 5.5 2.5 9.5 2.5s6.5-.5 9.5-2.5"/><path d="M3 14.5c-.5-2 0-4 1.5-5.5M21 14.5c.5-2 0-4-1.5-5.5"/><path d="M12 3v11"/><path d="M8 5h8v6H8z"/><circle cx="7" cy="15.6" r=".6"/><circle cx="10" cy="16.1" r=".6"/><circle cx="14" cy="16.1" r=".6"/><circle cx="17" cy="15.6" r=".6"/></svg>',
    };
    function mountThemeRow() {
        if (!shipOn || !THEMES) return;
        const host = document.getElementById('color-picker-container'); if (!host || host.querySelector('.ws-themes')) return;
        themeRow = document.createElement('div'); themeRow.className = 'ws-themes'; themeRow.setAttribute('role', 'radiogroup'); themeRow.setAttribute('aria-label', 'Ship style');
        for (const [id, mod] of Object.entries(THEMES)) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-theme'; b.dataset.theme = id;
            b.setAttribute('aria-pressed', id === themeId ? 'true' : 'false'); b.title = (mod.THEME && mod.THEME.name || id) + (mod.THEME && mod.THEME.title ? ': ' + mod.THEME.title : '');
            b.innerHTML = THEME_ICONS[id] || THEME_ICONS.atlantic; b.addEventListener('click', () => setTheme(id));
            themeRow.appendChild(b);
        }
        host.appendChild(themeRow);
    }
    if (THEME_ROW) mountThemeRow();   // off for now: the lineage icons under the colour picker may come back later
    layer = section.wsLayer = {
        theme: () => themeId, setTheme, themes: () => THEMES ? Object.keys(THEMES) : [],
        // the path editor's window on the route (js/voyage-editor.js, ?route=1)
        routeApi: {
            orientation: () => innerHeight > innerWidth ? 'portrait' : 'landscape',
            tables: () => keyframes(), defaults: () => keyframeTables(), stored: () => routeOverride,
            set(o, list) { routeOverride = Object.assign({}, routeOverride || {}, { [o]: list }); try { localStorage.setItem(routeStore, JSON.stringify(routeOverride)); } catch (e) {} resolveRoute(performance.now()); },
            reset() { routeOverride = null; try { localStorage.removeItem(routeStore); } catch (e) {} resolveRoute(performance.now()); },
            rebuild() { resolveRoute(performance.now()); },
            levels: () => levels.length,
            params: () => pcfg, setParam(k, v) { if (k in pcfg) { pcfg[k] = v; layer.sync(); } },
            attrs: keys => keys.filter(k => k in pcfg).map(k => `data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${pcfg[k]}"`).join(' '),
            resolveAt, keys: () => ship.keys, sample: (sc, out) => ship.route ? ship.route.sample(sc, out) : null, pose: () => ship.pose, state: () => ship,
            toPx: (x, y) => [(x * 0.5 + 0.5) * innerWidth, (0.5 - y * 0.5) * innerHeight], fromPx: (px, py) => [px / innerWidth * 2 - 1, 1 - py / innerHeight * 2],
        },
        // called by the work section every frame while it is active: figure index and where the figure sits on screen (px)
        setStars(k, cx, cy, w, h) { if (k !== stars.fig) starsSetFigure(k); stars.cx = cx; stars.cy = cy; stars.w = w; stars.h = h; stars.last = performance.now(); },
        sync() { velU.uCurl.value = pcfg.pCurl; velU.uReturn.value = pcfg.pReturn; velU.uDamp.value = pcfg.pDamp; velU.uPull.value = pcfg.pPull; velU.uRadius.value = pcfg.pRadius; U.uSize.value = pcfg.pSize; U.uRadius.value = pcfg.pRadius; U.uFlag.value = pcfg.shipBurgee; applyTheme(); resize(); },
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
    let BOAT = null, THEMES = null;
    if (pcfg.boat !== 'off') {
        try { BOAT = await import('./voyage-boat.js' + MOD_V); THEMES = { atlantic: BOAT }; } catch (e) { console.warn('work-spine: no ship model, particles only', e); }
        if (THEMES) { try { THEMES.norse = await import('./voyage-norse.js' + MOD_V); } catch (e) { console.warn('work-spine: the Norse lineage failed to load', e); } }
        // the lineage: ?theme= (dev aid), then the picker's stored choice, then the section's data-ship-theme
        let want = new URLSearchParams(location.search).get('theme') || '';   // the picker's theme icons are off for now (THEME_ROW), so a stored choice is ignored: ?theme= only
        if (!want && THEME_ROW) { try { want = localStorage.getItem('ws-ship-theme') || ''; } catch (e) {} }
        if (THEMES && THEMES[want || pcfg.shipTheme]) BOAT = THEMES[want || pcfg.shipTheme];
    }
    if (pcfg.mode === 'page') startParticleLayer(THREE, GPUC, BOAT, THEMES);
    if (layer && new URLSearchParams(location.search).get('route') === '1') import('./voyage-editor.js' + MOD_V).then(m => m.mountRouteEditor(layer.routeApi)).catch(e => console.warn('work-spine: route editor', e));
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
        const noBoat = () => ({ tBoatA: { value: home }, tBoatB: { value: home }, tMetaA: { value: home }, tMetaB: { value: home }, uMix: { value: 0 }, uForm: { value: 0 }, uBoatScale: { value: 1 }, uBoat: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uTime: { value: 0 }, uRipple: { value: 0 }, uFlow: { value: 0 }, uSettle: { value: 0 }, uWay: { value: 0 }, uReflect: { value: 1 }, uStarT: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, uN: { value: N }, uStarForm: { value: 0 }, uSnap: { value: 1.2 }, uSnapBoat: { value: 0 }, uSoft: { value: 0 }, uLoose: { value: 0 }, uSoftLane: { value: 0 }, uRotSea: { value: new THREE.Matrix3() }, uSeaD: { value: new THREE.Vector2(1, 0) }, uSqN: { value: new THREE.Vector3(0.970, 0, 0.242) }, uTrail: { value: 0 }, uTrailClk: { value: 0 }, uTrailClk0: { value: 0 }, tFleet: { value: home }, tFleetPos: { value: home }, tFleetMeta: { value: home }, uFleet: { value: Array.from({ length: 32 }, () => new THREE.Vector4()) }, uFleetForm: { value: 0 }, uFleetScale: { value: 1 }, uFleetBoat: { value: new THREE.Vector3() }, uFleetRot: { value: new THREE.Matrix3() }, uFleetLift: { value: new THREE.Vector2(0, 12) }, uSmoke: { value: 0 }, uSmokeClk: { value: 0 }, uPaddle: { value: 0 }, uAnchor: { value: 0 }, uAnchorSide: { value: 1 }, uFunnel: { value: new THREE.Vector4(0, 0, 0, 1) },
            uWave: { value: new THREE.Vector4(0, 0.3, 0, 0.15) }, uSea: { value: new THREE.Vector4(0, 2.618, 0, 0) }, uMotion: { value: new THREE.Vector4() }, uSail: { value: new THREE.Vector4(1, 0, 0, 0) }, uClock: { value: new THREE.Vector4() }, uHull: { value: new THREE.Vector4(0.5, -0.5, 1, 0.02) }, uMisc: { value: new THREE.Vector4(-0.02, 0, 0, 1.6) }, uSail2: { value: new THREE.Vector4() }, uBeam: { value: new Float32Array(17) }, uRot0: { value: new THREE.Matrix3() }, uBoat0: { value: new THREE.Vector3() }, uScale0: { value: 1 }, uSwell: { value: new THREE.Vector4(1, 0, 0, 0) } });
        Object.assign(velU, { tHome: { value: home }, uDelta: { value: 0 }, uCurl: { value: cfg.pCurl }, uReturn: { value: cfg.pReturn }, uDamp: { value: cfg.pDamp }, uPull: { value: cfg.pPull }, uRadius: { value: cfg.pRadius }, uScroll: { value: 0 }, uH: { value: 1e5 }, uW: { value: 1e5 }, uDrift: { value: new THREE.Vector2() }, uRocket: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } }, noBoat());
        Object.assign(posU, { tHome: { value: home }, uDelta: { value: 0 }, uScroll: { value: 0 }, uH: { value: 1e5 }, uW: { value: 1e5 }, uDrift: { value: new THREE.Vector2() } }, noBoat());
        const err = gpu.init(); if (err) throw new Error(err);
        const geo = new THREE.BufferGeometry();
        const ref = new Float32Array(COUNT * 2), sz = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) { ref[i * 2] = ((i % N) + 0.5) / N; ref[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N; sz[i] = Math.random() < 0.015 ? 1.8 + Math.random() * 1.0 : 0.5 + Math.random() * 0.6; }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
        geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: Object.assign(noBoat(), { tPos: { value: null }, tVel: { value: null }, uSize: { value: cfg.pSize }, uDPR: { value: Math.min(devicePixelRatio || 1, 2) }, uP: { value: 1000 }, uRadius: { value: cfg.pRadius }, uIntro: { value: 0 }, uScroll: { value: 0 }, uH: { value: 1e5 }, uW: { value: 1e5 }, uDrift: { value: new THREE.Vector2() }, uRocket: { value: 0 }, uFieldDim: { value: 1 }, uWake: { value: 0 }, uBoatPx: { value: 1.25 },
                uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uColorA: { value: new THREE.Color(0x4faad1) }, uColorB: { value: new THREE.Color(0xbfe6ff) }, uColorLit: { value: new THREE.Color(0xe6f4ff) }, uColorFlag: { value: new THREE.Color(0xffffff) }, uFlag: { value: 0 }, uClipTop: { value: 1e9 }, uGlow: { value: cfg.pGlow } }),
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
            ['shipWorkSize', 'ship: size in work', 0.06, 0.5, 0.005], ['shipWorkY', 'ship: y in work (ndc)', -1, 1, 0.01], ['shipWorkTilt', 'ship: tilt in work (deg)', 0, 90, 1],
            ['shipEntry', 'ship: sail-in (s)', 0.5, 8, 0.1], ['shipFlap', 'ship: sail flutter', 0, 3, 0.05], ['shipRipple', 'ship: rest rings', 0, 3, 0.05], ['shipBob', 'ship: motion (swell/pitch/roll)', 0, 3, 0.05],
            ['shipHeelWind', 'ship: wind heel (deg)', 0, 25, 0.5], ['shipWave', 'ship: bow wave height', 0, 3, 0.05], ['shipSpray', 'ship: spray', 0, 3, 0.05], ['shipFoam', 'ship: foam', 0, 3, 0.05],
            ['shipSwell', 'sea: swell height', 0, 4, 0.05], ['shipSwellDir', 'sea: swell direction (deg)', 0, 180, 5],
            ['shipSettle', 'ship: settle speed (/s)', 1, 20, 0.5], ['shipWay', 'ship: water flow', 0, 3, 0.05],
            ['shipLag', 'ship: lag angles (s)', 0.1, 2.5, 0.05], ['shipLagPos', 'ship: lag position (s)', 0.1, 2.5, 0.05], ['shipLagSize', 'ship: lag framing (s)', 0.1, 2.5, 0.05],
            ['shipLean', 'ship: lean (deg per deg/s)', -0.2, 0.2, 0.005], ['shipSoftStart', 'ship: soft start', 0.05, 1, 0.05],
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
