// Load Google Drive sync modules with proper dependency order
(function() {
  let gsiLoaded = false;
  let apiLoaded = false;

  function loadSyncModules() {
    if (gsiLoaded && apiLoaded) {
      // Load gsync modules in sequence
      ['gsync-minimal.js', 'gsync-ui.js', 'gsync-integration.js'].forEach((src, index) => {
        const script = document.createElement('script');
        script.src = src;
        if (index === 0) script.onload = () => console.log('Google Drive sync modules loaded');
        document.head.appendChild(script);
      });
    }
  }

  // Google Identity Services
  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  gsiScript.onload = () => {
    console.log('Google Identity Services loaded');
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
    console.log('Google API loaded');
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