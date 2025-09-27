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
     * Perform manual sync with multi-device merge logic
     */
    async performSync() {
        try {
            // Generate device ID for this instance
            const deviceId = this.getDeviceId();

            // Collect local data
            const localData = {
                bookmarks: JSON.parse(localStorage.getItem('yoga-vasishtha-bookmarks') || '{}'),
                notes: JSON.parse(localStorage.getItem('yoga-vasishtha-notes') || '{}'),
                readingPositions: this.collectReadingPositions()
            };

            // Get current remote state
            const remoteData = await this.syncManager.download() || {
                bookmarks: {},
                notes: {},
                readingPositions: {},
                deletionEvents: [],
                syncVersion: 0,
                participatingDevices: []
            };

            // Process deletion events
            const cleanedLocalData = this.applyDeletionEvents(localData, remoteData.deletionEvents || []);

            // Merge local and remote data
            const mergedData = this.mergeData(cleanedLocalData, remoteData, deviceId);

            // Upload merged state
            await this.syncManager.upload(mergedData);

            // Apply merged data back to localStorage
            localStorage.setItem('yoga-vasishtha-bookmarks', JSON.stringify(mergedData.bookmarks));
            localStorage.setItem('yoga-vasishtha-notes', JSON.stringify(mergedData.notes));

            // Update reading positions
            Object.keys(mergedData.readingPositions).forEach(bookIndex => {
                const key = `epub-position-${bookIndex}`;
                localStorage.setItem(key, mergedData.readingPositions[bookIndex]);
            });

            // Refresh UI by triggering custom events that the app can listen to
            window.dispatchEvent(new CustomEvent('syncDataUpdated', {
                detail: {
                    bookmarks: mergedData.bookmarks,
                    notes: mergedData.notes,
                    readingPositions: mergedData.readingPositions
                }
            }));

            // Update local storage timestamp
            localStorage.setItem('last-sync-time', new Date().toISOString());

            // Show success
            this.showLastSyncTime();
            this.showNotification('Sync completed successfully');

            this.setState('connected');

        } catch (error) {
            console.error('❌ Sync failed:', error);
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
     * Apply deletion events to local data
     */
    applyDeletionEvents(localData, deletionEvents) {
        const cleaned = JSON.parse(JSON.stringify(localData)); // Deep copy

        deletionEvents.forEach(event => {
            const { id, type } = event;

            if (type === 'note') {
                // Remove note from all books
                Object.keys(cleaned.notes).forEach(bookIndex => {
                    if (cleaned.notes[bookIndex]) {
                        cleaned.notes[bookIndex] = cleaned.notes[bookIndex].filter(note => note.id !== id);
                    }
                });
            } else if (type === 'bookmark') {
                // Remove bookmark from all books
                Object.keys(cleaned.bookmarks).forEach(bookIndex => {
                    if (cleaned.bookmarks[bookIndex]) {
                        cleaned.bookmarks[bookIndex] = cleaned.bookmarks[bookIndex].filter(bookmark => bookmark.id !== id);
                    }
                });
            }
        });

        return cleaned;
    }

    /**
     * Merge local and remote data with conflict resolution
     */
    mergeData(localData, remoteData, deviceId) {
        const merged = {
            bookmarks: this.mergeByType(localData.bookmarks || {}, remoteData.bookmarks || {}),
            notes: this.mergeByType(localData.notes || {}, remoteData.notes || {}),
            readingPositions: this.mergeReadingPositions(localData.readingPositions || {}, remoteData.readingPositions || {}),

            // Sync metadata
            deletionEvents: remoteData.deletionEvents || [],
            syncVersion: (remoteData.syncVersion || 0) + 1,
            lastModified: new Date().toISOString(),
            participatingDevices: this.updateParticipatingDevices(remoteData.participatingDevices || [], deviceId),

            // Legacy timestamp for backward compatibility
            timestamp: new Date().toISOString()
        };

        // Clean up old deletion events (older than 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        merged.deletionEvents = merged.deletionEvents.filter(event =>
            new Date(event.deletedAt).getTime() > thirtyDaysAgo
        );

        return merged;
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
     * Add deletion event for distributed sync
     */
    async addDeletionEvent(itemId, itemType) {
        if (!this.syncManager?.isAuthenticated) {
            return; // Skip if not connected
        }

        try {
            // Get current remote state
            const remoteData = await this.syncManager.download() || {
                deletionEvents: [],
                syncVersion: 0
            };

            // Add new deletion event
            const deletionEvent = {
                id: itemId,
                type: itemType,
                deletedAt: new Date().toISOString(),
                deviceId: this.getDeviceId()
            };

            // Update deletion events
            const updatedDeletionEvents = [
                ...(remoteData.deletionEvents || []),
                deletionEvent
            ];

            // Create minimal update to just add the deletion event
            const updateData = {
                ...remoteData,
                deletionEvents: updatedDeletionEvents,
                syncVersion: (remoteData.syncVersion || 0) + 1,
                lastModified: new Date().toISOString()
            };

            // Upload updated state
            await this.syncManager.upload(updateData);

        } catch (error) {
            console.warn('Failed to add deletion event:', error);
            // Continue with local deletion even if sync fails
        }
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