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
 * On screen: the curve the ship travels (blue), a handle per waypoint you can drag, the ship's current position (white dot), and the
 * scroll position each `at` resolves to. "Go" scrolls the page to a waypoint so you see the ship there. */
export function mountRouteEditor(api) {
    const FIELDS = [
        ['x', -1.3, 1.3, 0.005], ['y', -1.1, 1.1, 0.005], ['size', 0.03, 0.7, 0.005], ['turn', -720, 720, 1], ['tilt', 0, 90, 1],   // turn: any angle; the box beside the slider takes what the slider cannot
        ['heel', -25, 25, 0.5], ['level', 0, 3, 0.05], ['wake', 0, 1, 0.02], ['cam', 0, 1, 0.05],
        ['storm', 0, 1, 0.05], ['fleet', 0, 4, 0.05],   // the passage through weather; the small copies of the ship in formation
    ];
    const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const normalise = l => l.map((w, i) => { const o = { at: String(w.at) }; for (const [k, min, max] of FIELDS) { const v = Number(w[k]); o[k] = Number.isFinite(v) ? clamp(v, min, max) : (k === 'cam' ? 0.5 : 0); } return o; });   // stored lists may predate a field or carry junk
    const NLEV = Math.max(1, (api.levels && api.levels()) || 4) - 1; FIELDS[6][2] = NLEV;   // the level slider spans the module's levels
    // the levers: the dynamics and camera settings the layer reads every frame (data-ship-* / data-boat-* attributes on the section)
    const LEVERS = [
        ['sea', [['shipSwell', 'swell height', 0, 4, 0.05], ['shipSwellDir', 'swell direction (deg)', 0, 180, 5], ['shipWave', 'bow wave height', 0, 3, 0.05], ['shipSpray', 'spray', 0, 3, 0.05], ['shipFoam', 'foam', 0, 3, 0.05], ['shipWay', 'water flow', 0, 3, 0.05], ['shipRipple', 'rest ripple drift', 0, 3, 0.05], ['shipRings', 'rest ripple rings (rad/s)', 0, 4, 0.05], ['shipCurrent', 'field drift (x cam)', 0, 3, 0.05], ['shipFieldDim', 'field dim under way', 0, 1, 0.05], ['shipStorm', 'storm strength (x route)', 0, 2, 0.05], ['shipRain', 'storm: rain (units/s)', 0, 4, 0.1], ['shipTrail', 'wake trail life (s; 0 = strip)', 0, 15, 0.5], ['shipFleet', 'fleet strength (x route)', 0, 1, 0.05], ['shipFleetSize', 'fleet: copies size (x)', 0.3, 2, 0.05], ['shipFleetSettle', 'fleet: settle speed (x ship)', 0.2, 4, 0.1], ['shipLines', 'wireframe (x level)', 0, 2, 0.05], ['shipSolid', 'surfaces (x level)', 0, 2, 0.05]]],
        ['ship', [['shipHeelWind', 'wind heel (deg)', 0, 25, 0.5], ['shipBob', 'motion (pitch/heave/roll)', 0, 3, 0.05], ['shipSway', 'scene sway at anchor', 0, 3, 0.05], ['shipSoft', 'soft ship (barely existing)', 0, 1, 0.05], ['shipSoftUntil', 'solid by level', 1, 6, 0.1], ['shipDotsRest', 'dot size at rest (x field)', 1, 2.2, 0.05], ['shipFlap', 'sail flutter', 0, 3, 0.05], ['shipSettle', 'settle speed (/s)', 1, 20, 0.5], ['shipLean', 'banking (deg per deg/s)', -0.2, 0.2, 0.005],
            ['shipAnchor', 'anchor after (s of no scroll; 0 = never)', 0, 10, 0.1], ['shipAnchorOut', 'anchor: way dies over (s)', 0.2, 10, 0.1], ['shipCursorWind', 'cursor is the wind (at anchor)', 0, 2, 0.05], ['shipBurgee', 'burgee', 0, 1, 1]]],
        ['camera', [['shipLag', 'lag angles (s)', 0.1, 2.5, 0.05], ['shipLagPos', 'lag position (s)', 0.1, 2.5, 0.05], ['shipLagSize', 'lag framing (s)', 0.1, 2.5, 0.05], ['shipSoftStart', 'soft start', 0.05, 1, 0.05], ['shipEntry', 'ride-in (s; 0 = loads in place)', 0, 8, 0.1]]],
        ['framing', [['boatX', 'hero x (ndc)', -1, 1, 0.01], ['boatY', 'hero y (ndc)', -1, 1, 0.01], ['boatSize', 'hero size', 0.05, 0.6, 0.005], ['shipWorkY', 'work y (ndc)', -1, 1, 0.01], ['shipWorkSize', 'work size', 0.06, 0.5, 0.005], ['shipWorkTilt', 'work tilt (deg)', 0, 90, 1]]],
    ];
    let orientation = api.orientation(), list = normalise(api.tables()[orientation]);
    let selected = 0, overlayOn = true, saveTimer = 0, dragging = -1;
    function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { api.set(orientation, normalise(list)); drawOverlay(); updateMarks(); }, 120); }

    // ── panel
    const panel = document.createElement('div');
    panel.id = 'ws-route';
    panel.setAttribute('style', 'position:fixed;right:12px;top:80px;z-index:100000;width:360px;max-height:calc(100vh - 100px);overflow:auto;box-sizing:border-box;padding:10px 12px;background:rgba(10,12,16,.94);color:#e8ecf1;font:12px/1.4 ui-monospace,Menlo,monospace;text-align:left;border-radius:8px;border:1px solid rgba(255,255,255,.12)');
    const B = 'position:static;display:inline-block;margin:0;height:auto;width:auto;line-height:1.3;font:inherit;text-transform:none;letter-spacing:0;box-shadow:none;transform:none;padding:4px 8px;border:1px solid rgba(255,255,255,.25);background:none;color:inherit;border-radius:6px;cursor:pointer';
    panel.innerHTML = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><b data-title style="letter-spacing:.08em;text-transform:uppercase;flex:1">route · ${orientation}</b>
        <button type="button" data-a="copy" style="${B}">Copy JSON</button><button type="button" data-a="reset" style="${B}">Reset</button><button type="button" data-a="overlay" style="${B}">Overlay</button></div>
        <details style="margin:0 0 8px"><summary style="cursor:pointer;color:#9aa4b2">levers · sea, ship, camera, framing</summary>
            <div data-levers style="margin-top:6px">${(api.params ? LEVERS : []).map(([grp, rows]) => `<div style="margin:6px 0 2px;letter-spacing:.08em;text-transform:uppercase;color:#9aa4b2">${grp}</div>` + rows.map(([k, l, min, max, st]) => `<label style="display:grid;grid-template-columns:1fr 96px 46px;gap:6px;align-items:center;margin:2px 0"><span>${l}</span><input type="range" data-p="${k}" min="${min}" max="${max}" step="${st}" value="${esc(api.params()[k])}" style="width:96px"><output style="text-align:right">${esc(api.params()[k])}</output></label>`).join('')).join('')}
            <button type="button" data-a="attrs" style="${B};margin-top:6px">Copy levers as data-attributes</button></div></details>
        <div data-rows></div>
        <div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-a="add" style="${B}">+ waypoint after selected</button><button type="button" data-a="del" style="${B}">× delete selected</button></div>
        <textarea readonly rows="3" data-out style="width:100%;box-sizing:border-box;margin-top:8px;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.35);color:#cfd6df;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px" placeholder="Copy JSON puts the waypoints here (and on the clipboard) for baking into work-spine.js"></textarea>
        <small data-note style="display:block;margin-top:6px;color:#9aa4b2">drag the handles on the page to move a waypoint · edits apply live and persist here while ?route=1 · select a row to see its pose · a red anchor does not resolve</small>`;
    document.body.appendChild(panel);
    const rowsEl = panel.querySelector('[data-rows]'), out = panel.querySelector('[data-out]');

    function renderRows() {
        rowsEl.innerHTML = list.map((w, i) => {
            const sel = i === selected;
            return `<div data-i="${i}" style="border:1px solid rgba(255,255,255,${sel ? '.35' : '.08'});border-radius:6px;padding:6px 8px;margin:4px 0;background:${sel ? 'rgba(79,170,209,.08)' : 'none'}">
                <div style="display:flex;gap:6px;align-items:center"><span style="width:18px;color:#9aa4b2">${i}</span>
                    <input data-at value="${esc(w.at)}" style="flex:1;font:inherit;background:rgba(0,0,0,.35);color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:2px 6px">
                    <span data-px style="color:#9aa4b2;width:52px;text-align:right"></span><button type="button" data-go style="${B};padding:2px 7px">Go</button></div>
                ${sel ? FIELDS.map(([k, min, max, st]) => `<label style="display:grid;grid-template-columns:44px 1fr 64px;gap:6px;align-items:center;margin:2px 0"><span>${k}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${esc(w[k])}"><input type="number" data-n="${k}" step="${st}" value="${esc(w[k])}" style="width:64px;box-sizing:border-box;font:inherit;background:rgba(0,0,0,.35);color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:1px 4px;text-align:right"></label>`).join('') : ''}
            </div>`;
        }).join('');
        updateMarks();
    }
    function updateMarks() {   // the scroll each anchor resolves to; red when it does not
        rowsEl.querySelectorAll('[data-i]').forEach(row => {
            const w = list[+row.dataset.i], at = api.resolveAt(String(w.at)), px = row.querySelector('[data-px]'), inp = row.querySelector('[data-at]');
            px.textContent = at === null ? '?' : Math.round(at) + 'px'; inp.style.borderColor = at === null ? '#d9534f' : 'rgba(255,255,255,.15)';
        });
    }
    panel.addEventListener('input', e => {
        if (e.target.dataset.p) { api.setParam(e.target.dataset.p, +e.target.value); e.target.nextElementSibling.value = e.target.value; return; }   // a lever: applied live, kept for this page load; copy them out as attributes to keep
        const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i, w = list[i];
        if (e.target.dataset.k) { w[e.target.dataset.k] = +e.target.value; e.target.nextElementSibling.value = e.target.value; }
        else if (e.target.dataset.n) { const v = Number(e.target.value); if (!Number.isFinite(v)) return; w[e.target.dataset.n] = v; e.target.previousElementSibling.value = v; }   // the box: any value, the slider follows where it can
        else if (e.target.hasAttribute('data-at')) w.at = e.target.value;
        save();
    });
    panel.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a === 'attrs') { out.value = api.attrs(LEVERS.flatMap(g => g[1].map(r => r[0]))); out.select(); navigator.clipboard?.writeText(out.value).catch(() => {}); return; }
        if (a === 'copy') { out.value = JSON.stringify(normalise(list), null, 1); out.select(); navigator.clipboard?.writeText(out.value).catch(() => {}); return; }
        if (a === 'reset') { clearTimeout(saveTimer); api.reset(); list = normalise(api.defaults()[orientation]); selected = 0; renderRows(); drawOverlay(); return; }
        if (a === 'overlay') { overlayOn = !overlayOn; svg.style.display = overlayOn ? 'block' : 'none'; return; }
        if (a === 'add') {   // a copy of the selected waypoint, 80 px further down the page (the offset adds to any existing one)
            const w = Object.assign({}, list[selected]), m = /^(.*?)([+-]\d+(?:\.\d+)?)?$/.exec(String(w.at)); w.at = m[1] + '+' + ((+m[2] || 0) + 80);
            list.splice(selected + 1, 0, w); selected++; save(); renderRows(); return;
        }
        if (a === 'del') { if (list.length > 2) { list.splice(selected, 1); selected = Math.max(0, selected - 1); save(); renderRows(); } return; }
        const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i;
        if (e.target.hasAttribute('data-go')) { const at = api.resolveAt(String(list[i].at)); if (at !== null) window.scrollTo({ top: at, left: 0, behavior: 'instant' }); }
        if (i !== selected && !e.target.matches('input,button')) { selected = i; renderRows(); drawOverlay(); }
    });

    // ── overlay: the curve, the handles, the ship's current position
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;z-index:99;pointer-events:none;overflow:visible');
    document.body.appendChild(svg);
    const NS = 'http://www.w3.org/2000/svg', el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const curve = el('path', { fill: 'none', stroke: '#4faad1', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.8 });
    const shipDot = el('circle', { r: 5, fill: '#fff', opacity: 0.9 });
    const handles = el('g', {}); svg.append(curve, handles, shipDot);
    const _o = {};
    function drawCurve() {
        const keys = api.keys(); if (!keys.length) { curve.setAttribute('d', ''); return; }
        const s0 = keys[0].y, s1 = keys[keys.length - 1].y, pts = [];   // sampled from the live route, which already includes the edits
        for (let i = 0; i <= 240; i++) { const r = api.sample(s0 + (s1 - s0) * i / 240, _o); if (!r) break; pts.push(api.toPx(r.x, r.y)); }
        curve.setAttribute('d', pts.length ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') : '');
    }
    function drawOverlay() {
        drawCurve();
        if (dragging >= 0) { positionHandles(); return; }   // never rebuild the element that holds the pointer capture
        handles.innerHTML = '';
        list.forEach((w, i) => {
            const g = el('g', { style: 'pointer-events:auto;cursor:grab;touch-action:none' });
            g.append(el('circle', { r: i === selected ? 9 : 6, fill: i === selected ? '#4faad1' : 'rgba(79,170,209,.35)', stroke: '#fff', 'stroke-width': 1 }));
            const t = el('text', { x: 12, y: 4, fill: '#fff', 'font-size': 11, 'font-family': 'ui-monospace,Menlo,monospace', style: 'paint-order:stroke;stroke:rgba(0,0,0,.7);stroke-width:3px;pointer-events:none' }); t.textContent = i + ' ' + w.at; g.append(t);
            g.addEventListener('pointerdown', ev => {
                ev.preventDefault(); dragging = i; selected = i; renderRows(); g.style.cursor = 'grabbing';
                const move = m => { const [nx, ny] = api.fromPx(m.clientX, m.clientY); w.x = +clamp(nx, -1.3, 1.3).toFixed(3); w.y = +clamp(ny, -1.1, 1.1).toFixed(3); positionHandles(); syncSliders(); save(); };
                const up = () => { for (const ev2 of ['pointermove', 'pointerup', 'pointercancel']) window.removeEventListener(ev2, ev2 === 'pointermove' ? move : up); dragging = -1; g.style.cursor = 'grab'; drawOverlay(); };
                window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
            });
            handles.append(g);
        });
        positionHandles();
    }
    function positionHandles() { [...handles.children].forEach((g, i) => { const w = list[i]; if (!w) return; const [px, py] = api.toPx(w.x, w.y); g.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`); }); }
    function syncSliders() { for (const inp of rowsEl.querySelectorAll('[data-i="' + selected + '"] input[type=range]')) { inp.value = list[selected][inp.dataset.k]; inp.nextElementSibling.value = list[selected][inp.dataset.k]; } }
    let lastResolved = -1;
    function tick() {
        const st = api.state(), p = api.pose();
        if (p && p.x !== undefined) { const [px, py] = api.toPx(p.x, p.y); shipDot.setAttribute('cx', px); shipDot.setAttribute('cy', py); }
        if (st && st.resolvedAt !== lastResolved) { lastResolved = st.resolvedAt; if (overlayOn) drawCurve(); updateMarks(); }   // the layer re-resolves every second (and on every edit)
        requestAnimationFrame(tick);
    }
    addEventListener('resize', () => {
        const o = api.orientation();
        if (o !== orientation) { orientation = o; list = normalise(api.tables()[orientation]); selected = 0; panel.querySelector('[data-title]').textContent = 'route · ' + orientation; renderRows(); }
        drawOverlay();
    });
    addEventListener('scroll', () => { if (overlayOn) drawCurve(); }, { passive: true });
    renderRows(); setTimeout(drawOverlay, 1200); requestAnimationFrame(tick);
    console.info('work-spine: route editor mounted (' + orientation + '). Edits persist in this browser while ?route=1 is on the URL; Copy JSON to bake them in.');
}
