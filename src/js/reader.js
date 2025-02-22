document.addEventListener('DOMContentLoaded', function () {
  var toSplit = document.querySelector('[data-split]');
  var content = toSplit.innerText;
  var contentLength = content.length;

  var PPC = 5; // Pixels per character
  var BUFFER = 40;

  // Set CSS custom properties
  document.documentElement.style.setProperty('--buffer', BUFFER);
  document.documentElement.style.setProperty('--ppc', PPC);
  document.documentElement.style.setProperty('--pad', 8);
  document.documentElement.style.setProperty('--content-length', contentLength + 2);

  var words = content.split(' ');
  toSplit.innerHTML = '';
  var cumulation = 10;
  words.forEach(function (word, index) {
      var text = document.createElement('span');
      text.textContent = word + ' ';
      text.style = `--index: ${index}; --start: ${cumulation}; --end: ${cumulation + word.length};`;
      text.dataset.index = index;
      text.dataset.start = cumulation;
      text.dataset.end = cumulation + word.length;
      cumulation += word.length + 1;
      toSplit.appendChild(text);
  });

  // Calculate the height of the text-containing div
  var textContainerHeight = toSplit.offsetHeight;
  document.documentElement.style.setProperty('--text-container-height', textContainerHeight + 'px');

  // Fallback for devices without CSS scroll animation support
  if (!CSS.supports('animation-timeline: scroll()')) {
      window.addEventListener('scroll', function () {
          var scrollPosition = window.scrollY;
          var section = document.querySelector('.reader');
          var sectionTop = section.offsetTop;
          var sectionHeight = section.offsetHeight;
          var relativeScroll = (scrollPosition - sectionTop) / sectionHeight;

          Array.prototype.forEach.call(toSplit.children, function (word, index) {
              var start = parseFloat(word.dataset.start) * PPC;
              var end = parseFloat(word.dataset.end) * PPC;
              var threshold = scrollPosition - sectionTop;
              
              if (threshold > start - 100) { // Expands range progressively
                  word.style.opacity = 1;
              } else {
                  word.style.opacity = 0.2;
              }
          });
      });
  }
});

