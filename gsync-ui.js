/**
 * Google Drive Sync UI Module
 * Self-contained UI components for sync functionality
 */

class GoogleSyncUI {
    constructor(container, syncManager) {
        this.container = container;
        this.syncManager = syncManager;
        this.button = null;
        this.currentState = 'initializing';

        this.init();
    }

    /**
     * Initialize the sync UI
     */
    init() {
        this.createUI();
        this.attachEventListeners();
        this.setState('initializing');
    }

    /**
     * Create the UI elements
     */
    createUI() {
        this.container.innerHTML = `
            <div class="sync-section">
                <h3 class="sync-section-title">Cloud Sync</h3>
                <button id="sync-main-btn" class="sync-main-btn" disabled>
                    <span class="sync-btn-icon">
                        <span class="material-icons">cloud_off</span>
                    </span>
                    <span class="sync-btn-text">Initializing...</span>
                </button>
                <div id="last-sync-info" class="sync-info" hidden></div>
            </div>
        `;

        this.button = this.container.querySelector('#sync-main-btn');
        this.lastSyncInfo = this.container.querySelector('#last-sync-info');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        this.button.addEventListener('click', () => {
            this.handleButtonClick();
        });
    }

    /**
     * Handle button click based on current state
     */
    async handleButtonClick() {
        if (this.button.disabled) return;

        try {
            switch (this.currentState) {
                case 'ready':
                    this.setState('connecting');
                    await this.syncManager.authenticate();
                    break;

                case 'connected':
                    this.setState('syncing');
                    await this.performSync();
                    break;

                case 'disconnected':
                    this.setState('connecting');
                    await this.syncManager.authenticate();
                    break;

                case 'error':
                    // Retry initialization/connection
                    this.setState('connecting');
                    await this.syncManager.authenticate();
                    break;
            }
        } catch (error) {
            console.error('Sync action failed:', error);
            this.showError(error.message);

            // Reset to appropriate state
            if (this.syncManager.isAuthenticated) {
                this.setState('connected');
            } else {
                this.setState('ready');
            }
        }
    }

    /**
     * Perform complete sync with deletion event processing and cleanup
     */
    async performCompleteSync() {
        try {
            const deviceId = this.getDeviceId();

            // Collect local data
            const localData = {
                bookmarks: JSON.parse(localStorage.getItem('yoga-vasishtha-bookmarks') || '{}'),
                notes: JSON.parse(localStorage.getItem('yoga-vasishtha-notes') || '{}'),
                readingPositions: this.collectReadingPositions()
            };

            const localBookmarkCount = Object.values(localData.bookmarks).reduce((total, bookmarks) => total + bookmarks.length, 0);
            const localNoteCount = Object.values(localData.notes).reduce((total, notes) => total + notes.length, 0);
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Local data - bookmarks:', localBookmarkCount, 'notes:', localNoteCount);

            // Get current remote state
            const remoteData = await this.syncManager.download() || {
                bookmarks: {},
                notes: {},
                readingPositions: {},
                deletionEvents: [],
                syncVersion: 0,
                participatingDevices: []
            };

            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Remote deletion events:', remoteData.deletionEvents?.length || 0);

            // Get pending local deletion events
            const pendingDeletions = this.getPendingDeletionEvents();

            // Combine remote and pending deletion events
            const allDeletionEvents = [...(remoteData.deletionEvents || []), ...pendingDeletions];

            // Clean up old deletion events (older than retention period)
            const cleanDeletionEvents = this.cleanupOldDeletionEvents(allDeletionEvents);
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: After cleanup - deletion events:', cleanDeletionEvents.length);

            // Apply deletion events to both local and remote data
            const cleanedLocalData = this.applyDeletionEvents(localData, cleanDeletionEvents);
            const cleanedRemoteData = this.applyDeletionEvents(remoteData, cleanDeletionEvents);

            // Merge cleaned data
            const mergedData = this.mergeData(cleanedLocalData, cleanedRemoteData, deviceId, cleanDeletionEvents);

            // Upload merged state
            await this.syncManager.upload(mergedData);

            // Apply merged data back to localStorage
            const finalBookmarkCount = Object.values(mergedData.bookmarks).reduce((total, bookmarks) => total + bookmarks.length, 0);
            const finalNoteCount = Object.values(mergedData.notes).reduce((total, notes) => total + notes.length, 0);
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Final data - bookmarks:', finalBookmarkCount, 'notes:', finalNoteCount);

            this.updateLocalStorage(mergedData);
            this.refreshUI(mergedData);

            // Update sync timestamp
            localStorage.setItem('last-sync-time', new Date().toISOString());
            this.showLastSyncTime();

        } catch (error) {
            console.error('🔄 SYNC: Failed:', error);
            throw error;
        }
    }

    /**
     * Legacy method for manual sync button - delegates to complete sync
     */
    async performSync() {
        this.setState('syncing');
        try {
            await this.performCompleteSync();
            this.showNotification('Sync completed successfully');
            this.setState('connected');
        } catch (error) {
            this.setState('error');
            throw error;
        }
    }

    /**
     * Collect reading positions from localStorage
     */
    collectReadingPositions() {
        const positions = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('epub-position-')) {
                const bookIndex = key.replace('epub-position-', '');
                positions[bookIndex] = localStorage.getItem(key);
            }
        }
        return positions;
    }

    /**
     * Generate or retrieve device ID
     */
    getDeviceId() {
        let deviceId = localStorage.getItem('yoga-vasishtha-device-id');
        if (!deviceId) {
            // Generate unique device ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substr(2, 9);
            const platform = navigator.platform.replace(/\s+/g, '-').toLowerCase();
            deviceId = `${platform}-${timestamp}-${random}`;
            localStorage.setItem('yoga-vasishtha-device-id', deviceId);
        }
        return deviceId;
    }

    /**
     * Clean up old deletion events (older than retention period)
     */
    cleanupOldDeletionEvents(deletionEvents) {
        const cutoffTime = Date.now() - DELETE_EVENT_RETENTION;
        const cleaned = deletionEvents.filter(event => {
            const eventTime = new Date(event.deletedAt).getTime();
            return eventTime > cutoffTime;
        });

        if (cleaned.length < deletionEvents.length) {
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Cleaned up', deletionEvents.length - cleaned.length, 'old deletion events');
        }

        return cleaned;
    }

    /**
     * Apply deletion events to data
     */
    applyDeletionEvents(data, deletionEvents) {
        const cleaned = JSON.parse(JSON.stringify(data)); // Deep copy
        let deletionsApplied = 0;

        deletionEvents.forEach(event => {
            const { id, type } = event;

            if (type === 'note') {
                // Remove note from all books
                Object.keys(cleaned.notes).forEach(bookIndex => {
                    if (cleaned.notes[bookIndex]) {
                        const beforeCount = cleaned.notes[bookIndex].length;
                        cleaned.notes[bookIndex] = cleaned.notes[bookIndex].filter(note => note.id !== id);
                        if (cleaned.notes[bookIndex].length < beforeCount) {
                            deletionsApplied++;
                        }
                    }
                });
            } else if (type === 'bookmark') {
                // Remove bookmark from all books
                Object.keys(cleaned.bookmarks).forEach(bookIndex => {
                    if (cleaned.bookmarks[bookIndex]) {
                        const beforeCount = cleaned.bookmarks[bookIndex].length;
                        cleaned.bookmarks[bookIndex] = cleaned.bookmarks[bookIndex].filter(bookmark => bookmark.id !== id);
                        if (cleaned.bookmarks[bookIndex].length < beforeCount) {
                            deletionsApplied++;
                        }
                    }
                });
            }
        });

        if (deletionsApplied > 0) {
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Applied', deletionsApplied, 'deletion events');
        }

        return cleaned;
    }

    /**
     * Merge local and remote data with conflict resolution
     */
    mergeData(localData, remoteData, deviceId, cleanDeletionEvents) {
        const merged = {
            bookmarks: this.mergeByType(localData.bookmarks || {}, remoteData.bookmarks || {}),
            notes: this.mergeByType(localData.notes || {}, remoteData.notes || {}),
            readingPositions: this.mergeReadingPositions(localData.readingPositions || {}, remoteData.readingPositions || {}),

            // Sync metadata with cleaned deletion events
            deletionEvents: cleanDeletionEvents,
            syncVersion: (remoteData.syncVersion || 0) + 1,
            lastModified: new Date().toISOString(),
            participatingDevices: this.updateParticipatingDevices(remoteData.participatingDevices || [], deviceId),

            // Legacy timestamp for backward compatibility
            timestamp: new Date().toISOString()
        };

        return merged;
    }

    /**
     * Update localStorage with merged data
     */
    updateLocalStorage(mergedData) {
        localStorage.setItem('yoga-vasishtha-bookmarks', JSON.stringify(mergedData.bookmarks));
        localStorage.setItem('yoga-vasishtha-notes', JSON.stringify(mergedData.notes));

        // Update reading positions
        Object.keys(mergedData.readingPositions).forEach(bookIndex => {
            const key = `epub-position-${bookIndex}`;
            localStorage.setItem(key, mergedData.readingPositions[bookIndex]);
        });
    }

    /**
     * Refresh UI with merged data
     */
    refreshUI(mergedData) {
        // Trigger custom event that the app listens to
        window.dispatchEvent(new CustomEvent('syncDataUpdated', {
            detail: {
                bookmarks: mergedData.bookmarks,
                notes: mergedData.notes,
                readingPositions: mergedData.readingPositions
            }
        }));
    }

    /**
     * Merge items by type (notes or bookmarks)
     */
    mergeByType(localItems, remoteItems) {
        const merged = {};

        // Get all book indices from both local and remote
        const allBookIndices = new Set([
            ...Object.keys(localItems),
            ...Object.keys(remoteItems)
        ]);

        allBookIndices.forEach(bookIndex => {
            const localBookItems = localItems[bookIndex] || [];
            const remoteBookItems = remoteItems[bookIndex] || [];

            // Create map for deduplication by ID
            const itemsById = new Map();

            // Add remote items first
            remoteBookItems.forEach(item => {
                itemsById.set(item.id, item);
            });

            // Add local items (overwrites remote if same ID, for latest-wins)
            localBookItems.forEach(item => {
                const existing = itemsById.get(item.id);
                if (!existing || new Date(item.timestamp) >= new Date(existing.timestamp)) {
                    itemsById.set(item.id, item);
                }
            });

            merged[bookIndex] = Array.from(itemsById.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first
        });

        return merged;
    }

    /**
     * Merge reading positions (most recent wins per book)
     */
    mergeReadingPositions(localPositions, remotePositions) {
        const merged = { ...remotePositions };

        Object.keys(localPositions).forEach(bookIndex => {
            const localPos = localPositions[bookIndex];
            const remotePos = remotePositions[bookIndex];

            if (!remotePos) {
                merged[bookIndex] = localPos;
            } else {
                // Parse timestamps and keep most recent
                try {
                    const localData = JSON.parse(localPos);
                    const remoteData = JSON.parse(remotePos);

                    if (localData.timestamp > remoteData.timestamp) {
                        merged[bookIndex] = localPos;
                    }
                } catch (error) {
                    // If parsing fails, keep local
                    merged[bookIndex] = localPos;
                }
            }
        });

        return merged;
    }

    /**
     * Update participating devices list
     */
    updateParticipatingDevices(existingDevices, currentDevice) {
        const devices = new Set(existingDevices);
        devices.add(currentDevice);
        return Array.from(devices);
    }

    /**
     * Add deletion event to local pending deletions
     * Will be processed during next smart sync
     */
    addDeletionEvent(itemId, itemType) {
        const deletionEvent = {
            id: itemId,
            type: itemType,
            deletedAt: new Date().toISOString(),
            deviceId: this.getDeviceId()
        };

        // Store locally - will be uploaded during next smart sync
        const pendingDeletions = JSON.parse(localStorage.getItem('yoga-vasishtha-pending-deletions') || '[]');

        // Check for duplicates
        const existingEvent = pendingDeletions.find(event => event.id === itemId && event.type === itemType);
        if (!existingEvent) {
            pendingDeletions.push(deletionEvent);
            localStorage.setItem('yoga-vasishtha-pending-deletions', JSON.stringify(pendingDeletions));
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Added local deletion event for', itemType, itemId);
        }
    }

    /**
     * Get and process pending local deletion events
     */
    getPendingDeletionEvents() {
        const pendingDeletions = JSON.parse(localStorage.getItem('yoga-vasishtha-pending-deletions') || '[]');

        if (pendingDeletions.length > 0) {
            if (ENABLE_SYNC_LOGGING) console.log('🔄 SYNC: Processing', pendingDeletions.length, 'pending deletion events');
            // Clear pending deletions as they'll be uploaded to remote
            localStorage.removeItem('yoga-vasishtha-pending-deletions');
        }

        return pendingDeletions;
    }

    /**
     * Set UI state
     */
    setState(state) {
        this.currentState = state;
        this.updateButtonAppearance();
    }

    /**
     * Update button appearance based on state
     */
    updateButtonAppearance() {
        const iconEl = this.button.querySelector('.material-icons');
        const textEl = this.button.querySelector('.sync-btn-text');

        this.button.className = 'sync-main-btn'; // Reset classes

        switch (this.currentState) {
            case 'initializing':
                this.button.disabled = true;
                this.button.classList.add('state-initializing');
                iconEl.textContent = 'cloud_off';
                textEl.textContent = 'Initializing...';
                break;

            case 'ready':
                this.button.disabled = false;
                this.button.classList.add('state-ready');
                iconEl.textContent = 'cloud';
                textEl.textContent = 'Connect to Google Drive';
                break;

            case 'connecting':
                this.button.disabled = true;
                this.button.classList.add('state-connecting');
                iconEl.textContent = 'hourglass_empty';
                textEl.textContent = 'Connecting...';
                break;

            case 'connected':
                this.button.disabled = false;
                this.button.classList.add('state-connected');
                iconEl.textContent = 'cloud_done';
                textEl.textContent = 'Connected - Click to Sync';
                break;

            case 'syncing':
                this.button.disabled = true;
                this.button.classList.add('state-syncing');
                iconEl.textContent = 'sync';
                iconEl.classList.add('spinning');
                textEl.textContent = 'Syncing...';
                break;

            case 'disconnected':
                this.button.disabled = false;
                this.button.classList.add('state-disconnected');
                iconEl.textContent = 'cloud_off';
                textEl.textContent = 'Disconnected - Click to Reconnect';
                break;

            case 'error':
                this.button.disabled = false;
                this.button.classList.add('state-error');
                iconEl.textContent = 'error';
                textEl.textContent = 'Sync Error - Click to Retry';
                break;
        }

        // Remove spinning class when not syncing
        if (this.currentState !== 'syncing') {
            iconEl.classList.remove('spinning');
        }
    }

    /**
     * Show last sync time
     */
    showLastSyncTime() {
        const lastSync = localStorage.getItem('last-sync-time');
        if (lastSync) {
            const date = new Date(lastSync);
            const timeStr = date.toLocaleString();
            this.lastSyncInfo.textContent = `Last sync: ${timeStr}`;
            this.lastSyncInfo.hidden = false;
        }
    }

    /**
     * Show error state
     */
    showError(message) {
        this.setState('error');
        // Only show notification for user-facing errors, not initialization errors
        if (message && !message.includes('initialize')) {
            this.showNotification(`Sync failed: ${message}`, 'error');
        }
    }

    /**
     * Show notification (integrate with app's notification system if available)
     */
    showNotification(message, type = 'info') {
        // Try to use app's notification system
        if (window.NotificationManager && window.NotificationManager.show) {
            window.NotificationManager.show(message, type);
        } else {
            // Fallback to console
        }
    }

    /**
     * Handle sync manager state changes
     */
    onSyncManagerStateChange(isAuthenticated) {
        if (isAuthenticated) {
            this.setState('connected');
            this.showLastSyncTime();
        } else {
            this.setState('ready');
            this.lastSyncInfo.hidden = true;
        }
    }

    /**
     * Handle successful initialization
     */
    onSyncManagerReady() {
        // Check if already authenticated
        if (this.syncManager.isAuthenticated) {
            this.setState('connected');
            this.showLastSyncTime();
        } else {
            this.setState('ready');
        }
    }

    /**
     * Handle initialization failure
     */
    onSyncManagerFailed() {
        this.setState('error');
        this.showError('Failed to initialize Google Drive sync');
    }
}

// Export for use
window.GoogleSyncUI = GoogleSyncUI;