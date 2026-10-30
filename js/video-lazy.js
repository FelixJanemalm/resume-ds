/* video-lazy.js — a page's <video> loops fetch nothing until something is going to show them.
 *
 * Used by index.html and the case-study pages in work/.
 *
 * Each <source> carries data-src instead of src, and the <video> has no autoplay. That pairing is the only
 * reliable way to hold a video back: Chrome starts fetching an autoplay element whatever `preload` says, and
 * an element with no source opens no connection at all. On the homepage six videos used to start downloading
 * during parse and were paused a moment later, long after the bytes were in flight; work/ai-sourcing.html
 * pulled 9.8 MB of video before the visitor had scrolled a pixel.
 *
 * There are two ways in, because there are two kinds of page.
 *
 * 1. Videos the homepage's own controllers own — js/cards.js for the principles rail (the open card is
 *    `.item.active`) and js/work-spine.js for the case-study spine (the nearest card's wrapper is
 *    `.ws-card.is-front`). Both are edge-triggered: work-spine only acts when the front card changes, so
 *    neither will correct a video this module starts by mistake, and neither can start one whose source is
 *    still missing. So such a video loads only when its owner says it is the one on show, and the
 *    MutationObserver below watches for that word changing — turn the spine, or open a card in the rail, and
 *    that card's video is fetched then. These are observed by section rather than individually: in 3D the
 *    spine hands its cards to a CSS3DRenderer, and an IntersectionObserver reading a 3D-transformed element
 *    is not worth depending on. The section stays in normal flow.
 *
 * 2. Everything else — every video on a case-study page, and the homepage teasers if the spine never arrives.
 *    Nothing owns these and nothing transforms them, so each one is observed on its own and loads when it is
 *    about to be scrolled into view. That is both simpler and more precise than waiting for a whole section.
 */
(function () {
    "use strict";

    /* Without graphics acceleration (no WebGL, or only a software one: the setting off, a blocked GPU, a virtual machine) a playing video
       holds the whole page at 30 frames a second, even after it has stopped. There a video shows its poster and plays only while the
       pointer is over it, or after a tap. Shared with cards.js through window.siteNoGPU(); ?sea=2d forces it, for testing. */
    var noGPU = null;
    window.siteNoGPU = function () {
        if (noGPU !== null) return noGPU;
        if (/[?&]sea=2d\b/.test(location.search)) return (noGPU = true);
        try {
            var c = document.createElement('canvas'), o = { failIfMajorPerformanceCaveat: true };
            var g = c.getContext('webgl2', o) || c.getContext('webgl', o); noGPU = !g;
            if (g) { var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }   // (a probe: its context released at once)
        } catch (e) { noGPU = true; }
        return noGPU;
    };
    function onDemand(video) {   // the poster until a pointer comes over its card, or a tap; nothing else may start it
        if (video.dataset.onDemand) return; video.dataset.onDemand = '1';
        var fetchIt = function () { var src = video.querySelector('source[data-src]'); if (src) { src.src = src.dataset.src; delete src.dataset.src; video.load(); } };
        if (video.controls) {   // a video with its own controls: its source comes with the first touch of it, the controls do the rest
            ['pointerdown', 'focus'].forEach(function (ev) { video.addEventListener(ev, fetchIt, { once: true }); });
            return;
        }
        var wanted = false;
        var play = function () { fetchIt(); wanted = true; var p = video.play();   /* (wanted after the load: a load can fire a pause) */ if (p && p.catch) p.catch(function () {}); };
        var stop = function () { wanted = false; video.pause(); };
        video.addEventListener('play', function () { if (!wanted) video.pause(); });
        video.addEventListener('pause', function () { wanted = false; });   // (its card closed under it, say: the next tap plays it again)   // (the spine and the rail start their front card's video: not here)
        var host = video.closest('.ws-card, .item') || video.parentElement;   // the whole card answers (its overlays sit over the video)
        host.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') play(); });
        host.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') stop(); });
        var down = null;   // a tap (not the start of a swipe or a scroll) toggles it
        host.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') down = [e.clientX, e.clientY]; }, { passive: true });
        host.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse' || !down) return; var moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null; if (moved < 10) { if (wanted) stop(); else play(); } });
        host.addEventListener('pointercancel', function () { down = null; });
        if (host.matches(':hover')) play();   // (a card opened under a pointer that is already on it)
    }

    var lazy = [].slice.call(document.querySelectorAll('video source[data-src]'));
    if (!lazy.length) return;

    /* A video that has not loaded would otherwise be a flat panel of its background colour. The poster puts a
       frame back for ~25 KB instead of megabytes, and the browser drops it the moment the video has a frame of
       its own. It lives in data-poster rather than poster so that it waits too — a `poster` attribute is
       fetched as soon as the element renders, which would undo half the point. */
    function dress(video) {
        if (!video.dataset.poster) return;
        video.poster = video.dataset.poster;
        delete video.dataset.poster;
    }

    function load(source) {
        if (!source.dataset.src) return;
        var video = source.parentNode;
        dress(video);
        if (window.siteNoGPU()) { onDemand(video); return; }
        source.src = source.dataset.src;
        delete source.dataset.src;
        video.load();
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* refused, or the element moved under us */ });
    }

    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) { lazy.forEach(load); return; }

    var MARGIN = { rootMargin: '200px 0px' };

    /* ---- 2. one observer, one video at a time ---- */
    var solo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            solo.unobserve(entry.target);
            var source = entry.target.querySelector('source[data-src]');
            if (source) load(source);
        });
    }, MARGIN);

    /* Two passes, because while a page is still loading its geometry is not yet worth believing. On
       work/ai-sourcing.html the second video reads as 910px down at this point and ends up at 1475px, a clear
       screen below the fold, as the content above it arrives; an observer armed against that early layout
       fetches 2 MB nobody asked for. Waiting a frame or two does not help — Chrome renders frames in between
       deferred scripts, so an early frame is just as wrong — and waiting for everything would hold back the
       video at the top of the page, which is usually the largest thing the visitor is waiting to see.
       So: whatever is inside the first screen right now loads immediately, measured without any margin,
       because something a little below the fold in this layout may be far below it in the final one. The rest
       is handed to the observer at `load`, when nothing is going to move again. */
    function watchEach(sources) {
        sources.forEach(function (s) {
            if (!s.dataset.src) return;
            var r = s.parentNode.getBoundingClientRect();
            if (r.top < window.innerHeight && r.bottom > 0) load(s);
        });
        function arm() { sources.forEach(function (s) { if (s.dataset.src) solo.observe(s.parentNode); }); }
        if (document.readyState === 'complete') arm();
        else window.addEventListener('load', arm, { once: true });
    }

    /* ---- 1. the homepage's owned videos ---- */
    var managed = lazy.filter(function (s) { return s.parentNode.closest('.work-spine, .card-wrapper'); });
    var plain = lazy.filter(function (s) { return managed.indexOf(s) === -1; });

    watchEach(plain);
    if (!managed.length) return;

    /* The spine boots on the same three conditions it checks for itself (work-spine.js: `if (section && !reduced &&
       'IntersectionObserver' in window) boot()`), but it gets there by dynamic-importing three.js, so .ws-card does
       not exist for a while after this script has run. Without the wait below, every teaser video would read as
       unowned during that gap and load — which is exactly what they did before. If the spine is expected but never
       arrives (three.js failed to load, say), the grace period lets them through so they are not lost. */
    var spineSection = document.querySelector('.work-spine');
    var spineComing = !!spineSection && !matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* whoever owns this video, does it say the video is the one on show? */
    function onShow(video) {
        var item = video.closest('.card-wrapper .item');
        if (item) return item.classList.contains('active');
        var wrap = video.closest('.ws-card');          // only exists once the spine has taken the cards
        if (wrap) return wrap.classList.contains('is-front');
        if (spineComing && video.closest('.work-spine')) return false;   // still on its way; wait for is-3d
        return true;
    }

    var groups = new Map();
    managed.forEach(function (source) {
        var anchor = source.parentNode.closest('.work-spine, .card-wrapper');
        if (!groups.has(anchor)) groups.set(anchor, { sources: [], observer: null });
        groups.get(anchor).sources.push(source);
    });

    function pending(group) {
        return group.sources.some(function (s) { return s.dataset.src && !s.parentNode.dataset.onDemand; });   // (one waiting for a hover is no longer the observer's)
    }

    function sync(group) {
        group.sources.forEach(function (s) {
            if (s.dataset.src && onShow(s.parentNode)) load(s);
        });
        if (!pending(group) && group.observer) { group.observer.disconnect(); group.observer = null; }
    }

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            io.unobserve(entry.target);
            var group = groups.get(entry.target);
            group.sources.forEach(function (s) { dress(s.parentNode); });
            sync(group);
            if (!pending(group)) return;
            group.observer = new MutationObserver(function () { sync(group); });
            group.observer.observe(entry.target, { attributes: true, attributeFilter: ['class'], subtree: true });
            /* The spine was expected and has not arrived — no WebGL2, a phone, or three.js never loaded. The
               teasers are a plain list now, so hand them to the per-video observer like any other page's. */
            if (spineComing && entry.target === spineSection) setTimeout(function () {
                if (spineSection.classList.contains('is-3d')) return;
                spineComing = false;
                watchEach(group.sources);
            }, 3000);
        });
    }, MARGIN);

    groups.forEach(function (_, anchor) { io.observe(anchor); });
})();
