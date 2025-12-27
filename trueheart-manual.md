# TrueHeart Sync Module Documentation

A complete authentication and cloud synchronization system for web applications.

## Overview

The TrueHeart modules provide a full-featured authentication and sync solution with backend infrastructure. The system consists of four main components:

- **trueheart-integration.js** - Core API clients and sync engine
- **trueheart-ui.js** - Self-contained UI components for auth and sync
- **trueheart-style.css** - Complete styling with theme support
- **trueheart-loader.js** - Initialization and backwards compatibility layer

## Features

- ✅ **Complete authentication** - Registration, login, logout, password reset

**Note:** Password reset is handled by a backend-hosted page by default. When a user requests a reset, they'll receive an email with a link to the central reset page (e.g., `https://trueheartapps.com/user/reset?reset_token=...`). Apps no longer need to implement a password-reset form unless you prefer in-app flows.
- ✅ **User account management** - Account deletion with data cleanup
- ✅ **Manual sync control** - User-triggered synchronization
- ✅ **Storage quota display** - Real-time usage tracking (MB used / quota)
- ✅ **Modular architecture** - Easy to add/remove from projects
- ✅ **Localization support** - Integrated with app locale system
- ✅ **Error handling** - Graceful degradation and clear error messages
- ✅ **Mobile-friendly** - Responsive design across all devices
- ✅ **Zero external dependencies** - Pure JavaScript

## Quick Start

### 1. Add Required HTML

Add a placeholder div in your settings panel:

```html
<div id="sync-placeholder"></div>
```

### 2. Include Styles and Scripts

Add the CSS file to your `<head>` section:

```html
<link rel="stylesheet" href="css/trueheart-style.css">
```

Add these scripts to your HTML (in order):

```html
<!-- TrueHeart modules -->
<script src="js/trueheart-integration.js"></script>
<script src="js/trueheart-ui.js"></script>
<script src="js/trueheart-loader.js"></script>
```

### 3. Backend Requirements

The TrueHeart system requires three backend services:

1. **trueheartuser** - Authentication and user management
   - Port: 3003 (development), /user (production)
   - Features: Login, registration, session management, service provisioning

2. **trueheartsync** - Data synchronization storage
   - Port: 3004 (development), /sync (production)
   - Features: Data storage, compression, quota management

3. **trueheartdonate** - Donations (optional)
   - Port: 3005 (development), /donate (production)
   - Features: PayPal/Stripe integration for voluntary donations

### 4. Configure API Endpoints

The system automatically detects the environment in `trueheart-integration.js`:

```javascript
const TRUEHEART_CONFIG = {
    userAPI: window.location.hostname === 'localhost' 
        ? 'http://localhost:3003' 
        : 'https://trueheartapps.com/user',
    syncAPI: window.location.hostname === 'localhost'
        ? 'http://localhost:3004'
        : 'https://trueheartapps.com/sync',
    appId: 'jayaapp',  // ⚠️ Change this to your app identifier
    appUrl: window.location.origin
};
```

### 5. ⚠️ CRITICAL: Configure App-Specific Settings

When reusing this module in a different app, you **MUST** update:

**A. App Identifier** in `trueheart-integration.js`:
```javascript
appId: 'yourapp',  // Must match backend service definitions
```

**B. Localized Strings** in `data/locale.json` - Add all TrueHeart translations:
```json
{
    "English": {
        "sync_title": "Cloud Sync & User Account",
        "sync_description": "Sign in to sync your data across devices.",
        "email_placeholder": "Email",
        "password_placeholder": "Password",
        // ... (see Integration Example section for full list)
    },
    "YourLanguage": {
        // Add translations for your language
    }
}
```

**C. Data Collection** in `trueheart-integration.js` `performTrueHeartSync()` (~line 301):
```javascript
const localData = {
    bookmarks: JSON.parse(localStorage.getItem('bookmarks') || '{}'),
    notes: JSON.parse(localStorage.getItem('notes') || '{}'),
    prompts: JSON.parse(localStorage.getItem('prompts') || '{}'),
    // Add your app's data structures here
    timestamp: new Date().toISOString()
};
```

**D. Localization Application** - Add to your settings initialization:
```javascript
// In settings.js or main initialization
function applyLocalization() {
    // ... existing localization code
    
    // Apply TrueHeart-specific localization (with placeholders)
    applyTrueHeartLocalization();
}

function applyTrueHeartLocalization() {
    // See Integration Example section for implementation
}
```

## Integration Example

Here's the complete integration from JayaApp:

### HTML Structure

```html
<!-- In html/settings.html -->
<div class="settings-section">
    <h2 locale-id="cloud_sync">Cloud Sync</h2>
    
    <!-- TrueHeart sync integration point -->
    <div id="sync-placeholder"></div>
</div>
```

### Loader Integration

```javascript
// trueheart-loader.js
(async function initTrueHeartLoader() {
    // Wait for DOM
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }

    // Find sync container
    const syncContainer = document.getElementById('sync-placeholder');
    if (!syncContainer) {
        console.warn('TrueHeart: sync-placeholder not found');
        return;
    }

    // Wait for API initialization
    let attempts = 0;
    while (!window.trueheartUser && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }

    if (!window.trueheartUser) {
        console.error('TrueHeart: API failed to initialize');
        return;
    }

    // Create UI
    window.trueheartUI = new TrueHeartUI(syncContainer);
    
    // Apply localization
    if (typeof applyLocalization === 'function') {
        applyLocalization();
    }

    // Listen for locale changes
    document.addEventListener('localeChanged', () => {
        if (typeof applyTrueHeartLocalization === 'function') {
            applyTrueHeartLocalization();
        }
    });

    // Listen for sync completion to refresh UI
    window.addEventListener('trueheart-sync-complete', () => {
        if (typeof window.loadBookmarks === 'function') {
            window.loadBookmarks();
        }
        // Refresh other UI components as needed
    });
})();

// Backwards compatibility stubs
window.syncUI = {
    addDeletionEvent: function(key, type) {
        const deletions = JSON.parse(localStorage.getItem('trueheart-deletions') || '[]');
        deletions.push({ key, type, timestamp: Date.now() });
        localStorage.setItem('trueheart-deletions', JSON.stringify(deletions));
    },
    performCompleteSync: async function() {
        if (window.trueheartState.isAuthenticated && window.trueheartAPI) {
            await window.trueheartAPI.performTrueHeartSync();
            window.dispatchEvent(new CustomEvent('trueheart-sync-complete'));
        }
    }
};
```

### Localization Integration

```javascript
// In settings.js - Smart localization with placeholder support
function applyTrueHeartLocalization() {
    const currentLang = localStorage.getItem('appLang') || 'English';
    if (!window.localeData || !window.localeData[currentLang]) return;

    const locale = window.localeData[currentLang];

    // Handle hobby project notice with donate link placeholder
    const hobbyNotice = document.querySelector('[locale-id="hobby_project_notice"]');
    if (hobbyNotice && locale.hobby_project_notice && locale.donating) {
        const donateLinkId = hobbyNotice.getAttribute('data-donate-link');
        const donateText = locale.donating;
        
        // Replace {0} placeholder with localized link
        const localizedText = locale.hobby_project_notice.replace(
            '{0}',
            `<a href="#" id="${donateLinkId}">${donateText}</a>`
        );
        
        hobbyNotice.innerHTML = localizedText;
        
        // Reattach event listener
        const donateLink = document.getElementById(donateLinkId);
        if (donateLink && window.trueheartUI) {
            donateLink.addEventListener('click', (e) => {
                e.preventDefault();
                const donateToggle = document.getElementById('donate-toggle');
                if (donateToggle) {
                    donateToggle.click();
                } else {
                    window.open('https://trueheartapps.com/donate', '_blank');
                }
            });
        }
    }
}
```

### Required Locale Translations

Add these keys to your `locale.json` for each language:

```json
{
    "sync_title": "Cloud Sync & User Account",
    "sync_description": "Sign in to sync your data across devices.",
    "login": "Log In",
    "register": "Register",
    "email_placeholder": "Email",
    "password_placeholder": "Password",
    "password_requirements": "Password (min 8 chars, uppercase, lowercase, number)",
    "confirm_password": "Confirm Password",
    "tos_notice_prefix": "By registering, you accept our",
    "tos_notice_and": "and",
    "terms": "Terms",
    "privacy_policy": "Privacy Policy",
    "forgot_password": "Forgot Password?",
    "send_reset_link": "Send Reset Link",
    "cancel": "Cancel",
    "sync_now": "Sync Now",
    "last_sync": "Last sync:",
    "storage_label": "Storage:",
    "loading": "Loading...",
    "hobby_project_title": "Free Hobby Project",
    "hobby_project_notice": "You have 1MB free sync storage. This is a volunteer-run service with limited capacity. Want to help? Consider {0}.",
    "donating": "donating",
    "logout": "Log Out",
    "delete_account": "Delete Account",
    
    "error_email_password_required": "Please enter email and password",
    "status_logging_in": "Logging in...",
    "success_login": "Login successful!",
    "error_login_failed": "Login failed",
    "error_network": "Network error",
    "error_fill_all_fields": "Please fill all fields",
    "error_passwords_mismatch": "Passwords do not match",
    "status_creating_account": "Creating account...",
    "success_registration": "Registration successful!",
    "error_registration_failed": "Registration failed",
    "error_enter_email": "Please enter your email",
    "status_sending_reset": "Sending reset link...",
    "success_reset_sent": "Password reset link sent! Check your email.",
    "error_request_failed": "Request failed",
    "success_logout": "Logged out successfully",
    "error_logout": "Logout error",
    "confirm_delete_account": "WARNING: This will permanently delete your account and all synced data.\\n\\nThis action CANNOT be undone.\\n\\nAre you absolutely sure?",
    "prompt_enter_password": "Enter your password to confirm account deletion:",
    "status_deleting_account": "Deleting account...",
    "success_account_deleted": "Account deleted. Redirecting...",
    "info_account_deleted_permanent": "Your account has been permanently deleted.",
    "error_delete_account_failed": "Failed to delete account",
    "error_general": "Error",
    "syncing": "Syncing...",
    "success_sync_complete": "Sync completed successfully!",
    "error_sync": "Sync error"
}
```

## Data Structure

The sync system saves data to TrueHeartSync backend in this format:

```javascript
{
    "bookmarks": {
        "0": [/* bookmark objects for book 0 */],
        "1": [/* bookmark objects for book 1 */]
    },
    "notes": {
        "0": [/* note objects for book 0 */],
        "1": [/* note objects for book 1 */]
    },
    "prompts": {
        "custom_prompt_1": {/* prompt definition */}
    },
    "readingPositions": {
        "0": "1234",  // scroll position for book 0
        "1": "5678"   // scroll position for book 1
    },
    "settings": {
        /* app settings */
    },
    "timestamp": "2025-12-14T10:30:00.000Z"
}
```

## UI States

The sync button and UI display different states:

| State | Icon | Text | Description |
|-------|------|------|-------------|
| **Not Authenticated** | - | Login/Register forms | User needs to sign in |
| **Authenticated** | `person` | User email shown | Logged in, ready to sync |
| **Syncing** | `cloud_sync` (spinning) | "Syncing..." | Upload/download in progress |
| **Success** | - | Green message | Operation completed successfully |
| **Error** | - | Red message | Something went wrong |

### Account View Features

When authenticated, the UI displays:
- User email address
- Storage usage (e.g., "0.05 MB / 1 MB (5%)")
- Last sync timestamp
- Manual sync button
- Logout button
- Delete account button (with double confirmation)

## App Integration Checklist

When integrating TrueHeart modules into a new application:

### Required Configuration Steps

- [ ] **1. Update App ID** in `trueheart-integration.js`
  ```javascript
  appId: 'yourapp',  // Must match backend service definition
  ```

- [ ] **2. Configure Backend Endpoints** (if different)
  ```javascript
  const TRUEHEART_CONFIG = {
      userAPI: 'https://yourbackend.com/user',
      syncAPI: 'https://yourbackend.com/sync',
      appId: 'yourapp',
      appUrl: window.location.origin
  };
  ```

- [ ] **3. Add All Locale Translations** to `data/locale.json`
  - Copy all 40+ translation keys from the example above
  - Translate for each language your app supports

- [ ] **4. Implement `applyTrueHeartLocalization()`** in your settings/init code
  - Handles placeholder replacement (e.g., donate link)
  - Reattaches event listeners after localization

- [ ] **5. Update Data Collection** in `performTrueHeartSync()` method
  ```javascript
  const localData = {
      yourData1: JSON.parse(localStorage.getItem('your-key-1') || '{}'),
      yourData2: JSON.parse(localStorage.getItem('your-key-2') || '{}'),
      timestamp: new Date().toISOString()
  };
  ```

- [ ] **6. Update Data Restoration** in merge logic
  ```javascript
  // After merge, update localStorage
  localStorage.setItem('your-key-1', JSON.stringify(mergedData.yourData1));
  localStorage.setItem('your-key-2', JSON.stringify(mergedData.yourData2));
  ```

- [ ] **7. Add Sync Completion Handlers** in loader
  ```javascript
  window.addEventListener('trueheart-sync-complete', () => {
      // Refresh your UI components
      window.loadYourData();
  });
  ```

- [ ] **8. Configure Backend Service** in trueheartuser
  - Add your app to `services.json`
  - Set up CORS origins for your domain

- [ ] **9. Test Complete Flow**:
  - Registration → receives welcome email
  - Login → sees account view
  - Sync → data uploads to backend
  - Cross-device → data syncs between devices
  - Account deletion → data cleanup

### Common Integration Mistakes

❌ **Mistake 1:** Forgetting to add locale translations
- **Result:** UI displays translation keys instead of text
- **Fix:** Add all 40+ translation keys to each language in locale.json

❌ **Mistake 2:** Not implementing `applyTrueHeartLocalization()`
- **Result:** Placeholder links don't render, localization breaks
- **Fix:** Copy the function from the example and call it in your localization flow

❌ **Mistake 3:** App ID mismatch between frontend and backend
- **Result:** Service provisioning fails, users can't sync
- **Fix:** Ensure appId in frontend matches service_id in backend services.json

❌ **Mistake 4:** Not listening to `trueheart-sync-complete` event
- **Result:** UI doesn't refresh after sync
- **Fix:** Add event listener to reload your data after sync completes

❌ **Mistake 5:** Loading scripts in wrong order
- **Result:** Initialization failures, "undefined" errors
- **Fix:** Load in order: trueheart-integration.js → trueheart-ui.js → trueheart-loader.js

## Customization

### Custom Sync Data

To sync different data types, modify `performTrueHeartSync()` in `trueheart-integration.js`:

```javascript
async function performTrueHeartSync() {
    if (!window.trueheartState.isAuthenticated) {
        throw new Error('Not authenticated');
    }

    // Collect your app's data
    const localData = {
        gameProgress: JSON.parse(localStorage.getItem('game-progress') || '{}'),
        achievements: JSON.parse(localStorage.getItem('achievements') || '[]'),
        settings: JSON.parse(localStorage.getItem('settings') || '{}'),
        timestamp: new Date().toISOString()
    };

    // Load remote data
    const remoteResult = await window.trueheartSync.load();
    const remoteData = remoteResult.data;

    let mergedData;
    if (!remoteData) {
        mergedData = localData;
    } else {
        // Implement your merge strategy
        const localTime = new Date(localData.timestamp || 0);
        const remoteTime = new Date(remoteData.timestamp || 0);
        
        mergedData = localTime > remoteTime 
            ? localData 
            : remoteData;
    }

    // Save merged data
    await window.trueheartSync.save(mergedData);

    // Update localStorage
    localStorage.setItem('game-progress', JSON.stringify(mergedData.gameProgress));
    localStorage.setItem('achievements', JSON.stringify(mergedData.achievements));
    localStorage.setItem('settings', JSON.stringify(mergedData.settings));
}
```

### Custom UI Styling

The system uses CSS custom properties for theming. Override in your app:

```css
:root {
    --primary-color: #your-color;
    --success-color: #your-success;
    --error-color: #your-error;
    --panel-bg: #your-panel-bg;
    --border-color: #your-border;
}
```

### Custom Panel Layout

Adjust panel width and position in `trueheart-style.css`:

```css
.trueheart-sync-container {
    max-width: 1024px;  /* Hand-tunable: panel width cap */
    margin-top: 20px;   /* Hand-tunable: top spacing */
    /* For center: margin-left: auto; margin-right: auto; */
    /* For left: (leave margins unset) */
}
```

### Custom Merge Strategy

Implement advanced merge logic in `performTrueHeartSync()`:

```javascript
// Example: Field-by-field merge
mergedData = {
    bookmarks: mergeObjects(localData.bookmarks, remoteData.bookmarks),
    notes: mergeObjects(localData.notes, remoteData.notes),
    settings: remoteData.settings, // Always take remote settings
    timestamp: new Date().toISOString()
};

function mergeObjects(local, remote) {
    return { ...remote, ...local }; // Local wins
    // Or implement more sophisticated merge
}
```

## API Reference

### TrueHeartUser Class

Methods for authentication and account management.

#### `async register(email, password)`
Register a new user account.
- Returns: `{ success: boolean, session_token?: string, error?: string }`

#### `async login(email, password)`
Login to existing account.
- Returns: `{ success: boolean, session_token?: string, error?: string }`

#### `async logout()`
Logout current session.
- Returns: `{ success: boolean }`

#### `async validateSession()`
Check if current session is still valid.
- Returns: `{ success: boolean, valid: boolean }`

#### `async requestPasswordReset(email)`
Request password reset email.
- Returns: `{ success: boolean, message: string }`

#### `async checkServiceStatus(serviceId)`
Get status of a service for current user.
- Returns: `{ success: boolean, status: string, storage_quota_mb: number }`

#### `async getStorageUsage()`
Get current storage usage statistics.
- Returns: `{ success: boolean, total_size_mb: number, quota_mb: number, quota_used_percent: number }`

#### `async deleteAccount(password)`
Permanently delete user account and all data.
- Returns: `{ success: boolean, error?: string }`

### TrueHeartSync Class

Methods for data synchronization.

#### `async save(data)`
Upload data to sync backend.
- Parameters: `data` (object) - Data to sync
- Returns: Promise

#### `async load()`
Download data from sync backend.
- Returns: `{ success: boolean, data: object }`

#### `async check()`
Check if remote data exists and get metadata.
- Returns: `{ exists: boolean, hash?: string, lastModified?: number }`

### TrueHeartUI Class

UI component for authentication and sync interface.

#### Constructor
```javascript
new TrueHeartUI(container)
```
- `container` (HTMLElement) - DOM element to render UI into

#### Methods

##### `getLocalizedMessage(key)`
Get localized message for given key.
- Returns: string (localized text with newlines converted)

##### `async updateAuthState()`
Update UI based on current authentication state.
- Shows login/register forms if not authenticated
- Shows account view if authenticated
- Fetches and displays service status and storage usage

##### `setState(state)`
Update sync button state.
- States: 'disconnected', 'connecting', 'connected', 'syncing'

## Security Considerations

### Session Management
- Session tokens stored in localStorage
- Automatically sent with API requests via Authorization header
- Validated on every request
- Cleared on logout and account deletion

### Password Requirements
- Minimum 8 characters
- Must contain: uppercase, lowercase, number
- Validated on frontend and backend
- Never stored in plaintext (bcrypt hashed on backend)

### CORS Protection
Backend validates requests against CORS_ORIGIN whitelist.

### Data Encryption
- Session tokens are secure random strings
- Passwords hashed with bcrypt (cost factor 10)
- HTTPS required in production

### Service Secrets
- Backend services communicate via service secrets
- Not exposed to frontend
- Validated on internal API calls

## Troubleshooting

### "Cloud Sync Unavailable"

**Cause**: TrueHeart API failed to initialize

**Solutions**:
1. Check backend services are running (ports 3003, 3004)
2. Check browser console for errors
3. Verify CORS_ORIGIN includes your frontend URL
4. Check network tab for failed API calls

### "Not authenticated" errors

**Cause**: Session token invalid or expired

**Solutions**:
1. Logout and login again
2. Clear session: `localStorage.removeItem('trueheart-session-token')`
3. Check backend logs for authentication errors

### Sync fails silently

**Cause**: Network error or backend error

**Solutions**:
1. Check browser console for error messages
2. Check backend logs (trueheartuser/trueheartsync)
3. Verify user has valid session
4. Check CORS configuration
5. Verify service is provisioned for user

### UI not appearing

**Cause**: Scripts loaded out of order or container missing

**Solutions**:
1. Verify `sync-placeholder` div exists
2. Check scripts loaded in correct order
3. Check browser console for JavaScript errors
4. Verify `window.trueheartUser` is defined

### Localization not working

**Cause**: Missing translations or localization function

**Solutions**:
1. Verify all translation keys exist in locale.json
2. Check `applyTrueHeartLocalization()` is implemented
3. Ensure function is called on language change
4. Check console for "missing translation" warnings

### Storage usage shows "Loading..."

**Cause**: API call failed or response format wrong

**Solutions**:
1. Check `/sync/usage` endpoint is accessible
2. Verify response format: `{ total_size_mb, quota_mb, quota_used_percent }`
3. Check browser console for API errors

### Account deletion fails

**Cause**: Wrong password or backend error

**Solutions**:
1. Verify correct password entered
2. Check backend logs for error details
3. Ensure user is authenticated
4. Verify sync data deletion completed

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Migration guidance

If your application uses a different sync solution and you want to migrate to TrueHeart:

1. Keep the other sync code commented during testing (comment out in `index.html`).
2. Deploy the TrueHeart modules and initialize them in your environment.
3. Test sync and account flows across all target devices and browsers.
4. Note: users will start with a TrueHeart account; data migration is not automatic.
5. Once tests pass, you may remove the commented-out sync code.

### Backwards Compatibility

TrueHeart loader provides stubs for compatibility with older sync call sites:

```javascript
window.syncUI = {
    addDeletionEvent(key, type) { ... },
    performCompleteSync() { ... }
};
```

This ensures existing code referencing `window.syncUI` continues to work while you're
transitioning to the TrueHeart APIs.

## Backend Setup

### Required Services

1. **trueheartuser** - Install and configure:
   ```bash
   cd TrueHeartApps/trueheartuser/backend
   npm install
   # Configure .env or use JayaAppSecrets/environment.env
   npm start
   ```

2. **trueheartsync** - Install and configure:
   ```bash
   cd TrueHeartApps/trueheartsync/backend
   npm install
   # Configure .env
   npm start
   ```

3. **Backend Configuration** - Add your app to services.json:
   ```json
   {
       "service_id": "yourapp",
       "scope": "app",
       "name": {
           "en": "Your App",
           "pl": "Twoja Aplikacja"
       },
       "pricing": {
           "free": {
               "storage_mb": 1
           }
       }
   }
   ```

## Production Deployment

### Frontend Checklist

- [ ] Update API endpoints to production URLs
- [ ] Test all authentication flows
- [ ] Verify CORS configuration
- [ ] Test on multiple devices and browsers
- [ ] Check localization in all supported languages

### Backend Checklist

- [ ] Configure CORS_ORIGIN for production domain
- [ ] Set up HTTPS (required for production)
- [ ] Configure email service (nodemailer)
- [ ] Set up backup strategy for SQLite databases
- [ ] Monitor logs for errors
- [ ] Set up rate limiting if needed

## Performance Considerations

### Sync Optimization

- Sync is manual (user-triggered) - no automatic intervals
- Data is compressed on backend (gzip)
- Only changed data synced (timestamp comparison)
- Storage usage checked after each sync

### UI Performance

- Lazy loading - UI only initialized when settings panel opened
- Localization applied once on init + language change
- Event listeners attached once, not on every render

## Support

For issues or questions:

1. Check browser console for error messages
2. Check backend logs in `backend/logs/server.log`
3. Review this guide's troubleshooting section
4. Verify backend services are running
5. Check CORS and network connectivity

---

**Example Integration**: This system is successfully used in JayaApp (Mahabharata EPUB Reader), handling authentication, synchronization of bookmarks, notes, prompts, reading positions, and settings across multiple devices with full localization support for English and Polish.
