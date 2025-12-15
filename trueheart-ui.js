/**
 * TrueHeart User Interface Component
 * Provides authentication and sync UI for JayaApp settings panel
 */

// Default English locale fallback for TrueHeart UI messages
const TRUEHEART_DEFAULT_LOCALE = {
    English: {
        error_email_password_required: 'Please enter email and password',
        status_logging_in: 'Logging in...',
        success_login: 'Login successful!',
        error_login_failed: 'Login failed',
        error_network: 'Network error',
        error_enter_email: 'Please enter your email',
        status_sending_reset: 'Sending reset link...',
        success_reset_sent: 'Password reset link sent! Check your email.',
        error_request_failed: 'Request failed',
        success_logout: 'Logged out successfully',
        error_logout: 'Logout error',
        confirm_delete_account: 'WARNING: This will permanently delete your account and all synced data.\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?',
        prompt_enter_password: 'Enter your password to confirm account deletion:',
        status_deleting_account: 'Deleting account...',
        success_account_deleted: 'Account deleted. Redirecting...',
        info_account_deleted_permanent: 'Your account has been permanently deleted.',
        error_delete_account_failed: 'Failed to delete account',
        error_general: 'Error',
        syncing: 'Syncing...',
        success_sync_complete: 'Sync completed successfully!',
        error_sync: 'Sync error',
        sync_title: 'Cloud Sync & User Account',
        sync_description: 'Sign in to sync your data across devices.',
        login: 'Log In',
        register: 'Register',
        email_placeholder: 'Email',
        password_placeholder: 'Password',
        send_reset_link: 'Send Reset Link',
        donating: 'Consider donating'
    }
};

class TrueHeartUI {
    constructor(container) {
        this.container = container;
        this.state = 'disconnected'; // disconnected, connecting, connected, syncing
        this.render();
        this.attachEventListeners();
        
        // Check initial auth state
        this.updateAuthState();
    }

    // Helper to get localized message
    getLocalizedMessage(key) {
        const currentLang = localStorage.getItem('appLang') || 'English';
        // Prefer external locale data if available
        if (window.localeData && window.localeData[currentLang] && window.localeData[currentLang][key]) {
            return window.localeData[currentLang][key].replace(/\\n/g, '\n');
        }

        // Fallback to embedded default English strings
        if (TRUEHEART_DEFAULT_LOCALE[currentLang] && TRUEHEART_DEFAULT_LOCALE[currentLang][key]) {
            return TRUEHEART_DEFAULT_LOCALE[currentLang][key];
        }

        return key; // Final fallback to the key itself
    }

    render() {
        this.container.innerHTML = `
            <div class="trueheart-sync-container">
                <div class="trueheart-header">
                    <h3>
                        <span class="material-symbols-outlined">cloud</span>
                        <span locale-id="sync_title">Cloud Sync & User Account</span>
                    </h3>
                </div>

                <!-- Not authenticated view -->
                <div class="trueheart-auth-view" id="trueheart-auth-view">
                    <p class="trueheart-description" locale-id="sync_description">
                        Sign in to sync your data across devices.
                    </p>

                    <div class="trueheart-tabs">
                        <button class="trueheart-tab active" data-tab="login">
                            <span locale-id="login">Log In</span>
                        </button>
                        <button class="trueheart-tab" data-tab="register">
                            <span locale-id="register">Register</span>
                        </button>
                    </div>

                    <!-- Login Form -->
                    <div class="trueheart-form trueheart-form-active" id="trueheart-login-form">
                        <input 
                            type="email" 
                            id="trueheart-login-email" 
                            placeholder="Email"
                            locale-placeholder="email_placeholder"
                            required>
                        <input 
                            type="password" 
                            id="trueheart-login-password" 
                            placeholder="Password"
                            locale-placeholder="password_placeholder"
                            required>
                        <button class="trueheart-btn-primary" id="trueheart-login-btn">
                            <span locale-id="login">Log In</span>
                        </button>
                        <button class="trueheart-btn-text" id="trueheart-forgot-password-btn">
                            <span locale-id="forgot_password">Forgot Password?</span>
                        </button>
                    </div>

                    <!-- Register Form -->
                    <div class="trueheart-form trueheart-form-hidden" id="trueheart-register-form">
                        <input 
                            type="email" 
                            id="trueheart-register-email" 
                            placeholder="Email"
                            locale-placeholder="email_placeholder"
                            required>
                        <input 
                            type="password" 
                            id="trueheart-register-password" 
                            placeholder="Password (min 8 chars, uppercase, lowercase, number)"
                            locale-placeholder="password_requirements"
                            required>
                        <input 
                            type="password" 
                            id="trueheart-register-password-confirm" 
                            placeholder="Confirm Password"
                            locale-placeholder="confirm_password"
                            required>
                        <div class="trueheart-tos-notice">
                            <span locale-id="tos_notice_prefix">By registering, you accept our</span> 
                            <a href="https://trueheartapps.com/user/legal/terms" target="_blank" rel="noopener" locale-id="terms">Terms</a> 
                            <span locale-id="tos_notice_and">and</span> 
                            <a href="https://trueheartapps.com/user/legal/privacy" target="_blank" rel="noopener" locale-id="privacy_policy">Privacy Policy</a>
                        </div>
                        <button class="trueheart-btn-primary" id="trueheart-register-btn">
                            <span locale-id="register">Register</span>
                        </button>
                    </div>

                    <!-- Password Reset Form -->
                    <div class="trueheart-form trueheart-form-hidden" id="trueheart-reset-form">
                        <input 
                            type="email" 
                            id="trueheart-reset-email" 
                            placeholder="Email"
                            locale-placeholder="email_placeholder"
                            required>
                        <button class="trueheart-btn-primary" id="trueheart-reset-submit-btn">
                            <span locale-id="send_reset_link">Send Reset Link</span>
                        </button>
                        <button class="trueheart-btn-text" id="trueheart-reset-cancel-btn">
                            <span locale-id="cancel">Cancel</span>
                        </button>
                    </div>

                    <div class="trueheart-message" id="trueheart-auth-message"></div>
                </div>

                <!-- Authenticated view -->
                <div class="trueheart-account-view" id="trueheart-account-view" style="display: none;">
                    <div class="trueheart-user-info">
                        <span class="material-symbols-outlined">person</span>
                        <div>
                            <div class="trueheart-email" id="trueheart-user-email"></div>
                            <div class="trueheart-service-status" id="trueheart-service-status">
                                <span class="trueheart-service-badge" id="trueheart-service-badge">Trial</span>
                            </div>
                        </div>
                    </div>

                    <div class="trueheart-sync-controls">
                        <button class="trueheart-btn-sync" id="trueheart-sync-btn">
                            <span class="material-symbols-outlined" id="trueheart-sync-icon">cloud_sync</span>
                            <span id="trueheart-sync-text" locale-id="sync_now">Sync Now</span>
                        </button>
                        <div class="trueheart-sync-info" id="trueheart-sync-info">
                            <span locale-id="last_sync">Last sync:</span>
                            <span id="trueheart-last-sync-time">Never</span>
                        </div>
                        <div class="trueheart-storage-info" id="trueheart-storage-info">
                            <span locale-id="storage_label">Storage:</span>
                            <span id="trueheart-storage-usage">Loading...</span>
                        </div>
                    </div>

                    <div class="trueheart-hobby-notice">
                        <p><strong locale-id="hobby_project_title">Free Hobby Project</strong></p>
                        <p locale-id="hobby_project_notice" data-donate-link="trueheart-donate-link">You have 1MB free sync storage. This is a volunteer-run service with limited capacity. Want to help? <a href="#" id="trueheart-donate-link">Consider donating.</a></p>
                    </div>

                    <button class="trueheart-btn-secondary" id="trueheart-logout-btn">
                        <span locale-id="logout">Log Out</span>
                    </button>

                    <button class="trueheart-btn-danger" id="trueheart-delete-account-btn">
                        <span locale-id="delete_account">Delete Account</span>
                    </button>

                    <div class="trueheart-message" id="trueheart-account-message"></div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Tab switching
        const tabs = this.container.querySelectorAll('.trueheart-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Login
        const loginBtn = this.container.querySelector('#trueheart-login-btn');
        loginBtn?.addEventListener('click', () => this.handleLogin());

        // Register
        const registerBtn = this.container.querySelector('#trueheart-register-btn');
        registerBtn?.addEventListener('click', () => this.handleRegister());

        // Forgot password
        const forgotBtn = this.container.querySelector('#trueheart-forgot-password-btn');
        forgotBtn?.addEventListener('click', () => this.showResetForm());

        // Password reset
        const resetSubmitBtn = this.container.querySelector('#trueheart-reset-submit-btn');
        resetSubmitBtn?.addEventListener('click', () => this.handlePasswordReset());

        const resetCancelBtn = this.container.querySelector('#trueheart-reset-cancel-btn');
        resetCancelBtn?.addEventListener('click', () => this.hideResetForm());

        // Logout
        const logoutBtn = this.container.querySelector('#trueheart-logout-btn');
        logoutBtn?.addEventListener('click', () => this.handleLogout());

        // Delete account
        const deleteAccountBtn = this.container.querySelector('#trueheart-delete-account-btn');
        deleteAccountBtn?.addEventListener('click', () => this.handleDeleteAccount());

        // Sync
        const syncBtn = this.container.querySelector('#trueheart-sync-btn');
        syncBtn?.addEventListener('click', () => this.handleSync());

        // Donate link: open donation panel (init if necessary)
        const donateLink = this.container.querySelector('#trueheart-donate-link');
        donateLink?.addEventListener('click', async (e) => {
            e.preventDefault();
            // Close settings modal if open so donation panel isn't hidden behind it
            try {
                if (window.ModalManager && typeof window.ModalManager.close === 'function') {
                    window.ModalManager.close('settings');
                } else {
                    const settingsModal = document.getElementById('settings-modal');
                    if (settingsModal) {
                        settingsModal.classList.remove('active');
                        settingsModal.setAttribute('aria-hidden', 'true');
                    }
                }
            } catch (err) {
                console.warn('Could not close settings modal:', err);
            }
            try {
                // Ensure donation manager is initialized (only call init if not present)
                if (typeof window.initAppDonation === 'function' && !window.donationManager) {
                    window.initAppDonation();
                }

                // Wait briefly for donationManager to be ready (max 5s)
                const start = Date.now();
                const waitForReady = () => new Promise((resolve) => {
                    const check = () => {
                        if (window.donationManager && window.donationManager.isInitialized) return resolve(true);
                        if (Date.now() - start > 5000) return resolve(false);
                        setTimeout(check, 200);
                    };
                    check();
                });

                const ready = await waitForReady();

                if (ready && window.donationManager) {
                    window.donationManager.open();
                } else if (window.donationManager) {
                    // Try to open anyway (the manager may show a loading message)
                    window.donationManager.open();
                } else if (window.showAlert) {
                    window.showAlert('Donation service is unavailable right now. Please try again later.');
                } else {
                    console.warn('Donation service unavailable and no alert UI present');
                }
            } catch (err) {
                console.error('Failed to open donation panel:', err);
                if (window.showAlert) window.showAlert('Unable to open donation panel');
            }
        });

        // Enter key handling
        ['login', 'register'].forEach(formType => {
            const form = this.container.querySelector(`#trueheart-${formType}-form`);
            form?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (formType === 'login') this.handleLogin();
                    else this.handleRegister();
                }
            });
        });
    }

    switchTab(tab) {
        const loginForm = this.container.querySelector('#trueheart-login-form');
        const registerForm = this.container.querySelector('#trueheart-register-form');
        
        if (tab === 'login') {
            loginForm.classList.add('trueheart-form-active');
            loginForm.classList.remove('trueheart-form-hidden');
            registerForm.classList.add('trueheart-form-hidden');
            registerForm.classList.remove('trueheart-form-active');
        } else {
            loginForm.classList.add('trueheart-form-hidden');
            loginForm.classList.remove('trueheart-form-active');
            registerForm.classList.add('trueheart-form-active');
            registerForm.classList.remove('trueheart-form-hidden');
        }

        this.clearMessage('auth');
    }

    showResetForm() {
        const authView = this.container.querySelector('#trueheart-auth-view');
        const loginForm = authView.querySelector('#trueheart-login-form');
        const registerForm = authView.querySelector('#trueheart-register-form');
        const resetForm = authView.querySelector('#trueheart-reset-form');
        const tabs = authView.querySelector('.trueheart-tabs');

        loginForm.classList.add('trueheart-form-hidden');
        loginForm.classList.remove('trueheart-form-active');
        registerForm.classList.add('trueheart-form-hidden');
        registerForm.classList.remove('trueheart-form-active');
        resetForm.classList.add('trueheart-form-active');
        resetForm.classList.remove('trueheart-form-hidden');
        tabs.style.display = 'none';
        this.clearMessage('auth');
    }

    hideResetForm() {
        const authView = this.container.querySelector('#trueheart-auth-view');
        const resetForm = authView.querySelector('#trueheart-reset-form');
        const tabs = authView.querySelector('.trueheart-tabs');

        resetForm.classList.add('trueheart-form-hidden');
        resetForm.classList.remove('trueheart-form-active');
        tabs.style.display = 'flex';
        this.switchTab('login');
    }

    async handleLogin() {
        const email = this.container.querySelector('#trueheart-login-email').value.trim();
        const password = this.container.querySelector('#trueheart-login-password').value;

        if (!email || !password) {
            this.showMessage('auth', this.getLocalizedMessage('error_email_password_required'), 'error');
            return;
        }

        this.setState('connecting');
        this.showMessage('auth', this.getLocalizedMessage('status_logging_in'), 'info');

        try {
            const result = await window.trueheartUser.login(email, password);
            
            if (result.success) {
                this.showMessage('auth', this.getLocalizedMessage('success_login'), 'success');
                await this.updateAuthState();
            } else {
                this.setState('disconnected');
                this.showMessage('auth', result.error || this.getLocalizedMessage('error_login_failed'), 'error');
            }
        } catch (error) {
            this.setState('disconnected');
            this.showMessage('auth', this.getLocalizedMessage('error_network') + ': ' + error.message, 'error');
        }
    }

    async handleRegister() {
        const email = this.container.querySelector('#trueheart-register-email').value.trim();
        const password = this.container.querySelector('#trueheart-register-password').value;
        const passwordConfirm = this.container.querySelector('#trueheart-register-password-confirm').value;

        if (!email || !password || !passwordConfirm) {
            this.showMessage('auth', 'Please fill all fields', 'error');
            return;
        }

        if (password !== passwordConfirm) {
            this.showMessage('auth', 'Passwords do not match', 'error');
            return;
        }

        this.setState('connecting');
        this.showMessage('auth', 'Creating account...', 'info');

        try {
            const result = await window.trueheartUser.register(email, password);
            
            if (result.success) {
                this.showMessage('auth', 'Registration successful!', 'success');
                await this.updateAuthState();
            } else {
                this.setState('disconnected');
                this.showMessage('auth', result.error || 'Registration failed', 'error');
            }
        } catch (error) {
            this.setState('disconnected');
            this.showMessage('auth', 'Network error: ' + error.message, 'error');
        }
    }

    async handlePasswordReset() {
        const email = this.container.querySelector('#trueheart-reset-email').value.trim();

        if (!email) {
            this.showMessage('auth', this.getLocalizedMessage('error_enter_email'), 'error');
            return;
        }

        this.showMessage('auth', this.getLocalizedMessage('status_sending_reset'), 'info');

        try {
            const result = await window.trueheartUser.requestPasswordReset(email);
            
            if (result.success) {
                this.showMessage('auth', this.getLocalizedMessage('success_reset_sent'), 'success');
                setTimeout(() => this.hideResetForm(), 3000);
            } else {
                this.showMessage('auth', result.message || this.getLocalizedMessage('error_request_failed'), 'error');
            }
        } catch (error) {
            this.showMessage('auth', this.getLocalizedMessage('error_network') + ': ' + error.message, 'error');
        }
    }

    async handleLogout() {
        try {
            await window.trueheartUser.logout();
            this.updateAuthState();
            this.showMessage('auth', this.getLocalizedMessage('success_logout'), 'success');
        } catch (error) {
            this.showMessage('account', this.getLocalizedMessage('error_logout') + ': ' + error.message, 'error');
        }
    }

    async handleDeleteAccount() {
        // Double confirmation
        const confirmed = confirm(this.getLocalizedMessage('confirm_delete_account'));
        
        if (!confirmed) return;

        const password = prompt(this.getLocalizedMessage('prompt_enter_password'));
        if (!password) return;

        this.showMessage('account', this.getLocalizedMessage('status_deleting_account'), 'info');

        try {
            const result = await window.trueheartUser.deleteAccount(password);
            
            if (result.success) {
                this.showMessage('account', this.getLocalizedMessage('success_account_deleted'), 'success');
                setTimeout(() => {
                    this.updateAuthState();
                    this.showMessage('auth', this.getLocalizedMessage('info_account_deleted_permanent'), 'info');
                }, 1500);
            } else {
                this.showMessage('account', result.error || this.getLocalizedMessage('error_delete_account_failed'), 'error');
            }
        } catch (error) {
            this.showMessage('account', this.getLocalizedMessage('error_general') + ': ' + error.message, 'error');
        }
    }

    async handleSync() {
        if (this.state === 'syncing') return;

        this.setState('syncing');
        this.showMessage('account', this.getLocalizedMessage('syncing'), 'info');

        try {
            // Use syncController if available to get unified behaviour (debounce, UI state)
            if (window.syncController && typeof window.syncController.immediateSync === 'function') {
                await window.syncController.immediateSync('manual');
            } else {
                await window.trueheartAPI.performTrueHeartSync();
            }
            
            const now = new Date().toLocaleString();
            localStorage.setItem('trueheart-last-sync', now);
            
            const lastSyncElem = this.container.querySelector('#trueheart-last-sync-time');
            if (lastSyncElem) lastSyncElem.textContent = now;
            
            // Update storage usage
            try {
                const usage = await window.trueheartUser.getStorageUsage();
                const storageElem = this.container.querySelector('#trueheart-storage-usage');
                if (storageElem && usage.success) {
                    const usedMb = parseFloat(usage.total_size_mb || 0);
                    const quotaMb = usage.quota_mb || 1;
                    const percent = parseFloat(usage.quota_used_percent || 0);
                    storageElem.textContent = `${usedMb} MB / ${quotaMb} MB (${percent}%)`;
                }
            } catch (err) {
                console.log('Could not update storage usage:', err);
            }
            
            this.setState('connected');
            this.showMessage('account', this.getLocalizedMessage('success_sync_complete'), 'success');
            
            // Notify app to refresh data
            window.dispatchEvent(new CustomEvent('trueheart-sync-complete'));
        } catch (error) {
            this.setState('connected');
            this.showMessage('account', this.getLocalizedMessage('error_sync') + ': ' + error.message, 'error');
        }
    }

    async updateAuthState() {
        if (window.trueheartState.isAuthenticated) {
            // Show account view
            const authView = this.container.querySelector('#trueheart-auth-view');
            const accountView = this.container.querySelector('#trueheart-account-view');
            authView.style.display = 'none';
            accountView.style.display = 'block';

            // Update user info
            const emailElem = this.container.querySelector('#trueheart-user-email');
            if (emailElem) emailElem.textContent = window.trueheartState.user.email;

            // Update last sync time
            const lastSync = localStorage.getItem('trueheart-last-sync');
            const lastSyncElem = this.container.querySelector('#trueheart-last-sync-time');
            if (lastSyncElem) lastSyncElem.textContent = lastSync || 'Never';

            // Check service status and storage usage
            try {
                const status = await window.trueheartUser.checkServiceStatus('sync');
                const statusContainer = this.container.querySelector('.trueheart-service-status');
                
                // Badge removed - storage usage display is sufficient
                if (statusContainer) {
                    statusContainer.innerHTML = '';
                }

                // Fetch storage usage
                const usage = await window.trueheartUser.getStorageUsage();
                const storageElem = this.container.querySelector('#trueheart-storage-usage');
                if (storageElem && usage.success) {
                    const usedMb = parseFloat(usage.total_size_mb || 0);
                    const quotaMb = usage.quota_mb || 1;
                    const percent = parseFloat(usage.quota_used_percent || 0);
                    storageElem.textContent = `${usedMb} MB / ${quotaMb} MB (${percent}%)`;
                } else if (storageElem) {
                    storageElem.textContent = '0 MB / 1 MB (0%)';
                }
            } catch (error) {
                console.log('Could not check service status:', error);
                // On error, default to Free
                const statusContainer = this.container.querySelector('.trueheart-service-status');
                if (statusContainer) {
                    statusContainer.innerHTML = `<span class="trueheart-service-badge free">Free</span>`;
                }
                const storageElem = this.container.querySelector('#trueheart-storage-usage');
                if (storageElem) {
                    storageElem.textContent = 'Unknown';
                }
            }

            this.setState('connected');
        } else {
            // Show auth view
            const authView = this.container.querySelector('#trueheart-auth-view');
            const accountView = this.container.querySelector('#trueheart-account-view');
            authView.style.display = 'block';
            accountView.style.display = 'none';

            // Clear any previous account messages (e.g., from account deletion)
            this.clearMessage('account');
            
            this.setState('disconnected');
        }
    }

    setState(state) {
        this.state = state;
        
        const syncBtn = this.container.querySelector('#trueheart-sync-btn');
        const syncIcon = this.container.querySelector('#trueheart-sync-icon');
        const syncText = this.container.querySelector('#trueheart-sync-text');

        if (!syncBtn || !syncIcon || !syncText) return;

        switch (state) {
            case 'syncing':
                syncBtn.disabled = true;
                syncIcon.textContent = 'sync';
                syncIcon.style.animation = 'spin 1s linear infinite';
                syncText.textContent = 'Syncing...';
                break;
            case 'connected':
                syncBtn.disabled = false;
                syncIcon.textContent = 'cloud_sync';
                syncIcon.style.animation = '';
                syncText.textContent = 'Sync Now';
                break;
            case 'connecting':
            case 'disconnected':
            default:
                break;
        }
    }

    showMessage(context, message, type = 'info') {
        const messageElem = this.container.querySelector(`#trueheart-${context}-message`);
        if (!messageElem) return;

        messageElem.textContent = message;
        messageElem.className = `trueheart-message ${type}`;
        messageElem.style.display = 'block';
    }

    clearMessage(context) {
        const messageElem = this.container.querySelector(`#trueheart-${context}-message`);
        if (!messageElem) return;
        messageElem.style.display = 'none';
    }
}

// Make available globally
window.TrueHeartUI = TrueHeartUI;
