/* grid.js — the hero's pinstripe grid, and the ripple it makes under the pointer.
 *
 * There used to be a scroll listener here that wrote window.scrollY to --scroll on <html> on every scroll
 * event. Nothing reads --scroll: cards.css's parallax rule, the one the old comment pointed at, is inside a
 * commented-out block. It was not free either. Writing an inline style on <html> invalidates style for the
 * whole document, and the MutationObserver below — which watches that same element's style attribute for
 * the colour picker — fired on every one of those writes and called getComputedStyle, forcing a synchronous
 * style recalc per scroll tick. If the parallax is ever switched back on in cards.css, the writer has to
 * come back with it, coalesced into a frame.
 */
document.addEventListener("DOMContentLoaded", function () {
  const canvas = document.getElementById('grid');
  if (!canvas) return;

  // Phones get no grid at all: the canvas is hidden in hero.css at the same
  // breakpoint, and without a hover pointer the distortion is unreachable anyway.
  const isMobile = window.matchMedia('(max-width: 767px)').matches
      || window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (isMobile) {
      canvas.remove();
      return;
  }

  const ctx = canvas.getContext('2d');

  function getGridColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--gridOverlay').trim();
  }

  let gridColor = getGridColor(); // Initial color

  function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawGrid();
  }

  const gridSize = 56;

  function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.imageSmoothingEnabled = false;

    ctx.beginPath();

    for (let y = 0.5; y <= canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }

    for (let x = 0.5; x <= canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }

    ctx.stroke();
  }

  const distortionStrength = 5.6;
  const falloffFactor = 0.0025;

  function distortGrid(mouseX, mouseY) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();

      for (let y = 0; y <= canvas.height; y += gridSize) {
          let startNewLine = true;
          for (let x = 0; x <= canvas.width; x += gridSize) {
              const dx = mouseX - x;
              const dy = mouseY - y;
              const dist = Math.sqrt(dx * dx + dy * dy) + 0.0001;
              const falloff = Math.exp(-dist * falloffFactor);
              const offsetY = (dy / dist) * distortionStrength * falloff;

              if (startNewLine) {
                  ctx.moveTo(x, y + offsetY);
                  startNewLine = false;
              } else {
                  ctx.lineTo(x, y + offsetY);
              }
          }
      }

      for (let x = 0; x <= canvas.width; x += gridSize) {
          let startNewLine = true;
          for (let y = 0; y <= canvas.height; y += gridSize) {
              const dx = mouseX - x;
              const dy = mouseY - y;
              const dist = Math.sqrt(dx * dx + dy * dy) + 0.0001;
              const falloff = Math.exp(-dist * falloffFactor);
              const offsetX = (dx / dist) * distortionStrength * falloff;

              if (startNewLine) {
                  ctx.moveTo(x + offsetX, y);
                  startNewLine = false;
              } else {
                  ctx.lineTo(x + offsetX, y);
              }
          }
      }

      ctx.lineWidth = 1;
      ctx.strokeStyle = gridColor;
      ctx.stroke();
  }

  /* One redraw per frame, whatever the pointer's report rate: a full distort is ~2,400 iterations of sqrt and
     exp at 1440p, and a 120 Hz mouse fires far more often than the screen can show the result. The current
     state decides what gets drawn rather than each event queueing its own job, so whichever event lands last
     in a frame is the one that shows — a mouseout arriving behind a mousemove cannot be swallowed. */
  let frame = 0, pointer = null, needsResize = false;

  function render() {
      frame = 0;
      if (needsResize) {
          needsResize = false;
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
      }
      if (pointer) distortGrid(pointer[0], pointer[1]); else drawGrid();
  }

  function schedule() {
      if (!frame) frame = requestAnimationFrame(render);
  }

  canvas.addEventListener('mousemove', (event) => {
      pointer = [event.offsetX, event.offsetY];
      schedule();
  }, { passive: true });

  canvas.addEventListener('mouseout', () => {
      pointer = null;
      schedule();
  }, { passive: true });

  function observeColorChanges() {
      const observer = new MutationObserver(() => {
          const newColor = getGridColor();
          if (newColor === gridColor) return;   // the picker writes ~15 properties per change; only this one matters
          gridColor = newColor;
          schedule();
      });

      observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style'],
      });
  }

  window.addEventListener('resize', () => {
      needsResize = true;
      schedule();
  }, { passive: true });

  resizeCanvas(); // Initial draw
  observeColorChanges(); // Start observing changes to the CSS variable
});
