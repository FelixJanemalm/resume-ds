const n = 48; // number of slices (more = smooth, but less performant)
const o = Math.PI / n; // offset per slice
const range = 20; // range of motion (total degrees)
const tf = 0.002; // timing factor (higher = faster)
const d = document;
const c = d.getElementById("c");
const s = d.getElementById("s");
const w = c.getBoundingClientRect().width;
const h = c.getBoundingClientRect().height;
const sw = w / n; // slice width

const img_url = "images/texturetest2.svg";

// prep array
const slices = [];

// create slices
Array(n).fill().map((_, i) => {
    const slice = d.createElement("div");
    slice.classList.add("slice");
    slice.style.width = `${sw + 2.5}px`; // +2.5px for overlap
    slice.style.left = `${i * sw}px`;
    slice.style.backgroundImage = `url(${img_url})`;
    slice.style.backgroundPosition = `top 0px left ${-i * sw}px`;
    slice.style.backgroundSize = `${w}px ${h}px`;
    slices.push({ slice, ref: s.appendChild(slice) });
});

// preview
const img = d.createElement("img");
img.src = img_url;
d.querySelector(".preview").appendChild(img);

// ticker
const tick = (time) => {
    slices.map((slice, i) => {
        let ry = Math.sin(tf * time + o * i) * 0.5 * range;
        slice.ref.style.transform = `rotateX(${ry}deg)`;
    });

    // Again, again, again!
    window.requestAnimationFrame(tick);
};

// Go!
window.requestAnimationFrame(tick);
