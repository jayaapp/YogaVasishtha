/**
 * Minimal Google Drive Sync - Reusable across apps
 * Simple, elegant solution for app state synchronization
 */

// Token encryption utilities for secure storage
class TokenCrypto {
    static async generateKey() {
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        return key;
    }

    static async encrypt(text, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoded
        );

        // Combine iv and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    static async decrypt(encryptedData, key) {
        try {
            const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );

            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.warn('Token decryption failed:', error);
            return null;
        }
    }

    static async deriveKey(clientId) {
        // Derive a consistent key from client ID and browser fingerprint
        const data = new TextEncoder().encode(clientId + navigator.userAgent + location.origin);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return await crypto.subtle.importKey(
            'raw',
            hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }
}

class GoogleDriveSync {
    constructor(options = {}) {
        this.clientId = options.clientId || null;
        this.fileName = options.fileName || 'app-sync.json';
        this.isAuthenticated = false;
        this.onStatusChange = options.onStatusChange || (() => {});
        this.accessToken = null;
        this.tokenExpiry = null;
        this.encryptionKey = null;
        this.storageKey = 'gsync_token_data';
    }

    // Configure credentials (app-specific)
    configure(clientId, fileName = null) {
        this.clientId = clientId;
        if (fileName) {
            this.fileName = fileName;
        }
        // Keep existing fileName if not provided
    }

    // Token storage methods
    async initializeEncryption() {
        if (!this.encryptionKey && this.clientId) {
            this.encryptionKey = await TokenCrypto.deriveKey(this.clientId);
        }
    }

    async saveTokenData(accessToken, expiresIn = 3600) {
        try {
            await this.initializeEncryption();

            const tokenData = {
                accessToken: accessToken,
                expiry: Date.now() + (expiresIn * 1000), // Convert seconds to milliseconds
                clientId: this.clientId,
                timestamp: Date.now()
            };

            const encryptedData = await TokenCrypto.encrypt(JSON.stringify(tokenData), this.encryptionKey);
            localStorage.setItem(this.storageKey, encryptedData);

            this.accessToken = accessToken;
            this.tokenExpiry = tokenData.expiry;
        } catch (error) {
            console.warn('Failed to save token data:', error);
        }
    }

    async loadTokenData() {
        try {
            await this.initializeEncryption();

            const encryptedData = localStorage.getItem(this.storageKey);
            if (!encryptedData) return null;

            const decryptedData = await TokenCrypto.decrypt(encryptedData, this.encryptionKey);
            if (!decryptedData) return null;

            const tokenData = JSON.parse(decryptedData);

            // Verify token belongs to current client
            if (tokenData.clientId !== this.clientId) {
                this.clearTokenData();
                return null;
            }

            return tokenData;
        } catch (error) {
            console.warn('Failed to load token data:', error);
            this.clearTokenData();
            return null;
        }
    }

    clearTokenData() {
        localStorage.removeItem(this.storageKey);
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isAuthenticated = false;
    }

    isTokenValid() {
        if (!this.accessToken || !this.tokenExpiry) return false;

        // Check if token expires within next 5 minutes (300000ms buffer)
        return Date.now() < (this.tokenExpiry - 300000);
    }

    // Initialize Google API
    async initialize() {
        if (!this.clientId) {
            console.warn('Google Drive sync: No client ID configured');
            return false;
        }

        try {
            await this.waitForGoogleAPI();
            await this.initializeGoogleClient();

            // Try to restore authentication from stored token
            const restored = await this.tryRestoreToken();

            return true;
        } catch (error) {
            console.error('Initialization error:', error);
            console.warn('Google Drive sync initialization failed:', error.message);
            return false;
        }
    }

    // Wait for Google API to load
    waitForGoogleAPI(maxWait = 10000) {
        return new Promise((resolve, reject) => {
            if (window.gapi) return resolve();

            const timeout = setTimeout(() => reject(new Error('Google API timeout')), maxWait);
            const check = setInterval(() => {
                if (window.gapi) {
                    clearTimeout(timeout);
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    // Initialize Google client for PWA
    async initializeGoogleClient() {
        return new Promise((resolve, reject) => {
            if (typeof google !== 'undefined' && google.accounts) {
                this.useGoogleIdentityServices = true;
            } else {
                this.useGoogleIdentityServices = false;
            }

            // Wait for Google API to be available
            const checkAPIs = () => {
                if (window.gapi) {

                    gapi.load('client', {
                        callback: async () => {
                            try {
                                await gapi.client.init({
                                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                                });
                                resolve();
                            } catch (error) {
                                console.error('🔧 PWA: gapi.client.init failed:', error);
                                reject(error);
                            }
                        },
                        onerror: (error) => {
                            console.error('🔧 PWA: gapi client load failed:', error);
                            reject(new Error('Failed to load Google API client'));
                        }
                    });
                } else {
                    setTimeout(checkAPIs, 500);
                }
            };

            checkAPIs();
        });
    }

    // Authenticate user with Google Services
    async authenticate() {
        // First try to restore existing valid token
        const restoredToken = await this.tryRestoreToken();
        if (restoredToken) {
            return true;
        }

        // If no valid token, proceed with new authentication
        if (this.useGoogleIdentityServices) {
            return this.authenticateWithGoogleIdentityServices();
        } else {
            return this.authenticateWithDirectOAuth();
        }
    }

    // Try to restore token from localStorage
    async tryRestoreToken() {
        try {
            const tokenData = await this.loadTokenData();
            if (!tokenData) return false;

            // Check if token is still valid
            this.accessToken = tokenData.accessToken;
            this.tokenExpiry = tokenData.expiry;

            const isValid = this.isTokenValid();

            if (!isValid) {
                this.clearTokenData();
                return false;
            }

            // Token is valid, restore authentication state
            this.isAuthenticated = true;
            gapi.client.setToken({ access_token: this.accessToken });
            this.onStatusChange('connected');
            return true;
        } catch (error) {
            console.warn('Token restoration failed:', error);
            this.clearTokenData();
            return false;
        }
    }

    // Google Identity Services authentication (modern)
    async authenticateWithGoogleIdentityServices() {
        return new Promise((resolve, reject) => {

            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
                callback: async (response) => {
                    if (response.error) {
                        console.error('OAuth failed:', response.error);
                        reject(new Error('Authentication failed: ' + response.error));
                        return;
                    }

                    this.accessToken = response.access_token;
                    this.isAuthenticated = true;

                    // Save token to localStorage with expiry
                    const expiresIn = response.expires_in || 3600; // Default 1 hour
                    await this.saveTokenData(response.access_token, expiresIn);

                    gapi.client.setToken({ access_token: this.accessToken });
                    this.onStatusChange('connected');
                    resolve(true);
                }
            });

            client.requestAccessToken();
        });
    }

    // PWA web authentication using standard OAuth redirect
    async authenticateWithDirectOAuth() {

        const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
        const redirectUri = window.location.origin + window.location.pathname;
        const state = 'pwa_auth_' + Date.now();

        // Build OAuth URL for PWA
        const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(this.clientId)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scope)}&` +
            `response_type=token&` +
            `state=${encodeURIComponent(state)}`;

        window.location.href = oauthUrl;
    }



    // Disconnect
    async disconnect() {
        // Revoke token with Google Identity Services before clearing
        if (typeof google !== 'undefined' && google.accounts && this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken);
        }

        // Clear stored token data
        this.clearTokenData();

        // Clear the token from gapi.client
        if (gapi && gapi.client) {
            gapi.client.setToken(null);
        }

        this.onStatusChange('disconnected');
    }

    // Validate authentication before API calls
    async validateAuthBeforeAPICall() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        // Check if token is still valid
        if (!this.isTokenValid()) {
            // Token expired, clear and require re-authentication
            this.clearTokenData();
            throw new Error('Token expired - please reconnect');
        }

        return true;
    }

    // Upload data to Google Drive
    async upload(data) {
        await this.validateAuthBeforeAPICall();

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            'name': this.fileName,
            'parents': ['appDataFolder']
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(data) +
            close_delim;

        const request = gapi.client.request({
            'path': 'https://www.googleapis.com/upload/drive/v3/files',
            'method': 'POST',
            'params': {'uploadType': 'multipart'},
            'headers': {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            'body': multipartRequestBody
        });

        return request.execute();
    }

    // Download data from Google Drive
    async download() {
        await this.validateAuthBeforeAPICall();

        // Find file in appDataFolder
        const response = await gapi.client.drive.files.list({
            q: `name='${this.fileName}' and parents in 'appDataFolder'`,
            spaces: 'appDataFolder'
        });

        if (response.result.files.length === 0) {
            return null; // No sync file exists yet
        }

        const fileId = response.result.files[0].id;
        const fileResponse = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        return JSON.parse(fileResponse.body);
    }

    // Sync data (merge local and remote)
    async sync(localData, mergeFunction = null) {
        await this.validateAuthBeforeAPICall();

        try {
            const remoteData = await this.download();

            if (!remoteData) {
                // No remote data, upload local
                await this.upload(localData);
                return localData;
            }

            // Merge data
            const mergedData = mergeFunction ?
                mergeFunction(localData, remoteData) :
                {...remoteData, ...localData}; // Simple override

            await this.upload(mergedData);
            return mergedData;
        } catch (error) {
            console.error('Sync failed:', error);
            throw error;
        }
    }
}

// Export for use
window.GoogleDriveSync = GoogleDriveSync;