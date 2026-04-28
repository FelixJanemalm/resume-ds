const n = 300,
    o = Math.PI / n,
    range = 45,
    tf = 0.0004,
    d = document,
    c = d.getElementById("c"),
    s = d.getElementById("s");

if (c && s) {
    let w, h, sw;
    const slices = [];

    function updateSlices() {
        w = c.getBoundingClientRect().width;
        h = c.getBoundingClientRect().height;
        sw = w / n;
        s.innerHTML = "";

        for (let i = 0; i < n; i++) {
            const slice = d.createElement("div");
            slice.classList.add("slice");
            slice.style.width = `${sw + 2.5}px`;
            slice.style.left = `${i * sw}px`;
            slice.style.backgroundImage = `url(images/testhue.png)`;
            slice.style.backgroundPosition = `top 0px left ${-i * sw}px`;
            slice.style.backgroundSize = `${w}px ${h}px`;
            slices.push({ slice, ref: s.appendChild(slice) });
        }
    }

    const tick = (time) => {
        slices.forEach((slice, i) => {
            let ry = Math.sin(tf * time + o * i) * 0.5 * range;
            slice.ref.style.transform = `rotateX(${ry}deg)`;
        });
        window.requestAnimationFrame(tick);
    };

    window.addEventListener("resize", updateSlices);
    updateSlices();
    window.requestAnimationFrame(tick);
}
