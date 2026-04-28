// Case-study swipe-hint dismissal.
// For each .cs-swipe-hint with a data-scroll-target selector, attach a
// once-only scroll listener that adds .is-dismissed (which fades the hint via
// the transition declared in css/case-study-page.css).
//
// Exposed as window.initSwipeHints so pages can re-call after dynamically-
// rendered scroll targets appear (e.g., the Sankey container is built by
// initSankey on DOMContentLoaded, so by the time this script runs on the same
// event the target element doesn't exist yet). Idempotent — already-wired
// hints are skipped.
(function () {
    'use strict';

    function initSwipeHints() {
        document.querySelectorAll('.cs-swipe-hint[data-scroll-target]').forEach(function (hint) {
            if (hint.dataset.swipeHintWired === '1') return;
            var scroll = document.querySelector(hint.dataset.scrollTarget);
            if (!scroll) return;
            hint.dataset.swipeHintWired = '1';
            scroll.addEventListener('scroll', function () {
                hint.classList.add('is-dismissed');
            }, { passive: true, once: true });
        });
    }

    window.initSwipeHints = initSwipeHints;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSwipeHints);
    } else {
        initSwipeHints();
    }
})();
