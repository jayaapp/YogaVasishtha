/**
 * TrueHeartDonate - Definition-Driven Donation Manager
 * 
 * A standalone, embeddable donation system driven entirely by JSON definitions.
 * 
 * Usage:
 *   const donationManager = new DonationManager({
 *     appId: 'yogavasishtha',
 *     apiBase: 'https://trueheartapps.com/donate',
 *     language: 'en',
 *     onSuccess: (data) => console.log('Donation successful', data),
 *     onError: (err) => console.error('Donation failed', err)
 *   });
 *   
 *   donationManager.open();
 */

class DonationManager {
  constructor(options = {}) {
    this.appId = options.appId || 'yogavasishtha';
    this.apiBase = options.apiBase || 'https://trueheartapps.com/donate';
    this.language = options.language || 'en';
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    
    // Progress callbacks for campaigns (app-specific)
    this.progressCallbacks = options.progressCallbacks || {};
    
    // State
    this.definition = null;
    this.isInitialized = false;
    this.currentStage = 1;
    this.paypalClientId = null;
    this.stripePublicKey = null;
    this.idempotencyKey = null;
    
    // DOM elements
    this.panel = null;
    this.overlay = null;
    
    this.init();
  }
  
  async init() {
    try {
      // Fetch app definition
      const response = await fetch(`${this.apiBase}/init?app_id=${this.appId}`);
      if (!response.ok) throw new Error(`Failed to load donation config: ${response.status}`);
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load donation config');
      
      this.definition = result.data;
      this.paypalClientId = result.data.paypal_client_id;
      this.stripePublicKey = result.data.stripe_public_key;
      
      // Create and inject panel
      this.createPanel();
      this.bindEvents();
      
      // Load campaigns with current amounts
      await this.loadCampaigns();
      
      // Check for payment return (Stripe)
      this.checkPaymentReturn();
      
      this.isInitialized = true;
    } catch (err) {
      console.error('DonationManager init failed:', err);
      this.onError(err);
    }
  }
  
  getString(key) {
    const strings = this.definition?.ui_strings?.[this.language] 
      || this.definition?.ui_strings?.en 
      || {};
    return strings[key] || key;
  }
  
  createPanel() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'thd-overlay';
    
    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'thd-panel';
    
    this.panel.innerHTML = this.renderPanelHTML();
    
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);
    
    // Render categories
    this.renderCategories();
  }
  
  renderPanelHTML() {
    const strings = this.definition?.ui_strings?.[this.language] || this.definition?.ui_strings?.en || {};
    const appName = this.definition?.app?.name || 'App';
    
    return `
      <div class="thd-header">
        <h2 class="thd-title">${strings.support_app || `Support ${appName} Development`}</h2>
        <button class="thd-close" data-thd-close>&times;</button>
      </div>
      
      <div class="thd-content">
        <div class="thd-stage" data-thd-stage1>
          <div data-thd-categories></div>
          
          <div class="thd-error" data-thd-error></div>
          
          <div class="thd-footer">
            <p>${strings.donation_footer_message || 'All donations are gratefully received!'}</p>
          </div>
          
          <div class="thd-actions">
            <button class="thd-btn thd-btn-primary" data-thd-summary-btn>
              ${strings.go_to_donation_summary || 'Go to donation summary'}
            </button>
          </div>
        </div>
        
        <div class="thd-stage hidden" data-thd-stage2>
          <div class="thd-summary-header">
            <h3>${strings.donation_summary || 'Donation Summary'}</h3>
          </div>
          
          <div data-thd-summary-content></div>
          
          <div class="thd-total">
            <h4>
              <span>${strings.total_amount || 'Total Amount'}:</span>
              <span data-thd-total-amount>$0.00</span>
            </h4>
          </div>
          
          <div class="thd-error" data-thd-error2></div>
          
          <div class="thd-footer">
            <p>${strings.donation_thankyou_message || 'Thank you from the heart!'}</p>
          </div>
          
          <div class="thd-paypal-container" data-thd-paypal></div>
          <div class="thd-stripe-container" data-thd-stripe></div>
          
          <div class="thd-actions">
            <button class="thd-btn thd-btn-secondary" data-thd-back-btn>
              ${strings.back_to_form || 'Back to form'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  renderCategories() {
    const container = this.panel.querySelector('[data-thd-categories]');
    if (!container) return;
    
    const categories = this.definition?.categories || [];
    const strings = this.definition?.ui_strings?.[this.language] || this.definition?.ui_strings?.en || {};
    
    categories.forEach(category => {
      const section = this.renderCategory(category, strings);
      if (section) container.appendChild(section);
    });
  }
  
  renderCategory(category, strings) {
    const title = category.title?.[this.language] || category.title?.en || category.id;
    const description = category.description?.[this.language] || category.description?.en || '';
    
    const section = document.createElement('div');
    section.className = 'thd-section';
    section.dataset.categoryId = category.id;
    section.dataset.categoryType = category.type;
    
    if (category.type === 'dropdown_select') {
      section.innerHTML = this.renderDropdownCategory(category, title, description, strings);
    } else if (category.type === 'github_issues') {
      section.innerHTML = this.renderGitHubCategory(category, title, description, strings);
    } else if (category.type === 'campaign_progress') {
      section.innerHTML = this.renderCampaignCategory(category, title, description, strings);
    } else if (category.type === 'free_text') {
      section.innerHTML = this.renderFreeTextCategory(category, title, strings);
    }
    
    return section;
  }
  
  renderDropdownCategory(category, title, description, strings) {
    const placeholder = category.select_placeholder?.[this.language] || category.select_placeholder?.en || 'Select...';
    const statsText = category.stats_toggle_text?.[this.language] || category.stats_toggle_text?.en || 'See stats';
    const amountTier = category.amount_tier || 'translation';
    const amounts = this.definition?.amount_tiers?.[amountTier] || [];
    
    let optionsHtml = `<option value="">${placeholder}</option>`;
    (category.options || []).forEach(opt => {
      optionsHtml += `<option value="${opt.code}">${opt.name}</option>`;
    });
    
    let amountsHtml = amounts.map(a => `<option value="${a}">$${a}</option>`).join('');
    
    return `
      <h4 class="thd-section-title">
        <span class="material-symbols-outlined">${category.icon || 'translate'}</span>
        <span>${title}</span>
      </h4>
      <div class="thd-row">
        <span>${description}</span>
        <select class="thd-select" data-select>${optionsHtml}</select>
      </div>
      <div class="thd-row thd-amount-row">
        <span>${strings.at || 'at'}</span>
        <select class="thd-select" data-amount>${amountsHtml}</select>
        <span>${strings.currency || 'USD'}</span>
      </div>
      <a class="thd-stats-toggle" data-stats-toggle>
        <span>${statsText}</span>
        <span class="thd-toggle-icon">▼</span>
      </a>
      <div class="thd-stats-content" data-stats-content></div>
    `;
  }
  
  renderGitHubCategory(category, title, description, strings) {
    const placeholder = category.select_placeholder?.[this.language] || category.select_placeholder?.en || 'Select issue...';
    const statsText = category.stats_toggle_text?.[this.language] || category.stats_toggle_text?.en || 'See stats';
    const amountTier = category.amount_tier || 'github';
    const amounts = this.definition?.amount_tiers?.[amountTier] || [];
    
    let amountsHtml = amounts.map(a => `<option value="${a}">$${a}</option>`).join('');
    
    return `
      <h4 class="thd-section-title">
        <span class="material-symbols-outlined">${category.icon || 'bug_report'}</span>
        <span>${title}</span>
      </h4>
      <div class="thd-row">
        <span>${description}</span>
        <select class="thd-select thd-github-select" data-select data-github-repo="${category.github_repo || ''}">
          <option value="">${placeholder}</option>
        </select>
      </div>
      <div class="thd-row thd-amount-row">
        <span>${strings.at || 'at'}</span>
        <select class="thd-select" data-amount>${amountsHtml}</select>
        <span>${strings.currency || 'USD'}</span>
        <span data-github-link></span>
      </div>
      <a class="thd-stats-toggle" data-stats-toggle>
        <span>${statsText}</span>
        <span class="thd-toggle-icon">▼</span>
      </a>
      <div class="thd-stats-content" data-stats-content></div>
    `;
  }
  
  renderCampaignCategory(category, title, description, strings) {
    // Calculate progress if callback exists
    let progressValue = 0;
    if (category.progress_callback && this.progressCallbacks[category.progress_callback]) {
      try {
        progressValue = this.progressCallbacks[category.progress_callback]();
      } catch (e) {
        console.warn('Progress callback failed:', e);
      }
    }
    
    description = description.replace('{progress}', progressValue.toFixed(1));
    
    const amountTier = category.amount_tier || 'analysis';
    const amounts = this.definition?.amount_tiers?.[amountTier] || [];
    let amountsHtml = amounts.map(a => `<option value="${a}">$${a}</option>`).join('');
    
    return `
      <h4 class="thd-section-title">
        <span class="material-symbols-outlined">${category.icon || 'psychology'}</span>
        <span>${title}</span>
      </h4>
      <p class="thd-description">${description}</p>
      <div class="thd-progress-container">
        <div class="thd-progress-bar">
          <div class="thd-progress-fill" data-progress-fill style="width: 0%"></div>
          <div class="thd-progress-text" data-progress-text>$0.00 / $${(category.target_amount_usd || 0).toFixed(2)}</div>
        </div>
      </div>
      <div class="thd-completed hidden" data-completed>
        ${category.completed_message?.[this.language] || category.completed_message?.en || 'Campaign complete!'}
      </div>
      <div class="thd-row thd-amount-row" data-amount-row>
        <span>${strings.donate || 'Donate'}:</span>
        <select class="thd-select" data-amount>${amountsHtml}</select>
        <span>${strings.currency || 'USD'}</span>
      </div>
    `;
  }
  
  renderFreeTextCategory(category, title, strings) {
    const placeholder = category.message_placeholder?.[this.language] || category.message_placeholder?.en || 'Your message...';
    
    return `
      <h4 class="thd-section-title">
        <span class="material-symbols-outlined">${category.icon || 'volunteer_activism'}</span>
        <span>${title}</span>
      </h4>
      <textarea class="thd-textarea" data-message placeholder="${placeholder}" rows="3"></textarea>
      <div class="thd-row thd-amount-row">
        <label>${strings.amount || 'Amount'}:</label>
        <input type="number" class="thd-input thd-input-amount" data-amount min="0" step="0.01" value="0">
        <span>${strings.currency || 'USD'}</span>
      </div>
    `;
  }
  
  async loadCampaigns() {
    try {
      const response = await fetch(`${this.apiBase}/campaigns?app_id=${this.appId}`);
      if (!response.ok) return;
      
      const result = await response.json();
      if (!result.success || !result.campaigns) return;
      
      // Update campaign progress bars
      result.campaigns.forEach(campaign => {
        const section = this.panel.querySelector(`[data-category-id="${campaign.id}"]`);
        if (!section) return;
        
        const current = campaign.current_amount_usd || 0;
        const target = campaign.target_amount_usd || 1;
        const percentage = Math.min((current / target) * 100, 100);
        const isComplete = current >= target && !campaign.allow_exceed_target;
        
        const fill = section.querySelector('[data-progress-fill]');
        const text = section.querySelector('[data-progress-text]');
        const completed = section.querySelector('[data-completed]');
        const amountRow = section.querySelector('[data-amount-row]');
        
        if (fill) fill.style.width = `${percentage}%`;
        if (text) text.textContent = `${isComplete ? '✓ ' : ''}$${current.toFixed(2)} / $${target.toFixed(2)}`;
        
        if (isComplete) {
          if (completed) completed.classList.remove('hidden');
          if (amountRow) amountRow.classList.add('hidden');
        }
      });
    } catch (err) {
      console.warn('Failed to load campaigns:', err);
    }
  }
  
  bindEvents() {
    // Close button
    this.panel.querySelector('[data-thd-close]')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());
    
    // ESC key to close
    this.escHandler = (e) => {
      if (e.key === 'Escape' && this.panel.classList.contains('active')) {
        this.close();
      }
    };
    document.addEventListener('keydown', this.escHandler);
    
    // Summary button
    this.panel.querySelector('[data-thd-summary-btn]')?.addEventListener('click', () => this.goToSummary());
    
    // Back button
    this.panel.querySelector('[data-thd-back-btn]')?.addEventListener('click', () => this.goToForm());
    
    // Stats toggles
    this.panel.querySelectorAll('[data-stats-toggle]').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const section = toggle.closest('.thd-section');
        const content = section?.querySelector('[data-stats-content]');
        const icon = toggle.querySelector('.thd-toggle-icon');
        
        if (content) {
          content.classList.toggle('expanded');
          if (icon) icon.textContent = content.classList.contains('expanded') ? '▲' : '▼';
          
          // Load stats if expanding and empty
          if (content.classList.contains('expanded') && !content.innerHTML) {
            this.loadStats(section.dataset.categoryId, content);
          }
        }
      });
    });
    
    // Listen for locale changes
    this.localeChangeHandler = (e) => {
      if (e.detail && e.detail.langCode) {
        const langMap = {
          'en': 'en',
          'pl': 'pl'
        };
        const newLang = langMap[e.detail.langCode] || 'en';
        if (newLang !== this.language) {
          this.language = newLang;
          this.updateUILanguage();
        }
      }
    };
    document.addEventListener('localeChanged', this.localeChangeHandler);
  }
  
  updateUILanguage() {
    // Update panel title
    const titleEl = this.panel.querySelector('.thd-title');
    if (titleEl) {
      const strings = this.definition?.ui_strings?.[this.language] || this.definition?.ui_strings?.en || {};
      const appName = this.definition?.app?.name || 'App';
      titleEl.textContent = strings.support_app || `Support ${appName} Development`;
    }
    
    // Re-render categories to update all localized strings
    const container = this.panel.querySelector('[data-thd-categories]');
    if (container) {
      container.innerHTML = '';
      this.renderCategories();
      
      // Re-bind stats toggles for new elements
      this.panel.querySelectorAll('[data-stats-toggle]').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          const section = toggle.closest('.thd-section');
          const content = section?.querySelector('[data-stats-content]');
          const icon = toggle.querySelector('.thd-toggle-icon');
          
          if (content) {
            content.classList.toggle('expanded');
            if (icon) icon.textContent = content.classList.contains('expanded') ? '▲' : '▼';
            
            if (content.classList.contains('expanded') && !content.innerHTML) {
              this.loadStats(section.dataset.categoryId, content);
            }
          }
        });
      });
    }
    
    // Update summary view if visible
    if (this.currentStage === 2) {
      const summary = this.collectDonations();
      this.renderSummary(summary);
    }
    
    // Update other UI strings
    const strings = this.definition?.ui_strings?.[this.language] || this.definition?.ui_strings?.en || {};
    
    const summaryBtn = this.panel.querySelector('[data-thd-summary-btn]');
    if (summaryBtn) summaryBtn.textContent = strings.go_to_donation_summary || 'Go to donation summary';
    
    const backBtn = this.panel.querySelector('[data-thd-back-btn]');
    if (backBtn) backBtn.textContent = strings.back_to_form || 'Back to form';
    
    const summaryHeader = this.panel.querySelector('.thd-summary-header h3');
    if (summaryHeader) summaryHeader.textContent = strings.donation_summary || 'Donation Summary';
    
    const totalLabel = this.panel.querySelector('.thd-total h4 span:first-child');
    if (totalLabel) totalLabel.textContent = strings.total_amount || 'Total Amount';
    
    const footers = this.panel.querySelectorAll('.thd-footer p');
    footers.forEach((footer, idx) => {
      if (idx === 0) footer.textContent = strings.donation_footer_message || 'All donations are gratefully received!';
      if (idx === 1) footer.textContent = strings.donation_thankyou_message || 'Thank you from the heart!';
    });
  }
  
  async loadStats(category, container) {
    try {
      const response = await fetch(`${this.apiBase}/stats/${category}?app_id=${this.appId}`);
      const result = await response.json();
      
      if (!result.success || !result.stats?.length) {
        container.innerHTML = `<div class="thd-stats-item">${this.getString('no_sponsorships_yet')}</div>`;
        return;
      }
      
      container.innerHTML = result.stats.map(s => `
        <div class="thd-stats-item">
          <span>${s.target_identifier}</span>
          <span>$${Number(s.total).toFixed(2)}</span>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div class="thd-stats-item">Failed to load stats</div>';
    }
  }
  
  open() {
    if (!this.isInitialized) {
      console.warn('DonationManager not yet initialized');
      return;
    }
    this.overlay.classList.add('active');
    this.panel.classList.add('active');
  }
  
  close() {
    this.overlay.classList.remove('active');
    this.panel.classList.remove('active');
    this.goToForm(); // Reset to form
  }
  
  goToSummary() {
    const summary = this.collectDonations();
    if (summary.total <= 0) {
      this.showError(this.getString('please_enter_amount'));
      return;
    }
    
    // Render summary
    this.renderSummary(summary);
    
    // Switch stages
    this.panel.querySelector('[data-thd-stage1]')?.classList.add('hidden');
    this.panel.querySelector('[data-thd-stage2]')?.classList.remove('hidden');
    this.currentStage = 2;
    
    // Initialize payment buttons
    this.initializePaymentButtons(summary);
  }
  
  goToForm() {
    this.panel.querySelector('[data-thd-stage2]')?.classList.add('hidden');
    this.panel.querySelector('[data-thd-stage1]')?.classList.remove('hidden');
    this.currentStage = 1;
    this.clearErrors();
  }
  
  collectDonations() {
    const items = [];
    let total = 0;
    
    this.panel.querySelectorAll('.thd-section').forEach(section => {
      const categoryId = section.dataset.categoryId;
      const categoryType = section.dataset.categoryType;
      
      let amount = 0;
      let target = null;
      let message = null;
      
      if (categoryType === 'free_text') {
        const input = section.querySelector('[data-amount]');
        amount = parseFloat(input?.value || 0);
        const textarea = section.querySelector('[data-message]');
        message = textarea?.value?.trim() || null;
      } else {
        const amountSelect = section.querySelector('[data-amount]');
        amount = parseFloat(amountSelect?.value || 0);
        const targetSelect = section.querySelector('[data-select]');
        target = targetSelect?.value || null;
      }
      
      if (amount > 0) {
        const category = this.definition?.categories?.find(c => c.id === categoryId);
        const title = category?.title?.[this.language] || category?.title?.en || categoryId;
        
        items.push({
          category_id: categoryId,
          sponsor_type: categoryId,
          target_identifier: target,
          amount,
          message,
          title
        });
        total += amount;
      }
    });
    
    return { items, total };
  }
  
  renderSummary(summary) {
    const container = this.panel.querySelector('[data-thd-summary-content]');
    if (!container) return;
    
    container.innerHTML = summary.items.map(item => `
      <div class="thd-summary-item">
        <div>
          <div class="thd-summary-title">${item.title}</div>
          ${item.target_identifier ? `<div class="thd-summary-details">${item.target_identifier}</div>` : ''}
          ${item.message ? `<div class="thd-summary-details">"${item.message}"</div>` : ''}
        </div>
        <div class="thd-summary-amount">$${item.amount.toFixed(2)}</div>
      </div>
    `).join('');
    
    const totalEl = this.panel.querySelector('[data-thd-total-amount]');
    if (totalEl) totalEl.textContent = `$${summary.total.toFixed(2)}`;
  }
  
  async initializePaymentButtons(summary) {
    const defaultProvider = this.definition?.payment?.default_provider || 'paypal';
    
    if (defaultProvider === 'stripe' && this.stripePublicKey) {
      await this.initStripeButton(summary);
    } else if (this.paypalClientId) {
      await this.initPayPalButtons(summary);
    }
  }
  
  async initPayPalButtons(summary) {
    const container = this.panel.querySelector('[data-thd-paypal]');
    if (!container) return;
    
    // Load PayPal SDK if not already loaded
    if (!window.paypal) {
      await this.loadScript(`https://www.paypal.com/sdk/js?client-id=${this.paypalClientId}&currency=USD`);
    }
    
    container.innerHTML = '';
    
    window.paypal.Buttons({
      createOrder: async () => {
        this.idempotencyKey = this.generateIdempotencyKey();
        
        // Create combined payment
        const response = await fetch(`${this.apiBase}/create-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: this.appId,
            sponsor_type: 'combined',
            target_identifier: JSON.stringify(summary.items),
            amount: summary.total,
            idempotency_key: this.idempotencyKey,
            provider: 'paypal'
          })
        });
        
        const result = await response.json();
        if (result.status !== 'ok') throw new Error(result.message);
        
        return result.order_id;
      },
      
      onApprove: async (data) => {
        const response = await fetch(`${this.apiBase}/execute-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: data.orderID })
        });
        
        const result = await response.json();
        if (result.success) {
          this.showToast(this.getString('payment_success'), 'success');
          this.close();
          this.onSuccess(result);
        } else {
          throw new Error(result.message);
        }
      },
      
      onError: (err) => {
        console.error('PayPal error:', err);
        this.showError(err.message || 'Payment failed');
        this.onError(err);
      },
      
      onCancel: () => {
        this.showToast(this.getString('payment_cancelled'), 'info');
      }
    }).render(container);
  }
  
  async initStripeButton(summary) {
    const container = this.panel.querySelector('[data-thd-stripe]');
    if (!container) return;
    
    const button = document.createElement('button');
    button.className = 'thd-btn-stripe';
    button.textContent = `Pay $${summary.total.toFixed(2)} with Stripe`;
    
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Processing...';
      
      try {
        this.idempotencyKey = this.generateIdempotencyKey();
        
        const response = await fetch(`${this.apiBase}/create-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: this.appId,
            sponsor_type: 'combined',
            target_identifier: JSON.stringify(summary.items),
            amount: summary.total,
            idempotency_key: this.idempotencyKey,
            provider: 'stripe'
          })
        });
        
        const result = await response.json();
        if (result.status !== 'ok') throw new Error(result.message);
        
        // Redirect to Stripe Checkout
        if (result.checkout_url) {
          window.location.href = result.checkout_url;
        }
      } catch (err) {
        button.disabled = false;
        button.textContent = `Pay $${summary.total.toFixed(2)} with Stripe`;
        this.showError(err.message);
        this.onError(err);
      }
    });
    
    container.innerHTML = '';
    container.appendChild(button);
  }
  
  async checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const donationStatus = params.get('donation');
    
    if (donationStatus === 'success' && sessionId) {
      try {
        const response = await fetch(`${this.apiBase}/execute-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
        
        const result = await response.json();
        if (result.success) {
          this.showToast(this.getString('payment_success'), 'success');
          this.onSuccess(result);
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        this.showToast(this.getString('payment_verification_failed'), 'error');
        this.onError(err);
      }
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (donationStatus === 'cancelled') {
      this.showToast(this.getString('payment_cancelled'), 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  
  generateIdempotencyKey() {
    return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }
  
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  showError(message) {
    const errorEl = this.panel.querySelector(
      this.currentStage === 1 ? '[data-thd-error]' : '[data-thd-error2]'
    );
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }
  
  clearErrors() {
    this.panel.querySelectorAll('.thd-error').forEach(el => {
      el.textContent = '';
      el.style.display = 'none';
    });
  }
  
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `thd-toast thd-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'thdSlideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
  
  setLanguage(lang) {
    this.language = lang;
    // Re-render would require more complex state management
    // For now, just update strings that can be easily updated
  }
  
  destroy() {
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
    }
    if (this.localeChangeHandler) {
      document.removeEventListener('localeChanged', this.localeChangeHandler);
    }
    this.overlay?.remove();
    this.panel?.remove();
  }
}

// Expose globally for script tag usage
if (typeof window !== 'undefined') {
  window.DonationManager = DonationManager;
}

/**
 * Yoga Vasishtha - Donation System Initialization
 */
let donationManager = null;

function initAppDonation() {
  // Initialize DonationManager with blog config
  donationManager = new DonationManager({
    appId: 'yogavasishtha',
    apiBase: 'https://trueheartapps.com/donate',
    language: 'en',
    
    onSuccess: (data) => {
      console.log('Donation successful:', data);
      // Could show additional success UI here if needed
    },
    
    onError: (err) => {
      console.error('Donation error:', err);
    }
  });
  
  // Bind to donate link
  const donateLink = document.getElementById('donate-btn');
  if (donateLink) {
    donateLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (donationManager) {
        donationManager.open();
      }
    });
  }

  // Bind to donate link mobile
  const donateLinkMobile = document.getElementById('donate-btn-mobile');
  if (donateLinkMobile) {
    donateLinkMobile.addEventListener('click', (e) => {
      e.preventDefault();
      if (donationManager) {
        donationManager.open();
      }
    });
  }
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppDonation);
  } else {
    initAppDonation();
  }
}

// Expose globally
if (typeof window !== 'undefined') {
  window.initAppDonation = initAppDonation;
}