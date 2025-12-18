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

    // Append events to the event-log via TrueHeartUser proxy (if available)
    async appendEvents(events) {
        if (!this.userClient.sessionToken) throw new Error('Not authenticated');
        const response = await fetch(`${this.userClient.baseURL}/sync/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.userClient.sessionToken}`
            },
            body: JSON.stringify({ app_id: this.appId, events })
        });
        return await response.json();
    }

    async fetchEvents(since = 0, limit = 1000) {
        if (!this.userClient.sessionToken) throw new Error('Not authenticated');
        const response = await fetch(`${this.userClient.baseURL}/sync/events?app_id=${this.appId}&since=${since}&limit=${limit}`, {
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
    // Local bookmarks/notes are stored under canonical keys
    const localBookmarks = JSON.parse(localStorage.getItem('bookmarks') || '{}');
    const localNotes = JSON.parse(localStorage.getItem('notes') || '{}');

    // Build local snapshot (only bookmarks & notes for Yoga Vasishtha)
    const localData = {
        bookmarks: localBookmarks,
        notes: localNotes,
        timestamp: new Date().toISOString()
    };

    // Load remote data
    const remoteResult = await window.trueheartSync.load();
    const remoteData = remoteResult.data;

    // Gather pending deletion events (use canonical 'trueheart-deletions')
    const pendingDeletions = JSON.parse(localStorage.getItem('trueheart-deletions') || '[]');
    // Clear pending deletions (they will be processed and uploaded)
    if (pendingDeletions.length > 0) localStorage.removeItem('trueheart-deletions');

    // Prefer a sensible merge between local and remote snapshots for sync (bookmarks & notes only).
    function isEmptySnapshot(v) {
        if (!v) return true;
        const keys = ['bookmarks','notes'];
        return keys.every(k => !v[k] || (typeof v[k] === 'object' && Object.keys(v[k]).length === 0));
    }

    // Always merge bookmarks and notes per-item to avoid one-client snapshot overwriting another.
    function mergeListsById(localObj = {}, remoteObj = {}) {
        const out = {};
        const bookIndexes = new Set([...Object.keys(localObj), ...Object.keys(remoteObj)]);
        bookIndexes.forEach(bi => {
            const localArr = (localObj[bi] || []).slice();
            const remoteArr = (remoteObj[bi] || []).slice();
            const byId = Object.create(null);
            localArr.concat(remoteArr).forEach(item => {
                if (!item || !item.id) return;
                const existing = byId[item.id];
                if (!existing) byId[item.id] = item;
                else {
                    const exT = new Date(existing.timestamp || 0).getTime();
                    const itT = new Date(item.timestamp || 0).getTime();
                    if (itT > exT) byId[item.id] = item;
                }
            });
            out[bi] = Object.values(byId).sort((a,b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
        });
        return out;
    }

    let mergedData = {
        bookmarks: mergeListsById(localData.bookmarks, remoteData?.bookmarks),
        notes: mergeListsById(localData.notes, remoteData?.notes),
        timestamp: new Date(Math.max(new Date(localData.timestamp || 0).getTime(), new Date(remoteData?.timestamp || 0).getTime())).toISOString()
    }; 

    // Convert pending deletions into events and upload them
    const eventsToAppend = [];
    (pendingDeletions || []).forEach(event => {
        const id = event.key || event.id || event;
        const type = event.type || 'bookmark';
        eventsToAppend.push({ event_id: `del-${id}-${Date.now()}`, type: 'delete', payload: { target: type === 'note' ? 'note' : 'bookmark', id }, created_at: Date.now() });
    });

    if (eventsToAppend.length > 0) {
        try {
            const appendRes = await window.trueheartSync.appendEvents(eventsToAppend);
            console.debug('TrueHeart Debug: appendEvents result:', { appended: eventsToAppend.length, result: appendRes });
        } catch (err) {
            console.warn('Failed to append events:', err);
        }
    }

    // Fetch events and apply them to mergedData (simple replay)
    let deletedItems = { bookmarks: [], notes: [] };
    try {
        const eventsRes = await window.trueheartSync.fetchEvents(0, 10000);
        console.debug('TrueHeart Debug: fetched events response', { success: eventsRes && eventsRes.success, count: eventsRes && Array.isArray(eventsRes.events) ? eventsRes.events.length : 0 });
        if (eventsRes && eventsRes.success && Array.isArray(eventsRes.events)) {
            eventsRes.events.forEach(ev => {
                const type = ev.type || 'patch';
                const payload = ev.payload || {};

                if (type === 'replace') {
                    mergedData = payload;
                    return;
                }

                if (type === 'patch' || type === 'state') {
                    // Only merge bookmarks and notes for now
                    if (payload.bookmarks) mergedData.bookmarks = { ...(mergedData.bookmarks || {}), ...(payload.bookmarks || {}) };
                    if (payload.notes) mergedData.notes = { ...(mergedData.notes || {}), ...(payload.notes || {}) };
                    return;
                }

                if (type === 'delete') {
                    const target = payload.target || 'bookmark';
                    const id = payload.id;
                    if (target === 'note') {
                        Object.keys(mergedData.notes || {}).forEach(bookIndex => {
                            const beforeCount = (mergedData.notes[bookIndex] || []).length;
                            mergedData.notes[bookIndex] = (mergedData.notes[bookIndex] || []).filter(n => n.id !== id);
                            if ((mergedData.notes[bookIndex] || []).length < beforeCount) deletedItems.notes.push({ id, bookIndex });
                        });
                    } else {
                        Object.keys(mergedData.bookmarks || {}).forEach(bookIndex => {
                            const beforeCount = (mergedData.bookmarks[bookIndex] || []).length;
                            mergedData.bookmarks[bookIndex] = (mergedData.bookmarks[bookIndex] || []).filter(b => b.id !== id);
                            if ((mergedData.bookmarks[bookIndex] || []).length < beforeCount) deletedItems.bookmarks.push({ id, bookIndex });
                        });
                    }
                }
            });
        }
    } catch (err) {
        console.warn('Failed to fetch or apply events:', err);
    }

    // Optionally, save merged data back to server to update snapshot
    try {
        // Only sync bookmarks and notes
        const syncPayload = {
            bookmarks: mergedData.bookmarks || {},
            notes: mergedData.notes || {},
            timestamp: mergedData.timestamp || new Date().toISOString()
        };
        const payloadStr = JSON.stringify(syncPayload);
        const payloadSample = payloadStr.length > 300 ? payloadStr.slice(0,300) + '... (truncated)' : payloadStr;
        console.debug('TrueHeart Debug: saving payload (truncated):', payloadSample);
        const saveRes = await window.trueheartSync.save(syncPayload);
        console.debug('TrueHeart Debug: save result:', saveRes);
    } catch (err) {
        // Handle defensive rejection: if server rejects empty snapshot to prevent wipe, reload server snapshot and apply it
        if (err && err.message === 'empty_snapshot_rejected') {
            console.warn('TrueHeart: save rejected as empty_snapshot_rejected — reloading server snapshot instead');
            try {
                const reload = await window.trueheartSync.load();
                if (reload && reload.data) {
                    mergedData.bookmarks = reload.data.bookmarks || {};
                    mergedData.notes = reload.data.notes || {};
                    // Update local storage with server snapshot (bookmarks & notes only)
                    localStorage.setItem('bookmarks', JSON.stringify(mergedData.bookmarks || {}));
                    localStorage.setItem('notes', JSON.stringify(mergedData.notes || {}));
                    window.dispatchEvent(new CustomEvent('syncDataUpdated', { detail: { bookmarks: mergedData.bookmarks || {}, notes: mergedData.notes || {} } }));
                    console.info('TrueHeart: local bookmarks/notes refreshed from server after rejected empty save');
                } else {
                    console.warn('TrueHeart: reload returned no data after empty save rejection');
                }
            } catch (reloadErr) {
                console.error('TrueHeart: failed to reload server snapshot after empty save rejection', reloadErr);
            }
        } else {
            console.warn('Failed to save merged data to server:', err);
        }
    }

    // Update local storage with merged bookmarks & notes only
    try {
        localStorage.setItem('bookmarks', JSON.stringify(mergedData.bookmarks));
        localStorage.setItem('notes', JSON.stringify(mergedData.notes));
    } catch (err) {
        console.warn('Could not update bookmarks/notes in local storage:', err);
    }

    // Notify app of synced data (bookmarks & notes only)
    window.dispatchEvent(new CustomEvent('syncDataUpdated', {
        detail: {
            bookmarks: mergedData.bookmarks || {},
            notes: mergedData.notes || {},
            deletedItems: deletedItems
        }
    }));

    // Also emit TrueHeart-specific completion event
    window.dispatchEvent(new CustomEvent('trueheart-sync-complete'));

    return mergedData;
}


// Sync controller: event-driven sync (debounced) and manual immediate sync
const SYNC_DEBOUNCE_MS = 2000; // coalesce rapid local edits

class SyncController {
    constructor() {
        this.debounceTimer = null;
        this.isSyncing = false;
        this.pendingChanges = false;
        this.lastToastShown = false;
    }

    scheduleSync(reason) {
        // Mark there are pending changes
        this.pendingChanges = true;

        if (!window.trueheartState?.isAuthenticated) {
            // Not authenticated: defer sync until login; notify user once
            if (!this.lastToastShown) {
                if (window.showAlert) window.showAlert('Changes saved locally; they will be synced when you sign in.', 3000);
                this.lastToastShown = true;
            }
            return;
        }

        // Debounce frequent updates
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.immediateSync(reason || 'scheduled');
        }, SYNC_DEBOUNCE_MS);
    }

    async immediateSync(reason = 'manual') {
        if (!window.trueheartState?.isAuthenticated) {
            if (window.showAlert) window.showAlert('Not signed in. Please sign in to sync.', 2500);
            return;
        }

        // If a debounce timer is pending (scheduled sync), cancel it because
        // the user requested an immediate sync and we don't want the timer
        // to fire after this manual sync completes and cause a duplicate run.
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
            // Helpful debug line when testing to show the pending debounce was cancelled
            if (typeof console !== 'undefined' && console.log) console.log('🔁 SyncController: canceled pending debounce before immediate sync');
        }

        if (this.isSyncing) return; // avoid concurrent syncs
        this.isSyncing = true;
        this.pendingChanges = false;

        try {
            if (window.syncUI && typeof window.syncUI.setState === 'function') {
                window.syncUI.setState('syncing');
            }
            if (window.showAlert) window.showAlert('Syncing...', 1200);

            await performTrueHeartSync();

            if (window.showAlert) window.showAlert('Sync completed', 2000);
        } catch (err) {
            console.error('Sync failed:', err);
            if (window.showAlert) window.showAlert('Sync failed: ' + (err.message || err), 4000);
        } finally {
            this.isSyncing = false;
            if (window.syncUI && typeof window.syncUI.setState === 'function') {
                window.syncUI.setState('connected');
            }
        }
    }
}

// Create global controller
window.syncController = new SyncController();

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

    // On login, immediately sync to reconcile state
    if (window.trueheartState.isAuthenticated) {
        // Reset any toast flag so user sees messages for subsequent changes
        if (window.syncController) window.syncController.lastToastShown = false;
        if (window.syncController) window.syncController.immediateSync('login');
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
