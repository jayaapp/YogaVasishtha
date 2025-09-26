/**
 * Google Drive Sync Integration
 * Simplified integration for Yoga Vasishtha app
 */

// Initialize sync manager and UI
const syncManager = new GoogleDriveSync({
    fileName: 'yoga-vasishtha-sync.json',
    onStatusChange: (status) => {
        console.log('🔄 Sync status changed:', status);
        if (window.syncUI) {
            window.syncUI.onSyncManagerStateChange(status === 'connected');
        }
    }
});

// Configure with client ID - use web client for now (working version)
syncManager.configure('75331868163-0o2bkv6mas7a5ljsm2a81h066hshtno8.apps.googleusercontent.com');

// Initialize when page loads
window.addEventListener('load', async () => {
    console.log('🔧 DEBUG: gsync-integration.js - Page load event fired');

    try {
        // Initialize sync manager
        const initialized = await syncManager.initialize();
        console.log('🔧 DEBUG: syncManager.initialize() returned:', initialized);

        // Find sync container and initialize UI
        const syncContainer = document.getElementById('sync-placeholder');
        if (syncContainer && initialized) {
            // Create sync UI
            window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
            window.syncUI.onSyncManagerReady();
            makeThemeAware();
            console.log('✅ Google Drive sync UI ready');
        } else if (syncContainer && !initialized) {
            // Show error state
            window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
            window.syncUI.onSyncManagerFailed();
            makeThemeAware();
            console.log('❌ Google Drive sync initialization failed');
        } else {
            console.warn('⚠️  Sync container not found - sync UI disabled');
        }

    } catch (error) {
        console.error('❌ Sync initialization error:', error);
        const syncContainer = document.getElementById('sync-placeholder');
        if (syncContainer) {
            window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
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
            console.log('📄 Current sync file content:');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log('📄 No sync file exists yet');
        }
        return data;
    } catch (error) {
        console.error('Failed to read sync file:', error);
    }
};

// Export for debugging
window.syncManager = syncManager;