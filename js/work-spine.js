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

if (section && !reduced && 'IntersectionObserver' in window) boot();

async function boot() {
    const cards = [...section.querySelectorAll('.case-study-teaser')];
    if (cards.length < 2) return;

    // Load three only once the section is within 1.5 viewports.
    await new Promise(resolve => {
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) { io.disconnect(); resolve(); }
        }, { rootMargin: '150% 0px' });
        io.observe(section);
    });

    let THREE, CSS3D, ENV;
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
    init(THREE, CSS3D, ENV, cards);
}

function init(THREE, { CSS3DRenderer, CSS3DObject }, { RoomEnvironment }, cards) {
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
        edge: num(ds.edge, 0.06), edgePortrait: 0.1,   // scroll dead zone at both ends
        lerp: num(ds.lerp, 0.2),
        drift: num(ds.drift, 0.8),              // units the camera enters above / leaves below (theirs: 1)
        cardFrac: num(ds.cardFrac, 0.6),        // card width as a fraction of the visible width (upper bound; see layout())
        gap: num(ds.gap, 0.45),                 // minimum clearance between neighbouring cards, in units
        cardFracPortrait: 0.86,
        spineScale: num(ds.spineScale, 1),
        spineSpacing: num(ds.spineSpacing, 0.65),   // their SpineInstancer: y = 4 - 0.65 i
        spineTwist: num(ds.spineTwist, 0.4),        // rotation.y = 0.4 i
        scrollPerCard: num(ds.scrollPerCard, 60),   // vh of scrolling per card
        polyScale: num(ds.polyScale, 1),            // polystar size multiplier
        polyOpacity: num(ds.polyOpacity, 0.9),      // polystar opacity (dark theme; light theme uses 0.8 of it)
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
            buildParticles();
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

    // Their "flower" particle layer, reduced to a drifting cloud that turns with the scroll.
    function buildParticles() {
        const P = 500, pos = new Float32Array(P * 3);
        for (let i = 0; i < P; i++) {
            const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 2.6, h = 9 - Math.random() * 28;
            pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
        }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x4faad1, size: 0.045 * S, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
        world.add(particles);
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

    /* Centerpiece 'axis': the single source of truth every case study hangs off — a thin line
       down the helix axis with one node per card. The front card's node lights up. */
    let axis = null;
    function buildAxis() {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x4faad1, transparent: true, opacity: 0.35, depthWrite: false });
        const nodeMat = new THREE.MeshBasicMaterial({ color: 0x4faad1 });
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x4faad1, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), lineMat);
        const nodes = [], halos = [];
        for (let i = 0; i < n; i++) {
            const nd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), nodeMat); nodes.push(nd); world.add(nd);
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), haloMat); halos.push(h); world.add(h);
        }
        world.add(line);
        axis = { line, nodes, halos, lineMat, nodeMat, haloMat };
        layoutAxis();
    }
    function layoutAxis() {
        if (!axis) return;
        const span = yStep * (n - 1), pad = 6;
        axis.line.scale.set(1, span + pad * 2, 1);
        axis.line.position.y = -span / 2;
        axis.nodes.forEach((nd, i) => { nd.position.y = -yStep * i; axis.halos[i].position.y = nd.position.y; });
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
        if (particles) { particles.material.color.copy(accent); particles.material.opacity = light ? 0.55 : 0.75; }
        if (axis) { axis.lineMat.color.copy(accent); axis.nodeMat.color.copy(accent); axis.haloMat.color.copy(accent); axis.lineMat.opacity = light ? 0.45 : 0.35; }
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
    let portrait = false, S = 240, yStep = 0, lastCardW = 0, lastCap = '';
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
            if (portrait) t.position.y -= 0.7 * S;
            targets.push(t);
        });
        world.scale.setScalar(S);
        if (particles) particles.material.size = 0.045 * S;
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
    let first = true, dirty = true, running = false, active = false, tStart = performance.now(), frontIndex = -1, tuneLive = null, frames = 0;

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
        target.position.y += -cfg.drift * S * smooth(p, 0, 0.15);    // drop in from above
        target.position.y += cfg.drift * S * (1 - smooth(p, 0.85, 1)); // and leave below
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

        if (particles) particles.rotation.y = p * Math.PI * 1.2 + now * 0.00004;
        if (polystar) {
            // billboard to the camera, sit on the axis at the camera's height, offset up-right in view space
            const g = polystar.group;
            g.quaternion.copy(camera.quaternion);
            g.rotation.z += 0; g.rotateZ(M.degToRad(15.66) + now * 0.000105);              // their layer tilt + 360° per 60 s
            _s.set((portrait ? 0.7 : 1.0) * polystar.scale, (portrait ? 1.0 : 0.75) * polystar.scale, -0.6 * polystar.scale).applyQuaternion(camera.quaternion);
            g.position.set(_s.x, camGroup.position.y / S + _s.y, _s.z);
        }
        if (axis) axis.nodes.forEach((nd, i) => {
            const k = i === frontIndex ? 1 : 0;
            nd.scale.lerp(_s.setScalar(1 + k * 0.8), 0.12);
            axis.halos[i].scale.lerp(_s.setScalar(k ? 1 + 0.15 * Math.sin(now * 0.004) : 0.001), 0.12);
        });
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
            ['cardFrac', 'card width', 0.3, 0.95, 0.01], ['gap', 'card gap', 0, 1.5, 0.05], ['drift', 'entry drift', 0, 1.5, 0.05], ['lerp', 'camera lerp', 0.02, 0.5, 0.01],
            ['edge', 'scroll edge', 0, 0.2, 0.005], ['scrollPerCard', 'scroll per card (vh)', 25, 120, 5],
            ['polyScale', 'polystar size', 0.4, 3, 0.05], ['polyOpacity', 'polystar opacity', 0, 1, 0.02],
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
            layout(); layoutSpine(); applyTheme(); ta.value = attrs(); wake();
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
