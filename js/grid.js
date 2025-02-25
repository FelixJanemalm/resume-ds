document.addEventListener("DOMContentLoaded", function () {
  const canvas = document.getElementById('grid');
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

  document.addEventListener("scroll", () => {
      document.documentElement.style.setProperty("--scroll", window.scrollY + "px");
  });

  // Detect mobile device
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  
  if (!isMobile) {
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

      canvas.addEventListener('mousemove', (event) => {
          distortGrid(event.offsetX, event.offsetY);
      });

      canvas.addEventListener('mouseout', drawGrid);
  }
  
  function observeColorChanges() {
      const observer = new MutationObserver(() => {
          const newColor = getGridColor();
          if (newColor !== gridColor) {
              gridColor = newColor;
              drawGrid(); // Redraw grid with new color
          }
      });

      observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style'],
      });
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); // Initial draw
  observeColorChanges(); // Start observing changes to the CSS variable
});


/*

const grid = document.querySelector('.dot-grid');
const dotSize = 1;
const padding = 40;
const sizes = [0, 0, 0, 0, 1.5, 1.5, 1.5, 1.5, 3, 4, 5];
let animationReq;
let increment = 0;
let dots = [];
window.addEventListener('resize', createGrid);

createGrid();

function createGrid (event) {
	clearGrid();
	
	const gridR = grid.getBoundingClientRect();
	const width = (gridR.width - (padding * 2)) / (padding - (dotSize / 2));
	const height = (gridR.height - (padding * 2)) / (padding - (dotSize / 2));

	for	(let i = 0; i < width; i++) {
		for	(let j = 0; j < height; j++) {
			const dot = document.createElement('div');
			dot.className = 'dot';
			dot.style.top = j * padding + padding + 'px';
			dot.style.left = i * padding + padding + 'px';
			grid.appendChild(dot);
			dots.push(dot);
		}
	}
	
	animationReq = window.requestAnimationFrame(animateGrid);
}

function clearGrid () {
	window.cancelAnimationFrame(animationReq);
	while (grid.firstChild) { grid.removeChild(grid.firstChild); }
	dots = [];
}


function animateGrid () {
	const dot = dots[Math.floor(Math.random() * dots.length)];
	const scale = sizes[Math.floor(Math.random() * sizes.length)];
    const timeoutTime = Math.floor(Math.random() * (5000 - 10 + 1)) + 10;
	dot.style.transform =  `scale(${scale})`;
	const st1 = setTimeout(() =>{
		dot.style.transform = `scale(1)`;
		clearTimeout(st1);
	}, 600);
	
	animationReq = window.requestAnimationFrame(animateGrid);
}
    */