/* silk-2d.js: the principles section's silk ribbon (voyage-fold.js mountSilk, style 'ribbon') drawn on the CPU, for a browser without
 * graphics acceleration. Started by work-spine.js when there is no hardware WebGL (or with ?sea=2d).
 *
 * The same sheet from the same numbers (voyage-fold.js's RIBBON): its centre line, its roll from edge-on to facing, its slow breathing on simplex noise, its
 * colour fanned out from the picked hue, the sheen where it turns edge-on and the soft edges, worked out at the corners of a grid over the
 * sheet and filled in between them, triangle by triangle, far ones first, into a pixel buffer at 0.4 of the section's size (the canvas is
 * stretched to the section; the sheet is soft, and it moves slowly, so 24 frames a second). The fine threads and the grain are left out:
 * at this size they would only shimmer.
 */

// 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence), as the shader's snoise
const mod289 = x => x - Math.floor(x / 289) * 289, permute = x => mod289((x * 34 + 1) * x);
function snoise(vx, vy) {
    const C0 = 0.211324865405187, C1 = 0.366025403784439, C2 = -0.577350269189626, C3 = 0.024390243902439;
    let ix = Math.floor(vx + (vx + vy) * C1), iy = Math.floor(vy + (vx + vy) * C1);
    const x0x = vx - ix + (ix + iy) * C0, x0y = vy - iy + (ix + iy) * C0;
    const i1x = x0x > x0y ? 1 : 0, i1y = 1 - i1x;
    const x1x = x0x + C0 - i1x, x1y = x0y + C0 - i1y, x2x = x0x + C2, x2y = x0y + C2;
    ix = mod289(ix); iy = mod289(iy);
    const p0 = permute(permute(iy) + ix), p1 = permute(permute(iy + i1y) + ix + i1x), p2 = permute(permute(iy + 1) + ix + 1);
    let m0 = Math.max(0.5 - (x0x * x0x + x0y * x0y), 0), m1 = Math.max(0.5 - (x1x * x1x + x1y * x1y), 0), m2 = Math.max(0.5 - (x2x * x2x + x2y * x2y), 0);
    m0 *= m0; m0 *= m0; m1 *= m1; m1 *= m1; m2 *= m2; m2 *= m2;
    const g = (p, xx, xy, m) => { const x = 2 * ((p * C3) % 1) - 1, h = Math.abs(x) - 0.5, a0 = x - Math.floor(x + 0.5); return m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h)) * (a0 * xx + h * xy); };
    return 130 * (g(p0, x0x, x0y, m0) + g(p1, x1x, x1y, m1) + g(p2, x2x, x2y, m2));
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hsl(h, s, l) { const k = n => (n + h * 12) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0), f(8), f(4)]; }
// the picked colour's hue, or null for a grey (judged by its HSL saturation, as the WebGL ribbon does)
const hueOf = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const [r, g, b] = [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d || d / (1 - Math.abs(mx + mn - 1)) < 0.05) return null; return (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; };

export function mountSilk2D(host, { strength = 1, ribbon } = {}) {   // ribbon: voyage-fold.js's RIBBON, handed over by the page's own copy of that module
    if (!host || !ribbon || host.querySelector('.ws-silk')) return null;
    const o = { ...ribbon }, canvas = document.createElement('canvas');
    canvas.className = 'ws-silk'; canvas.setAttribute('aria-hidden', 'true');
    host.classList.add('ws-silk-host'); host.insertBefore(canvas, host.firstChild);
    const ctx = canvas.getContext('2d');
    const NU = 110, NV = 14, NVERT = (NU + 1) * (NV + 1), K = 0.4;   // the grid over the sheet; the buffer's scale (the sheet is soft: 0.4 of the section's size, stretched, reads as at half)
    const P = new Float32Array(NVERT * 3), S = new Float32Array(NVERT * 3), Cc = new Float32Array(NVERT * 4);   // per corner: its place, its place on the screen (x, y, depth), its colour and alpha
    const order = new Int32Array(NU * NV), depth = new Float32Array(NU * NV);
    let W = 0, H = 0, img = null, px = null, acc = null, tmp = null, cols = null, key = '', bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;   // bx/by: the part of the buffer drawn this frame
    const tanH = Math.tan(17.5 * Math.PI / 180), CAM = 12;
    function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; W = canvas.width = Math.max(1, Math.round(w * K)); H = canvas.height = Math.max(1, Math.round(h * K)); img = ctx.createImageData(W, H); px = new Uint32Array(img.data.buffer); acc = new Float32Array(W * H * 4); tmp = new Float32Array(W * H * 4); }
    function color() {
        let c = '', ph = NaN; try { c = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(); ph = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--primary-hue')); } catch (e) {}
        if (c + ph === key) return; key = c + ph;
        let h = hueOf(c); if (h === null) h = isFinite(ph) ? ph / 360 : 0.58;   // a grey pick keeps its hue in --primary-hue
        cols = [hsl((h + o.hueA + 1) % 1, 0.95, 0.66), hsl(h, 0.95, 0.52), hsl((h + o.hueC + 1) % 1, 0.9, 0.4)];
    }
    // the shader's centre line and cross direction (RIBBON_VS)
    const centre = (u, t, out) => {
        const x = (u - 0.5) * o.length, bow = Math.sin(Math.PI * u), ts = t * o.speed;
        out[0] = x; out[1] = o.lift - o.slope * x + o.arcY * bow + o.amp * snoise(u * o.freq, ts); out[2] = o.arcZ * bow + o.amp * 0.8 * snoise(u * o.freq + 17, ts * 0.8);
    };
    const ca = [0, 0, 0], cb = [0, 0, 0], cc = [0, 0, 0];
    function sheet(t) {
        const asp = W / H;
        for (let i = 0; i <= NU; i++) {
            const u = i / NU; centre(u, t, cc); centre(u + 0.002, t, ca); centre(u - 0.002, t, cb);
            let Tx = ca[0] - cb[0], Ty = ca[1] - cb[1], Tz = ca[2] - cb[2]; const tl = Math.hypot(Tx, Ty, Tz) || 1; Tx /= tl; Ty /= tl; Tz /= tl;
            let Bx = Ty, By = -Tx; const bl = Math.hypot(Bx, By) || 1; Bx /= bl; By /= bl;   // cross(T, z): across the sheet, facing the viewer
            const th = o.rollA + (o.rollB - o.rollA) * smooth(o.twistAt - o.twistSpan, o.twistAt + o.twistSpan, u) + 0.3 * snoise(u * 1.3 + 5, t * o.speed * 0.6), c = Math.cos(th), s = Math.sin(th);
            const Cx = Ty * 0 - Tz * By, Cy = Tz * Bx - Tx * 0, Cz = Tx * By - Ty * Bx;   // cross(T, B0)
            const Rx = Bx * c + Cx * s, Ry = By * c + Cy * s, Rz = Cz * s;   // B turned about the centre line
            const Nx = Ty * Rz - Tz * Ry, Ny = Tz * Rx - Tx * Rz, Nz = Tx * Ry - Ty * Rx;   // cross(T, B): the ripple's direction
            const wd = o.width * (1 + (o.taper - 1) * u);
            for (let j = 0; j <= NV; j++) {
                const v = j / NV - 0.5, rp = o.ripple * Math.sin(v * 6 + u * 9 + t * 0.3), q = (i * (NV + 1) + j) * 3;
                const x = cc[0] + Rx * v * wd + Nx * rp, y = cc[1] + Ry * v * wd + Ny * rp, z = cc[2] + Rz * v * wd + Nz * rp;
                P[q] = x; P[q + 1] = y; P[q + 2] = z;
                const dz = CAM - z; S[q] = (x / (dz * tanH * asp) * 0.5 + 0.5) * W; S[q + 1] = (0.5 - y / (dz * tanH) * 0.5) * H; S[q + 2] = dz;
            }
        }
        // per corner its colour (RIBBON_FS: the gradient across, deepening toward the calm end, the sheen where the sheet turns edge-on) and alpha
        const [A, B, C] = cols, al = Math.min(1, strength);   // (the shader's uAlpha)
        for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
            const u = i / NU, v = j / NV, q = i * (NV + 1) + j, q3 = q * 3;
            const iu = Math.min(NU - 1, i), jv = Math.min(NV - 1, j), a3 = (iu * (NV + 1) + jv) * 3, b3 = ((iu + 1) * (NV + 1) + jv) * 3, c3 = (iu * (NV + 1) + jv + 1) * 3;
            const ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2], vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1;
            let ex = -P[q3], ey = -P[q3 + 1], ez = CAM - P[q3 + 2]; const el = Math.hypot(ex, ey, ez) || 1;
            const sheen = Math.min(1, Math.max(0, o.sheen * Math.pow(1 - Math.abs((nx * ex + ny * ey + nz * ez) / nl / el), 3))) * 0.65;
            const g1 = smooth(0, 0.55, v), g2 = smooth(0.45, 1, v), dim = 1 + (0.55 - 1) * smooth(0.35, 1, u) * o.shade, q4 = q * 4;
            for (let k = 0; k < 3; k++) { const base = ((A[k] + (B[k] - A[k]) * g1) * (1 - g2) + C[k] * g2) * dim; Cc[q4 + k] = base + (1 - base) * sheen; }
            Cc[q4 + 3] = smooth(0, o.edge, v) * smooth(0, o.edge, 1 - v) * smooth(0, 0.1, u) * smooth(0, 0.1, 1 - u) * al;
        }
    }
    // one triangle, its colour and alpha linear across it, laid over what is under it (premultiplied light in acc)
    function tri(a, b, c) {   // (per row: the span inside the three edges solved at once, the colour and alpha stepped along it)
        const ax = S[a * 3], ay = S[a * 3 + 1], bx = S[b * 3], by = S[b * 3 + 1], cx = S[c * 3], cy = S[c * 3 + 1];
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-6) return;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        if (x1 < x0 || y1 < y0) return;
        if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
        const ia = 1 / area, A4 = a * 4, B4 = b * 4, C4 = c * 4;
        const d0 = (by - cy) * ia, d1 = (cy - ay) * ia, d2 = -d0 - d1;   // each weight's step along a row
        const cR = Cc[A4] * Cc[A4 + 3], cG = Cc[A4 + 1] * Cc[A4 + 3], cB = Cc[A4 + 2] * Cc[A4 + 3];   // (the colour carried premultiplied, so it steps linearly)
        const eR = Cc[B4] * Cc[B4 + 3], eG = Cc[B4 + 1] * Cc[B4 + 3], eB = Cc[B4 + 2] * Cc[B4 + 3], fR = Cc[C4] * Cc[C4 + 3], fG = Cc[C4 + 1] * Cc[C4 + 3], fB = Cc[C4 + 2] * Cc[C4 + 3];
        const aA = Cc[A4 + 3], aB = Cc[B4 + 3], aC = Cc[C4 + 3];
        const sR = d0 * cR + d1 * eR + d2 * fR, sG = d0 * cG + d1 * eG + d2 * fG, sB = d0 * cB + d1 * eB + d2 * fB, sA = d0 * aA + d1 * aB + d2 * aC;
        for (let y = y0; y <= y1; y++) {
            const py = y + 0.5, px0 = x0 + 0.5;
            const w0 = ((bx - px0) * (cy - py) - (cx - px0) * (by - py)) * ia, w1 = ((cx - px0) * (ay - py) - (ax - px0) * (cy - py)) * ia, w2 = 1 - w0 - w1;
            let lo = 0, hi = x1 - x0;   // the span's ends, in steps from x0
            if (d0 > 0) lo = Math.max(lo, Math.ceil(-w0 / d0 - 1e-9)); else if (d0 < 0) hi = Math.min(hi, Math.floor(w0 / -d0 + 1e-9)); else if (w0 < 0) continue;
            if (d1 > 0) lo = Math.max(lo, Math.ceil(-w1 / d1 - 1e-9)); else if (d1 < 0) hi = Math.min(hi, Math.floor(w1 / -d1 + 1e-9)); else if (w1 < 0) continue;
            if (d2 > 0) lo = Math.max(lo, Math.ceil(-w2 / d2 - 1e-9)); else if (d2 < 0) hi = Math.min(hi, Math.floor(w2 / -d2 + 1e-9)); else if (w2 < 0) continue;
            if (hi < lo) continue;
            let R = w0 * cR + w1 * eR + w2 * fR + lo * sR, G = w0 * cG + w1 * eG + w2 * fG + lo * sG, B = w0 * cB + w1 * eB + w2 * fB + lo * sB, al = w0 * aA + w1 * aB + w2 * aC + lo * sA;
            for (let k = lo, q = (y * W + x0 + lo) * 4; k <= hi; k++, q += 4, R += sR, G += sG, B += sB, al += sA) {
                if (al < 0.003) continue;
                const m = 1 - al; acc[q] = R + acc[q] * m; acc[q + 1] = G + acc[q + 1] * m; acc[q + 2] = B + acc[q + 2] * m; acc[q + 3] = al + acc[q + 3] * m;
            }
        }
    }
    // a 1-2-1 blur across and down where the sheet turns edge-on (past the twist): its fold is a thin silhouette there, and at this buffer's
    // size its edge would step; the rest of the sheet has soft edges of its own
    function soften() {   // (only where the opacity changes, and only past the twist, where the sheet turns edge-on)
        if (bx1 < bx0) return;
        let xt = W; for (let i = Math.max(0, Math.floor(o.twistAt * NU)); i <= NU; i++) for (let j = 0; j <= NV; j++) xt = Math.min(xt, S[(i * (NV + 1) + j) * 3]);
        const x0 = Math.max(0, bx0 - 1, Math.floor(xt) - 2), x1 = Math.min(W - 1, bx1 + 1), y0 = Math.max(0, by0 - 1), y1 = Math.min(H - 1, by1 + 1), E = 0.01;
        for (let y = Math.max(0, y0 - 1), ye = Math.min(H - 1, y1 + 1); y <= ye; y++) for (let x = x0; x <= x1; x++) {   // (a row more each way: the pass down reads them)
            const q = (y * W + x) * 4, l = x > 0 ? q - 4 : q, r = x < W - 1 ? q + 4 : q, a = acc[q + 3];
            if (Math.abs(acc[l + 3] - a) < E && Math.abs(acc[r + 3] - a) < E) { tmp[q] = acc[q]; tmp[q + 1] = acc[q + 1]; tmp[q + 2] = acc[q + 2]; tmp[q + 3] = a; continue; }
            tmp[q] = (acc[l] + 2 * acc[q] + acc[r]) * 0.25; tmp[q + 1] = (acc[l + 1] + 2 * acc[q + 1] + acc[r + 1]) * 0.25;
            tmp[q + 2] = (acc[l + 2] + 2 * acc[q + 2] + acc[r + 2]) * 0.25; tmp[q + 3] = (acc[l + 3] + 2 * a + acc[r + 3]) * 0.25;
        }
        const row = W * 4;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const q = (y * W + x) * 4, u = y > 0 ? q - row : q, d = y < H - 1 ? q + row : q, a = tmp[q + 3];
            if (Math.abs(tmp[u + 3] - a) < E && Math.abs(tmp[d + 3] - a) < E) { acc[q] = tmp[q]; acc[q + 1] = tmp[q + 1]; acc[q + 2] = tmp[q + 2]; acc[q + 3] = a; continue; }
            acc[q] = (tmp[u] + 2 * tmp[q] + tmp[d]) * 0.25; acc[q + 1] = (tmp[u + 1] + 2 * tmp[q + 1] + tmp[d + 1]) * 0.25;
            acc[q + 2] = (tmp[u + 2] + 2 * tmp[q + 2] + tmp[d + 2]) * 0.25; acc[q + 3] = (tmp[u + 3] + 2 * a + tmp[d + 3]) * 0.25;
        }
    }
    function draw(t) {
        if (!W) return; const now = performance.now(); if (now - polled > 600 || !cols) { polled = now; color(); } sheet(t); acc.fill(0); bx0 = W; by0 = H; bx1 = -1; by1 = -1;
        for (let i = 0, n = 0; i < NU; i++) for (let j = 0; j < NV; j++, n++) { order[n] = n; const q = (i * (NV + 1) + j) * 3; depth[n] = S[q + 2] + S[q + 3 * (NV + 1) + 2]; }   // far quads first
        const ord = Array.from(order).sort((m, n) => depth[n] - depth[m]);
        for (const n of ord) { const i = (n / NV) | 0, j = n % NV, a = i * (NV + 1) + j, b = a + NV + 1; tri(a, b, b + 1); tri(a, b + 1, a + 1); }
        soften();
        px.fill(0); if (bx1 < bx0) { ctx.putImageData(img, 0, 0); return; }
        for (let y = Math.max(0, by0 - 2), ye = Math.min(H - 1, by1 + 2); y <= ye; y++) for (let x = Math.max(0, bx0 - 2), xe = Math.min(W - 1, bx1 + 2), q = y * W + x; x <= xe; x++, q++) {   // (the drawn part, and the blur's reach round it)
            const a = acc[q * 4 + 3]; if (!(a > 0.002)) continue;
            const ia = 255 / a; px[q] = (Math.min(255, a * 255) << 24) | (Math.min(255, acc[q * 4 + 2] * ia) << 16) | (Math.min(255, acc[q * 4 + 1] * ia) << 8) | Math.min(255, acc[q * 4] * ia);
        }
        ctx.putImageData(img, 0, 0);
    }
    let visible = false, raf = 0, last = 0, polled = -1e9;
    const prof = /[?&]prof\b/.test(location.search) ? (window.__silkP = { n: 0, ms: 0 }) : null;
    const t0 = performance.now();
    function frame(now) {
        raf = 0; if (!visible) return;
        raf = requestAnimationFrame(frame);
        if (now - last < 40) return; last = now;   // 24 a second: it moves very slowly (its clock runs at 0.08)
        const d0 = performance.now(); draw((now - t0) / 1000);
        if (prof) { prof.n++; prof.ms += performance.now() - d0; }   // ?prof: window.__silkP, the drawing's own time
    }
    size(); new ResizeObserver(() => { size(); draw((performance.now() - t0) / 1000); }).observe(host);
    new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { rootMargin: '10% 0px' }).observe(host);
    return { canvas };
}
