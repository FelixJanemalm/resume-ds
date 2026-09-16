/* principle-clouds.js — particle scenes for two of the principles cards, in the particle layer's own look (round additive specks in the
 * picked colour, soft with depth), replacing their Lotties.
 *
 * People first: six people, each a small cloud of light in a hue of their own, wander apart. Some of each cloud's specks cross over and
 * stay with a neighbour; then the people draw in round a circle and spread into one ring, each holding an arc of it in their own hue (with
 * the specks they took in), while a light runs round through everyone.
 * Ruthless focus: a scattered cloud, out of focus with depth. Gravity takes it: every speck falls toward one point, slow at first and
 * fastest as it arrives (light streaks with the speed), spiralling in and coming into focus. The mass lands with a flash and a shockwave,
 * and the specks orbit in a small bright disc. Then it lets go and falls again.
 *
 * A collapsed card holds its rest pose (People: the ring; Focus: the scattered cloud, with the faintest seed of the point). Opening a card
 * (or hovering it) plays the loop (People from the release, so the picture opens up first and then comes together again; Focus from the
 * fall). Every speck chases its analytic target through a spring, so any jump in the
 * clock (open, close, hover) is a glide. Nothing animates with reduced motion: the resolved pose (the ring, the focused point) is drawn once.
 *
 * Markup: <div data-principle-cloud="people|focus"> inside a card's .item. Dev aid: ?pc=<seconds> freezes both loops at that time.
 */
import * as THREE from 'three';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const freezeAt = (() => { const v = new URLSearchParams(location.search).get('pc'); return v !== null && v !== '' && !Number.isNaN(+v) ? +v : null; })();

const TAU = Math.PI * 2;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function rng(seed) {   // mulberry32: the same composition on every load
    return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const onSphere = R => { const u = 2 * R() - 1, th = R() * TAU, s = Math.sqrt(1 - u * u); return [s * Math.cos(th), u, s * Math.sin(th)]; };

const FOV = 40, CAM_Z = 10, HALF_H = CAM_Z * Math.tan(FOV / 2 * Math.PI / 180);

/* A speck in focus is a glowing dot; out of focus (aBlur -> 1) it opens into a flat disc with a brighter rim, its light spread over the disc. */
const VS = `
    attribute vec3 aColor; attribute float aSize, aAlpha, aBlur;
    uniform float uPR, uScale; varying vec3 vColor; varying float vAlpha, vBlur;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float grow = 1.0 + aBlur * 4.0;
      gl_PointSize = max(1.0, aSize * uScale * uPR * grow / max(0.5, -mv.z));
      vColor = aColor; vBlur = aBlur; vAlpha = aAlpha / (1.0 + aBlur * grow * 0.8);
      gl_Position = projectionMatrix * mv; }`;
const FS = `
    varying vec3 vColor; varying float vAlpha, vBlur;
    void main(){
      float d = length(gl_PointCoord * 2.0 - 1.0); if (d > 1.0) discard;
      float glow = exp(-d * d * 4.5);
      float disc = (1.0 - smoothstep(0.72, 1.0, d)) * (0.55 + 0.45 * smoothstep(0.3, 0.92, d));
      float a = mix(glow, disc, clamp(vBlur * 1.6, 0.0, 1.0)) * vAlpha;
      gl_FragColor = vec4(vColor * a, 1.0); }`;

/* ---------------------------------------------------------------- Ruthless focus */
const FOCUS = {
    seed: 7, T: 13, rest: 12.4, still: 6.5, start: 0, count: coarse ? 1260 : 2200, extra: 6 + 260, streaks: true,
    // while it plays the specks track the fall almost rigidly (gravity accelerates; a spring would ease it out), easing up to that over the first
    // moments so a re-hover mid-exhale glides; let go, they drift back out slowly
    follow: (play, playT) => play ? mix(3, 26, smooth(0, 0.8, playT)) : 2.4,
    create(N, R) {
        const P = [], ax = [0.3, 1, 0.95], l = Math.hypot(...ax); ax[0] /= l; ax[1] /= l; ax[2] /= l;   // the disc's axis
        for (let i = 0; i < N; i++) P.push({
            hx: R() * 2 - 1, hy: R() * 2 - 1, hz: R(), s: R(), f1: 0.6 + R(), f2: 0.6 + R(), f3: 0.6 + R(), a1: R() * TAU, a2: R() * TAU, a3: R() * TAU,
            hue: (R() - 0.5) * 0.06, spin: 1.6 + 2.2 * R(), rdU: R(), lift: R() - 0.5, late: R() < 0.08 ? 3 + 5 * R() : 0,   // late: keeps falling in through the hold
        });
        return { P, N, ax, mass: 0 };
    },
    targets(S, ct, time, v, o, rest) {
        const { P, N, ax } = S, { halfW, halfH, cy, fit } = v, [kx, ky, kz] = ax;
        const rMax = Math.hypot(halfW * 1.05, halfH, 2.5), IMPACT = 3.3;
        const flash = rest ? 0 : Math.exp(-Math.pow((ct - IMPACT) / 0.22, 2));
        const shockT = Math.min(ct - IMPACT, 2.4), shockA = rest || shockT < 0 || shockT > 2.4 ? 0 : Math.exp(-shockT * 1.5) * smooth(0, 0.08, shockT), shockR = shockT * 3.4 * fit;
        let sumC = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i], i3 = i * 3;
            let x, y, z, a, b, sz, white;
            {
                const hx = p.hx * halfW * 1.05 + Math.sin(time * 0.23 * p.f1 + p.a1) * 0.25, hy = p.hy * halfH + Math.cos(time * 0.19 * p.f2 + p.a2) * 0.22, hz = -2.5 + p.hz * 5 + Math.sin(time * 0.15 * p.f3 + p.a3) * 0.3;
                const dx = hx, dy = hy - cy, dz = hz, r0 = Math.hypot(dx, dy, dz);
                // free fall: the far ones take longer (t ~ r^1.5); the radius closes as 1 - s^2, so each speck starts slow and arrives fastest
                const tau = (p.late || 1.2 + 2.3 * Math.pow(r0 / rMax, 1.5)) * (0.85 + 0.3 * p.s), s = clamp01(ct / tau), f = 1 - s * s;
                const E = smooth(9.0 + p.s * 0.8, 11.6 + p.s * 0.8, ct), g = 1 - Math.pow(1 - E, 2.5);   // the exhale: back out to where it was
                // it spirals in (angular momentum: the turn quickens as it closes), then orbits in the disc, inner orbits faster
                const rd = (0.05 + 0.6 * p.rdU * p.rdU) * fit, w = Math.min(4, 0.32 / Math.pow(rd, 1.5));
                const phi = p.spin * s * s * s + w * Math.max(0, ct - tau), c = Math.cos(phi), sn = Math.sin(phi), kd = kx * dx + ky * dy + kz * dz;
                const vx = dx * c + (ky * dz - kz * dy) * sn + kx * kd * (1 - c), vy = dy * c + (kz * dx - kx * dz) * sn + ky * kd * (1 - c), vz = dz * c + (kx * dy - ky * dx) * sn + kz * kd * (1 - c);
                const kv = kx * vx + ky * vy + kz * vz, px = vx - kx * kv, py = vy - ky * kv, pz = vz - kz * kv, pl = Math.hypot(px, py, pz) || 1;
                const lift = p.lift * 0.05 * fit, Dx = px / pl * rd + kx * lift, Dy = py / pl * rd + ky * lift, Dz = pz / pl * rd + kz * lift;
                const Cx = vx * f + Dx * (1 - f), Cy = vy * f + Dy * (1 - f), Cz = vz * f + Dz * (1 - f);
                x = mix(Cx, dx, g); y = cy + mix(Cy, dy, g); z = mix(Cz, dz, g);
                const near = (1 - f) * (1 - g); sumC += near;
                a = (0.42 + 0.35 * p.s) * (1 + 0.9 * near) * (1 + 0.8 * flash * near);
                b = Math.min(0.6, Math.abs(z) * 0.12) * (1 - near);   // in focus as it arrives
                sz = (0.032 + 0.04 * p.s * p.s) * (1 - 0.4 * near);
                white = 0.08 + 0.6 * near * near * Math.max(0, 1 - 2.2 * rd / fit) + 0.4 * flash * near;   // white-hot inside, the picked colour at the disc's rim
            }
            o.pos[i3] = x; o.pos[i3 + 1] = y; o.pos[i3 + 2] = z;
            o.size[i] = sz; o.alpha[i] = a; o.blur[i] = b;
            v.color(p.hue, white, o.col, i3);
        }
        S.mass = sumC / N;
        const m = S.mass, u1 = [1, 0, 0], u2 = [0, 0, 0];   // the disc's plane: u1 (x made perpendicular to the axis), u2 = axis x u1
        const d1 = kx; u1[0] -= kx * d1; u1[1] -= ky * d1; u1[2] -= kz * d1; const l1 = Math.hypot(...u1); u1[0] /= l1; u1[1] /= l1; u1[2] /= l1;
        u2[0] = ky * u1[2] - kz * u1[1]; u2[1] = kz * u1[0] - kx * u1[2]; u2[2] = kx * u1[1] - ky * u1[0];
        // the point: wide soft glows that grow with the mass (a faint seed of it while the field is scattered) and flare at the impact
        for (let h = 0; h < 6; h++) {
            const i = N + h, i3 = i * 3;
            o.pos[i3] = 0; o.pos[i3 + 1] = cy; o.pos[i3 + 2] = 0;
            o.size[i] = (0.35 + 0.9 * h / 5) * fit * (1 + 0.6 * flash + 0.04 * Math.sin(time * 2.1 + h));
            o.blur[i] = 0; o.alpha[i] = (0.035 + 0.16 * Math.pow(m, 1.5) + 0.35 * flash) * (1 - 0.13 * h);
            v.color(0, 0.25 + 0.5 * m / (1 + h), o.col, i3);
        }
        // the shockwave: one thin ring of light running out through the disc's plane from the impact
        for (let j = 0; j < 260; j++) {
            const i = N + 6 + j, i3 = i * 3, th = j / 260 * TAU, c = Math.cos(th), sn = Math.sin(th), rr = shockR;
            o.pos[i3] = (u1[0] * c + u2[0] * sn) * rr; o.pos[i3 + 1] = cy + (u1[1] * c + u2[1] * sn) * rr; o.pos[i3 + 2] = (u1[2] * c + u2[2] * sn) * rr;
            o.size[i] = 0.05; o.blur[i] = 0; o.alpha[i] = shockA * 1.2; v.color(0, 0.45, o.col, i3);
        }
    },
};

/* ---------------------------------------------------------------- People first */
const K = 6, TILT = 1.15;   // the people stand round a circle seen from above and in front: TILT (rad) from face-on
const PEOPLE = {
    seed: 11, T: 14, rest: 9.2, start: 10.6, count: coarse ? 1400 : 2600, extra: 0,
    create(N, R) {
        const P = [], hues = Array.from({ length: K }, (_, k) => 0.11 * Math.sin(k / K * TAU + 0.5));
        for (let i = 0; i < N; i++) {
            const owner = i % K, nuc = R() < 0.06, giver = !nuc && R() < 0.14, host = (owner + (R() < 0.5 ? 1 : K - 1)) % K;
            const r = nuc ? 0.08 * Math.cbrt(R()) : 0.38 * Math.pow(R(), 0.6), [dx, dy, dz] = onSphere(R);
            const arc = giver ? host : owner, tube = 0.21 * Math.sqrt(R()), ta = R() * TAU;
            P.push({
                owner, nuc, giver, host, s: R(), hue: hues[owner] + (R() - 0.5) * 0.02,
                ox: dx * r, oy: dy * r, oz: dz * r,
                // on the ring: the angle along it (the person's arc, or the arc of the neighbour a speck crossed over to) and its place in the ring's cross-section
                ang: nuc ? (arc + 0.5) / K * TAU : (arc + 0.03 + 0.94 * R()) / K * TAU, tr: nuc ? 0 : tube * Math.cos(ta), tu: nuc ? 0 : tube * Math.sin(ta),
                gStart: 2.2 + R() * 2.6, rStart: 10.4 + R() * 1.2,
            });
        }
        return { P, N, cx: new Float32Array(K), cyy: new Float32Array(K), cz: new Float32Array(K), spin: new Float32Array(K) };
    },
    targets(S, ct, time, v, o) {
        const { P, N, cx, cyy, cz, spin } = S, { halfW, halfH, cy, fit } = v;
        const ct1 = Math.cos(TILT), st1 = Math.sin(TILT);
        const RR = Math.min(2.2, halfW * 0.7) * fit;                                  // the ring's radius
        const gather = smooth(2.0, 5.8, ct) * (1 - smooth(10.8, 13.4, ct));     // the people draw closer before they join
        const R0 = Math.min(halfW * 0.62, halfH * 0.36 / ct1) * fit, Rk = mix(R0, RR * 1.05, gather);
        const base = time * 0.06 + 0.4;
        for (let k = 0; k < K; k++) {   // each person on the same tilted circle the ring will be, wandering off it while apart
            const th = (k + 0.5) / K * TAU + base, apart = (1 - gather) * fit;
            cx[k] = Math.cos(th) * Rk + Math.sin(time * 0.37 + k * 1.9) * 0.3 * apart;
            cyy[k] = cy - Math.sin(th) * Rk * ct1 + Math.cos(time * 0.29 + k * 2.7) * 0.24 * apart;
            cz[k] = Math.sin(th) * Rk * st1 + Math.sin(k * 2.3 + time * 0.1) * 0.8 * apart;
            spin[k] = time * (0.45 + 0.1 * k);
        }
        for (let i = 0; i < N; i++) {
            const p = P[i], i3 = i * 3, k = p.owner, sc = Math.cos(spin[k]), ss = Math.sin(spin[k]);
            const breathe = (1 + 0.08 * Math.sin(time * 1.1 + k * 1.3)) * Math.sqrt(fit);
            const ox = (p.ox * sc + p.oz * ss) * breathe, oz = (-p.ox * ss + p.oz * sc) * breathe, oy = p.oy * breathe;
            let hx = cx[k], hy = cyy[k], hz = cz[k], a = p.nuc ? 0.9 : 0.42 + 0.35 * p.s, white = p.nuc ? 0.35 : 0.06;
            if (p.giver) {   // crossing over to a neighbour, and home again as the loop lets go
                const h = p.host, m = smooth(p.gStart, p.gStart + 1.4, ct) * (1 - smooth(p.rStart, p.rStart + 1.4, ct));
                if (m > 0) {
                    const mx = (cx[k] + cx[h]) * 0.5 * 0.55, my = cy + ((cyy[k] + cyy[h]) * 0.5 - cy) * 0.55, mz = (cz[k] + cz[h]) * 0.5 + 0.9, q = 1 - m;
                    hx = q * q * cx[k] + 2 * q * m * mx + m * m * cx[h];
                    hy = q * q * cyy[k] + 2 * q * m * my + m * m * cyy[h];
                    hz = q * q * cz[k] + 2 * q * m * mz + m * m * cz[h];
                    const travel = Math.sin(Math.PI * m); a += 0.45 * travel; white += 0.3 * travel;
                }
            }
            let x = hx + ox, y = hy + oy, z = hz + oz;
            const J = smooth(5.0 + p.s * 1.2, 7.0 + p.s * 1.2, ct) * (1 - smooth(10.2 + p.s * 0.8, 11.9 + p.s * 0.8, ct));
            if (J > 0) {   // joined: spread along the person's arc of the ring (a nucleus stays a bright knot at the arc's middle)
                const A = p.ang + base, rr = RR + p.tr * fit, px = Math.cos(A) * rr, pl = Math.sin(A) * rr;
                const X = px + (p.nuc ? ox * 0.7 : 0), Y = cy - pl * ct1 + p.tu * fit * st1 + (p.nuc ? oy * 0.7 : 0), Z = pl * st1 + p.tu * fit * ct1;
                x = mix(x, X, J); y = mix(y, Y, J); z = mix(z, Z, J);
                let dA = Math.abs(A - time * 1.3) % TAU; if (dA > Math.PI) dA = TAU - dA;   // a light running round the joined ring, through everyone
                const run = Math.exp(-dA * dA / 0.18);
                a = mix(a, p.nuc ? 1 : 0.5 + 0.4 * p.s, J) * (1 + 0.6 * run * J); white += (0.1 + 0.35 * run) * J;
            }
            o.pos[i3] = x; o.pos[i3 + 1] = y; o.pos[i3 + 2] = z;
            o.size[i] = p.nuc ? 0.042 : 0.026 + 0.03 * p.s * p.s;
            o.alpha[i] = a; o.blur[i] = Math.min(p.nuc ? 0.12 : 0.6, Math.abs(z) * 0.14);
            v.color(p.hue, white, o.col, i3);
        }
    },
};

const SCENES = { people: PEOPLE, focus: FOCUS };

function mount(host, def) {
    const item = host.closest('.item') || host;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) { return null; }
    host.appendChild(canvas);
    const PR = Math.min(devicePixelRatio || 1, 2);
    gl.setPixelRatio(PR); gl.setClearColor(0x000000, 1);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60); camera.position.set(0, 0, CAM_Z);

    const R = rng(def.seed), state = def.create(def.count, R), M = def.count + (def.extra || 0);
    const cur = { pos: new Float32Array(M * 3), col: new Float32Array(M * 3), size: new Float32Array(M), alpha: new Float32Array(M), blur: new Float32Array(M) };
    const tgt = { pos: new Float32Array(M * 3), col: new Float32Array(M * 3), size: new Float32Array(M), alpha: new Float32Array(M), blur: new Float32Array(M) };
    const lag = new Float32Array(M); for (let i = 0; i < M; i++) lag[i] = 0.7 + 0.6 * R();
    const geo = new THREE.BufferGeometry();
    const attr = (name, arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    const aPos = attr('position', cur.pos, 3), aCol = attr('aColor', cur.col, 3), aSize = attr('aSize', cur.size, 1), aAlpha = attr('aAlpha', cur.alpha, 1), aBlur = attr('aBlur', cur.blur, 1);
    const mat = new THREE.ShaderMaterial({ uniforms: { uPR: { value: PR }, uScale: { value: 500 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
    let streak = null;
    if (def.streaks) {
        const lg = new THREE.BufferGeometry(), lp = new Float32Array(M * 6), lc = new Float32Array(M * 6);
        lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3).setUsage(THREE.DynamicDrawUsage));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        lines.frustumCulled = false; scene.add(lines);
        streak = { lg, lp, lc, prev: new Float32Array(M * 3), vel: new Float32Array(M * 3), primed: false, mute: 0 };
    }

    // the picked colour, pushed vivid (as the particle layer does), polled while drawing
    const acc = { h: 0.56, s: 0.85, l: 0.6 }, tmp = new THREE.Color();
    let colorKey = null;
    function pollColor() {
        let c = ''; try { c = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(); } catch (e) {}
        if (c === colorKey) return false; colorKey = c;
        const hsl = { h: 0, s: 0, l: 0 }; try { tmp.setStyle(c || '#4faad1'); } catch (e) { tmp.set(0x4faad1); } tmp.getHSL(hsl);
        acc.h = hsl.h; acc.s = Math.max(hsl.s, 0.8); acc.l = 0.6;
        return true;
    }
    const view = {
        halfW: HALF_H, halfH: HALF_H, cy: 0, fit: 1,
        color(hueOff, white, out, i3) {
            tmp.setHSL(((acc.h + hueOff) % 1 + 1) % 1, acc.s, acc.l);
            const w = clamp01(white); out[i3] = mix(tmp.r, 1, w); out[i3 + 1] = mix(tmp.g, 1, w); out[i3 + 2] = mix(tmp.b, 1, w);
        },
    };
    function size() {
        const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return false;
        gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
        mat.uniforms.uScale.value = h / (2 * Math.tan(FOV / 2 * Math.PI / 180));
        view.halfW = HALF_H * camera.aspect; view.halfH = HALF_H;
        if (streak) streak.mute = 0.35;
        layout();
        return true;
    }
    // the card's title and text sit over its lower part (all of its text once open): the picture centres in the free area above and shrinks
    // to fit it (a change glides: positions are targets)
    const desc = item.querySelector('.item-desc');
    function layout() {
        const h = host.clientHeight; if (!h) return;
        const free = Math.max(h * 0.3, h - (desc ? desc.offsetHeight : 0) - 8);
        view.cy = HALF_H * (1 - free / h); view.fit = Math.max(0.5, Math.min(1, free / h / 0.62));
    }

    const stillAt = () => reduced && def.still !== undefined ? def.still : def.rest;
    let playT = 0;
    let ct = def.rest, time = 0, raf = 0, last = 0, settle = 0, visible = false, hover = false, active = item.classList.contains('active'), polled = 0;
    const playing = () => !reduced && (freezeAt === null) && (active || hover);
    function compute(rest) { def.targets(state, ct, time, view, tgt, rest); }
    function snap() { if (streak) { streak.primed = false; streak.lc.fill(0); } const r = freezeAt === null && !playing(); compute(r); compute(r);   /* twice: the glow at the point reads the mass the first pass gathered */cur.pos.set(tgt.pos); cur.col.set(tgt.col); cur.size.set(tgt.size); cur.alpha.set(tgt.alpha); cur.blur.set(tgt.blur); }
    function upload() { aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = aBlur.needsUpdate = true; }
    function frame(now) {
        raf = 0; if (!visible) return;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
        if (now - polled > 600) { polled = now; pollColor(); }
        const play = playing();
        time += dt;
        if (play) { ct = (ct + dt) % def.T; settle = 0; playT += dt; } else { ct = def.rest; settle += dt; playT = 0; }
        compute(!play);
        const kp = 1 - Math.exp(-dt * (def.follow ? def.follow(play, playT) : 4.2)), kc = 1 - Math.exp(-dt * 7);
        const { pos, col, size: sz, alpha, blur } = cur;
        for (let i = 0; i < M; i++) {
            const f = Math.min(1, kp * lag[i]), i3 = i * 3;
            pos[i3] += (tgt.pos[i3] - pos[i3]) * f; pos[i3 + 1] += (tgt.pos[i3 + 1] - pos[i3 + 1]) * f; pos[i3 + 2] += (tgt.pos[i3 + 2] - pos[i3 + 2]) * f;
            col[i3] += (tgt.col[i3] - col[i3]) * kc; col[i3 + 1] += (tgt.col[i3 + 1] - col[i3 + 1]) * kc; col[i3 + 2] += (tgt.col[i3 + 2] - col[i3 + 2]) * kc;
            sz[i] += (tgt.size[i] - sz[i]) * kc; alpha[i] += (tgt.alpha[i] - alpha[i]) * kc; blur[i] += (tgt.blur[i] - blur[i]) * kc;
        }
        if (streak) {
            const { lp, lc, prev, vel } = streak, kv = 1 - Math.exp(-dt * 12);
            if (!streak.primed || streak.mute > 0) { prev.set(pos); vel.fill(0); streak.primed = true; streak.mute -= dt; }   // a card resizing moves the field: no trails for that
            for (let i = 0; i < def.count; i++) {   // the specks only: the glows and the shockwave draw no trails
                const i3 = i * 3, i6 = i * 6;
                let sp = 0;
                for (let c = 0; c < 3; c++) { vel[i3 + c] += ((pos[i3 + c] - prev[i3 + c]) / Math.max(dt, 1e-3) - vel[i3 + c]) * kv; sp += vel[i3 + c] * vel[i3 + c]; }
                sp = Math.sqrt(sp);
                const k = clamp01((sp - 0.8) / 6) * alpha[i] * (1 - blur[i]) * 0.55, len = Math.min(0.07, 0.6 / Math.max(sp, 1e-3));   // at most 0.6 world units long
                for (let c = 0; c < 3; c++) { lp[i6 + c] = pos[i3 + c]; lp[i6 + 3 + c] = pos[i3 + c] - vel[i3 + c] * len; lc[i6 + c] = col[i3 + c] * k; lc[i6 + 3 + c] = 0; }
            }
            prev.set(pos);
            streak.lg.attributes.position.needsUpdate = streak.lg.attributes.color.needsUpdate = true;
        }
        upload(); gl.render(scene, camera);
        if (play || settle < 3) raf = requestAnimationFrame(frame);   // at rest the specks keep drifting a moment while they settle, then the frame holds
    }
    function drawStill() { if (!size()) return; pollColor(); if (freezeAt !== null) { ct = freezeAt % def.T; time = freezeAt; } else if (reduced) ct = stillAt(); snap(); upload(); gl.render(scene, camera); }
    function wake() { if (visible && !raf && !reduced && freezeAt === null) { last = 0; raf = requestAnimationFrame(frame); } }

    new MutationObserver(() => {
        const a = item.classList.contains('active');
        if (a && !active && !hover) ct = def.start;
        active = a; settle = 0; wake();
    }).observe(item, { attributes: true, attributeFilter: ['class'] });
    if (!coarse) {
        item.addEventListener('pointerenter', () => { if (!active && !hover) ct = def.start; hover = true; settle = 0; wake(); });
        item.addEventListener('pointerleave', () => { hover = false; settle = 0; wake(); });
    }
    if (desc) new ResizeObserver(() => { layout(); if (!raf && !reduced && freezeAt === null) { settle = Math.min(settle, 2.5); wake(); } else if (!raf) drawStill(); }).observe(desc);
    // resizing clears the canvas, and resize callbacks run after the frame has drawn: draw again at once or the card blinks black while it opens
    new ResizeObserver(() => { if (!size()) return; gl.render(scene, camera); if (!raf) { if (reduced || freezeAt !== null) drawStill(); else { settle = Math.min(settle, 2.5); wake(); } } }).observe(host);
    new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible) wake(); }, { rootMargin: '15% 0px' }).observe(host);

    drawStill();
    return { host, get ct() { return ct; } };
}

const mounted = [];
document.querySelectorAll('[data-principle-cloud]').forEach(host => {
    const def = SCENES[host.dataset.principleCloud];
    if (def) { const m = mount(host, def); if (m) mounted.push(m); }
});
window.__principleClouds = mounted;
