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

    window.addEventListener("scroll", updateHeader);
    updateHeader(); // Run once on load
});




document.addEventListener("DOMContentLoaded", function () {
    const scrollArrow = document.getElementById("scroll-down-arrow");

    // Initially hide the arrow
    scrollArrow.style.opacity = "0";
    scrollArrow.style.pointerEvents = "none";

    // Delay the appearance of the arrow
    setTimeout(() => {
        scrollArrow.style.opacity = "0.8";
        scrollArrow.style.pointerEvents = "auto";
    }, 3500); // Delay of 2 seconds (adjust as needed)

    // Hide the arrow on scroll
    function hideArrowOnScroll() {
        if (window.scrollY > 0) {
            scrollArrow.style.opacity = "0";
            scrollArrow.style.pointerEvents = "none";
        }
    }

    window.addEventListener("scroll", hideArrowOnScroll);
});