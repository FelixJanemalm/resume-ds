const slider = document.querySelector('[data-carousel]');
const slides = [...document.querySelectorAll('.Wallop-item')]
this.wallop = new Wallop(slider);

let prev = 0

const removePrevClasses = (index) => {
	let prevClass
	if (slides[index].classList.contains('Wallop-item--hidePrevious')) {
		prevClass = 'Wallop-item--hidePrevious'
	} else if (slides[index].classList.contains('Wallop-item--hideNext')) {
		prevClass = 'Wallop-item--hideNext'
	}
	
	if (prevClass) {
		setTimeout(() => {
		slides[index].classList.remove(prevClass)
	}, 600)
	}
}

const onChange = () => {
	removePrevClasses(prev)
	prev = this.wallop.currentItemIndex
}

this.wallop.on('change', onChange);
/* Touch: swipe left/right to move between testimonials.
   Pointer events, touch and pen only — a mouse drag stays a text selection. */
if (slider) {
	const SWIPE_DISTANCE = 45;   // px of travel that counts as a swipe
	const SWIPE_VELOCITY = 0.4;  // px/ms: a short, quick flick counts too
	const DIRECTION_LOCK = 10;   // px before the gesture commits to an axis

	let startX = 0, startY = 0, startTime = 0;
	let tracking = false, axis = null, swiped = false;

	const end = (event) => {
		if (!tracking) return;
		const dx = event.clientX - startX;
		const elapsed = Math.max(1, event.timeStamp - startTime);
		tracking = false;

		if (axis !== 'x') return;
		if (Math.abs(dx) < SWIPE_DISTANCE && Math.abs(dx) / elapsed < SWIPE_VELOCITY) return;

		swiped = true;   // the click this gesture ends with is not a tap: see below
		dx < 0 ? this.wallop.next() : this.wallop.previous();
	};

	slider.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'mouse') return;
		startX = event.clientX;
		startY = event.clientY;
		startTime = event.timeStamp;
		tracking = true;
		axis = null;
		swiped = false;
	});

	slider.addEventListener('pointermove', (event) => {
		if (!tracking || axis) return;
		const dx = Math.abs(event.clientX - startX);
		const dy = Math.abs(event.clientY - startY);
		if (Math.max(dx, dy) < DIRECTION_LOCK) return;
		axis = dx > dy ? 'x' : 'y';   // a mostly vertical drag is the page scrolling: let it go
		if (axis === 'y') tracking = false;
	});

	slider.addEventListener('pointerup', end);
	slider.addEventListener('pointercancel', () => { tracking = false; });

	// a swipe that lifted off over the "Read on LinkedIn" link must not open it
	slider.addEventListener('click', (event) => {
		if (!swiped) return;
		swiped = false;
		event.preventDefault();
		event.stopPropagation();
	}, true);
}
