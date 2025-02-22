document.addEventListener("DOMContentLoaded", function () {
    const contactBtn = document.getElementById("contactBtn");
    const drawer = document.getElementById("drawer");
    const overlay = document.getElementById("overlay");

    function toggleDrawer() {
        const isOpen = drawer.classList.contains("open");

        if (isOpen) {
            // Close the drawer and remove underline
            drawer.classList.remove("open");
            contactBtn.classList.remove("contact-active");
            overlay.style.opacity = "0";
            overlay.style.visibility = "hidden";
        } else {
            // Open the drawer and add underline
            drawer.classList.add("open");
            contactBtn.classList.add("contact-active");
            overlay.style.opacity = "1";
            overlay.style.visibility = "visible";
        }
    }

    function closeDrawer() {
        drawer.classList.remove("open");
        contactBtn.classList.remove("contact-active"); // Remove underline when closing
        overlay.style.opacity = "0";
        overlay.style.visibility = "hidden";
    }

    contactBtn.addEventListener("click", toggleDrawer);
    overlay.addEventListener("click", closeDrawer);

    // Close on ESC key
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDrawer();
    });
});
