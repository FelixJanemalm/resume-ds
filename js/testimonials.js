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