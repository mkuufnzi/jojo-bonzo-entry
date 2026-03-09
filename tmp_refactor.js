const fs = require('fs');

const TEMPLATE = `<%- layout('layouts/dashboard-layout') %>

<!-- Content Area -->
<div class="max-w-6xl mx-auto space-y-8" 
     x-data="recommendationsDashboard()" 
     x-init="initDashboard()">

    <!-- Hero Section -->
    <div class="relative overflow-hidden rounded-3xl bg-indigo-600 p-8 md:p-12 text-white shadow-2xl shadow-indigo-500/20">
        <div class="relative z-10 max-w-2xl">
            <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-bold uppercase tracking-wider mb-6">
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-200"></i>
                <span>Smart Revenue Engine</span>
            </div>
            <h1 class="text-4xl md:text-5xl font-black tracking-tight mb-4">Increase Revenue with Smart Upsells</h1>
            <p class="text-indigo-100 text-lg leading-relaxed mb-8">
                Automatically recommend relevant products on every invoice, estimate, and document. Our engine analyzes purchase patterns to drive higher conversion rates.
            </p>
            <div class="flex flex-wrap gap-4">
                <button @click="openRuleModal()" class="px-6 py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-lg hover:shadow-indigo-400/20 active:scale-95">
                    <i data-lucide="plus" class="w-4 h-4 inline-block mr-2"></i>Create Rule
                </button>
                <button id="syncHubBtn" @click="syncHubData()" class="px-6 py-3 bg-indigo-500/30 backdrop-blur-md text-white font-bold rounded-xl border border-white/20 hover:bg-indigo-500/40 transition-all active:scale-95 flex items-center">
                    <i data-lucide="refresh-cw" class="w-4 h-4 mr-2" id="syncIcon"></i>
                    <span id="syncText">Sync Hub Data</span>
                </button>
                <a href="/dashboard/recommendations/analytics" class="px-6 py-3 bg-indigo-500/30 backdrop-blur-md text-white font-bold rounded-xl border border-white/20 hover:bg-indigo-500/40 transition-all active:scale-95">
                    View Intelligence
                </a>
            </div>
        </div>
        <!-- Abstract Background Shapes -->
        <div class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-64 h-64 bg-indigo-400/20 rounded-full blur-2xl"></div>
    </div>

    <!-- How It Works Strip -->
    <div data-section="sync" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div class="flex items-start space-x-4">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center flex-shrink-0">
                <i data-lucide="info" class="w-5 h-5 text-indigo-500"></i>
            </div>
            <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-white mb-1">How Smart Recommendations Work</h3>
                <p class="text-xs text-slate-500 leading-relaxed">
                    <strong>1. Sync</strong> your product catalog and order history from your ERP. 
                    <strong>2. Rules</strong> you create below define which products to recommend when a specific SKU or category appears on a document. 
                    <strong>3. Intelligence</strong> automatically finds frequently-bought-together patterns and customer segments to suggest even smarter upsells. 
                    Recommendations are injected into invoices, estimates, and receipts generated through your workflows.
                </p>
            </div>
        </div>
    </div>

    <!-- API Loading State -->
    <div x-show="loading" class="flex justify-center flex-col items-center py-20 min-h-[400px]">
        <i data-lucide="loader-2" class="w-12 h-12 text-indigo-500 animate-spin mb-4"></i>
        <span class="text-slate-500 font-medium">Loading recommendations data...</span>
    </div>

    <!-- Content (Hidden while loading) -->
    <div x-cloak x-show="!loading" class="space-y-8">
        
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                        <i data-lucide="shopping-bag" class="w-6 h-6"></i>
                    </div>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Impressions</p>
                <h3 class="text-2xl font-bold text-slate-900 dark:text-white" x-text="stats?.impressions || 0"></h3>
            </div>
            
            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                        <i data-lucide="trending-up" class="w-6 h-6"></i>
                    </div>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Conversion Rate</p>
                <h3 class="text-2xl font-bold text-slate-900 dark:text-white" x-text="stats?.conversionRate || '0%'"></h3>
            </div>

            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                        <i data-lucide="pound-sterling" class="w-6 h-6"></i>
                    </div>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Revenue Lift</p>
                <h3 class="text-2xl font-bold text-slate-900 dark:text-white" x-text="stats?.revenueLift || '£0.00'"></h3>
            </div>

            <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                        <i data-lucide="settings-2" class="w-6 h-6"></i>
                    </div>
                </div>
                <p class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Active Rules</p>
                <h3 class="text-2xl font-bold text-slate-900 dark:text-white" x-text="rules?.length || 0"></h3>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12 mt-8">
            <!-- Active Rules Table -->
            <div class="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-2">
                        <h2 class="text-xl font-bold">Active Recommendation Rules</h2>
                        <button @click="openRuleModal()" class="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Create Rule</span>
                        </button>
                    </div>
                    <p class="text-xs text-slate-500 max-w-lg">Rules define what product to recommend when a specific SKU or product category appears on a document. Higher priority rules are matched first.</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[0.65rem] font-bold uppercase tracking-widest">
                            <tr>
                                <th class="px-8 py-4">Name</th>
                                <th class="px-8 py-4">Trigger</th>
                                <th class="px-8 py-4">Recommendation</th>
                                <th class="px-8 py-4">Priority</th>
                                <th class="px-8 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            
                            <!-- Display rules via Alpine loop -->
                            <template x-if="rules && rules.length > 0">
                                <template x-for="rule in rules" :key="rule.id">
                                    <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                        <td class="px-8 py-6">
                                            <span class="font-bold text-sm text-slate-900 dark:text-white" x-text="rule.name"></span>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center space-x-3">
                                                <div class="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                                                    <i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>
                                                </div>
                                                <span class="text-sm text-slate-600 dark:text-slate-400" x-text="rule.triggerCategory ? 'Category: ' + rule.triggerCategory : (rule.triggerSku ? 'SKU: ' + rule.triggerSku : 'Global fallback')"></span>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6">
                                            <span class="text-sm font-medium text-slate-600 dark:text-slate-400" x-text="rule.targetSku"></span>
                                        </td>
                                        <td class="px-8 py-6">
                                            <div class="flex items-center">
                                                <div class="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mr-3">
                                                    <div class="h-full bg-blue-500" :style="'width: ' + (rule.priority * 10) + '%;'"></div>
                                                </div>
                                                <span class="text-xs font-bold text-slate-500" x-text="rule.priority"></span>
                                            </div>
                                        </td>
                                        <td class="px-8 py-6 text-right">
                                            <div class="flex items-center justify-end space-x-2">
                                                <button @click="editRule(rule)" class="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100">
                                                    <i data-lucide="edit-3" class="w-4 h-4"></i>
                                                </button>
                                                <button @click="deleteRule(rule.id)" class="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                            </template>

                            <!-- Empty State -->
                            <template x-if="rules && rules.length === 0">
                                <tr>
                                    <td colspan="5" class="px-8 py-12 text-center">
                                        <div class="max-w-xs mx-auto space-y-4">
                                            <div class="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto">
                                                <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
                                            </div>
                                            <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-2">No rules created yet</h3>
                                            <p class="text-slate-500 mb-6">Add your first recommendation rule to start driving upsells.</p>
                                            <button @click="createDefaultRules($event)" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-500/30">
                                                Generate Default Rules
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>

                <!-- Suggested Pairings Detail Trigger -->
                <div class="px-8 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div class="flex flex-col sm:flex-row items-center justify-between">
                        <div>
                            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Suggested Pairings Inventory</h3>
                            <p class="text-xs text-slate-500 mt-1">Machine-learning generated suggestions for your rules.</p>
                        </div>
                        <a href="/dashboard/recommendations/segments" class="mt-4 sm:mt-0 text-indigo-600 text-sm font-bold hover:text-indigo-800 flex items-center hover:underline">
                            View Detailed Suggestions <i data-lucide="arrow-right" class="w-4 h-4 ml-1"></i>
                        </a>
                    </div>
                </div>

            </div>

            <!-- Right Column: Quick Insights -->
            <div class="space-y-8">
                <div data-section="catalog" class="grid grid-cols-2 gap-4">
                    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative group overflow-hidden">
                        <div class="flex items-center justify-between mb-4 relative z-10">
                            <i data-lucide="layers" class="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Rules</span>
                        </div>
                        <h4 class="text-2xl font-black text-slate-900 dark:text-white relative z-10" x-text="rules?.length || 0"></h4>
                        <p class="text-[0.65rem] text-slate-500 mt-1 relative z-10">Matching rules on docs</p>
                    </div>
                    <a href="/dashboard/recommendations/catalog" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative group overflow-hidden hover:border-emerald-500 hover:shadow-emerald-500/10 transition-all block">
                        <div class="flex items-center justify-between mb-4 relative z-10">
                            <i data-lucide="package" class="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Catalog</span>
                        </div>
                        <h4 class="text-2xl font-black text-slate-900 dark:text-white relative z-10" x-text="stats?.catalogSize || 0"></h4>
                        <p class="text-[0.65rem] text-slate-500 mt-1 relative z-10">Products via ERP</p>
                    </a>
                    <a href="/dashboard/recommendations/catalog" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative group overflow-hidden hover:border-amber-500 hover:shadow-amber-500/10 transition-all block">
                        <div class="flex items-center justify-between mb-4 relative z-10">
                            <i data-lucide="tag" class="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Categories</span>
                        </div>
                        <h4 class="text-2xl font-black text-slate-900 dark:text-white relative z-10" x-text="stats?.topCategories?.length || 0"></h4>
                        <p class="text-[0.65rem] text-slate-500 mt-1 relative z-10">Active categories</p>
                    </a>
                    <a href="/dashboard/recommendations/analytics" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative group overflow-hidden hover:border-rose-500 hover:shadow-rose-500/10 transition-all block">
                        <div class="flex items-center justify-between mb-4 relative z-10">
                            <i data-lucide="trending-up" class="w-5 h-5 text-rose-500 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest">Conversion</span>
                        </div>
                        <h4 class="text-2xl font-black text-slate-900 dark:text-white relative z-10" x-text="stats?.conversionRate || '0%'"></h4>
                        <p class="text-[0.65rem] text-slate-500 mt-1 relative z-10">Converted upsells</p>
                    </a>
                </div>

                <!-- Secondary Insights -->
                <div class="grid grid-cols-1 lg:grid-cols-1 gap-8">
                    <!-- Affinity Insights -->
                    <a href="/dashboard/recommendations/segments" class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl block hover:border-indigo-500 transition-all group" data-section="clusters">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h3 class="font-bold text-lg group-hover:text-indigo-600 transition-colors">Affinity Insights</h3>
                                <p class="text-[0.65rem] text-slate-500 mt-1">Products your customers frequently buy together</p>
                            </div>
                            <i data-lucide="external-link" class="w-5 h-5 text-indigo-300 opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0"></i>
                        </div>
                        <div class="space-y-4">
                            <template x-if="stats?.affinities && stats.affinities.length > 0">
                                <template x-for="a in stats.affinities.slice(0,3)">
                                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                        <div class="flex items-center space-x-2">
                                            <span class="text-[0.65rem] font-bold text-slate-900 dark:text-white" x-text="a.baseProduct + ' + ' + a.matchedSku"></span>
                                        </div>
                                        <span class="text-[0.55rem] font-black uppercase px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded" x-text="a.confidence + ' Match'"></span>
                                    </div>
                                </template>
                            </template>
                            <template x-if="!stats?.affinities || stats.affinities.length === 0">
                                <p class="text-xs italic text-slate-400 text-center py-4">No affinity patterns detected yet.</p>
                            </template>
                        </div>
                    </a>
                </div>

                <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
                    <div class="relative z-10">
                        <h3 class="font-bold text-lg mb-2">Customer Segments</h3>
                        <p class="text-indigo-100 text-[0.7rem] leading-relaxed mb-3">
                            Your customers are automatically grouped into 
                            <span class="font-bold text-white" x-text="(stats?.customerClusters?.length || 3) + ' segments'"></span> 
                            based on frequency.
                        </p>
                        <ul class="text-indigo-100 text-xs space-y-1 mb-6">
                            <li>🏆 <strong class="text-white">Champions</strong> &mdash; 5+ orders</li>
                            <li>📈 <strong class="text-white">Steady</strong> &mdash; 2-5 orders</li>
                            <li>🆕 <strong class="text-white">At Risk</strong> &mdash; 0-1 orders</li>
                        </ul>
                        <a href="/dashboard/recommendations/segments" class="inline-block w-full text-center py-2 bg-white/20 backdrop-blur-md border border-white/20 rounded-xl text-sm font-bold hover:bg-white/30 transition-all">
                            View All Segments
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Rule Modal -->
<div id="ruleModal" class="hidden fixed inset-0 z-[100] items-center justify-center p-4">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="document.dispatchEvent(new CustomEvent('close-modal'))"></div>
    <div class="relative bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 id="modalTitle" class="text-xl font-bold">Create Recommendation Rule</h2>
            <button onclick="document.dispatchEvent(new CustomEvent('close-modal'))" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>
        <form id="ruleForm" class="p-8 space-y-6">
            <input type="hidden" id="ruleId">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Inputs remain identical to avoid UI breakage -->
                <div class="space-y-2 md:col-span-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Rule Name</label>
                    <input type="text" id="ruleName" required placeholder="e.g., Summer Upsell Bundle" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                </div>
                <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Trigger SKU</label>
                    <input type="text" id="triggerSku" placeholder="e.g., SKU-123" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                </div>
                <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Trigger Category</label>
                    <input type="text" id="triggerCategory" placeholder="e.g., Footwear" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                </div>
                <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Recommended SKU</label>
                    <input type="text" id="targetSku" required placeholder="e.g., SKU-789" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                </div>
                <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Priority (1-10)</label>
                    <input type="number" id="rulePriority" min="1" max="10" value="5" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all">
                </div>
                <div class="space-y-2 md:col-span-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Advanced AI Context</label>
                    <textarea id="aiPromptContext" rows="3" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"></textarea>
                </div>
            </div>
            <div class="flex items-center space-x-3 pt-2">
                <input type="checkbox" id="ruleActive" checked class="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500">
                <label for="ruleActive" class="text-sm font-medium text-slate-600 dark:text-slate-400">Rule is active</label>
            </div>
            <div class="flex justify-end space-x-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onclick="document.dispatchEvent(new CustomEvent('close-modal'))" class="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all">Cancel</button>
                <button type="submit" class="px-8 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">Save Rule</button>
            </div>
        </form>
    </div>
</div>

<script nonce="<%= nonce %>">
    document.addEventListener('alpine:init', () => {
        Alpine.data('recommendationsDashboard', () => ({
            rules: [], 
            stats: {}, 
            loading: true, 
            
            async initDashboard() { 
                try {
                    const [rulesRes, statsRes] = await Promise.all([
                        fetch('/dashboard/recommendations/api/rules').then(r=>r.json()),
                        fetch('/dashboard/recommendations/api/stats').then(r=>r.json())
                    ]);
                    this.rules = rulesRes.data || [];
                    this.stats = statsRes.data || {};
                } catch(e) {
                    console.error('Failed to load data', e);
                } finally {
                    this.loading = false;
                    this.$nextTick(() => { if(window.lucide) window.lucide.createIcons(); });
                }
            },

            openRuleModal() {
                document.getElementById('modalTitle').textContent = 'Create Recommendation Rule';
                document.getElementById('ruleForm').reset();
                document.getElementById('ruleId').value = '';
                document.getElementById('ruleModal').classList.remove('hidden');
                document.getElementById('ruleModal').classList.add('flex');
            },

            editRule(rule) {
                if (!rule) return;
                document.getElementById('modalTitle').textContent = 'Edit Recommendation Rule';
                document.getElementById('ruleId').value = rule.id;
                document.getElementById('ruleName').value = rule.name;
                document.getElementById('triggerSku').value = rule.triggerSku || '';
                document.getElementById('triggerCategory').value = rule.triggerCategory || '';
                document.getElementById('targetSku').value = rule.targetSku;
                document.getElementById('rulePriority').value = rule.priority;
                document.getElementById('aiPromptContext').value = rule.aiPromptContext || '';
                document.getElementById('ruleActive').checked = rule.isActive;
                document.getElementById('ruleModal').classList.remove('hidden');
                document.getElementById('ruleModal').classList.add('flex');
            },

            async deleteRule(id) {
                if (!confirm('Are you sure you want to delete this rule?')) return;
                try {
                    const response = await fetch('/dashboard/recommendations/rules/' + id, { method: 'DELETE' });
                    if (response.ok) window.location.reload();
                    else alert('Failed to delete rule');
                } catch (error) { 
                    console.error(error); 
                    alert('Error deleting rule'); 
                }
            },

            async syncHubData() {
                const btn = document.getElementById('syncHubBtn');
                const icon = document.getElementById('syncIcon');
                const text = document.getElementById('syncText');
                
                btn.disabled = true;
                icon.classList.add('animate-spin');
                text.textContent = 'Syncing...';
                
                try {
                    await Promise.all([
                        fetch('/dashboard/recommendations/sync/products', { method: 'POST' }),
                        fetch('/dashboard/recommendations/sync/orders', { method: 'POST' })
                    ]);
                    text.textContent = 'Sync Triggered';
                    setTimeout(() => window.location.reload(), 1500);
                } catch (error) {
                    text.textContent = 'Sync Failed';
                    btn.disabled = false;
                    icon.classList.remove('animate-spin');
                }
            },

            async createDefaultRules(event) {
                const btn = event.currentTarget;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>';
                try {
                    const res = await fetch('/dashboard/recommendations/rules/default', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if(res.ok) window.location.reload();
                    else throw new Error('Failed to create default rules');
                } catch(err) {
                    alert(err.message);
                    window.location.reload();
                }
            }
        }));
    });

    document.addEventListener('close-modal', () => {
        document.getElementById('ruleModal').classList.add('hidden');
        document.getElementById('ruleModal').classList.remove('flex');
    });

    document.getElementById('ruleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('ruleId').value;
        const data = {
            name: document.getElementById('ruleName').value,
            triggerSku: document.getElementById('triggerSku').value,
            triggerCategory: document.getElementById('triggerCategory').value,
            targetSku: document.getElementById('targetSku').value,
            priority: parseInt(document.getElementById('rulePriority').value),
            aiPromptContext: document.getElementById('aiPromptContext').value,
            isActive: document.getElementById('ruleActive').checked
        };

        const url = id ? '/dashboard/recommendations/rules/' + id : '/dashboard/recommendations/rules';
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) window.location.reload();
            else {
                const result = await response.json();
                alert(result.error || 'Failed to save rule');
            }
        } catch (error) {
            console.error(error);
            alert('Error saving rule');
        }
    });

    // Handle AlpineJS x-cloak
    document.addEventListener('alpine:initialized', () => {
        document.querySelectorAll('[x-cloak]').forEach(el => el.removeAttribute('x-cloak'));
    });
</script>

<style>
    [x-cloak] { display: none !important; }
</style>

<%- include('../../partials/sidebar-script') %>
`;

fs.writeFileSync('d:/apps/websites/saas/afs_doc_tools_source/src/views/dashboard/recommendations/index.ejs', TEMPLATE, 'utf-8');
console.log('index.ejs successfully refactored to Client-Side API-driven architecture');
