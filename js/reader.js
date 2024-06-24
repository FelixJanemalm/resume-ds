document.addEventListener('DOMContentLoaded', function () {
    var toSplit = document.querySelector('[data-split]');
    var content = toSplit.innerText;
    var contentLength = content.length;
  
    var PPC = 10; // Pixels per character...
    var BUFFER = 40;
  
    // Set CSS custom properties
    document.documentElement.style.setProperty('--buffer', BUFFER);
    document.documentElement.style.setProperty('--ppc', PPC);
    document.documentElement.style.setProperty('--pad', 8);
    document.documentElement.style.setProperty('--content-length', contentLength + 2);
  
    var words = toSplit.innerText.split(' ');
    toSplit.innerHTML = '';
    var cumulation = 10;
    words.forEach(function (word, index) {
      var text = document.createElement('span');
      text.innerHTML = '<span>' + word + ' </span>';
      text.style = '--index: ' + index + '; --start: ' + cumulation + '; --end: ' + (cumulation + word.length) + ';';
      text.dataset.index = index;
      text.dataset.start = cumulation;
      text.dataset.end = cumulation + word.length;
      cumulation += word.length + 1;
      toSplit.appendChild(text);
    });
  
    // Calculate the height of the text-containing div
    var textContainerHeight = toSplit.offsetHeight;
    document.documentElement.style.setProperty('--text-container-height', textContainerHeight + 'px');
  
    if (!CSS.supports('animation-timeline: scroll()')) {
      gsap.registerPlugin(ScrollTrigger);
      console.info('GSAP ScrollTrigger: Registered');
      Array.prototype.forEach.call(toSplit.children, function (word) {
        gsap.fromTo(
          word,
          { '--active': 0 },
          {
            '--active': 1,
            ease: 'steps(1)',
            scrollTrigger: {
              trigger: '.reader',
              start: 'top top-=' + word.dataset.start * PPC,
              end: 'top top-=' + word.dataset.end * PPC,
              scrub: true,
            },
          }
        );
      });
  
      // Animate the section after the reader
      gsap.fromTo('.after-reader', {
        scale: 0.8,
        opacity: 0
      }, {
        scale: 1,
        opacity: 1,
        scrollTrigger: {
          trigger: '.after-reader',
          start: 'top 75%',
          end: 'top 25%',
          scrub: true
        }
      });
    }
  });
  