/**
 * TrueHeartUser + TrueHeartSync Integration for JayaApp
 * 
 * This module provides TrueHeartUser authentication and TrueHeartSync
 * data synchronization for cloud-backed user sync.
 */

// API Configuration
// Always uses deployed backend services (even when testing locally on localhost)
// Uses path-based routing: /user, /donate, /sync
const TRUEHEART_CONFIG = {
    userAPI: 'https://trueheartapps.com/user',
    syncAPI: 'https://trueheartapps.com/sync',
    appId: 'yoga-vasishtha',
    appUrl: window.location.origin
};

// Global state
window.trueheartState = {
    user: null,
    sessionToken: null,
    isAuthenticated: false,
    syncEnabled: false
};

/**
 * TrueHeartUser API Client
 * Handles authentication and session management
 */
class TrueHeartUserClient {
    constructor(config) {
        this.baseURL = config.userAPI;
        this.appUrl = config.appUrl;
        this.sessionToken = localStorage.getItem('trueheart-session-token');
    }

    async register(email, password) {
        const response = await fetch(`${this.baseURL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (data.success) {
            this.sessionToken = data.session_token;
            localStorage.setItem('trueheart-session-token', this.sessionToken);
            window.trueheartState.user = { user_id: data.user_id, email };
            window.trueheartState.sessionToken = this.sessionToken;
            window.trueheartState.isAuthenticated = true;
        }
        return data;
    }

    async login(email, password) {
        const response = await fetch(`${this.baseURL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (data.success) {
            this.sessionToken = data.session_token;
            localStorage.setItem('trueheart-session-token', this.sessionToken);
            window.trueheartState.user = { user_id: data.user_id, email: data.email };
            window.trueheartState.sessionToken = this.sessionToken;
            window.trueheartState.isAuthenticated = true;
            try { document.dispatchEvent(new CustomEvent('authChanged', { detail: { user: null } })); } catch (e) { /* ignore */ }
        }
        return data;
    }

    async logout() {
        if (!this.sessionToken) return { success: true };

        const response = await fetch(`${this.baseURL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sessionToken}`
            },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        this.sessionToken = null;
        localStorage.removeItem('trueheart-session-token');
        window.trueheartState.user = null;
        window.trueheartState.sessionToken = null;
        window.trueheartState.isAuthenticated = false;
        try { document.dispatchEvent(new CustomEvent('authChanged', { detail: { user: null } })); } catch (e) { /* ignore */ }
        return data;
    }

    async validateSession() {
        if (!this.sessionToken) return { success: false };

        const response = await fetch(`${this.baseURL}/auth/validate`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.sessionToken}`
            }
        });
        
        const data = await response.json();
        if (data.success) {
            window.trueheartState.user = { user_id: data.user_id, email: data.email };
            window.trueheartState.isAuthenticated = true;
        } else {
            // Session invalid, clear it
            this.sessionToken = null;
            localStorage.removeItem('trueheart-session-token');
            window.trueheartState.isAuthenticated = false;
        }
        return data;
    }

    async requestPasswordReset(email) {
        const response = await fetch(`${this.baseURL}/password/reset-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, app_url: this.appUrl })
        });
        
        return await response.json();
    }

    async checkServiceStatus(serviceId) {
        if (!this.sessionToken) return { success: false, error: 'Not authenticated' };

        const response = await fetch(`${this.baseURL}/services/${serviceId}/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.sessionToken}`
            }
        });
        
        return await response.json();
    }

    async getStorageUsage() {
        if (!this.sessionToken) return { success: false, error: 'Not authenticated' };

        const response = await fetch(`${this.baseURL}/sync/usage`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.sessionToken}`
            }
        });
        
        return await response.json();
    }

    async deleteAccount(password) {
        if (!this.sessionToken) return { success: false, error: 'Not authenticated' };

        const response = await fetch(`${this.baseURL}/auth/account`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.sessionToken}`
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Clear local state
            this.sessionToken = null;
            localStorage.removeItem('trueheart-session-token');
            window.trueheartState.isAuthenticated = false;
            window.trueheartState.user = null;
        }
        
        return data;
    }
}

/**
 * TrueHeartSync API Client
 * Handles data synchronization
 */
class TrueHeartSyncClient {
    constructor(config, userClient) {
        this.baseURL = config.syncAPI;
        this.appId = config.appId;
        this.userClient = userClient;
    }

    async save(data) {
        if (!this.userClient.sessionToken) {
            throw new Error('Not authenticated');
        }

        // Encode data as base64 (sync backend expects this format)
        const jsonString = JSON.stringify(data);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        // Call through user service which proxies to sync with proper credentials
        const response = await fetch(`${this.userClient.baseURL}/sync/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.userClient.sessionToken}`
            },
            body: JSON.stringify({ app_id: this.appId, data: base64Data })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Sync save failed');
        }
        
        return await response.json();
    }

    async load() {
        if (!this.userClient.sessionToken) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${this.userClient.baseURL}/sync/load?app_id=${this.appId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.userClient.sessionToken}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                // No sync data yet - this is fine
                return { success: true, data: null };
            }
            const error = await response.json();
            throw new Error(error.error || 'Sync load failed');
        }
        
        const result = await response.json();
        
        // Decode base64 data if present
        if (result.success && result.data) {
            try {
                const decodedString = decodeURIComponent(escape(atob(result.data)));
                result.data = JSON.parse(decodedString);
            } catch (e) {
                console.error('Failed to decode sync data:', e);
                throw new Error('Failed to decode sync data');
            }
        }
        
        return result;
    }

    async check() {
        if (!this.userClient.sessionToken) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${this.userClient.baseURL}/sync/check?app_id=${this.appId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.userClient.sessionToken}`
            }
        });
        
        return await response.json();
    }
}

/**
 * Initialize TrueHeart integration
 */
async function initTrueHeart() {
    // Create API clients
    window.trueheartUser = new TrueHeartUserClient(TRUEHEART_CONFIG);
    window.trueheartSync = new TrueHeartSyncClient(TRUEHEART_CONFIG, window.trueheartUser);

    // Check if we have a stored session
    if (window.trueheartUser.sessionToken) {
        try {
            await window.trueheartUser.validateSession();
            console.log('✅ TrueHeart session restored:', window.trueheartState.user?.email);
            // Notify listeners that auth state has changed (used to start auto-sync and update UI)
            try { document.dispatchEvent(new CustomEvent('authChanged', { detail: { user: window.trueheartState.user } })); } catch (e) { /* ignore */ }
        } catch (error) {
            console.log('ℹ️ No valid session found');
        }
    }

    // Check for password reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        // Store token and show password reset UI
        localStorage.setItem('trueheart-reset-token', resetToken);
        // Remove from URL without page reload
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

/**
 * Perform sync operation using TrueHeartSync (cloud-backed synchronization)
 */
async function performTrueHeartSync() {
    if (!window.trueheartState.isAuthenticated) {
        throw new Error('Not authenticated');
    }
    // Collect local data (support app-specific keys for Yoga Vasishtha compatibility)
    const localBookmarks = JSON.parse(localStorage.getItem('yoga-vasishtha-bookmarks') || localStorage.getItem('bookmarks') || '{}');
    const localNotes = JSON.parse(localStorage.getItem('yoga-vasishtha-notes') || localStorage.getItem('notes') || '{}');

    // Collect reading positions using app-style keys (epub-position-<index>)
    const readingPositions = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('epub-position-')) {
            const bookIndex = key.replace('epub-position-', '');
            readingPositions[bookIndex] = localStorage.getItem(key);
        }
    }

    const localData = {
        bookmarks: localBookmarks,
        notes: localNotes,
        prompts: JSON.parse(localStorage.getItem('prompts') || '{}'),
        readingPositions: readingPositions,
        settings: JSON.parse(localStorage.getItem('yoga-vasishtha-settings') || '{}'),
        timestamp: new Date().toISOString()
    };

    // Load remote data
    const remoteResult = await window.trueheartSync.load();
    const remoteData = remoteResult.data;

    // Gather pending deletion events (compatibility with previous gsync and TrueHeart stubs)
    const pendingTrueHeartDeletions = JSON.parse(localStorage.getItem('trueheart-deletions') || '[]');
    const pendingOldDeletions = JSON.parse(localStorage.getItem('yoga-vasishtha-pending-deletions') || '[]');
    const pendingDeletions = [...pendingTrueHeartDeletions, ...pendingOldDeletions];
    // Clear pending deletions (they will be processed and uploaded)
    if (pendingTrueHeartDeletions.length > 0) localStorage.removeItem('trueheart-deletions');
    if (pendingOldDeletions.length > 0) localStorage.removeItem('yoga-vasishtha-pending-deletions');

    let mergedData;
    if (!remoteData) {
        // No remote data, start with local
        mergedData = localData;
    } else {
        // Merge local and remote data (simple: take newest by timestamp, then merge maps)
        const localTime = new Date(localData.timestamp || 0);
        const remoteTime = new Date(remoteData.timestamp || 0);

        if (localTime > remoteTime) {
            mergedData = {
                ...localData,
                // Keep remote fields where necessary
                timestamp: localData.timestamp
            };
        } else {
            mergedData = {
                bookmarks: { ...(remoteData.bookmarks || {}), ...(localData.bookmarks || {}) },
                notes: { ...(remoteData.notes || {}), ...(localData.notes || {}) },
                prompts: { ...(remoteData.prompts || {}), ...(localData.prompts || {}) },
                readingPositions: remoteData.readingPositions || localData.readingPositions,
                settings: { ...(remoteData.settings || {}), ...(localData.settings || {}) },
                timestamp: remoteData.timestamp || new Date().toISOString()
            };
        }
    }

    // Apply pending deletion events to merged data
    const deletedItems = { bookmarks: [], notes: [] };
    if (pendingDeletions && pendingDeletions.length > 0) {
        pendingDeletions.forEach(event => {
            const id = event.key || event.id || event;
            const type = event.type || 'bookmark';

            if (type === 'note') {
                Object.keys(mergedData.notes || {}).forEach(bookIndex => {
                    const beforeCount = (mergedData.notes[bookIndex] || []).length;
                    mergedData.notes[bookIndex] = (mergedData.notes[bookIndex] || []).filter(n => n.id !== id);
                    if ((mergedData.notes[bookIndex] || []).length < beforeCount) {
                        deletedItems.notes.push({ id, bookIndex });
                    }
                });
            } else {
                Object.keys(mergedData.bookmarks || {}).forEach(bookIndex => {
                    const beforeCount = (mergedData.bookmarks[bookIndex] || []).length;
                    mergedData.bookmarks[bookIndex] = (mergedData.bookmarks[bookIndex] || []).filter(b => b.id !== id);
                    if ((mergedData.bookmarks[bookIndex] || []).length < beforeCount) {
                        deletedItems.bookmarks.push({ id, bookIndex });
                    }
                });
            }
        });
    }

    // Save merged data back to server
    await window.trueheartSync.save(mergedData);

    // Update local storage for both TrueHeart-standard keys and Yoga app keys
    try {
        // TrueHeart-style
        localStorage.setItem('bookmarks', JSON.stringify(mergedData.bookmarks));
        localStorage.setItem('notes', JSON.stringify(mergedData.notes));
        localStorage.setItem('prompts', JSON.stringify(mergedData.prompts || {}));
        localStorage.setItem('reading-positions', JSON.stringify(mergedData.readingPositions || {}));
        localStorage.setItem('yoga-vasishtha-settings', JSON.stringify(mergedData.settings || {}));

        // Yoga app backward-compatible keys
        localStorage.setItem('yoga-vasishtha-bookmarks', JSON.stringify(mergedData.bookmarks || {}));
        localStorage.setItem('yoga-vasishtha-notes', JSON.stringify(mergedData.notes || {}));

        // Update epub-position-<index> keys (for compatibility)
        Object.keys(mergedData.readingPositions || {}).forEach(bookIndex => {
            const key = `epub-position-${bookIndex}`;
            localStorage.setItem(key, mergedData.readingPositions[bookIndex]);
        });
    } catch (err) {
        console.warn('Could not update all local storage keys:', err);
    }

    // Notify app of synced data in gsync-compatible format
    window.dispatchEvent(new CustomEvent('syncDataUpdated', {
        detail: {
            bookmarks: mergedData.bookmarks || {},
            notes: mergedData.notes || {},
            readingPositions: mergedData.readingPositions || {},
            deletedItems: deletedItems
        }
    }));

    // Also emit TrueHeart-specific completion event
    window.dispatchEvent(new CustomEvent('trueheart-sync-complete'));

    return mergedData;
}


// SmartAutoSync class to approximate previous gsync auto-sync behavior
class SmartAutoSync {
    constructor(syncAPI, ui, interval = 30000) {
        this.syncAPI = syncAPI;
        this.ui = ui;
        this.interval = interval;
        this.timer = null;
        this.isPerforming = false;
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        this.perform();
        this.timer = setInterval(() => this.perform(), this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async perform() {
        if (!window.trueheartState.isAuthenticated) return;
        if (this.isPerforming) return;
        this.isPerforming = true;
        try {
            if (this.ui && this.ui.setState) {
                this.ui.setState('syncing');
            }
            await performTrueHeartSync();
        } catch (e) {
            console.warn('SmartAutoSync failed:', e);
        } finally {
            this.isPerforming = false;
            if (this.ui && this.ui.setState) {
                this.ui.setState('connected');
            }
        }
    }
}

// Expose debugging helpers and compatibility objects
window.syncManager = window.trueheartSync;

window.viewSyncFile = async function() {
    if (!window.trueheartState.isAuthenticated) {
        console.warn('Not authenticated - connect to TrueHeart first');
        return;
    }

    try {
        const data = await window.trueheartSync.load();
        if (data && data.data) console.log('Sync file contents:', data.data);
        return data && data.data ? data.data : null;
    } catch (error) {
        console.error('Failed to read sync file:', error);
    }
};

window.resetSync = async function() {
    if (!window.trueheartState.isAuthenticated) {
        console.warn('Not authenticated - connect to TrueHeart first');
        return;
    }

    try {
        console.log('🔄 Resetting TrueHeart sync state to empty');
        const emptyState = {
            bookmarks: {},
            notes: {},
            prompts: {},
            readingPositions: {},
            settings: {},
            timestamp: new Date().toISOString()
        };

        await window.trueheartSync.save(emptyState);
        console.log('✅ TrueHeart sync state reset');
        return emptyState;
    } catch (error) {
        console.error('Reset sync failed:', error);
    }
};

// Listen for auth changes to start/stop smart auto sync and notify UI
document.addEventListener('authChanged', () => {
    if (window.syncUI && typeof window.syncUI.onSyncManagerStateChange === 'function') {
        window.syncUI.onSyncManagerStateChange(window.trueheartState.isAuthenticated);
    }

    if (!window.smartAutoSync && window.syncUI) {
        window.smartAutoSync = new SmartAutoSync(window.trueheartSync, window.syncUI);
    }

    if (window.trueheartState.isAuthenticated) {
        window.smartAutoSync?.start();
    } else {
        window.smartAutoSync?.stop();
    }
});

// Export for global use
window.trueheartAPI = {
    initTrueHeart,
    performTrueHeartSync
};

// Initialize on load or immediately if already loaded
if (document.readyState === 'complete') {
    initTrueHeart();
} else {
    window.addEventListener('load', initTrueHeart);
}

// Also attempt to initialize immediately in background to reduce race with loader
(async () => {
    try {
        await initTrueHeart();
    } catch (e) {
        // Ignore initialization errors here; load handler will retry
    }
})();
