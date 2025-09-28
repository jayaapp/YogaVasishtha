/**
 * Google Drive Sync Integration
 * Smart polling-based sync for Yoga Vasishtha app
 */

// Sync configuration constants
const AUTO_SYNC_INTERVAL = 30000; // 30 seconds
const DELETE_EVENT_RETENTION = 90 * 24 * 60 * 60 * 1000; // 90 days
const ENABLE_SYNC_LOGGING = true; // Set to true to enable sync debug logging

// Smart polling-based sync for cross-device consistency
class SmartAutoSync {
    constructor(syncManager, syncUI) {
        this.syncManager = syncManager;
        this.syncUI = syncUI;
        this.isPerformingSync = false;
        this.pollTimer = null;
        this.lastSuccessfulSync = null;
    }

    /**
     * Start the smart polling sync
     */
    start() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }


        // Start immediately, then at intervals
        this.performSmartSync();

        this.pollTimer = setInterval(() => {
            this.performSmartSync();
        }, AUTO_SYNC_INTERVAL);
    }

    /**
     * Stop the smart polling sync
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Perform smart sync with complete state reconciliation
     */
    async performSmartSync() {
        // Only sync if authenticated
        if (!this.syncManager?.isAuthenticated) {
            return;
        }

        // Prevent concurrent syncs
        if (this.isPerformingSync) {
            return;
        }

        try {
            this.isPerformingSync = true;

            // Show subtle sync indicator
            this.showSyncIndicator(true);

            // Perform complete sync with deletion event processing
            await this.syncUI.performCompleteSync();

            this.lastSuccessfulSync = Date.now();

        } catch (error) {
            console.warn('🔄 SMART-SYNC: Sync failed:', error);
            // Continue silently - user can still manually sync if needed
        } finally {
            this.isPerformingSync = false;
            this.showSyncIndicator(false);
        }
    }

    /**
     * Show/hide subtle sync indicator
     */
    showSyncIndicator(isVisible) {
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
     * Force immediate sync (for manual sync button)
     */
    async forceSync() {
        if (this.isPerformingSync) {
            return;
        }

        await this.performSmartSync();
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

        // Initialize smart auto-sync after everything is ready
        window.smartAutoSync = new SmartAutoSync(syncManager, window.syncUI);
        window.smartAutoSync.start();

        // Add debug function after everything is ready
        window.debugSync = async function() {
            if (!window.syncManager?.isAuthenticated) {
                console.warn('❌ Not authenticated');
                return;
            }

            try {
                console.log('🔍 === DEBUG SYNC START ===');
                await window.smartAutoSync.forceSync();
                console.log('✅ === DEBUG SYNC COMPLETE ===');
            } catch (error) {
                console.error('❌ Debug sync failed:', error);
            }
        };

        // Add reset sync function
        window.resetSync = async function() {
            if (!window.syncManager?.isAuthenticated) {
                console.warn('❌ Not authenticated - connect to Google Drive first');
                return;
            }

            try {
                console.log('🔄 === RESET SYNC START ===');

                // Upload empty state to Google Drive
                const emptyState = {
                    bookmarks: {},
                    notes: {},
                    readingPositions: {},
                    timestamp: new Date().toISOString()
                };

                console.log('🗑️ Clearing Google Drive sync state...');
                await window.syncManager.upload(emptyState);

                console.log('✅ Google Drive sync state reset to empty');
                console.log('🔄 === RESET SYNC COMPLETE ===');

                return emptyState;
            } catch (error) {
                console.error('❌ Reset sync failed:', error);
            }
        };

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