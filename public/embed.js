(function() {
  'use strict';
  
  var scripts = document.querySelectorAll('script[data-user]');
  scripts.forEach(function(script) {
    var user = script.getAttribute('data-user');
    var event = script.getAttribute('data-event') || '';
    var baseUrl = script.src.replace('/embed.js', '');
    
    var container = document.createElement('div');
    container.className = 'tinycal-embed';
    
    var iframe = document.createElement('iframe');
    iframe.src = baseUrl + '/' + user + (event ? '/' + event : '');
    iframe.style.width = '100%';
    iframe.style.height = '700px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.loading = 'lazy';
    
    container.appendChild(iframe);
    script.parentNode.insertBefore(container, script.nextSibling);
    
    // Listen for resize messages from iframe
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'tinycal:resize') {
        iframe.style.height = e.data.height + 'px';
      }
    });
  });
})();
