document.addEventListener("DOMContentLoaded", function () {
    const header = document.querySelector("header");
    let lastScrollY = window.scrollY;

    function updateHeader() {
        const currentScrollY = window.scrollY;

        if (currentScrollY <= 10) {
            // Only at the very top or within 10px
            header.classList.add("at-top");
            header.classList.remove("not-at-top", "scrolled");
        } else {
            // After scrolling at least 10px
            header.classList.add("not-at-top");
            header.classList.remove("at-top");

            if (currentScrollY > lastScrollY) {
                // Scrolling Down
                header.classList.add("scrolled");
            } else {
                // Scrolling Up
                header.classList.remove("scrolled");
            }
        }

        lastScrollY = currentScrollY;
    }

    // Coalesced into a frame and passive: the handler only toggles classes, but it used to run on every scroll
    // event and the listener blocked the scroll until it returned.
    let frame = 0;
    window.addEventListener("scroll", function () {
        if (frame) return;
        frame = requestAnimationFrame(function () { frame = 0; updateHeader(); });
    }, { passive: true });
    updateHeader(); // Run once on load
});




document.addEventListener("DOMContentLoaded", function () {
    const scrollArrow = document.getElementById("scroll-down-arrow");
    if (!scrollArrow) return;

    scrollArrow.style.opacity = "0";
    scrollArrow.style.pointerEvents = "none";

    setTimeout(() => {
        scrollArrow.style.opacity = "0.8";
        scrollArrow.style.pointerEvents = "auto";
    }, 3500);

    // The arrow only ever hides, so the listener retires itself on the first scroll instead of writing the same
    // two inline styles on every scroll event for the rest of the visit.
    function hideArrowOnScroll() {
        if (window.scrollY <= 0) return;
        scrollArrow.style.opacity = "0";
        scrollArrow.style.pointerEvents = "none";
        window.removeEventListener("scroll", hideArrowOnScroll);
    }

    window.addEventListener("scroll", hideArrowOnScroll, { passive: true });
});