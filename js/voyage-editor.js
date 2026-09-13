/* voyage-editor.js — the ship's path editor. Dev only: mounted by work-spine.js when the URL has ?route=1.
 *
 * The route is a list of waypoints per orientation (landscape / portrait). Each carries where it sits on the page (`at`, in the
 * vocabulary work-spine.js resolves: top | end | stage-pin | stage-release | stage@f | <selector>:<top|center|bottom>@<v>, with an
 * optional +px/-px), its position on screen (x, y in NDC: -1..1, y up, the waterline centre) and the pose there: size (hull length
 * as a fraction of the viewport width), turn (course: 0 bow right, 90 toward you, 180 bow left), tilt (0 side view .. 90 overhead),
 * heel, level (0 dinghy .. 3 tall ship), wake (0 at rest .. 1 under way), cam (0..1, how much the course follows the direction of
 * travel on screen). Edits apply live, persist in localStorage for this browser while ?route=1 is on the URL, and are handed over
 * with "Copy JSON" to be baked into keyframeTables() in work-spine.js.
 *
 * On screen: the curve the ship travels (blue), a handle per waypoint you can drag, the ship's current position (dot), and the
 * scroll positions each `at` resolves to. "Go" scrolls the page to a waypoint so you see the ship there. */
export function mountRouteEditor(api) {
    const FIELDS = [
        ['x', -1.3, 1.3, 0.005], ['y', -1.1, 1.1, 0.005], ['size', 0.03, 0.7, 0.005], ['turn', -180, 180, 1], ['tilt', 0, 90, 1],
        ['heel', -25, 25, 0.5], ['level', 0, 3, 0.05], ['wake', 0, 1, 0.02], ['cam', 0, 1, 0.05],
    ];
    const orientation = api.orientation();
    let list = clone(api.tables()[orientation]);
    let selected = 0, overlayOn = true, saveTimer = 0;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function clone(l) { return l.map(w => Object.assign({}, w)); }
    function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { api.set(orientation, clone(list)); }, 120); }

    // ── panel
    const panel = document.createElement('div');
    panel.id = 'ws-route';
    panel.setAttribute('style', 'position:fixed;right:12px;top:80px;z-index:100000;width:360px;max-height:calc(100vh - 100px);overflow:auto;box-sizing:border-box;padding:10px 12px;background:rgba(10,12,16,.94);color:#e8ecf1;font:12px/1.4 ui-monospace,Menlo,monospace;text-align:left;border-radius:8px;border:1px solid rgba(255,255,255,.12)');
    const B = 'position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;padding:4px 8px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer';
    panel.innerHTML = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><b style="letter-spacing:.08em;text-transform:uppercase;flex:1">route · ${orientation}</b>
        <button type="button" data-a="copy" style="${B}">Copy JSON</button><button type="button" data-a="reset" style="${B}">Reset</button><button type="button" data-a="overlay" style="${B}">Overlay</button></div>
        <div data-rows></div>
        <div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-a="add" style="${B}">+ waypoint after selected</button><button type="button" data-a="del" style="${B}">× delete selected</button></div>
        <textarea readonly rows="3" data-out style="width:100%;box-sizing:border-box;margin-top:8px;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.35);color:#cfd6df;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px" placeholder="Copy JSON puts the waypoints here (and on the clipboard) for baking into work-spine.js"></textarea>
        <small style="display:block;margin-top:6px;color:#9aa4b2">drag the handles on the page to move a waypoint · edits apply live and persist here while ?route=1 · select a row to see the pose at that point</small>`;
    document.body.appendChild(panel);
    const rowsEl = panel.querySelector('[data-rows]'), out = panel.querySelector('[data-out]');

    function renderRows() {
        rowsEl.innerHTML = list.map((w, i) => {
            const at = api.resolveAt(String(w.at)), sel = i === selected;
            return `<div data-i="${i}" style="border:1px solid rgba(255,255,255,${sel ? '.35' : '.08'});border-radius:6px;padding:6px 8px;margin:4px 0;background:${sel ? 'rgba(79,170,209,.08)' : 'none'}">
                <div style="display:flex;gap:6px;align-items:center"><span style="width:18px;color:#9aa4b2">${i}</span>
                    <input data-at value="${String(w.at).replace(/"/g, '&quot;')}" style="flex:1;font:inherit;background:rgba(0,0,0,.35);color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:2px 6px">
                    <span style="color:#9aa4b2;width:52px;text-align:right">${at === null ? '?' : Math.round(at) + 'px'}</span><button type="button" data-go style="${B};padding:2px 7px">Go</button></div>
                ${sel ? FIELDS.map(([k, min, max, st]) => `<label style="display:grid;grid-template-columns:44px 1fr 46px;gap:6px;align-items:center;margin:2px 0"><span>${k}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${w[k]}"><output style="text-align:right">${w[k]}</output></label>`).join('') : ''}
            </div>`;
        }).join('');
    }
    panel.addEventListener('input', e => {
        const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i, w = list[i];
        if (e.target.dataset.k) { w[e.target.dataset.k] = +e.target.value; e.target.nextElementSibling.value = e.target.value; }
        else if (e.target.hasAttribute('data-at')) w.at = e.target.value;
        save(); drawOverlay();
    });
    panel.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a === 'copy') { out.value = JSON.stringify(list.map(w => { const o = {}; for (const k of ['at', ...FIELDS.map(f => f[0])]) o[k] = w[k]; return o; }), null, 1); out.select(); navigator.clipboard?.writeText(out.value).catch(() => {}); return; }
        if (a === 'reset') { api.reset(); list = clone(api.defaults()[orientation]); selected = 0; renderRows(); drawOverlay(); return; }
        if (a === 'overlay') { overlayOn = !overlayOn; svg.style.display = overlayOn ? 'block' : 'none'; return; }
        if (a === 'add') { const w = Object.assign({}, list[selected]); w.at = String(w.at) + '+80'; list.splice(selected + 1, 0, w); selected++; save(); renderRows(); drawOverlay(); return; }
        if (a === 'del') { if (list.length > 2) { list.splice(selected, 1); selected = Math.max(0, selected - 1); save(); renderRows(); drawOverlay(); } return; }
        const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i;
        if (e.target.hasAttribute('data-go')) { const at = api.resolveAt(String(list[i].at)); if (at !== null) { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, at); } }
        if (i !== selected && !e.target.matches('input,button')) { selected = i; renderRows(); drawOverlay(); }
    });

    // ── overlay: the curve, the handles, the ship's current position
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;z-index:99999;pointer-events:none;overflow:visible');
    document.body.appendChild(svg);
    const NS = 'http://www.w3.org/2000/svg', el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const curve = el('path', { fill: 'none', stroke: '#4faad1', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.8 });
    const shipDot = el('circle', { r: 5, fill: '#fff', opacity: 0.9 });
    const handles = el('g', {}); svg.append(curve, handles, shipDot);
    const _o = {};
    function drawOverlay() {
        const keys = api.keys(); if (!keys.length) return;
        // the curve is sampled from the live route (which already includes the edits), between the first and last resolved scroll
        const s0 = keys[0].y, s1 = keys[keys.length - 1].y, pts = [];
        for (let i = 0; i <= 240; i++) { const r = api.sample(s0 + (s1 - s0) * i / 240, _o); if (!r) break; pts.push(api.toPx(r.x, r.y)); }
        curve.setAttribute('d', pts.length ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') : '');
        handles.innerHTML = '';
        list.forEach((w, i) => {
            const [px, py] = api.toPx(w.x, w.y), g = el('g', { transform: `translate(${px} ${py})`, style: 'pointer-events:auto;cursor:grab' });
            g.append(el('circle', { r: i === selected ? 9 : 6, fill: i === selected ? '#4faad1' : 'rgba(79,170,209,.35)', stroke: '#fff', 'stroke-width': 1 }));
            const t = el('text', { x: 12, y: 4, fill: '#fff', 'font-size': 11, 'font-family': 'ui-monospace,Menlo,monospace', style: 'paint-order:stroke;stroke:rgba(0,0,0,.7);stroke-width:3px' }); t.textContent = i + ' ' + w.at; g.append(t);
            g.addEventListener('pointerdown', ev => {
                ev.preventDefault(); g.setPointerCapture(ev.pointerId); selected = i; renderRows();
                const move = m => { const [nx, ny] = api.fromPx(m.clientX, m.clientY); w.x = +clamp(nx, -1.3, 1.3).toFixed(3); w.y = +clamp(ny, -1.1, 1.1).toFixed(3); save(); drawOverlay(); syncSliders(); };
                const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); };
                g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
            });
            handles.append(g);
        });
    }
    function syncSliders() { for (const inp of rowsEl.querySelectorAll('[data-i="' + selected + '"] input[type=range]')) { inp.value = list[selected][inp.dataset.k]; inp.nextElementSibling.value = inp.value; } }
    function tick() { const p = api.pose(); if (p && p.x !== undefined) { const [px, py] = api.toPx(p.x, p.y); shipDot.setAttribute('cx', px); shipDot.setAttribute('cy', py); } requestAnimationFrame(tick); }
    addEventListener('resize', drawOverlay); addEventListener('scroll', () => { if (overlayOn) drawOverlay(); }, { passive: true });
    renderRows(); setTimeout(drawOverlay, 1200); requestAnimationFrame(tick);
    console.info('work-spine: route editor mounted (' + orientation + '). Edits persist in this browser while ?route=1 is on the URL; Copy JSON to bake them in.');
}
