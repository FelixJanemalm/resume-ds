$(document).ready(function () {
    // Initialize Owl Carousel
    const carousel = $(".custom-carousel");
    carousel.owlCarousel({
        autoWidth: true,
        loop: false
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

    $(".custom-carousel .item").click(function () {
        const isActive = $(this).hasClass("active");

        $(".custom-carousel .item").removeClass("active");

        if (!isActive) {
            $(this).addClass("active");
        }

        updateMedia();
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
                carousel.trigger('next.owl'); // Scroll right
            } else {
                carousel.trigger('prev.owl'); // Scroll left
            }
            e.preventDefault(); // Prevent default vertical scrolling
        }

        lastX = e.originalEvent.deltaX;
        lastY = e.originalEvent.deltaY;
    });
});
