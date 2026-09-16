/* The principles rail.
 *
 * This was Owl Carousel driven by jQuery — 42 KB gzipped of library and two render-blocking stylesheets — configured
 * with `{ autoWidth: true, loop: false }`. That is a horizontal scroller, which every browser has had for years, so
 * the rail is now the browser's own: `overflow-x` with scroll snapping (see css/cards.css). The swipe and its
 * momentum, the rubber band at the ends, the trackpad's sideways scroll and the arrow keys are all native, which is
 * both less code and better than the library emulated them.
 *
 * What is left here is only what the browser cannot know: which card is open, holding it at the head of the rail as it grows,
 * playing its video and no other, and the dots. The open card's `.active` class is unchanged — the card CSS and
 * js/principle-clouds.js both watch for it.
 */

(function () {
    const HINT_KEY = 'portfolio-principles-next-hint-dismissed';
    const section = document.getElementById('scalability');
    const rail = section && section.querySelector('.card-rail');

    function dismissHint() {
        if (section) section.classList.add('card-wrapper--hint-dismissed');
        try { sessionStorage.setItem(HINT_KEY, '1'); } catch (e) { /* private mode */ }
    }

    if (rail) {
        try { if (sessionStorage.getItem(HINT_KEY) === '1') dismissHint(); } catch (e) { /* ignore */ }

        const items = [...rail.querySelectorAll('.item')];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');

        // every card's video is autoplay+loop, so they all start together: only the open card's is left running
        function media() {
            for (const it of items) {
                const v = it.querySelector('video');
                if (!v) continue;
                if (it.classList.contains('active')) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
            }
        }

        // bring a card to the head of the rail, where the library put it too (`to.owl.carousel` aligns to the start, for all
        // that the old function was called centerFirstItem). Measured against the rail's own box and applied to its
        // scrollLeft, NOT with scrollIntoView, which would also scroll every scrollable ancestor — clicking a card would jog the page
        const pad = () => parseFloat(getComputedStyle(rail).paddingLeft) || 0;   // 30px, 20px on a phone
        function reveal(it, smooth = true) {
            const r = it.getBoundingClientRect(), c = rail.getBoundingClientRect();
            const left = rail.scrollLeft + (r.left - c.left) - pad();
            rail.scrollTo({ left, behavior: smooth && !reduced.matches ? 'smooth' : 'auto' });
        }

        // open one card, or none: clicking the open card closes it, as it always did
        function open(it) {
            const wasOpen = it && it.classList.contains('active');
            for (const o of items) { o.classList.toggle('active', o === it && !wasOpen); o.setAttribute('aria-expanded', String(o === it && !wasOpen)); }
            media();
            if (it && !wasOpen) {
                reveal(it);
                setTimeout(() => reveal(it), 430);   // it grows by ~180px over 0.4s (css/cards.css): bring it back once it has
            }
            syncDots();
        }

        for (const it of items) {
            it.setAttribute('tabindex', '0');           // the cards were mouse-only: now they are reachable and operable from the keyboard
            it.setAttribute('role', 'button');
            it.setAttribute('aria-expanded', 'false');
            it.addEventListener('click', () => { if (!it.classList.contains('active')) dismissHint(); open(it); });
            it.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!it.classList.contains('active')) dismissHint(); open(it); } });
        }

        // the dots: one per card (the library drew one per "page", which with variable widths never matched what you saw).
        // The card at the head of the rail lights up as you scroll, so they read as a position, and clicking one opens that card
        const dots = document.createElement('div');
        dots.className = 'card-dots';
        dots.setAttribute('role', 'tablist');
        dots.setAttribute('aria-label', 'Principles');
        const dotEls = items.map((it, i) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'card-dot'; b.setAttribute('role', 'tab');
            b.setAttribute('aria-label', (it.querySelector('h3') || {}).textContent || `Principle ${i + 1}`);
            b.addEventListener('click', () => { dismissHint(); if (!it.classList.contains('active')) open(it); else reveal(it); });
            dots.appendChild(b);
            return b;
        });
        rail.after(dots);

        // an open card owns the dot, whatever the scroll says: a wide open card can sit a little past the head of the rail
        // while a neighbour's edge is nearer to it, and a dot that disagrees with the card you just opened reads as a bug.
        // With nothing open the dots go back to reporting the scroll: the card at the head of the rail
        function syncDots() {
            let on = items.findIndex(it => it.classList.contains('active'));
            if (on < 0) {
                const c = rail.getBoundingClientRect(), head = c.left + pad();
                let best = Infinity;
                items.forEach((it, i) => { const d = Math.abs(it.getBoundingClientRect().left - head); if (d < best) { best = d; on = i; } });
            }
            dotEls.forEach((b, i) => { b.classList.toggle('is-on', i === on); b.setAttribute('aria-selected', String(i === on)); });
        }

        let ticking = false;
        rail.addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; syncDots(); }); }, { passive: true });
        addEventListener('resize', syncDots, { passive: true });

        // the first card opens with the section, in place from the first frame (the old rail sat wrong for a whole second,
        // waiting on a setTimeout for the library to finish laying out, and then jumped)
        if (items[0]) {
            items[0].classList.add('active');
            items[0].setAttribute('aria-expanded', 'true');
            reveal(items[0], false);
            requestAnimationFrame(() => reveal(items[0], false));   // again after layout, in case the fonts or the video changed the widths
        }
        media();
        syncDots();
    }
})();
