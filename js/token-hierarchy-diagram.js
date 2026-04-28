/**
 * Token hierarchy diagram: theme toggle + SVG overlay connectors (design-tokens case study).
 * Success-* token swatches stay in a green (lime) family; when the accent is chromatic we blend
 * ~22% of its hue into a success anchor so greens feel at home with the user’s pick without
 * turning blue/red. Achromatic accents keep the fixed lime examples.
 * Expects tinycolor + markup under #cs-token-hierarchy (see design-tokens.html).
 */
(function () {
    var root = document.getElementById("cs-token-hierarchy");
    if (!root) return;

    var scene = document.getElementById("cs-th-scene");
    var svg = document.getElementById("cs-th-svg");
    var sw = document.getElementById("cs-th-switch");
    var lblLight = document.getElementById("cs-th-lbl-light");
    var lblDark = document.getElementById("cs-th-lbl-dark");

    var DEFAULT_LIGHT = {
        val: "#5C8211",
        ref: "lime-750",
        sys: "success-strong",
        u1: "success-bg-strong",
        u2: "success-text",
        dot: "#5C8211",
    };
    var DEFAULT_DARK = {
        val: "#C8DDB0",
        ref: "lime-100",
        sys: "success-strong",
        u1: "success-bg-strong",
        u2: "success-text",
        dot: "#C8DDB0",
    };

    var lightD = Object.assign({}, DEFAULT_LIGHT);
    var darkD = Object.assign({}, DEFAULT_DARK);
    var connectorColor = "#85b7eb";
    var isDark = false;

    var THEME_KEY = "portfolio-theme-primary";

    /** ~#5C8211 lime — success value anchor (deg) */
    var SUCCESS_HUE_ANCHOR = 88;

    /**
     * Hue between success-green and user accent so swatches read as green but harmonize with the theme.
     * @param {number} accentInfluence 0–1 (e.g. 0.22)
     */
    function blendedSuccessHue(accentHex, accentInfluence) {
        if (typeof tinycolor === "undefined") return SUCCESS_HUE_ANCHOR;
        var t = accentInfluence == null ? 0.22 : accentInfluence;
        var ah = tinycolor(accentHex).toHsl().h;
        var h = SUCCESS_HUE_ANCHOR * (1 - t) + ah * t;
        return ((h % 360) + 360) % 360;
    }

    function getAccentHex() {
        var c = typeof window.currentColor !== "undefined" ? window.currentColor : null;
        if (c && /^#[0-9A-Fa-f]{6}$/i.test(String(c))) {
            return String(c);
        }
        try {
            var ls = localStorage.getItem(THEME_KEY);
            if (ls && /^#[0-9A-Fa-f]{6}$/i.test(ls)) {
                return ls;
            }
        } catch (e) {
            /* ignore */
        }
        var fromCss = getComputedStyle(document.documentElement).getPropertyValue("--sysPrimaryDefault").trim();
        if (fromCss && typeof tinycolor !== "undefined") {
            var parsed = tinycolor(fromCss);
            if (parsed.isValid()) {
                return parsed.toHexString();
            }
        }
        return "#4faad1";
    }

    function isAchromatic(hex) {
        if (typeof tinycolor === "undefined") return true;
        var t = tinycolor(hex);
        if (!t.isValid()) return true;
        var hsl = t.toHsl();
        if (hsl.s < 0.07) return true;
        if (hsl.l < 0.035 || hsl.l > 0.975) return true;
        return false;
    }

    /** Muted stroke for SVG lines, readable on light + dark diagram surfaces */
    function connectorFromAccent(hex) {
        if (typeof tinycolor === "undefined") return "#85b7eb";
        var t = tinycolor(hex);
        if (!t.isValid()) return "#85b7eb";
        return tinycolor.mix(t, tinycolor("#ffffff"), 42).toHexString();
    }

    var SURFACE_PROPS = [
        "--th-bg-light",
        "--th-bg-dark",
        "--th-label-light",
        "--th-label-dark",
        "--th-chip-bg-light",
        "--th-chip-bg-dark",
        "--th-chip-fg-light",
        "--th-chip-fg-dark",
        "--th-divider-light",
        "--th-divider-dark",
    ];

    function clearThemeSurfaces() {
        if (!scene) return;
        SURFACE_PROPS.forEach(function (p) {
            scene.style.removeProperty(p);
        });
    }

    /**
     * Scene background + neutrals follow accent; legend (tier labels) stay in accent hue.
     * Success green is only for chip value text + small swatch dots (buildPaletteFromAccent).
     */
    function surfacesFromAccent(accentHex) {
        if (typeof tinycolor === "undefined") return null;
        var base = tinycolor(accentHex);
        if (!base.isValid() || isAchromatic(accentHex)) return null;
        var h = base.toHsl().h;

        /* Heavy mix toward neutral grays so scene + chip wells recede; token dots/hex stay vivid */
        return {
            bgLight: tinycolor.mix(base, tinycolor("#f1f1ef"), 97).toHexString(),
            bgDark: tinycolor.mix(base, tinycolor("#111113"), 96).toHexString(),
            labelLight: tinycolor({ h: h, s: 0.46, l: 0.37 }).toHexString(),
            labelDark: tinycolor({ h: h, s: 0.4, l: 0.58 }).toHexString(),
            chipBgLight: tinycolor.mix(base, tinycolor("#e6e6e4"), 84).toHexString(),
            chipBgDark: tinycolor.mix(base, tinycolor("#2e2e2c"), 84).toHexString(),
            chipFgLight: tinycolor.mix(base, tinycolor("#1a1a18"), 96).toHexString(),
            chipFgDark: tinycolor.mix(base, tinycolor("#ebeae8"), 94).toHexString(),
            dividerLight: tinycolor.mix(base, tinycolor("#cacac6"), 74).toHexString(),
            dividerDark: tinycolor.mix(base, tinycolor("#4a4a48"), 76).toHexString(),
        };
    }

    function applyThemeSurfaces(surfaces) {
        if (!scene) return;
        if (!surfaces) {
            clearThemeSurfaces();
            return;
        }
        scene.style.setProperty("--th-bg-light", surfaces.bgLight);
        scene.style.setProperty("--th-bg-dark", surfaces.bgDark);
        scene.style.setProperty("--th-label-light", surfaces.labelLight);
        scene.style.setProperty("--th-label-dark", surfaces.labelDark);
        scene.style.setProperty("--th-chip-bg-light", surfaces.chipBgLight);
        scene.style.setProperty("--th-chip-bg-dark", surfaces.chipBgDark);
        scene.style.setProperty("--th-chip-fg-light", surfaces.chipFgLight);
        scene.style.setProperty("--th-chip-fg-dark", surfaces.chipFgDark);
        scene.style.setProperty("--th-divider-light", surfaces.dividerLight);
        scene.style.setProperty("--th-divider-dark", surfaces.dividerDark);
    }

    /**
     * Value/Reference swatches: success (lime) green, with hue nudged toward accent for harmony.
     * Light scene: dark “raw value”; dark scene: pale tint (lime-750 / lime-100 roles).
     */
    function buildPaletteFromAccent(accentHex) {
        if (typeof tinycolor === "undefined") {
            return {
                light: Object.assign({}, DEFAULT_LIGHT),
                dark: Object.assign({}, DEFAULT_DARK),
                connector: "#85b7eb",
                surfaces: null,
            };
        }
        if (isAchromatic(accentHex)) {
            return {
                light: Object.assign({}, DEFAULT_LIGHT),
                dark: Object.assign({}, DEFAULT_DARK),
                connector: "#85b7eb",
                surfaces: null,
            };
        }

        var h = blendedSuccessHue(accentHex, 0.22);
        /* Light-mode: strong green. Dark-mode: pale mint with enough chroma/L so it reads green, not off-white */
        var lightVal = tinycolor({ h: h, s: 0.74, l: 0.33 }).toHexString();
        var darkVal = tinycolor({ h: h, s: 0.38, l: 0.76 }).toHexString();

        return {
            light: {
                val: lightVal,
                ref: "lime-750",
                sys: "success-strong",
                u1: "success-bg-strong",
                u2: "success-text",
                dot: lightVal,
            },
            dark: {
                val: darkVal,
                ref: "lime-100",
                sys: "success-strong",
                u1: "success-bg-strong",
                u2: "success-text",
                dot: darkVal,
            },
            connector: connectorFromAccent(accentHex),
            surfaces: surfacesFromAccent(accentHex),
        };
    }

    function applyAccentPalette() {
        var accent = getAccentHex();
        var pack = buildPaletteFromAccent(accent);
        lightD = pack.light;
        darkD = pack.dark;
        connectorColor = pack.connector;
        applyThemeSurfaces(pack.surfaces);
        setTheme(isDark);
    }

    function setTheme(dark) {
        isDark = !!dark;
        if (!scene || !sw) return;

        scene.classList.toggle("light", !isDark);
        scene.classList.toggle("dark", isDark);
        sw.classList.toggle("is-on", isDark);
        sw.setAttribute("aria-checked", isDark ? "true" : "false");
        sw.setAttribute(
            "aria-label",
            isDark ? "Color mode: dark. Switch to light mode." : "Color mode: light. Switch to dark mode."
        );

        if (lblLight) {
            lblLight.classList.toggle("is-active", !isDark);
        }
        if (lblDark) {
            lblDark.classList.toggle("is-active", isDark);
        }

        var d = isDark ? darkD : lightD;
        var tVal = document.getElementById("cs-th-t-val");
        var tRef = document.getElementById("cs-th-t-ref");
        var tSys = document.getElementById("cs-th-t-sys");
        var tU1 = document.getElementById("cs-th-t-u1");
        var tU2 = document.getElementById("cs-th-t-u2");
        if (tVal) tVal.textContent = d.val;
        if (tRef) tRef.textContent = d.ref;
        if (tSys) tSys.textContent = d.sys;
        if (tU1) tU1.textContent = d.u1;
        if (tU2) tU2.textContent = d.u2;

        ["cs-th-d-val", "cs-th-d-ref", "cs-th-d-sys", "cs-th-d-u1", "cs-th-d-u2"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.background = d.dot;
        });

        draw();
    }

    function toggleTheme() {
        setTheme(!isDark);
    }

    function pos(el) {
        if (!scene || !el) return { cx: 0, top: 0, bot: 0 };
        var sr = scene.getBoundingClientRect();
        var r = el.getBoundingClientRect();
        return {
            cx: r.left + r.width / 2 - sr.left,
            top: r.top - sr.top,
            bot: r.top + r.height - sr.top,
        };
    }

    function draw() {
        if (!svg || !scene) return;
        var ns = "http://www.w3.org/2000/svg";
        svg.innerHTML = "";

        var swLine = 2;
        var color = connectorColor;
        var pad = 10;

        var defs = document.createElementNS(ns, "defs");
        var marker = document.createElementNS(ns, "marker");
        marker.setAttribute("id", "cs-th-ah");
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "5");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "7");
        marker.setAttribute("markerHeight", "7");
        marker.setAttribute("orient", "auto-start-reverse");
        var mp = document.createElementNS(ns, "path");
        mp.setAttribute("d", "M0 0L5 5L0 10");
        mp.setAttribute("fill", "none");
        mp.setAttribute("stroke", color);
        mp.setAttribute("stroke-width", String(swLine));
        mp.setAttribute("stroke-linecap", "round");
        mp.setAttribute("stroke-linejoin", "round");
        marker.appendChild(mp);
        defs.appendChild(marker);
        svg.appendChild(defs);

        function addEl(tag, attrs) {
            var el = document.createElementNS(ns, tag);
            for (var k in attrs) {
                if (Object.prototype.hasOwnProperty.call(attrs, k)) {
                    el.setAttribute(k, String(attrs[k]));
                }
            }
            svg.appendChild(el);
        }

        var chipVal = document.getElementById("cs-th-c-val");
        var chipRef = document.getElementById("cs-th-c-ref");
        var chipSys = document.getElementById("cs-th-c-sys");
        var chipU1 = document.getElementById("cs-th-c-u1");
        var chipU2 = document.getElementById("cs-th-c-u2");
        if (!chipVal || !chipRef || !chipSys || !chipU1 || !chipU2) return;

        var pVal = pos(chipVal);
        var pRef = pos(chipRef);
        var pSys = pos(chipSys);
        var pU1 = pos(chipU1);
        var pU2 = pos(chipU2);

        function straightArrow(from, to) {
            addEl("line", {
                x1: from.cx,
                y1: from.bot + pad,
                x2: to.cx,
                y2: to.top - pad,
                stroke: color,
                "stroke-width": swLine,
                "stroke-linecap": "round",
                "marker-end": "url(#cs-th-ah)",
            });
        }

        straightArrow(pVal, pRef);
        straightArrow(pRef, pSys);

        [pU1, pU2].forEach(function (target) {
            var x1 = pSys.cx;
            var y1 = pSys.bot + pad;
            var x2 = target.cx;
            var y2 = target.top - pad;
            var dy = y2 - y1;
            addEl("path", {
                d: "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + dy) + ", " + x2 + " " + (y2 - dy) + ", " + x2 + " " + y2,
                fill: "none",
                stroke: color,
                "stroke-width": swLine,
                "stroke-linecap": "round",
                "marker-end": "url(#cs-th-ah)",
            });
        });
    }

    if (sw) {
        sw.addEventListener("click", toggleTheme);
    }
    if (lblLight) {
        lblLight.addEventListener("click", function () {
            if (isDark) setTheme(false);
        });
    }
    if (lblDark) {
        lblDark.addEventListener("click", function () {
            if (!isDark) setTheme(true);
        });
    }

    window.addEventListener("portfolioThemePrimaryChanged", function () {
        applyAccentPalette();
    });

    window.addEventListener("storage", function (e) {
        if (e.key === THEME_KEY) {
            applyAccentPalette();
        }
    });

    window.addEventListener("resize", draw);

    if (typeof window.ResizeObserver !== "undefined" && scene) {
        var ro = new ResizeObserver(function () {
            draw();
        });
        ro.observe(scene);
    }

    function boot() {
        applyAccentPalette();
        setTimeout(draw, 60);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
