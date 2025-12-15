/**
 * TrueHeart Loader
 * Initializes the TrueHeart UI in the settings panel and provides cloud sync
 * and user account features for the application.
 */

(async function initTrueHeartLoader() {
    console.log('🔷 TrueHeart Loader: Initializing...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }

    // Wait a bit for settings panel to be injected
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find the sync placeholder in settings panel
    const syncContainer = document.getElementById('sync-placeholder');
    
    if (!syncContainer) {
        console.warn('🔷 TrueHeart: sync-placeholder not found in settings panel');
        return;
    }

    // Wait for TrueHeart API to be initialized
    let attempts = 0;
    while (!window.trueheartUser && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }

    if (!window.trueheartUser) {
        console.error('🔷 TrueHeart: API failed to initialize');
        syncContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #c62828;">
                <p>⚠️ Cloud Sync Unavailable</p>
                <p style="font-size: 12px;">Please refresh the page or check your connection.</p>
            </div>
        `;
        return;
    }

    // Create TrueHeart UI
    try {
        window.trueheartUI = new TrueHeartUI(syncContainer);
        console.log('✅ TrueHeart UI initialized successfully');

        // Apply localization to TrueHeart UI elements
        if (typeof applyLocalization === 'function') {
            applyLocalization();
        }


        // Listen for sync complete events to refresh UI components
        window.addEventListener('trueheart-sync-complete', () => {
            console.log('✅ TrueHeart sync completed, refreshing data...');
            
            // Trigger any necessary UI refreshes
            // For example, reload bookmarks, notes, etc.
            if (typeof window.loadBookmarks === 'function') {
                window.loadBookmarks();
            }
            if (typeof window.loadNotes === 'function') {
                window.loadNotes();
            }
            if (typeof window.loadPrompts === 'function') {
                window.loadPrompts();
            }
        });

        // Notify the compatibility UI that the sync manager is ready
        if (window.syncUI && typeof window.syncUI.onSyncManagerReady === 'function') {
            window.syncUI.onSyncManagerReady();
        }

        // If session is already authenticated, notify connected state and start auto-sync
        if (window.trueheartState.isAuthenticated) {
            if (window.syncUI && typeof window.syncUI.onSyncManagerStateChange === 'function') {
                window.syncUI.onSyncManagerStateChange(true);
            }

            // Start SmartAutoSync if available
            if (typeof SmartAutoSync !== 'undefined' && !window.smartAutoSync) {
                window.smartAutoSync = new SmartAutoSync(window.trueheartSync, window.syncUI);
                window.smartAutoSync.start();
            }
        }

        // Check that Material Symbols font is available and warn if not
        try {
            if (document.fonts && !document.fonts.check("12px 'Material Symbols Outlined'")) {
                console.warn('⚠️ Material Symbols font not detected yet; icons may render as text until font loads');
                document.fonts.ready.then(() => {
                    if (!document.fonts.check("12px 'Material Symbols Outlined'")) {
                        console.warn('⚠️ Material Symbols still not available after load');
                    } else {
                        console.log('✅ Material Symbols font ready');
                    }
                });
            } else {
                console.log('✅ Material Symbols font detected');
            }
        } catch (e) {
            // ignore feature-detection errors
        }

    } catch (error) {
        console.error('🔷 TrueHeart UI initialization error:', error);
        syncContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #c62828;">
                <p>⚠️ Error loading Cloud Sync</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>
        `;
    }
})();

// Provide stub functions for backwards compatibility with older sync calls
// These ensure the app doesn't break if legacy sync code is still present

window.syncUI = {
    addDeletionEvent: function(key, type) {
        // Track deletions in localStorage for sync (write both legacy and TrueHeart keys)
        const thDeletions = JSON.parse(localStorage.getItem('trueheart-deletions') || '[]');
        thDeletions.push({ key, type, timestamp: Date.now() });
        localStorage.setItem('trueheart-deletions', JSON.stringify(thDeletions));

        const legacy = JSON.parse(localStorage.getItem('yoga-vasishtha-pending-deletions') || '[]');
        if (!legacy.find(e => e.key === key && e.type === type)) {
            legacy.push({ key, type, deletedAt: new Date().toISOString() });
            localStorage.setItem('yoga-vasishtha-pending-deletions', JSON.stringify(legacy));
        }

        console.log('📝 TrueHeart: Deletion tracked:', type, key);
    },

    
    onSyncManagerStateChange: function(connected) {
        console.log('ℹ️  TrueHeart: Sync state changed:', connected ? 'connected' : 'disconnected');
    },
    
    onSyncManagerReady: function() {
        console.log('✅ TrueHeart: Sync manager ready');
    },
    
    onSyncManagerFailed: function() {
        console.warn('⚠️ TrueHeart: Sync manager failed');
    },
    
    setState: function(state) {
        console.log('ℹ️  TrueHeart: State change:', state);
    },
    
    performCompleteSync: async function() {
        console.log('🔄 TrueHeart: Manual sync triggered');
        if (window.trueheartState.isAuthenticated && window.trueheartAPI) {
            try {
                await window.trueheartAPI.performTrueHeartSync();
                console.log('✅ TrueHeart: Sync completed');
                window.dispatchEvent(new CustomEvent('trueheart-sync-complete'));
            } catch (error) {
                console.error('❌ TrueHeart: Sync failed:', error);
            }
        } else {
            console.warn('⚠️ TrueHeart: Not authenticated, cannot sync');
        }
    }
};

console.log('✅ TrueHeart Loader: Compatibility stubs installed');
