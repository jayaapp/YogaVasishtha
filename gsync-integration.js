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

// Configure with client ID
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
            console.log('✅ Google Drive sync UI ready');
        } else if (syncContainer && !initialized) {
            // Show error state
            window.syncUI = new GoogleSyncUI(syncContainer, syncManager);
            window.syncUI.onSyncManagerFailed();
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

// Export for debugging
window.syncManager = syncManager;