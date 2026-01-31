/**
 * Floovioo Service Core Library
 * Standardizes UI Access Control and Event Management across all tools.
 */
class ServiceCore {
    constructor(config = {}) {
        this.config = {
            blockerId: 'accessBlocker',
            formId: 'serviceWorkspace', // Standardize this ID across views
            titleId: 'blockerTitle',
            messageId: 'blockerMessage',
            actionBtnId: 'blockerActionBtn',
            upgradeBtnId: 'blockerUpgradeBtn',
            iconNoAppId: 'iconNoApp',
            iconDisabledId: 'iconDisabled',
            iconQuotaId: 'iconQuota',
            ...config
        };
        
        this.init();
    }

    init() {
        console.log('[ServiceCore] Initializing...');
        this.bindEvents();
        
        // Auto-load state from global context if available
        if (window.SERVICE_CONTEXT) {
            this.applyContext(window.SERVICE_CONTEXT);
        }
    }

    bindEvents() {
        // Global Event Bus for App Toggles
        window.addEventListener('service-access-changed', (e) => {
            console.log('[ServiceCore] Access Changed Event:', e.detail);
            const { appId, enabled } = e.detail;
            const currentAppId = this.getCurrentAppId();
            
            // Only react if the toggled app is the one currently active in the tool
            if (currentAppId && currentAppId === appId) {
                 this.updateAccessState({
                     appId,
                     isEnabled: enabled,
                     // We preserve quota state as it doesn't change by toggling app usually, 
                     // unless we re-fetch, but for now assume quota is user-level not app-level
                     isQuotaReached: this.lastState?.isQuotaReached || false 
                 });
            }
        });

        // Smart Polling Triggers
        // 1. Job Completed (Immediate Sync)
        window.addEventListener('job-completed', () => {
             console.log('[ServiceCore] Job Completed Event detected. Syncing quota...');
             this.pollUsage();
        });

        // 2. Heartbeat (Every 60s)
        this.startPolling();
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.pollUsage(), 60000);
    }

    async pollUsage() {
        try {
            const response = await fetch('/api/usage');
            if (!response.ok) return; // Silent fail

            const data = await response.json();
            if (!data.success || !data.usage) return;

            // Determine relevant quota based on current view/context
            // We need to know which quota applies to THIS page (AI vs PDF)
            // Ideally, the backend sent us 'inferredFeatureKey' in initial context, needs usage mapping.
            // For now, we check the global 'total' or specific if we can infer it.
            
            // Heuristic: Check URL to guess service type
            const isAi = window.location.pathname.includes('ai') || window.location.pathname.includes('generate');
            const isPdf = window.location.pathname.includes('pdf') || window.location.pathname.includes('convert');
            
            let relevantUsage;
            if (isAi) relevantUsage = data.usage.ai;
            else if (isPdf) relevantUsage = data.usage.pdf;
            else relevantUsage = data.usage.total; // Fallback

            const isQuotaReached = relevantUsage.remaining === 0;

            console.log(`[ServiceCore] Polled Usage. Reached: ${isQuotaReached} (Remaining: ${relevantUsage.remaining})`);
            
            // Update UI
            this.updateQuotaUI(relevantUsage);

            if (this.lastState) {
                // Determine if state changed
                if (this.lastState.isQuotaReached !== isQuotaReached) {
                    console.log('[ServiceCore] Quota Status Changed! Updating UI.');
                    this.updateAccessState({
                        ...this.lastState,
                        isQuotaReached
                    });
                }
            }
        } catch (err) {
            console.warn('[ServiceCore] Poll failed:', err);
        }
    }


    getCurrentAppId() {
        // Try standard inputs
        const input = document.getElementById('generatorAppId') || document.querySelector('[name="appId"]');
        return input ? input.value : null;
    }

    applyContext(context) {
        console.log('[ServiceCore] Applying Context:', context);
        const { lockState, app } = context;
        
        // Derived State
        const isQuotaReached = lockState.reason === 'quota_reached';
        // Relaxed Check: Only strictly disabled if reason explicitly says so. 'none' or missing reason = enabled.
        const isEnabled = !lockState.reason.includes('disabled') && !lockState.reason.includes('no_app'); 
        
        // [FIX] Fallback to DOM input if context.app is missing (e.g. first load with default selection)
        let appId = app ? app.id : null;
        if (!appId) {
            appId = this.getCurrentAppId();
            if (appId) console.log('[ServiceCore] Context missing app, but found in DOM:', appId);
        }

        // If backend explicitly says LOCKED, we respect that above all
        if (lockState.isLocked) {
             this.renderBlocker(lockState.reason, lockState.message);
        } else {
             // Even if not "locked" server-side, check client-side consistency
             this.updateAccessState({
                 appId,
                 isEnabled: isEnabled, // If server didn't flag it, assume enabled
                 isQuotaReached
             });
        }
    }
    
    /**
     * Core Logic to show/hide blocker based on state
     */
    updateAccessState(state) {
        this.lastState = state; // cache state
        const { appId, isEnabled, isQuotaReached } = state;
        
        // Reset UI first
        this.hideIcons();

        // [FIX] Double check DOM for App ID if state is missing it
        const effectiveAppId = appId || this.getCurrentAppId();

        if (isQuotaReached) {
            this.renderBlocker('quota_reached', 'You have exhausted your quota for this billing cycle.');
            return;
        }

        if (!effectiveAppId) {
            this.renderBlocker('no_app_context', 'Connect an App to use this tool.');
            return;
        }

        if (!isEnabled) {
             this.renderBlocker('service_disabled', 'This service is disabled for the selected App.');
             return;
        }

        // If we get here, we are good
        this.hideBlocker();
    }

    renderBlocker(reason, customMessage) {
        const els = this.getElements();
        if (!els.blocker) return;

        // Default Content
        let titleText = 'Access Denied';
        let msgText = customMessage || 'Access to this service is restricted.';
        let showAction = false;
        let showUpgrade = false;
        let activeIcon = null;

        switch (reason) {
            case 'quota_reached':
                titleText = 'Limit Reached';
                activeIcon = els.iconQuota;
                showUpgrade = true;
                break;
            case 'no_app_context':
                titleText = 'No App Connected';
                activeIcon = els.iconNoApp;
                showAction = true;
                if(els.actionBtn) els.actionBtn.textContent = 'Connect App';
                break;
            case 'service_disabled':
                titleText = 'Service Disabled';
                activeIcon = els.iconDisabled;
                showAction = true;
                if(els.actionBtn) els.actionBtn.textContent = 'Manage Apps';
                break;
        }

        // DOM Updates
        if(els.title) els.title.textContent = titleText;
        if(els.message) els.message.textContent = msgText;
        if(activeIcon) activeIcon.classList.remove('hidden');
        
        if(els.actionBtn) {
            if(showAction) {
                els.actionBtn.classList.remove('hidden');
                els.actionBtn.onclick = () => window.location.href = '/dashboard?tab=apps'; // Simple redirect for now
            } else {
                els.actionBtn.classList.add('hidden');
            }
        }

        if(els.upgradeBtn) {
            showUpgrade ? els.upgradeBtn.classList.remove('hidden') : els.upgradeBtn.classList.add('hidden');
        }

        // SHOW OVERLAY
        els.blocker.classList.remove('hidden');
        if(els.form) els.form.classList.add('opacity-20', 'pointer-events-none');
    }

    hideBlocker() {
        const els = this.getElements();
        if(els.blocker) els.blocker.classList.add('hidden');
        if(els.form) els.form.classList.remove('opacity-20', 'pointer-events-none');
    }

    hideIcons() {
        const els = this.getElements();
        if(els.iconNoApp) els.iconNoApp.classList.add('hidden');
        if(els.iconDisabled) els.iconDisabled.classList.add('hidden');
        if(els.iconQuota) els.iconQuota.classList.add('hidden');
    }

    /**
     * Standardized Toast Notification
     * @param {string} type - 'success', 'error', 'info'
     * @param {string} message 
     */
    showToast(type, message) {
        // Create container if not exists
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed bottom-4 right-4 z-[200] flex flex-col gap-2';
            document.body.appendChild(container);
        }

        // Create notification element
        const el = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : 'bg-slate-800');
        const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');
        
        el.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] animate-in slide-in-from-right duration-300`;
        el.innerHTML = `
            <i data-lucide="${icon}" class="w-5 h-5"></i>
            <span class="text-sm font-bold">${message}</span>
        `;

        container.appendChild(el);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Auto remove
        setTimeout(() => {
            el.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => el.remove(), 300);
        }, 5000);
    }
    
    // Update Quota Display in UI
    updateQuotaUI(usage) {
        const quotaEl = document.getElementById('quotaDisplay');
        if (!quotaEl) return;
        
        if (usage) {
            quotaEl.textContent = `${usage.remaining} Credits Left`;
            quotaEl.classList.remove('hidden');
            
            // Color coding
            if (usage.remaining === 0) {
                 quotaEl.className = 'px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[0.625rem] font-black uppercase tracking-widest';
            } else if (usage.remaining < 5) {
                 quotaEl.className = 'px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[0.625rem] font-black uppercase tracking-widest';
            } else {
                 quotaEl.className = 'px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[0.625rem] font-black uppercase tracking-widest';
            }
        }
    }

    getElements() {
        return {
            blocker: document.getElementById(this.config.blockerId),
            form: document.getElementById(this.config.formId),
            title: document.getElementById(this.config.titleId),
            message: document.getElementById(this.config.messageId),
            actionBtn: document.getElementById(this.config.actionBtnId),
            upgradeBtn: document.getElementById(this.config.upgradeBtnId),
            iconNoApp: document.getElementById(this.config.iconNoAppId),
            iconDisabled: document.getElementById(this.config.iconDisabledId),
            iconQuota: document.getElementById(this.config.iconQuotaId),
        };
    }
}

// Expose to window
window.ServiceCore = ServiceCore;
