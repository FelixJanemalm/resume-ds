$(document).ready(function () {
    // Initialize Owl Carousel
    const carousel = $(".custom-carousel");
    carousel.owlCarousel({
        autoWidth: true,
        loop: false,
    });

    function updateMedia() {
        // Pause all videos inside the carousel only
        $(".custom-carousel video").each((_, video) => video.pause());

        // Pause all Lottie animations inside the carousel only
        $(".custom-carousel dotlottie-player").each((_, lottie) => lottie.pause());

        const activeItem = $(".custom-carousel .item.active");

        if (activeItem.length) {
            const activeVideo = activeItem.find("video").get(0);
            if (activeVideo) activeVideo.play();

            const activeLottie = activeItem.find("dotlottie-player").get(0);
            if (activeLottie) activeLottie.play();
        }
    }

    // Make the first item active on page load
    $(".custom-carousel .item").first().addClass("active");

    // Ensure the first item is centered when the page loads
    function centerFirstItem() {
        const firstItem = $(".custom-carousel .item").first();
        const firstIndex = firstItem.closest(".owl-item").index();

        if (window.innerWidth < 500) {
            // Mobile behavior (slow & smooth scroll)
            const itemWidth = firstItem.outerWidth(true); // Includes margins
            const containerWidth = carousel.width();
            const offset = (containerWidth - itemWidth) / 2;

            carousel.trigger("to.owl.carousel", [firstIndex, 500, true]);

            requestAnimationFrame(() => {
                $(".owl-stage").css({
                    "transform": `translate3d(-${firstIndex * itemWidth}px, 0px, 0px)`,
                    "transition": "transform 500ms ease-in-out"
                });
            });
        } else {
            // Desktop behavior (standard Owl positioning)
            carousel.trigger("to.owl.carousel", [firstIndex, 300, true]);
        }
    }

    // Wait for Owl Carousel to initialize before centering
    setTimeout(() => {
        centerFirstItem();
        updateMedia(); // Start playing the media for the first item
    }, 1000);

    $(".custom-carousel .item").click(function () {
        const isActive = $(this).hasClass("active");

        $(".custom-carousel .item").removeClass("active");

        if (!isActive) {
            $(this).addClass("active");
            updateMedia();

            const activeItem = $(this).closest(".owl-item");
            const activeIndex = activeItem.index();

            if (window.innerWidth < 500) {
                const itemWidth = activeItem.outerWidth(true);
                const containerWidth = carousel.width();
                const offset = (containerWidth - itemWidth) / 2;

                carousel.trigger("to.owl.carousel", [activeIndex, 500, true]);

                requestAnimationFrame(() => {
                    $(".owl-stage").css({
                        "transform": `translate3d(-${activeIndex * itemWidth}px, 0px, 0px)`,
                        "transition": "transform 500ms ease-in-out"
                    });
                });
            } else {
                $(".custom-carousel").trigger("to.owl.carousel", [activeIndex, 300, true]);
            }
        } else {
            updateMedia();
        }
    });

    // Ensure correct media state on load
    updateMedia();

    // Mousewheel scroll interaction (Horizontal Scroll Only)
    let lastX = 0;
    let lastY = 0;

    carousel.on('wheel', function (e) {
        let deltaX = Math.abs(e.originalEvent.deltaX);
        let deltaY = Math.abs(e.originalEvent.deltaY);

        if (deltaX > deltaY) {
            if (e.originalEvent.deltaX > 0) {
                carousel.trigger("next.owl"); // Scroll right
            } else {
                carousel.trigger("prev.owl"); // Scroll left
            }
            e.preventDefault(); // Prevent default vertical scrolling
        }

        lastX = e.originalEvent.deltaX;
        lastY = e.originalEvent.deltaY;
    });
});
