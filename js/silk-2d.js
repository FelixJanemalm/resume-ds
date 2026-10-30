/* silk-2d.js: the principles section's silk ribbon (voyage-fold.js mountSilk, style 'ribbon') drawn on the CPU, for a browser without
 * graphics acceleration. Reached with ?sea=2d while it is reviewed.
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
    let W = 0, H = 0, img = null, px = null, acc = null, cols = null, key = '';
    const tanH = Math.tan(17.5 * Math.PI / 180), CAM = 12;
    function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; W = canvas.width = Math.max(1, Math.round(w * K)); H = canvas.height = Math.max(1, Math.round(h * K)); img = ctx.createImageData(W, H); px = new Uint32Array(img.data.buffer); acc = new Float32Array(W * H * 4); }
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
    function tri(a, b, c) {
        const ax = S[a * 3], ay = S[a * 3 + 1], bx = S[b * 3], by = S[b * 3 + 1], cx = S[c * 3], cy = S[c * 3 + 1];
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-6) return;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        if (x1 < x0 || y1 < y0) return;
        const ia = 1 / area, A4 = a * 4, B4 = b * 4, C4 = c * 4;
        for (let y = y0; y <= y1; y++) {
            const py = y + 0.5;
            for (let x = x0; x <= x1; x++) {
                const pxx = x + 0.5;
                const w0 = ((bx - pxx) * (cy - py) - (cx - pxx) * (by - py)) * ia, w1 = ((cx - pxx) * (ay - py) - (ax - pxx) * (cy - py)) * ia, w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                const al = w0 * Cc[A4 + 3] + w1 * Cc[B4 + 3] + w2 * Cc[C4 + 3]; if (al < 0.003) continue;
                const q = (y * W + x) * 4, k = 1 - al;
                acc[q] = (w0 * Cc[A4] + w1 * Cc[B4] + w2 * Cc[C4]) * al + acc[q] * k;
                acc[q + 1] = (w0 * Cc[A4 + 1] + w1 * Cc[B4 + 1] + w2 * Cc[C4 + 1]) * al + acc[q + 1] * k;
                acc[q + 2] = (w0 * Cc[A4 + 2] + w1 * Cc[B4 + 2] + w2 * Cc[C4 + 2]) * al + acc[q + 2] * k;
                acc[q + 3] = al + acc[q + 3] * k;
            }
        }
    }
    function draw(t) {
        if (!W) return; const now = performance.now(); if (now - polled > 600 || !cols) { polled = now; color(); } sheet(t); acc.fill(0);
        for (let i = 0, n = 0; i < NU; i++) for (let j = 0; j < NV; j++, n++) { order[n] = n; const q = (i * (NV + 1) + j) * 3; depth[n] = S[q + 2] + S[q + 3 * (NV + 1) + 2]; }   // far quads first
        const ord = Array.from(order).sort((m, n) => depth[n] - depth[m]);
        for (const n of ord) { const i = (n / NV) | 0, j = n % NV, a = i * (NV + 1) + j, b = a + NV + 1; tri(a, b, b + 1); tri(a, b + 1, a + 1); }
        for (let q = 0, n = W * H; q < n; q++) {
            const a = acc[q * 4 + 3]; if (!(a > 0.002)) { px[q] = 0; continue; }
            const ia = 255 / a; px[q] = (Math.min(255, a * 255) << 24) | (Math.min(255, acc[q * 4 + 2] * ia) << 16) | (Math.min(255, acc[q * 4 + 1] * ia) << 8) | Math.min(255, acc[q * 4] * ia);
        }
        ctx.putImageData(img, 0, 0);
    }
    let visible = false, raf = 0, last = 0, polled = -1e9;
    const t0 = performance.now();
    function frame(now) {
        raf = 0; if (!visible) return;
        raf = requestAnimationFrame(frame);
        if (now - last < 40) return; last = now;   // 24 a second: it moves very slowly (its clock runs at 0.08)
        draw((now - t0) / 1000);
    }
    size(); new ResizeObserver(() => { size(); draw((performance.now() - t0) / 1000); }).observe(host);
    new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { rootMargin: '10% 0px' }).observe(host);
    return { canvas };
}
