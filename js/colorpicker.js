document.addEventListener('DOMContentLoaded', function() {
    const spectrumCanvas = document.getElementById('spectrum-canvas');
    const spectrumCtx = spectrumCanvas.getContext('2d');
    const spectrumCursor = document.getElementById('spectrum-cursor');
    const spectrumHitbox = document.getElementById('spectrum-hitbox');

    const hueCanvas = document.getElementById('hue-canvas');
    const hueCtx = hueCanvas.getContext('2d');
    const hueCursor = document.getElementById('hue-cursor');
    const hueHitbox = document.getElementById('hue-hitbox');

    let spectrumRect = spectrumCanvas.getBoundingClientRect();
    let hueRect = hueCanvas.getBoundingClientRect();

    let currentColor = '';
    let hue = 210; // Starting with a nice blue hue
    let saturation = 1;
    let lightness = 0.5;

    function ColorPicker() {
        createHueSpectrum();
        createShadeSpectrum(colorToHue(`hsl(${hue}, 100%, 50%)`));
        const initialColor = tinycolor(`hsl(${hue}, ${saturation * 80}%, ${lightness * 90}%)`);
        colorToPos(initialColor);
        setCurrentColor(initialColor);
    }

    function refreshElementRects() {
        spectrumRect = spectrumCanvas.getBoundingClientRect();
        hueRect = hueCanvas.getBoundingClientRect();
    }

    function createShadeSpectrum(color) {
        const canvas = spectrumCanvas;
        const ctx = spectrumCtx;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Base color
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // White gradient
        const whiteGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        whiteGradient.addColorStop(0, "#fff");
        whiteGradient.addColorStop(1, "transparent");
        ctx.fillStyle = whiteGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Black gradient
        const blackGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        blackGradient.addColorStop(0, "transparent");
        blackGradient.addColorStop(1, "#000");
        ctx.fillStyle = blackGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        spectrumHitbox.addEventListener('mousedown', startGetSpectrumColor);
    }

    function createHueSpectrum() {
        const canvas = hueCanvas;
        const ctx = hueCtx;
        const hueGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        const hues = ["hsl(0,100%,50%)", "hsl(60, 100%, 50%)", "hsl(120, 100%, 50%)", "hsl(180, 100%, 50%)", "hsl(240, 100%, 50%)", "hsl(300,100%,50%)", "hsl(360,100%,50%)"];
        hues.forEach((hue, index) => hueGradient.addColorStop(index / (hues.length - 1), hue));
        ctx.fillStyle = hueGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        hueHitbox.addEventListener('mousedown', startGetHueColor);
    }

    function colorToHue(color) {
        return tinycolor(`hsl ${tinycolor(color).toHsl().h} 1 .5`).toHslString();
    }

    function colorToPos(color) {
        const hsl = tinycolor(color).toHsl();
        hue = hsl.h;
        const hsv = tinycolor(color).toHsv();
        const x = spectrumRect.width * hsv.s;
        const y = spectrumRect.height * (1 - hsv.v);
        const hueX = (hue / 360) * hueRect.width;
        updateSpectrumCursor(x, y);
        updateHueCursor(hueX);
        setCurrentColor(color);
        createShadeSpectrum(colorToHue(color));
    }

    function setCurrentColor(color) {
        color = tinycolor(color);
        currentColor = color;
        document.body.style.backgroundColor = color;
        spectrumCursor.style.backgroundColor = color;
        hueCursor.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
    }

    function updateHueCursor(x) {
        hueCursor.style.left = `${x}px`;
    }

    function updateSpectrumCursor(x, y) {
        spectrumCursor.style.left = `${x}px`;
        spectrumCursor.style.top = `${y}px`;
    }

    function startGetSpectrumColor(e) {
        getSpectrumColor(e);
        spectrumCursor.classList.add('dragging');
        window.addEventListener('mousemove', getSpectrumColor);
        window.addEventListener('mouseup', endGetSpectrumColor);
    }

    function getSpectrumColor(e) {
        e.preventDefault();
        const x = Math.min(Math.max(0, e.pageX - spectrumRect.left), spectrumRect.width);
        const y = Math.min(Math.max(0, e.pageY - spectrumRect.top), spectrumRect.height);
        const xRatio = x / spectrumRect.width;
        const yRatio = y / spectrumRect.height;
        const hsvValue = 1 - yRatio;
        const hsvSaturation = xRatio;
        lightness = Math.min(Math.max(0.0001, (hsvValue / 2) * (2 - hsvSaturation)), 0.9999);
        saturation = Math.min(Math.max(0.0001, (hsvValue * hsvSaturation) / (1 - Math.abs(2 * lightness - 1))), 0.9999);
        const color = tinycolor(`hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`);
        setCurrentColor(color);
        updateSpectrumCursor(x, y);
    }

    function endGetSpectrumColor() {
        spectrumCursor.classList.remove('dragging');
        window.removeEventListener('mousemove', getSpectrumColor);
    }

    function startGetHueColor(e) {
        getHueColor(e);
        hueCursor.classList.add('dragging');
        window.addEventListener('mousemove', getHueColor);
        window.addEventListener('mouseup', endGetHueColor);
    }

    function getHueColor(e) {
        e.preventDefault();
        const x = Math.min(Math.max(0, e.pageX - hueRect.left), hueRect.width);
        const percent = x / hueRect.width;
        hue = 360 * percent;
        const hueColor = tinycolor(`hsl(${hue}, 100%, 50%)`).toHslString();
        const color = tinycolor(`hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`).toHslString();
        createShadeSpectrum(hueColor);
        updateHueCursor(x);
        setCurrentColor(color);
    }

    function endGetHueColor() {
        hueCursor.classList.remove('dragging');
        window.removeEventListener('mousemove', getHueColor);
    }

    window.addEventListener('resize', refreshElementRects);

    new ColorPicker();
});