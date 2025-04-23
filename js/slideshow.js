document.addEventListener('DOMContentLoaded', function() {
    // Initialize each slider separately
    initializeSlider('.slider-tokens');
    initializeSlider('.slider-design-system');
    
    // Set up resize observer for dynamic scaling
    setupResizeObservers();
    
    // Initial calculation of container scale
    updateContainerScales();
    
    // Listen for window resize events to recalculate scaling
    window.addEventListener('resize', debounce(updateContainerScales, 250));
});

function initializeSlider(sliderClass) {
    const container = document.querySelector(sliderClass);
    if (!container) return; // Skip if this slider doesn't exist
    
    const slides = container.querySelectorAll('.slider-slide');
    const slideWrapper = container.querySelector('.slider-slides');
    const prevButton = container.querySelector('.slider-prev-btn');
    const nextButton = container.querySelector('.slider-next-btn');
    const slideCounter = container.querySelector('.slider-counter');
    const resetButton = container.querySelector('.slider-reset-btn');
    const fullscreenButton = container.querySelector('.slider-fullscreen-btn');
    const exitFullscreenButton = container.querySelector('.slider-exit-fullscreen-btn');
    
    let currentSlide = 0;
    const totalSlides = slides.length;
    
    // Update the counter with the correct total
    if (slideCounter) {
        slideCounter.textContent = `1 / ${totalSlides}`;
    }
    
    function showSlide(index) {
        // Hide all slides
        slides.forEach(slide => {
            slide.classList.remove('active');
        });
        
        // Show the selected slide
        slides[index].classList.add('active');
        
        // Update counter
        if (slideCounter) {
            slideCounter.textContent = `${index + 1} / ${totalSlides}`;
        }
        
        // Update buttons
        if (prevButton) prevButton.disabled = index === 0;
        if (nextButton) nextButton.disabled = index === totalSlides - 1;
        
        // Update current slide tracker
        currentSlide = index;
    }
    
    // Make the slide area clickable to advance to next slide
    if (slideWrapper) {
        slideWrapper.addEventListener('click', function(event) {
            // Prevent click from triggering if it's on a button
            if (event.target.closest('button')) {
                return;
            }
            
            if (currentSlide < totalSlides - 1) {
                showSlide(currentSlide + 1);
            }
        });
    }
    
    // Event listeners for navigation buttons
    if (prevButton) {
        prevButton.addEventListener('click', function() {
            if (currentSlide > 0) {
                showSlide(currentSlide - 1);
            }
        });
    }
    
    if (nextButton) {
        nextButton.addEventListener('click', function() {
            if (currentSlide < totalSlides - 1) {
                showSlide(currentSlide + 1);
            }
        });
    }
    
    // Reset button (return to first slide)
    if (resetButton) {
        resetButton.addEventListener('click', function() {
            showSlide(0);
        });
    }
    
    // Handle fullscreen
    function enterFullscreen() {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) {
            container.msRequestFullscreen();
        }
        
        container.classList.add('is-fullscreen');
        document.body.style.overflow = 'hidden';
        if (fullscreenButton) fullscreenButton.style.display = 'none';
        if (exitFullscreenButton) exitFullscreenButton.style.display = 'flex';
    }
    
    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        container.classList.remove('is-fullscreen');
        document.body.style.overflow = '';
        if (fullscreenButton) fullscreenButton.style.display = 'flex';
        if (exitFullscreenButton) exitFullscreenButton.style.display = 'none';
    }
    
    // Fullscreen button
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', function() {
            enterFullscreen();
        });
    }
    
    // Exit fullscreen button
    if (exitFullscreenButton) {
        exitFullscreenButton.addEventListener('click', function() {
            exitFullscreen();
        });
    }
    
    // Listen for fullscreen change for this specific container
    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement && container.classList.contains('is-fullscreen')) {
            container.classList.remove('is-fullscreen');
            document.body.style.overflow = '';
            if (fullscreenButton) fullscreenButton.style.display = 'flex';
            if (exitFullscreenButton) exitFullscreenButton.style.display = 'none';
        }
    });
    
    // Mark this slider as active when interacted with
    container.addEventListener('mouseenter', function() {
        document.querySelectorAll('.slider-container').forEach(slider => {
            slider.classList.remove('keyboard-active');
        });
        container.classList.add('keyboard-active');
    });
    
    // Initialize first slide
    showSlide(0);
}

// Global keyboard handler that only affects the active slider
document.addEventListener('keydown', function(e) {
    const activeSlider = document.querySelector('.slider-container.keyboard-active');
    if (!activeSlider) return;
    
    if (e.key === 'ArrowLeft') {
        const prevBtn = activeSlider.querySelector('.slider-prev-btn');
        if (prevBtn && !prevBtn.disabled) {
            prevBtn.click();
        }
    } else if (e.key === 'ArrowRight') {
        const nextBtn = activeSlider.querySelector('.slider-next-btn');
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
        }
    } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
            const exitBtn = activeSlider.querySelector('.slider-exit-fullscreen-btn');
            if (exitBtn) {
                exitBtn.click();
            } else {
                document.exitFullscreen();
                document.body.style.overflow = '';
            }
        }
    }
});

// Set up ResizeObserver for each slider container
function setupResizeObservers() {
    if ('ResizeObserver' in window) {
        const sliders = document.querySelectorAll('.slider-container');
        
        const resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const slider = entry.target;
                calculateContainerScale(slider, slider.classList.contains('is-fullscreen'));
            });
        });
        
        sliders.forEach(slider => {
            resizeObserver.observe(slider);
        });
    }
}

// Calculate and apply container scale based on slider size
function calculateContainerScale(slider, isFullscreen) {
    const containerWidth = slider.offsetWidth;
    
    // Base scale calculation - adjust these values to tune the scaling
    let scale;
    
    if (isFullscreen) {
        // For fullscreen mode, scale based on viewport
        scale = Math.min(Math.max(window.innerWidth / 1200, 0.8), 1.5);
    } else {
        // For normal mode, scale based on container width
        scale = Math.min(Math.max(containerWidth / 1000, 0.7), 1.2);
    }
    
    // Apply the scale as a CSS variable
    slider.style.setProperty('--container-scale', scale.toFixed(2));
    
    // Adjust font size based on container width
    const baseFontSize = Math.min(Math.max(14, containerWidth / 50), 24);
    slider.style.fontSize = `${baseFontSize}px`;
}

// Update container scales for all sliders
function updateContainerScales() {
    const sliders = document.querySelectorAll('.slider-container');
    
    sliders.forEach(slider => {
        calculateContainerScale(slider, slider.classList.contains('is-fullscreen'));
    });
}

// Debounce function to limit frequent calls
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}