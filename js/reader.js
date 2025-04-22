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
    
    // Fallback for devices without CSS scroll animation support
    if (!CSS.supports('animation-timeline: scroll()')) {
      window.addEventListener('scroll', function () {
        var scrollPosition = window.scrollY;
        
        // Handle each reader section separately
        document.querySelectorAll('.reader, .reader2').forEach(function(section) {
          var sectionTop = section.offsetTop;
          var sectionHeight = section.offsetHeight;
          var splitElement = section.querySelector('[data-split]');
          
          if (splitElement) {
            Array.prototype.forEach.call(splitElement.children, function (word) {
              var start = parseFloat(word.dataset.start) * 5; // Using the PPC value (5)
              var threshold = scrollPosition - sectionTop;
              
              if (threshold > start - 100) { // Expands range progressively
                word.style.opacity = 1;
              } else {
                word.style.opacity = 0.2;
              }
            });
          }
        });
      });
    }
  });