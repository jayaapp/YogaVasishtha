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
        this.isCapacitor = !!(window.Capacitor && window.Capacitor.Plugins);
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
        console.log('🔧 DEBUG: initialize() called, clientId:', !!this.clientId, 'isCapacitor:', this.isCapacitor);

        if (!this.clientId) {
            console.warn('Google Drive sync: No client ID configured');
            return false;
        }

        try {
            if (this.isCapacitor) {
                console.log('🔧 DEBUG: Capacitor detected - trying native auth...');
                try {
                    await this.initializeCapacitorGoogleAuth();
                    console.log('🔧 DEBUG: Capacitor Google Auth initialized successfully');
                } catch (capacitorError) {
                    console.warn('🔧 DEBUG: Capacitor auth failed, falling back to web auth:', capacitorError.message);
                    // Fallback to web auth in Capacitor
                    await this.waitForGoogleAPI();
                    await this.initializeGoogleClient();
                    this.isCapacitor = false; // Use web auth methods
                }
            } else {
                console.log('🔧 DEBUG: Waiting for Google API...');
                await this.waitForGoogleAPI();
                console.log('🔧 DEBUG: Google API available, initializing client...');
                await this.initializeGoogleClient();
            }
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

    // Initialize Google client with modern Google Identity Services
    async initializeGoogleClient() {
        return new Promise((resolve, reject) => {
            console.log('🔧 DEBUG: Initializing with Google Identity Services...');

            // Wait for both Google Identity Services and Google API
            const checkAPIs = () => {
                if (typeof google !== 'undefined' && window.gapi) {
                    console.log('🔧 DEBUG: Both Google APIs available, loading client...');

                    // Load only the client module (no auth2 needed with GIS)
                    gapi.load('client', {
                        callback: async () => {
                            console.log('🔧 DEBUG: gapi.client loaded, initializing Drive API...');
                            try {
                                await gapi.client.init({
                                    apiKey: this.apiKey, // Optional but can help with quotas
                                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                                });

                                console.log('🔧 DEBUG: Google client initialization completed');
                                resolve();
                            } catch (error) {
                                console.error('🔧 DEBUG: gapi.client.init failed:', error);
                                reject(error);
                            }
                        },
                        onerror: (error) => {
                            console.error('🔧 DEBUG: gapi.client load failed:', error);
                            reject(new Error('Failed to load Google API client'));
                        }
                    });
                } else {
                    console.log('🔧 DEBUG: Waiting for Google APIs to load...');
                    setTimeout(checkAPIs, 500);
                }
            };

            checkAPIs();
        });
    }

    // Authenticate user with Google Identity Services
    async authenticate() {
        if (this.isCapacitor) {
            return await this.authenticateCapacitor();
        }

        return new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.accounts) {
                reject(new Error('Google Identity Services not loaded'));
                return;
            }

            console.log('🔧 DEBUG: Starting OAuth flow with Google Identity Services...');

            // Initialize OAuth with Google Identity Services
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

                    // Set the token for gapi.client requests
                    gapi.client.setToken({
                        access_token: this.accessToken
                    });

                    this.onStatusChange('connected');
                    resolve(true);
                }
            });

            // Request access token
            client.requestAccessToken();
        });
    }

    // Initialize Capacitor Google Auth
    async initializeCapacitorGoogleAuth() {
        if (!window.Capacitor?.Plugins?.GoogleAuth) {
            throw new Error('GoogleAuth plugin not available');
        }

        const { GoogleAuth } = window.Capacitor.Plugins;

        await GoogleAuth.initialize({
            clientId: this.clientId,
            scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'],
            grantOfflineAccess: true
        });

        console.log('🔧 DEBUG: Capacitor Google Auth initialized');
    }

    // Capacitor authentication
    async authenticateCapacitor() {
        try {
            const { GoogleAuth } = window.Capacitor.Plugins;

            const result = await GoogleAuth.signIn();
            this.accessToken = result.authentication.accessToken;
            this.isAuthenticated = true;
            this.onStatusChange('connected');

            // Initialize gapi client for Drive API
            await this.initializeGapiClient();
            return true;
        } catch (error) {
            console.error('🔧 DEBUG: Capacitor auth error:', error);
            return false;
        }
    }

    // Initialize gapi client with Capacitor token
    async initializeGapiClient() {
        if (!window.gapi) {
            // Load gapi for Drive API calls
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        await new Promise(resolve => window.gapi.load('client', resolve));
        await window.gapi.client.init({});
        window.gapi.client.setToken({ access_token: this.accessToken });
        await window.gapi.client.load('drive', 'v3');
    }

    // Disconnect
    async disconnect() {
        console.log('🔧 DEBUG: Disconnecting...');
        this.accessToken = null;
        this.isAuthenticated = false;

        if (this.isCapacitor) {
            // Capacitor sign out
            try {
                const { GoogleAuth } = window.Capacitor.Plugins;
                await GoogleAuth.signOut();
            } catch (error) {
                console.warn('Capacitor sign out error:', error);
            }
        } else {
            // Clear the token from gapi.client
            if (gapi && gapi.client) {
                gapi.client.setToken(null);
            }

            // Revoke token with Google Identity Services
            if (typeof google !== 'undefined' && google.accounts && this.accessToken) {
                google.accounts.oauth2.revoke(this.accessToken);
            }
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