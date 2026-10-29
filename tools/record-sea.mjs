// record-sea.mjs: records the hero sea down the page, for js/sea-frames.js (the sea for browsers that cannot run it live).
//
// The page runs in headless Chrome with the GPU, on a virtual clock: requestAnimationFrame and performance.now are replaced, so every
// frame of the animation is stepped from here (1/60 s each) and the scroll moves STEP px over PER frames between snapshots, like a slow
// real scroll. The ship's lag behind the scroll and the waves' motion come out as they would live, and the same on every run. Everything
// but the sea's canvas is hidden over a black page (html black, body transparent: a black body would paint over the canvas where it
// sits behind the page), so a frame is the sea light-on-black, ready to be screen-blended over the page. The silk section ground is not
// part of the sea and is left out.
//
// Usage (from resume-ds/, with the site served at http://127.0.0.1:8765/ and puppeteer-core + cwebp installed):
//   node tools/record-sea.mjs desktop 1440 900
// writes images/sea/<name>/f000.webp... and images/sea/<name>.json: { w, h, step, docMax, color, anchors: { id: top }, frames: [[y, z], ...] }
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name = 'desktop', W = '1440', H = '900'] = process.argv.slice(2);
const STEP = 60, PER = 8, DSF = 2, OUT_W = 1920, OUT_H = 1200;   // a frame per 60 px of scroll; stored at 1920 x 1200
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
const man = { w: +W, h: +H, step: STEP, docMax, frames: [], ...await page.evaluate(() => ({
    color: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim(),
    anchors: Object.fromEntries([...document.querySelectorAll('#work, #read, #scalability, footer')].map(e => [e.id || 'footer', Math.round(e.getBoundingClientRect().top + scrollY)])),
})) };
const scrollStep = y => page.evaluate(y => { scrollTo({ top: y, behavior: 'instant' }); window.__step(1); }, y);   // 'instant': the page's smooth scrolling would run on real time
for (let y = 0, n = 0; ; n++) {
    const z = await page.evaluate(() => +getComputedStyle(document.getElementById('ws-particles')).zIndex || 0);
    const png = `${tmp}/f.png`, file = `f${String(n).padStart(3, '0')}.webp`;
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '85', '-sns', '0', '-f', '0', '-sharp_yuv', '-resize', String(OUT_W), String(OUT_H), png, '-o', `${outDir}/${file}`]);   // no smoothing: the faint wave lines survive
    man.frames.push([y, z]);
    if (y >= docMax) break;
    const next = Math.min(docMax, y + STEP);
    for (let k = 1; k <= PER; k++) await scrollStep(y + (next - y) * k / PER);
    y = next;
}
fs.writeFileSync(`images/sea/${name}.json`, JSON.stringify(man));
const bytes = fs.readdirSync(outDir).reduce((s, f) => s + fs.statSync(`${outDir}/${f}`).size, 0);
console.log(`${name}: ${man.frames.length} frames, ${(bytes / 1048576).toFixed(1)} MB, doc ${docMax} px, colour ${man.color}`);
await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
