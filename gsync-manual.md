# Google Drive Sync Module Documentation

A lightweight, modular Google Drive synchronization system for web applications.

## Overview

The gsync modules provide a complete Google Drive sync solution that can be easily integrated into any web application. The system consists of four main components:

- **gsync-minimal.js** - Core sync engine with Google Drive API integration
- **gsync-ui.js** - Self-contained UI components for sync interface
- **gsync-style.css** - Complete styling for sync UI components
- **gsync-integration.js** - Application-specific integration layer

## Features

- ✅ **Manual sync control** - User-triggered synchronization only
- ✅ **Single-button interface** - Clean, state-aware UI
- ✅ **Modular architecture** - Easy to add/remove from projects
- ✅ **Modern Google Identity Services** - Uses latest Google OAuth standards
- ✅ **Error handling** - Graceful degradation when services unavailable
- ✅ **Mobile-friendly** - Works across all devices
- ✅ **Zero dependencies** - Pure JavaScript, no external libraries

## Quick Start

### 1. Add Required HTML

Add a placeholder div where you want the sync UI to appear:

```html
<div id="sync-placeholder"></div>
```

### 2. Include Styles and Scripts

Add the CSS file to your `<head>` section:

```html
<link rel="stylesheet" href="gsync-style.css">
```

Add these scripts to your HTML (in order):

```html
<!-- Google Identity Services (new auth) -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
<!-- Google API for Drive operations -->
<script src="https://apis.google.com/js/api.js" async defer></script>

<!-- Google Drive Sync modules -->
<script src="gsync-minimal.js"></script>
<script src="gsync-ui.js"></script>
<script src="gsync-integration.js"></script>
```

### 3. Configure Your Google Cloud Project

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing

2. **Enable Google Drive API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API" and enable it

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Create OAuth 2.0 Client ID (Web application)
   - Add your domain to authorized JavaScript origins

4. **Configure Client ID**
   - Edit `gsync-integration.js`
   - Replace the Client ID with your actual credentials:

   ```javascript
   syncManager.configure('your-client-id-here.apps.googleusercontent.com');
   ```

### 4. Customize Styling (Optional)

The `gsync-style.css` file includes complete styling that integrates with CSS custom properties. For custom styling, override these classes:

```css
.sync-main-btn { /* Main sync button */ }
.sync-main-btn.state-ready { /* Ready to connect */ }
.sync-main-btn.state-connected { /* Connected - ready to sync */ }
.sync-main-btn.state-syncing { /* Currently syncing */ }
```

The styles use CSS custom properties for theming:
```css
--primary-color, --success-color, --error-color
--button-bg, --button-hover
--text-primary, --text-secondary
```

## Integration Example

Here's how it's integrated in the Yoga Vasishtha reader:

### HTML Structure

```html
<!-- In settings modal -->
<div class="settings-grid">
    <!-- Other settings -->

    <!-- Sync integration -->
    <div id="sync-placeholder"></div>
</div>
```

### JavaScript Integration

```javascript
// gsync-integration.js
const syncManager = new GoogleDriveSync({
    fileName: 'yoga-vasishtha-sync.json',
    onStatusChange: (status) => {
        console.log('Sync status changed:', status);
        if (window.syncUI) {
            window.syncUI.onSyncManagerStateChange(status === 'connected');
        }
    }
});

// Configure with your Client ID
syncManager.configure('75331868163-0o2bkv6mas7a5ljsm2a81h066hshtno8.apps.googleusercontent.com');

// Initialize when page loads
window.addEventListener('load', async () => {
    const initialized = await syncManager.initialize();
    const syncContainer = document.getElementById('sync-placeholder');

    if (syncContainer) {
        window.syncUI = new GoogleSyncUI(syncContainer, syncManager);

        if (initialized) {
            window.syncUI.onSyncManagerReady();
        } else {
            window.syncUI.onSyncManagerFailed();
        }
    }
});
```

## Data Structure

The sync system saves data to Google Drive in this format:

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
    "readingPositions": {
        "0": "1234",  // scroll position for book 0
        "1": "5678"   // scroll position for book 1
    },
    "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## UI States

The sync button displays different states:

| State | Icon | Text | Clickable | Description |
|-------|------|------|-----------|-------------|
| **Initializing** | `cloud_off` | "Initializing..." | No | Loading Google APIs |
| **Ready** | `cloud` | "Connect to Google Drive" | Yes | Ready to authenticate |
| **Connecting** | `hourglass_empty` | "Connecting..." | No | OAuth in progress |
| **Connected** | `cloud_done` | "Connected - Click to Sync" | Yes | Authenticated, ready to sync |
| **Syncing** | `sync` (spinning) | "Syncing..." | No | Upload/download in progress |
| **Error** | `error` | "Error - Click to Retry" | Yes | Something went wrong |

## Customization

### Custom Sync Data

To sync different data types, modify the `performSync()` method in `gsync-ui.js`:

```javascript
async performSync() {
    // Collect your app's data
    const localData = {
        userPreferences: JSON.parse(localStorage.getItem('preferences') || '{}'),
        gameProgress: JSON.parse(localStorage.getItem('progress') || '{}'),
        timestamp: new Date().toISOString()
    };

    await this.syncManager.upload(localData);
    // Handle success...
}
```

### Custom UI Styling

Override the CSS classes to match your app's design:

```css
.sync-main-btn {
    /* Your custom button styling */
    background: linear-gradient(45deg, #blue, #purple);
    border-radius: 25px;
}

.sync-main-btn.state-connected {
    /* Connected state styling */
    background: linear-gradient(45deg, #green, #teal);
}
```

### Custom Notifications

The system integrates with existing notification systems:

```javascript
// In gsync-ui.js constructor
this.showNotification = options.notificationHandler || this.defaultNotificationHandler;
```

## API Reference

### GoogleDriveSync Class

#### Constructor Options
- `fileName` (string) - Name of sync file in Google Drive
- `onStatusChange` (function) - Callback for auth status changes

#### Methods
- `configure(clientId, fileName)` - Set OAuth credentials
- `initialize()` - Initialize Google APIs (returns Promise<boolean>)
- `authenticate()` - Start OAuth flow (returns Promise<boolean>)
- `upload(data)` - Upload data to Drive (returns Promise)
- `download()` - Download data from Drive (returns Promise<object>)
- `sync(localData, mergeFunction)` - Bi-directional sync with merge

### Debug Functions

The system includes several debug functions available in the browser console:

#### `debugSync()`
Performs a complete sync operation with detailed logging for troubleshooting.

```javascript
// Usage
debugSync()

// Console output example:
🔍 === DEBUG SYNC START ===
📱 Local bookmarks: {"0":[...]}
📱 Local notes: {"0":[...]}
⬆️ Syncing to Google Drive...
⬇️ Reading back from Google Drive...
☁️ What made it to Google Drive: {...}
🔍 === COMPARISON ===
Local vs Synced notes match: true
Local vs Synced bookmarks match: true
✅ === DEBUG SYNC COMPLETE ===
```

**What it does:**
1. Shows current local data before sync
2. Performs full sync to Google Drive
3. Downloads data back from Google Drive
4. Compares local vs synced data
5. Reports if sync was successful

**When to use:**
- Testing sync functionality
- Diagnosing sync issues
- Verifying data integrity after changes

#### `viewSyncFile()`
Downloads and displays the current sync file contents from Google Drive.

```javascript
// Usage
viewSyncFile()

// Console output example:
Sync file contents: {
  bookmarks: {...},
  notes: {...},
  readingPositions: {...},
  deletionEvents: [...],
  syncVersion: 42,
  participatingDevices: [...]
}
```

**What it shows:**
- Complete sync file structure
- All bookmarks across devices
- All notes across devices
- Reading positions for each book
- Deletion events (tombstone records)
- Sync version and device list

**When to use:**
- Checking what's stored in Google Drive
- Debugging cross-device sync issues
- Verifying data after deletions

#### `resetSync()`
Clears all sync data from Google Drive, creating a clean slate.

```javascript
// Usage
resetSync()

// Console output example:
🔄 === RESET SYNC START ===
🗑️ Clearing Google Drive sync state...
✅ Google Drive sync state reset to empty
🔄 === RESET SYNC COMPLETE ===
```

**What it does:**
1. Uploads empty data structure to Google Drive
2. Clears all bookmarks, notes, and reading positions
3. Resets sync version to 0
4. Removes all deletion events

**When to use:**
- Starting fresh with sync
- Resolving corruption issues
- Testing initial sync scenarios
- Clearing old/stuck data

**⚠️ Warning:** This permanently deletes all synced data from Google Drive. Local data on devices remains unchanged.

### GoogleSyncUI Class

#### Constructor Parameters
- `container` (HTMLElement) - DOM element to render UI into
- `syncManager` (GoogleDriveSync) - Sync manager instance

#### Methods
- `setState(state)` - Update UI state ('ready', 'connected', 'syncing', etc.)
- `onSyncManagerReady()` - Call when sync manager initializes successfully
- `onSyncManagerFailed()` - Call when sync manager fails to initialize

## Security Considerations

1. **Client ID Security**: The OAuth Client ID is not secret - it's safe to include in client-side code
2. **Authorized Origins**: Restrict your OAuth client to specific domains in Google Cloud Console
3. **Scope Limitation**: The system only requests `drive.file` scope (can only access files it creates)
4. **No Server Required**: All authentication happens client-side with Google's servers

## Troubleshooting

### "Connect to Google Drive" button does nothing
- Check browser console for errors
- Verify OAuth Client ID is correctly configured
- Ensure your domain is in authorized JavaScript origins

### "Error - Click to Retry" state
- Check network connectivity
- Verify Google Drive API is enabled in your project
- Check quota limits in Google Cloud Console

### Files not syncing between devices
- Check that sync completed successfully (green notification)
- Verify same Google account is used on all devices
- Look for JavaScript errors in console during sync

## Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Migration from Other Sync Systems

If you're replacing an existing sync system:

1. Keep old sync code temporarily
2. Deploy gsync modules alongside existing system
3. Test thoroughly on all devices
4. Remove old sync code once confirmed working
5. Update user documentation

## Support

The gsync modules are designed to be self-contained and require minimal maintenance. For issues:

1. Check browser console for error messages
2. Verify Google Cloud Console configuration
3. Test with different browsers/devices
4. Check network connectivity and firewall settings

---

**Example Integration**: This system is successfully used in the Yoga Vasishtha EPUB Reader, handling synchronization of bookmarks, notes, and reading positions across multiple devices and volumes.