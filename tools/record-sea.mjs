// record-sea.mjs: records the hero sea down the page, for js/sea-frames.js (the sea for browsers that cannot run it live).
//
// The page runs in headless Chrome with the GPU, on a virtual clock: requestAnimationFrame and performance.now are replaced, so every
// frame of the animation is stepped from here (1/60 s each) and the scroll moves STEP px over PER frames between snapshots, like a
// slow real scroll. The ship's lag behind the scroll and the waves' motion come out as they would live, and the same on every run. Everything
// but the sea's canvas is hidden over a black page (html black, body transparent: a black body would paint over the canvas where it
// sits behind the page), so a frame is the sea light-on-black, ready to be screen-blended over the page. The silk section ground is not
// part of the sea and is left out.
//
// Two recordings come out, both H.264 at 1280 x 800: scroll.mp4, a frame per STEP px of scroll (frame i at (i + 0.5) / FPS s, a keyframe
// every 5 frames so any frame decodes fast when the reader scrolls), and at every CLIP_EVERY-th frame a clip, c<frame>.mp4: time runs on
// while the scroll holds, LOOP frames at 24 fps from that very frame, then back again, so it loops without a seam.
//
// Usage (from resume-ds/, with the site served at http://127.0.0.1:8765/, puppeteer-core and ffmpeg installed):
//   node tools/record-sea.mjs desktop 1440 900
// writes images/sea/<name>/scroll.mp4, c0000.mp4... and images/sea/<name>.json:
// { w, h, step, fps, docMax, color, anchors: { id: top }, frames: [[y, z], ...], clips: [frame index, ...] }. SEA_LOOP=0 skips the clips.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name = 'desktop', W = '1440', H = '900'] = process.argv.slice(2);
const STEP = 12, PER = 2, FPS = 30, CLIP_EVERY = 5, DSF = 2, OUT_W = 1280, OUT_H = 800;   // a frame per 12 px of scroll, a clip every 60 px
const LOOP = +(process.env.SEA_LOOP ?? 48);   // each clip: LOOP frames at 24 fps, there and back
const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'grain', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];
const fit = `scale=${OUT_W}:${OUT_H}:flags=lanczos`, pad = n => String(n).padStart(4, '0');
const URL0 = process.env.SEA_URL || 'http://127.0.0.1:8765/';
const outDir = `images/sea/${name}`, tmp = fs.mkdtempSync('/tmp/record-sea-');
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: `${tmp}/profile`,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: DSF });
await page.evaluateOnNewDocument(() => {
    let vt = 1000; const cbs = new Map(); let id = 0;
    performance.now = () => vt;
    window.requestAnimationFrame = cb => { cbs.set(++id, cb); return id; };
    window.cancelAnimationFrame = i => cbs.delete(i);
    window.__step = (n, dt = 1000 / 60) => { for (let k = 0; k < n; k++) { vt += dt; const list = [...cbs.values()]; cbs.clear(); for (const cb of list) { try { cb(vt); } catch (e) { console.error(e.message); } } } };
    const get = HTMLCanvasElement.prototype.getContext;   // the screenshot reads the canvas between our steps: keep its buffer
    HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? get.call(this, t, Object.assign({}, o, { preserveDrawingBuffer: true })) : get.call(this, t, o); };
    addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = 'html{background:#000!important} body{background:transparent!important} body *{visibility:hidden!important}'
            + ' #ws-particles{visibility:visible!important;transition:none!important} .ws-silk{display:none!important}';
        document.head.appendChild(s);
    });
});
await page.goto(URL0, { waitUntil: 'load' });
for (let i = 0; i < 80; i++) {   // modules and shader compiles run on real time; the animation only on our steps
    await page.evaluate(() => window.__step(6)); await new Promise(r => setTimeout(r, 60));
    if (await page.evaluate(() => document.getElementById('ws-particles')?.style.opacity === '1')) break;
}
if (!await page.evaluate(() => document.getElementById('ws-particles')?.style.opacity === '1')) throw new Error('the live sea never showed');
await page.evaluate(() => window.__step(180));   // the intro settles

const docMax = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const man = { w: +W, h: +H, step: STEP, fps: FPS, docMax, frames: [], clips: [], ...await page.evaluate(() => ({
    color: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(),
    anchors: Object.fromEntries([...document.querySelectorAll('#work, #read, #scalability, footer')].map(e => [e.id || 'footer', Math.round(e.getBoundingClientRect().top + scrollY)])),
})) };
const scrollStep = y => page.evaluate(y => { scrollTo({ top: y, behavior: 'instant' }); window.__step(1); }, y);   // 'instant': the page's smooth scrolling would run on real time
fs.mkdirSync(`${tmp}/scroll`);
for (let y = 0, n = 0; ; n++) {
    const z = await page.evaluate(() => +getComputedStyle(document.getElementById('ws-particles')).zIndex || 0);
    const png = `${tmp}/scroll/s${pad(n)}.png`;
    await page.screenshot({ path: png });
    man.frames.push([y, z]);
    if (LOOP > 1 && n % CLIP_EVERY === 0) {   // the clip: time runs on from this frame while the scroll holds
        fs.mkdirSync(`${tmp}/loop`); fs.copyFileSync(png, `${tmp}/loop/l000.png`);
        for (let k = 1; k < LOOP; k++) { await page.evaluate(() => window.__step(5, 1000 / 120)); await page.screenshot({ path: `${tmp}/loop/l${String(k).padStart(3, '0')}.png` }); }
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '24', '-i', `${tmp}/loop/l%03d.png`, '-filter_complex',
            `[0]${fit},split[a][b];[b]reverse,trim=start_frame=1:end_frame=${LOOP - 1},setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1`, ...x264, `${outDir}/c${pad(n)}.mp4`]);
        man.clips.push(n);
        fs.rmSync(`${tmp}/loop`, { recursive: true });
    }
    if (y >= docMax) break;
    const next = Math.min(docMax, y + STEP);
    for (let k = 1; k <= PER; k++) await scrollStep(y + (next - y) * k / PER);
    y = next;
}
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${tmp}/scroll/s%04d.png`, '-vf', fit,
    '-g', '5', '-keyint_min', '5', '-sc_threshold', '0', '-bf', '0', ...x264, `${outDir}/scroll.mp4`]);
fs.writeFileSync(`images/sea/${name}.json`, JSON.stringify(man));
const bytes = fs.readdirSync(outDir).reduce((s, f) => s + fs.statSync(`${outDir}/${f}`).size, 0);
console.log(`${name}: ${man.frames.length} frames, ${(bytes / 1048576).toFixed(1)} MB, doc ${docMax} px, colour ${man.color}`);
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
