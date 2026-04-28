/**
 * Cumulative pipeline chart (design-tokens case study).
 * Logic matches revenue_impact_pipeline_v6.html; themed for dark case-study pages.
 */
(function () {
    function cssVar(name, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
    }

    function init() {
        const el = document.getElementById("cs-revenue-pipeline-chart");
        if (!el || typeof Chart === "undefined") return;

        const tickColor = cssVar("--textSubtle", "rgba(237, 237, 239, 0.55)");
        const gridColor = "rgba(255, 255, 255, 0.06)";
        const axisTitle = cssVar("--textSubtle", "#9a9a9f");

        const rate = 1.25;
        /** One point per month (M0–M12) so tooltips align to months, not 120 micro-steps */
        const monthCount = 12;
        const lastIdx = monthCount;

        const adjStart = 0;
        const adjEnd = 6;
        const origStart = 3;
        const origEnd = 11;

        const adjGrowth = 0.03;
        const origGrowth = 0.015;

        function ease(t) {
            return t * t * (3 - 2 * t);
        }

        function getRate(month, rStart, rEnd, growth) {
            let base;
            if (month <= rStart) return 0;
            if (month >= rEnd) base = rate;
            else {
                const t = (month - rStart) / (rEnd - rStart);
                base = rate * ease(t);
            }
            const pastFull = Math.max(0, month - rEnd);
            return base * (1 + growth * pastFull);
        }

        function getCum(month, rStart, rEnd, growth) {
            const steps = 300;
            let sum = 0;
            const dt = month / steps;
            for (let i = 0; i < steps; i++) {
                const m = (i + 0.5) * dt;
                sum += getRate(m, rStart, rEnd, growth) * dt;
            }
            return sum;
        }

        const labels = [];
        const origD = [];
        const adjD = [];

        for (let i = 0; i <= monthCount; i++) {
            labels.push("M" + i);
            origD.push(Math.round(getCum(i, origStart, origEnd, origGrowth) * 100) / 100);
            adjD.push(Math.round(getCum(i, adjStart, adjEnd, adjGrowth) * 100) / 100);
        }

        /* Narrative figure: $5.83M additional pipeline vs original over 12 months (scale gap to match copy) */
        const targetGapM = 5.83;
        const rawGap = adjD[lastIdx] - origD[lastIdx];
        if (rawGap > 0) {
            const scale = targetGapM / rawGap;
            for (let i = 0; i <= monthCount; i++) {
                adjD[i] = Math.round((origD[i] + (adjD[i] - origD[i]) * scale) * 100) / 100;
            }
        }

        /* Pin month-12 gap to narrative $5.83M (avoids float/rounding drift on the label) */
        adjD[lastIdx] = Math.round((origD[lastIdx] + targetGapM) * 100) / 100;
        const bonus = adjD[lastIdx] - origD[lastIdx];

        const additionalPlugin = {
            id: "additionalLabel",
            afterDraw(chart) {
                const meta0 = chart.getDatasetMeta(0);
                const meta1 = chart.getDatasetMeta(1);
                if (!meta0.data.length || !meta1.data.length) return;

                const midIdx = Math.round(monthCount * 0.68);
                const adjPt = meta0.data[midIdx];
                const origPt = meta1.data[midIdx];
                if (!adjPt || !origPt) return;

                const x = adjPt.x;
                const y = (adjPt.y + origPt.y) / 2;

                const ctx = chart.ctx;
                ctx.save();
                ctx.font = "500 15px system-ui, sans-serif";
                ctx.fillStyle = "#D2EAB0";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("+$" + bonus.toFixed(2) + "M", x, y - 10);
                ctx.font = "400 12px system-ui, sans-serif";
                ctx.fillStyle = "rgba(200, 220, 170, 0.92)";
                ctx.fillText("additional pipeline", x, y + 8);
                ctx.restore();
            },
        };

        new Chart(el, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Accelerated",
                        data: adjD,
                        borderColor: "#97C459",
                        backgroundColor: "rgba(151, 196, 89, 0.2)",
                        fill: "1",
                        tension: 0.35,
                        borderWidth: 2.5,
                    },
                    {
                        label: "Original",
                        data: origD,
                        borderColor: "#1D9E75",
                        backgroundColor: "rgba(29, 158, 117, 0.35)",
                        fill: "origin",
                        tension: 0.35,
                        borderWidth: 2.5,
                    },
                ],
            },
            plugins: [additionalPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                elements: {
                    point: {
                        radius: 0,
                        hoverRadius: 5,
                        hitRadius: 28,
                    },
                },
                /* Month columns: index mode shows both series; intersect false = anywhere in the band */
                interaction: {
                    mode: "index",
                    intersect: false,
                    axis: "x",
                },
                hover: {
                    mode: "index",
                    intersect: false,
                    axis: "x",
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => (items[0]?.label != null ? String(items[0].label) : ""),
                            label: (c) => c.dataset.label + ": $" + c.parsed.y.toFixed(2) + "M",
                        },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: "Months", color: axisTitle },
                        grid: { color: gridColor },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 0,
                            color: tickColor,
                            maxTicksLimit: 13,
                        },
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Cumulative pipeline increase ($M)",
                            color: axisTitle,
                        },
                        min: 0,
                        max: 14,
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            callback: (v) => "$" + v + "M",
                        },
                    },
                },
            },
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
