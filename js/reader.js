document.addEventListener('DOMContentLoaded', function () {
    // Select all elements with data-split attribute
    var splitElements = document.querySelectorAll('[data-split]');
    
    // Process each element
    splitElements.forEach(function(toSplit, elementIndex) {
      var content = toSplit.innerText;
      var contentLength = content.length;
      
      // Find the parent reader section
      var readerSection = toSplit.closest('.reader, .reader2');
      
      var PPC = 5; // Pixels per character
      var BUFFER = 40;
      
      // Set CSS custom properties for this specific section
      readerSection.style.setProperty('--buffer', BUFFER);
      readerSection.style.setProperty('--ppc', PPC);
      readerSection.style.setProperty('--pad', 8);
      readerSection.style.setProperty('--content-length', contentLength + 2);
      
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
      readerSection.style.setProperty('--text-container-height', textContainerHeight + 'px');
    });
    
    // Fallback for devices without CSS scroll animation support.
    // This used to re-run querySelectorAll, read offsetTop (a forced layout) and write an opacity to every word on
    // every scroll event — read, write, read, write, unthrottled. The sections and their words do not change after
    // setup, so they are collected once; offsetTop is measured outside the handler and re-measured on resize; the
    // handler itself is coalesced into a frame and only writes to a word whose state actually flipped.
    if (!CSS.supports('animation-timeline: scroll()')) {
      var sections = [].map.call(document.querySelectorAll('.reader, .reader2'), function (section) {
        var splitElement = section.querySelector('[data-split]');
        return {
          section: section,
          top: 0,
          words: splitElement ? [].map.call(splitElement.children, function (word) {
            return { el: word, start: parseFloat(word.dataset.start) * 5, lit: null };   // PPC is 5
          }) : []
        };
      }).filter(function (s) { return s.words.length; });

      if (sections.length) {
        var measure = function () {
          sections.forEach(function (s) { s.top = s.section.offsetTop; });
        };

        var paint = function () {
          frame = 0;
          var scrollPosition = window.scrollY;
          sections.forEach(function (s) {
            var threshold = scrollPosition - s.top;
            s.words.forEach(function (word) {
              var lit = threshold > word.start - 100;   // Expands range progressively
              if (lit === word.lit) return;
              word.lit = lit;
              word.el.style.opacity = lit ? 1 : 0.2;
            });
          });
        };

        var frame = 0;
        var schedule = function () { if (!frame) frame = requestAnimationFrame(paint); };

        measure();
        schedule();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', function () { measure(); schedule(); }, { passive: true });
      }
    }
  });