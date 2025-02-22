const n = 300, // Number of slices (higher = smoother, lower = faster)
    o = Math.PI / n, // Offset per slice
    range = 45, // Range of motion in degrees
    tf = 0.0004, // Timing factor (higher = faster)
    d = document,
    c = d.getElementById("c"),
    s = d.getElementById("s");

let w, h, sw; // Declare width, height, and slice width globally
const slices = [];

// Function to initialize or update slice properties
function updateSlices() {
    // Get updated dimensions
    w = c.getBoundingClientRect().width;
    h = c.getBoundingClientRect().height;
    sw = w / n; // Slice width

    // Clear existing slices to prevent duplication
    s.innerHTML = "";

    // Recreate slices with new dimensions
    for (let i = 0; i < n; i++) {
        const slice = d.createElement("div");
        slice.classList.add("slice");
        slice.style.width = `${sw + 2.5}px`; // +2.5px for overlap
        slice.style.left = `${i * sw}px`;
        slice.style.backgroundImage = `url(images/testhue.png)`;
        slice.style.backgroundPosition = `top 0px left ${-i * sw}px`;
        slice.style.backgroundSize = `${w}px ${h}px`;
        slices.push({ slice, ref: s.appendChild(slice) });
    }
}

// Function to handle animation
const tick = (time) => {
    slices.forEach((slice, i) => {
        let ry = Math.sin(tf * time + o * i) * 0.5 * range;
        slice.ref.style.transform = `rotateX(${ry}deg)`;
    });

    // Request next frame
    window.requestAnimationFrame(tick);
};

// Listen for window resize and update slices dynamically
window.addEventListener("resize", updateSlices);

// Initialize and start animation
updateSlices();
window.requestAnimationFrame(tick);
