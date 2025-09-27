/**
 * Google Drive Sync Integration
 * Simplified integration for Yoga Vasishtha app
 */

// Initialize sync manager and UI
const syncManager = new GoogleDriveSync({
    fileName: 'yoga-vasishtha-sync.json',
    onStatusChange: (status) => {
        console.log('🔍 DEBUG: onStatusChange called with status:', status);
        if (window.syncUI) {
            console.log('🔍 DEBUG: Calling syncUI.onSyncManagerStateChange with:', status === 'connected');
            window.syncUI.onSyncManagerStateChange(status === 'connected');
        } else {
            console.log('🔍 DEBUG: window.syncUI not available yet');
        }
    }
});

// Configure with web client ID
syncManager.configure('75331868163-0o2bkv6mas7a5ljsm2a81h066hshtno8.apps.googleusercontent.com');

// Check for OAuth redirect on page load
function handleOAuthRedirect() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const state = params.get('state');
        const error = params.get('error');

        if (state && (state.startsWith('webview_auth_') || state.startsWith('web_auth_') || state.startsWith('pwa_auth_'))) {

            // Post message to parent window (for iframe case)
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'oauth_result',
                    access_token: accessToken,
                    error: error
                }, window.location.origin);
                return;
            }

            // Handle direct redirect case
            if (accessToken) {
                // Store token persistently using the new token storage
                sessionStorage.setItem('oauth_access_token', accessToken);
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (error) {
                console.error('OAuth redirect failed:', error);
                sessionStorage.setItem('oauth_error', error);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    }
}

// Initialize when page loads
window.addEventListener('load', async () => {
    console.log('🔍 DEBUG: Page load event fired');

    // Check for OAuth redirect first
    handleOAuthRedirect();

    // Find sync container and show initializing state immediately
    const syncContainer = document.getElementById('sync-placeholder');
    if (syncContainer) {
        console.log('🔍 DEBUG: Creating sync UI in initializing state');
        // Create sync UI in initializing state
        window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
        window.syncUI.setState('initializing');
        makeThemeAware();
    } else {
        console.warn('⚠️  Sync container not found - sync UI disabled');
        return;
    }

    try {
        console.log('🔍 DEBUG: About to call syncManager.initialize()');
        // Initialize sync manager (includes token restoration)
        const initialized = await syncManager.initialize();
        console.log('🔍 DEBUG: syncManager.initialize() returned:', initialized);

        if (!initialized) {
            console.log('🔍 DEBUG: Initialization failed, setting error state');
            // Initialization failed - show error state with retry option
            window.syncUI.onSyncManagerFailed();
            return;
        }

        // Check for stored OAuth token from redirect
        const storedToken = sessionStorage.getItem('oauth_access_token');
        console.log('🔍 DEBUG: Stored OAuth token from session:', storedToken ? 'found' : 'none');
        if (storedToken) {
            console.log('🔍 DEBUG: Processing stored OAuth token');
            // Save token persistently and set up authentication
            await syncManager.saveTokenData(storedToken, 3600); // Default 1 hour expiry
            syncManager.accessToken = storedToken;
            syncManager.isAuthenticated = true;
            gapi.client.setToken({ access_token: storedToken });
            syncManager.onStatusChange('connected');
            sessionStorage.removeItem('oauth_access_token');
        }

        console.log('🔍 DEBUG: Current auth state before wait:', syncManager.isAuthenticated);
        // Wait for any pending token restoration to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('🔍 DEBUG: Current auth state after wait:', syncManager.isAuthenticated);

        // Now set UI state based on actual authentication status
        console.log('🔍 DEBUG: Calling onSyncManagerReady()');
        window.syncUI.onSyncManagerReady();

    } catch (error) {
        console.error('❌ Sync initialization error:', error);
        // Always show UI with error state, never leave it blank
        if (window.syncUI) {
            window.syncUI.onSyncManagerFailed();
        }
    }
});

// Make sync UI theme-aware
function makeThemeAware() {
    const syncTitle = document.querySelector('.sync-section-title');
    if (syncTitle) {
        // Apply theme class from body to sync title
        const bodyTheme = document.body.className;
        syncTitle.className = `sync-section-title ${bodyTheme}`;

        // Watch for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const newTheme = document.body.className;
                    syncTitle.className = `sync-section-title ${newTheme}`;
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

// Debug function to view sync file content
window.viewSyncFile = async function() {
    if (!window.syncManager?.isAuthenticated) {
        console.warn('Not authenticated - connect to Google Drive first');
        return;
    }

    try {
        const data = await window.syncManager.download();
        if (data) {
        } else {
        }
        return data;
    } catch (error) {
        console.error('Failed to read sync file:', error);
    }
};

// Export for debugging
window.syncManager = syncManager;