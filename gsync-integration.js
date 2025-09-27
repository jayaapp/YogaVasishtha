/**
 * Google Drive Sync Integration
 * Simplified integration for Yoga Vasishtha app
 */

// Auto-sync trigger for background synchronization
class AutoSyncTrigger {
    constructor(syncManager, syncUI) {
        this.syncManager = syncManager;
        this.syncUI = syncUI;
        this.syncTimeout = null;
        this.SYNC_DELAY = 2000; // 2 second debounce
        this.isPerformingSync = false;
    }

    /**
     * Trigger automatic sync after data changes
     */
    triggerSync(changeType) {
        // Only sync if authenticated
        if (!this.syncManager?.isAuthenticated) {
            return;
        }

        // Don't trigger if already syncing
        if (this.isPerformingSync) {
            return;
        }

        // Debounce multiple rapid changes
        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            this.performBackgroundSync(changeType);
        }, this.SYNC_DELAY);
    }

    /**
     * Perform background sync without blocking UI
     */
    async performBackgroundSync(changeType) {
        if (this.isPerformingSync || !this.syncManager?.isAuthenticated) {
            return;
        }

        try {
            this.isPerformingSync = true;

            // Show subtle sync indicator
            this.showSyncIndicator(true);

            // Reuse existing sync logic from UI
            await this.syncUI.performSync();

            // Show success indicator briefly
            this.showSyncNotification('Auto-sync completed', 'success');

        } catch (error) {
            console.warn('Auto-sync failed:', error);
            // Don't show error notifications for auto-sync failures
            // User can still manually sync if needed
        } finally {
            this.isPerformingSync = false;
            this.showSyncIndicator(false);
        }
    }

    /**
     * Show/hide subtle sync indicator
     */
    showSyncIndicator(isVisible) {
        // Add a small sync indicator to the sync button
        const syncButton = document.querySelector('#sync-main-btn');
        if (syncButton) {
            const icon = syncButton.querySelector('.material-icons');
            if (isVisible) {
                icon.classList.add('spinning');
            } else {
                icon.classList.remove('spinning');
            }
        }
    }

    /**
     * Show brief sync notification
     */
    showSyncNotification(message, type = 'info') {
        // Use existing notification system if available
        if (this.syncUI?.showNotification) {
            this.syncUI.showNotification(message, type);
        }
    }
}

// Initialize sync manager and UI
const syncManager = new GoogleDriveSync({
    fileName: 'yoga-vasishtha-sync.json',
    onStatusChange: (status) => {
        if (window.syncUI) {
            window.syncUI.onSyncManagerStateChange(status === 'connected');
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
    // Check for OAuth redirect first
    handleOAuthRedirect();

    // Find sync container and show initializing state immediately
    const syncContainer = document.getElementById('sync-placeholder');
    if (syncContainer) {
        // Create sync UI in initializing state
        window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
        window.syncUI.setState('initializing');
        makeThemeAware();
    } else {
        console.warn('⚠️  Sync container not found - sync UI disabled');
        return;
    }

    try {
        // Initialize sync manager (includes token restoration)
        const initialized = await syncManager.initialize();

        if (!initialized) {
            // Initialization failed - show error state with retry option
            window.syncUI.onSyncManagerFailed();
            return;
        }

        // Check for stored OAuth token from redirect
        const storedToken = sessionStorage.getItem('oauth_access_token');
        if (storedToken) {
            // Save token persistently and set up authentication
            await syncManager.saveTokenData(storedToken, 3600); // Default 1 hour expiry
            syncManager.accessToken = storedToken;
            syncManager.isAuthenticated = true;
            gapi.client.setToken({ access_token: storedToken });
            syncManager.onStatusChange('connected');
            sessionStorage.removeItem('oauth_access_token');
        }

        // Wait for any pending token restoration to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Now set UI state based on actual authentication status
        window.syncUI.onSyncManagerReady();

        // Initialize auto-sync trigger after everything is ready
        window.autoSyncTrigger = new AutoSyncTrigger(syncManager, window.syncUI);

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
            console.log('Sync file contents:', data);
        } else {
            // console.log('No sync file found - either no data synced yet or file doesn't exist');
            // Strangely uncommenting this seems to "cause" the Connect To Google Drive button to disappear
        }
        return data;
    } catch (error) {
        console.error('Failed to read sync file:', error);
    }
};

// Export for debugging
window.syncManager = syncManager;