/**
 * Smart Engine v1.0.0
 * The core logic for Floovioo Smart Templates.
 * 
 * Usage:
 * <script src="/assets/engines/smart-engine-v1.js"></script>
 * <body x-data="smartInvoice()">
 */

function smartInvoice() {
    return {
        // Core Data
        theme: window.DOC_DATA.theme || {},
        config: window.DOC_DATA.config || {},
        items: window.DOC_DATA.items || [],
        
        // Features (Matched to DOC_DATA)
        recommendations: window.DOC_DATA.features?.product_recommendations || [],
        tutorials: window.DOC_DATA.features?.product_support || [],
        nurtureMessages: window.DOC_DATA.features?.marketing_banner || [],
        reviews: window.DOC_DATA.features?.reviews || [],
        paymentConfirmation: window.DOC_DATA.features?.payment_details || null,
        
        // Computed State
        addedItems: [], // IDs of upsells added
        subtotal: 0,
        tax: 0,
        total: 0,
        
        // UI State
        expandedTutorial: null,
        nurtureMsgIdx: 0,

        init() {
             this.calculateTotals();
             
             // Nurture Carousel
             if (this.nurtureMessages.length > 0) {
                 setInterval(() => {
                    this.nurtureMsgIdx = (this.nurtureMsgIdx + 1) % this.nurtureMessages.length;
                 }, 5000);
             }

             // Auto-expand first tutorial for better visibility
             if (this.tutorials.length > 0 && !this.expandedTutorial) {
                 this.expandedTutorial = this.tutorials[0].id;
             }
        },

        calculateTotals() {
            let baseSubtotal = 0;
            const backend = window.DOC_DATA.totals || {};

            if (backend.updated) {
                 baseSubtotal = backend.subtotal;
                 this.tax = backend.tax;
            } else {
                // Client-side fallback
                baseSubtotal = this.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
                this.tax = (baseSubtotal + this.addedTotal) * 0.08;
            }

            this.subtotal = baseSubtotal;
            
            if (!backend.updated) {
                 this.tax = (this.subtotal + this.addedTotal) * 0.08;
            }
            
            this.total = this.subtotal + this.tax + this.addedTotal;
        },

        get addedTotal() {
            return this.addedItems.reduce((acc, id) => {
                const item = this.getRec(id);
                return acc + (item ? item.price : 0);
            }, 0);
        },
        
        toggleAdd(id) {
            if (this.addedItems.includes(id)) {
                this.addedItems = this.addedItems.filter(i => i !== id);
            } else {
                this.addedItems.push(id);
            }
            this.calculateTotals();
        },
        
        getRec(id) { 
            return this.recommendations.find(r => r.id == id); 
        },
        
        get nurtureMsg() {
            return this.nurtureMessages[this.nurtureMsgIdx] || { icon: '✨', headline: 'Welcome', body: 'Thanks for your business' };
        },
        
        cycleNurture() {
            this.nurtureMsgIdx = (this.nurtureMsgIdx + 1) % this.nurtureMessages.length;
        }
    }
}
