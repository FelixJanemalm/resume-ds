// Case-study swipe-hint dismissal.
// For each .cs-swipe-hint with a data-scroll-target selector, attach a
// once-only scroll listener that adds .is-dismissed (which fades the hint via
// the transition declared in css/case-study-page.css).
(function () {
    'use strict';

    function initSwipeHints() {
        document.querySelectorAll('.cs-swipe-hint[data-scroll-target]').forEach(function (hint) {
            var scroll = document.querySelector(hint.dataset.scrollTarget);
            if (!scroll) return;
            scroll.addEventListener('scroll', function () {
                hint.classList.add('is-dismissed');
            }, { passive: true, once: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSwipeHints);
    } else {
        initSwipeHints();
    }
})();
