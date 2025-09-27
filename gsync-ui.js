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
     * Perform manual sync
     */
    async performSync() {
        try {
            // Collect local data
            const localData = {
                bookmarks: JSON.parse(localStorage.getItem('epub-bookmarks') || '{}'),
                notes: JSON.parse(localStorage.getItem('epub-notes') || '{}'),
                readingPositions: this.collectReadingPositions(),
                timestamp: new Date().toISOString()
            };


            // Simple merge: upload local data (overwrite remote)
            await this.syncManager.upload(localData);

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