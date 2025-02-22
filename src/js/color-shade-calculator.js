let currentColor = '#FFFFFF'; // Initial color

Object.defineProperty(window, 'currentColor', {
    get: function() {
        return currentColor;
    },
    set: function(newColor) {
        currentColor = newColor;
        updateColors(newColor);
    }
});

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
        window.currentColor = color.toHexString();
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
    
        // Always get the latest bounding rect dynamically
        const spectrumRect = spectrumCanvas.getBoundingClientRect();
    
        // Use clientX and clientY to ensure viewport-relative positioning
        const x = Math.min(
            Math.max(0, e.clientX - spectrumRect.left),
            spectrumRect.width
        );
        const y = Math.min(
            Math.max(0, e.clientY - spectrumRect.top),
            spectrumRect.height
        );
    
        // Convert mouse position into saturation and brightness
        const xRatio = x / spectrumRect.width;
        const yRatio = y / spectrumRect.height;
        const hsvValue = 1 - yRatio;
        const hsvSaturation = xRatio;
    
        // Convert HSV to HSL
        lightness = Math.min(Math.max(0.0001, (hsvValue / 2) * (2 - hsvSaturation)), 0.9999);
        saturation = Math.min(Math.max(0.0001, (hsvValue * hsvSaturation) / (1 - Math.abs(2 * lightness - 1))), 0.9999);
    
        // Generate and apply the selected color
        const color = tinycolor(`hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`);
        setCurrentColor(color);
        
        // Update cursor position
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

function limitBrightness(color) {
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);

    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    if (l > 0.45 && l < 0.55) {
        l = l < 0.5 ? 0.4 : 0.6;
    }

    let rgb = hslToRgb(h, s, l);
    return `#${((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).toUpperCase()}`;
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) {
        r = g = b = l;
    } else {
        let hue2rgb = function(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
    let rgb = hslToRgb(h / 360, s / 100, l / 100);
    return `#${((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).toUpperCase()}`;
}

function calculateShades(color) {
    let [h, s, l] = hexToHsl(color);

    let shades = {
        strong: hslToHex(h, s, Math.max(0, l - 30)),
        default: color,
        subtle: hslToHex(h, s, Math.min(100, l + 20)),
        tint: hslToHex(h, s, Math.min(100, l + 30)),
        grid: hslToHex(h, s, l > 50 ? Math.min(100, l*0.6 + 10) : Math.max(8, l*1.6 + 16))
    };

    return shades;
}

function calculateButtonColors(color) {
    let [h, s, l] = hexToHsl(color);

    // Calculate the lightness adjustments dynamically
    let buttonL = l < 50 ? Math.min(l + (55 - 0.5 * l), 90) : Math.max(l - (70 - l * 0.1), 40);
    let buttonHoverL = buttonL < 50 ? Math.min(buttonL + (50 - buttonL) * 0.3, 85) : Math.max(buttonL - (buttonL - 50) * 0.2, 25);
    let buttonPressedL = buttonL < 50 ? Math.min(buttonL + (50 - buttonL) * 0.4, 95) : Math.max(buttonL - (buttonL - 50) * 0.3, 20);

    return {
        button: hslToHex(h, s, buttonL),
        buttonHover: hslToHex(h, s, buttonHoverL),
        buttonPressed: hslToHex(h, s, buttonPressedL)
    };
}



function hexToRgba(hex, opacity) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${opacity})`;
    }
    throw new Error('Bad Hex');
}

function applyThemeBasedOnBrightnessAndMode(hexColor) {
    let [h, s, l] = hexToHsl(hexColor);
    const colorblindMode = document.getElementById('colorblindSwitch').checked;

    document.body.classList.remove('default-dark-colorblind', 'default-light-colorblind', 'default-dark', 'default-light');

    if (l > 50) {
        document.body.classList.add(colorblindMode ? 'default-light-colorblind' : 'default-light');
    } else if (l <= 50) {
        document.body.classList.add(colorblindMode ? 'default-dark-colorblind' : 'default-dark');
    }
}

function calculateLinkColor(color) {
    let [h, s, l] = hexToHsl(color);
    
    // If the color is too dark, increase lightness by a fixed amount
    if (l < 20) {
        l += 40; // Brighten by a fixed amount
    }
    
    return hslToHex(h, s, l);
}

function calculateNeutralColor(color) {
    let [h, s, l] = hexToHsl(color);
    
    // Adjust neutral color dynamically based on lightness input
    let neutralL = l > 50 ? Math.min(98, l + 14) : Math.max(5, l - 14);
    
    return hslToHex(0, 0, neutralL); // Neutral color is always grayscale
}

function getComputedRGB(variableName) {
    let rgb = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();

    if (rgb.startsWith("#")) {
        return hexToRGB(rgb); // Convert HEX to RGB
    } else if (rgb.startsWith("rgb")) {
        return rgb.replace(/[^\d,]/g, ""); // Extract numbers from RGB format
    }
    return null;
}

// Convert HEX to RGB
function hexToRGB(hex) {
    let c = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',');
}

function updateColors(color) {
    const selectedColor = limitBrightness(color);
    const shades = calculateShades(selectedColor);
    const buttonColors = calculateButtonColors(selectedColor);
    const linkColor = calculateLinkColor(shades.default);
    const neutralColor = calculateNeutralColor(selectedColor);
    const bgStrongOpacity = hexToRgba(shades.tint, 0.9);
    const bgMediumOpacity = hexToRgba(shades.subtle, 0.4);
    const gridOverlay = hexToRgba(shades.grid, 0.4);

    const contrastRGB = getComputedRGB("--sysNeutral7");
    document.documentElement.style.setProperty('--contrastRGB', contrastRGB);

    document.documentElement.style.setProperty('--primary-color', selectedColor);
    document.documentElement.style.setProperty('--sysPrimaryStrong', shades.strong);
    document.documentElement.style.setProperty('--sysPrimaryDefault', shades.default);
    document.documentElement.style.setProperty('--sysPrimarySubtle', shades.subtle);
    document.documentElement.style.setProperty('--sysPrimaryTint', shades.tint);
    document.documentElement.style.setProperty('--button-color', buttonColors.button);
    document.documentElement.style.setProperty('--button-hover-color', buttonColors.buttonHover);
    document.documentElement.style.setProperty('--button-pressed-color', buttonColors.buttonPressed);
    document.documentElement.style.setProperty('--link-color', linkColor);
    document.documentElement.style.setProperty('--sysNeutral0', neutralColor);
    document.documentElement.style.setProperty('--bgStrong-opacity', bgStrongOpacity);
    document.documentElement.style.setProperty('--bgMedium-opacity', bgMediumOpacity);
    document.documentElement.style.setProperty('--gridOverlay', gridOverlay);

    document.getElementById('strongBox').style.backgroundColor = shades.strong;
    document.getElementById('defaultBox').style.backgroundColor = shades.default;
    document.getElementById('subtleBox').style.backgroundColor = shades.subtle;
    document.getElementById('tintBox').style.backgroundColor = shades.tint;

    document.getElementById('strongBox').textContent = shades.strong;
    document.getElementById('defaultBox').textContent = shades.default;
    document.getElementById('subtleBox').textContent = shades.subtle;
    document.getElementById('tintBox').textContent = shades.tint;

    // Get computed primary color before passing it
    const computedPrimaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
    
    document.querySelectorAll('.hue-shift').forEach(el => {
        if (computedPrimaryColor) {
            let { hueShift, saturationScale, brightnessChange } = getHueSaturationBrightnessShift("#FF0000", computedPrimaryColor);
            el.style.filter = `hue-rotate(${hueShift}deg) saturate(${saturationScale}) brightness(${brightnessChange})`;
        }
    });
    
    

    applyThemeBasedOnBrightnessAndMode(selectedColor);
}

// Function to calculate hue shift
function getHueSaturationBrightnessShift(originalHex, targetHex) {
    function hexToHSL(hex) {
        let r = parseInt(hex.substring(1, 3), 16) / 255;
        let g = parseInt(hex.substring(3, 5), 16) / 255;
        let b = parseInt(hex.substring(5, 7), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = 0; s = 0;
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = (max === r ? (g - b) / d + (g < b ? 6 : 0) :
                 max === g ? (b - r) / d + 2 :
                 (r - g) / d + 4) * 60;
        }
        return { h, s, l };
    }

    let originalHSL = hexToHSL(originalHex);
    let targetHSL = hexToHSL(targetHex);

    // Calculate hue shift
    let hueShift = targetHSL.h - originalHSL.h;
    if (hueShift < 0) hueShift += 360; // Normalize to positive degrees

    // Calculate saturation scale
    let saturationScale = targetHSL.s / (originalHSL.s || 1); // Avoid division by zero

    // Calculate brightness (limited to 20% variation)
    let brightnessChange = (targetHSL.l / (originalHSL.l || 1)); 
    brightnessChange = Math.max(1, Math.min(brightnessChange, 2)); // Limit between 0.8 and 1.2

    return { hueShift, saturationScale, brightnessChange };
}



document.addEventListener('DOMContentLoaded', () => {
    const colorblindSwitch = document.getElementById('colorblindSwitch');

    colorblindSwitch.addEventListener('change', () => updateColors(currentColor));

    // Initial call to set colors based on default current color and switch state
    updateColors(currentColor);
});