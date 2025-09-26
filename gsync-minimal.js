/**
 * Minimal Google Drive Sync - Reusable across apps
 * Simple, elegant solution for app state synchronization
 */

class GoogleDriveSync {
    constructor(options = {}) {
        this.clientId = options.clientId || null;
        this.fileName = options.fileName || 'app-sync.json';
        this.isAuthenticated = false;
        this.onStatusChange = options.onStatusChange || (() => {});
    }

    // Configure credentials (app-specific)
    configure(clientId, fileName = null) {
        this.clientId = clientId;
        if (fileName) {
            this.fileName = fileName;
        }
        // Keep existing fileName if not provided
    }

    // Initialize Google API
    async initialize() {
        console.log('🔧 DEBUG: initialize() called, clientId:', !!this.clientId);

        if (!this.clientId) {
            console.warn('Google Drive sync: No client ID configured');
            return false;
        }

        try {
            console.log('🔧 DEBUG: Waiting for Google API...');
            await this.waitForGoogleAPI();
            console.log('🔧 DEBUG: Google API available, initializing client...');
            await this.initializeGoogleClient();
            console.log('🔧 DEBUG: Google client initialized successfully');
            return true;
        } catch (error) {
            console.error('🔧 DEBUG: Initialization error:', error);
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
                console.log('🔧 PWA: Using Google Identity Services');
                this.useGoogleIdentityServices = true;
            } else {
                console.log('🔧 PWA: Google Identity Services not available, using standard OAuth');
                this.useGoogleIdentityServices = false;
            }

            // Wait for Google API to be available
            const checkAPIs = () => {
                if (window.gapi) {
                    console.log('🔧 PWA: Google API available, loading client...');

                    gapi.load('client', {
                        callback: async () => {
                            console.log('🔧 PWA: gapi client loaded, initializing...');
                            try {
                                await gapi.client.init({
                                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                                });
                                console.log('🔧 PWA: Google client initialization completed');
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
                    console.log('🔧 PWA: Waiting for Google API to load...');
                    setTimeout(checkAPIs, 500);
                }
            };

            checkAPIs();
        });
    }

    // Authenticate user with Google Services
    async authenticate() {
        if (this.useGoogleIdentityServices) {
            return this.authenticateWithGoogleIdentityServices();
        } else {
            return this.authenticateWithDirectOAuth();
        }
    }

    // Google Identity Services authentication (modern)
    async authenticateWithGoogleIdentityServices() {
        return new Promise((resolve, reject) => {
            console.log('🔧 DEBUG: Starting OAuth flow with Google Identity Services...');

            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata',
                callback: (response) => {
                    if (response.error) {
                        console.error('🔧 DEBUG: OAuth failed:', response.error);
                        reject(new Error('Authentication failed: ' + response.error));
                        return;
                    }

                    console.log('🔧 DEBUG: OAuth successful, got access token');
                    this.accessToken = response.access_token;
                    this.isAuthenticated = true;

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
        console.log('🔧 PWA: Starting OAuth flow...');

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

        console.log('🔧 PWA: Redirecting to Google OAuth...');
        window.location.href = oauthUrl;
    }



    // Disconnect
    async disconnect() {
        console.log('🔧 DEBUG: Disconnecting...');
        this.accessToken = null;
        this.isAuthenticated = false;

        // Clear the token from gapi.client
        if (gapi && gapi.client) {
            gapi.client.setToken(null);
        }

        // Revoke token with Google Identity Services
        if (typeof google !== 'undefined' && google.accounts && this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken);
        }

        this.onStatusChange('disconnected');
    }

    // Upload data to Google Drive
    async upload(data) {
        if (!this.isAuthenticated) throw new Error('Not authenticated');

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
        if (!this.isAuthenticated) throw new Error('Not authenticated');

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
        if (!this.isAuthenticated) throw new Error('Not authenticated');

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