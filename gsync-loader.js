// Load Google Drive sync modules with proper dependency order
(function() {
  let gsiLoaded = false;
  let apiLoaded = false;

  function loadSyncModules() {
    if (gsiLoaded && apiLoaded) {
      // Load gsync modules in proper sequence
      const modules = ['gsync-minimal.js', 'gsync-ui.js', 'gsync-integration.js'];
      let loadedCount = 0;

      function loadNextModule(index) {
        if (index >= modules.length) {
          return;
        }

        const script = document.createElement('script');
        script.src = modules[index];

        script.onload = () => {
          loadedCount++;
          loadNextModule(index + 1);
        };

        script.onerror = () => {
          console.error('Failed to load module:', modules[index]);
        };

        document.head.appendChild(script);
      }

      loadNextModule(0);
    }
  }

  // Google Identity Services
  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  gsiScript.onload = () => {
    gsiLoaded = true;
    loadSyncModules();
  };
  gsiScript.onerror = () => {
    console.warn('Google Identity Services failed to load - sync features will be disabled');
    gsiLoaded = true; // Allow other modules to load anyway
    loadSyncModules();
  };
  document.head.appendChild(gsiScript);

  // Google API
  const apiScript = document.createElement('script');
  apiScript.src = 'https://apis.google.com/js/api.js';
  apiScript.async = true;
  apiScript.defer = true;
  apiScript.onload = () => {
    apiLoaded = true;
    loadSyncModules();
  };
  apiScript.onerror = () => {
    console.warn('Google API failed to load - sync features will be disabled');
    apiLoaded = true; // Allow other modules to load anyway
    loadSyncModules();
  };
  document.head.appendChild(apiScript);
})();