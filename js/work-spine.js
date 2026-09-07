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
    const cfg = {
        radius: +ds.radius || 3.8,
        step: +ds.step || 50,            // degrees between cards
        stepPortrait: +ds.stepPortrait || 35,
        fov: +ds.fov || 35,
        fovPortrait: +ds.fovPortrait || 55,
        camOffset: +ds.camOffset || 2,   // camera's local z offset inside its group
        edge: 0.06, edgePortrait: 0.1,   // scroll dead zone at both ends
        lerp: 0.2,
        cardFrac: +ds.cardFrac || 0.6,   // card width as a fraction of the visible width
        cardFracPortrait: 0.86,
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
        buildSpine();
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
        const COUNT = 40, SPACING = 0.65, TWIST = 0.4, TOP = 8;   // their SpineInstancer: y = 4 - 0.65 i, rotation.y = 0.4 i
        const bodies = new THREE.InstancedMesh(body, mat, COUNT);
        const procs = new THREE.InstancedMesh(proc, mat, COUNT * 3);
        const d = new THREE.Object3D();
        const angles = [Math.PI / 2, Math.PI / 2 + 2.15, Math.PI / 2 - 2.15];
        for (let i = 0; i < COUNT; i++) {
            const y = TOP - SPACING * i, rot = TWIST * i;
            d.position.set(0, y, 0); d.rotation.set(0, rot, 0); d.scale.setScalar(1); d.updateMatrix();
            bodies.setMatrixAt(i, d.matrix);
            angles.forEach((a, k) => {
                const ang = a + rot, len = k === 0 ? 0.62 : 0.5;
                d.position.set(Math.cos(ang) * len, y - 0.03, Math.sin(ang) * len);
                d.rotation.set(0, -ang, Math.PI / 2 - 0.15);
                d.scale.set(1, k === 0 ? 1.15 : 1, 1);
                d.updateMatrix();
                procs.setMatrixAt(i * 3 + k, d.matrix);
            });
        }
        bodies.instanceMatrix.needsUpdate = true; procs.instanceMatrix.needsUpdate = true;
        world.add(bodies, procs);
        spineParts = [bodies, procs];

        keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(4, 6, 5);
        glScene.add(keyLight, new THREE.HemisphereLight(0xffffff, 0x223344, 0.35));

        // Their "flower" particle layer, reduced to a drifting cloud that turns with the scroll.
        const P = 500, pos = new Float32Array(P * 3);
        for (let i = 0; i < P; i++) {
            const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 2.6, h = TOP + 1 - Math.random() * (SPACING * COUNT + 2);
            pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
        }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x4faad1, size: 0.045, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
        world.add(particles);
        applyTheme();
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
    }
    new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    /* ---------- layout: helix + camera targets ---------- */
    const targets = [];
    let portrait = false, S = 240, yStep = 0;
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
        const cardW = visW * (portrait ? cfg.cardFracPortrait : cfg.cardFrac);
        const cardH = portrait ? cardW * 1.2 : cardW * 0.65;           // their pane is 4 x 2.6
        section.style.setProperty('--ws-s', S + 'px');

        const step = M.degToRad(portrait ? cfg.stepPortrait : cfg.step);
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

        cssRenderer.setSize(w, h);
        if (gl) gl.setSize(w, h, false);
        dirty = true;
    }

    /* ---------- scroll → camera ---------- */
    const camGroup = new THREE.Object3D();
    const target = new THREE.Object3D();
    const offset = new THREE.Vector3();
    let first = true, dirty = true, running = false, active = false, tStart = performance.now(), frontIndex = -1;

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
        target.position.y += -0.8 * S * smooth(p, 0, 0.15);    // drop in from above (theirs is a full unit)
        target.position.y += 0.8 * S * (1 - smooth(p, 0.85, 1)); // and leave below
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
            count.textContent = String(front + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
        }

        if (particles) particles.rotation.y = p * Math.PI * 1.2 + now * 0.00004;
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

    // ?ws=0.5 lands at 50% of the section (handy while tuning)
    const ws = parseFloat(new URLSearchParams(location.search).get('ws'));
    if (!Number.isNaN(ws)) {
        document.documentElement.style.scrollBehavior = 'auto';
        const total = section.offsetHeight - stage.clientHeight;
        window.scrollTo(0, section.offsetTop + M.clamp(ws, 0, 1) * total);
    }
}
