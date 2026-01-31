import sys

filepath = r'd:\apps\websites\saas\afs_doc_tools_source\src\views\services\ai-doc-generator.ejs'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_content = """                            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <!-- Composition Hub (2/3) -->
                                <div class="lg:col-span-8 space-y-8">
                                    <div class="bg-white rounded-[32px] border-2 border-slate-200 shadow-2xl relative overflow-hidden flex flex-col min-h-[500px]">
                                        <div class="p-8 border-b border-slate-100 flex items-center justify-between">
                                            <div class="flex items-center gap-4">
                                                <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                                    <i data-lucide="terminal" class="w-6 h-6"></i>
                                                </div>
                                                <div>
                                                    <h2 class="text-xl font-black text-gray-900 tracking-tight leading-none">Composition Workspace</h2>
                                                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 italic">Professional Drafting Logic v4.2</p>
                                                </div>
                                            </div>
                                        </div>

                                        <form id="aiGenerateForm" class="flex-1 flex flex-col">
                                            <div class="p-8 flex-1">
                                                <textarea name="prompt" id="promptInput" required
                                                    class="w-full h-full min-h-[250px] text-xl font-medium text-gray-800 placeholder-slate-200 border-none focus:ring-0 resize-none leading-relaxed bg-transparent"
                                                    placeholder="Synthesize a professional layout for... (e.g., 'An analytical quarterly report for a technology infrastructure startup')"></textarea>
                                                
                                                <!-- Hidden State Management -->
                                                <input type="hidden" name="type" id="documentTypeInput" value="report">
                                                <input type="hidden" name="tone" id="toneInput" value="professional">
                                                <input type="hidden" name="theme" id="themeInput" value="modern">
                                            </div>

                                            <div class="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                                <div class="flex items-center gap-3">
                                                    <div id="fileStatus" class="hidden items-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                                        <i data-lucide="paperclip" class="w-3 h-3 mr-2"></i>
                                                        <span id="fileCountText">0 Assets</span>
                                                    </div>
                                                </div>

                                                <button type="submit" id="generateBtn" 
                                                        class="px-12 py-5 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center group">
                                                    <span id="btnText">Synthesize Draft</span>
                                                    <i id="btnIcon" data-lucide="zap" class="ml-3 w-4 h-4 fill-white group-hover:scale-125 transition-transform"></i>
                                                    <div id="btnSpinner" class="hidden ml-3">
                                                        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    </div>
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                    
                                    <!-- Industry Hub (Suggestions) -->
                                    <div class="flex flex-wrap gap-3 justify-center">
                                        <% const blueprints = [
                                            { id: 'report', label: 'Strategic Report', icon: 'file-text' },
                                            { id: 'invoice', label: 'Financial Export', icon: 'credit-card' },
                                            { id: 'resume', label: 'Executive CV', icon: 'user' },
                                            { id: 'letterhead', label: 'Official Brief', icon: 'mail' },
                                            { id: 'press_release', label: 'Media Ledger', icon: 'megaphone' },
                                            { id: 'company_profile', label: 'Core Profile', icon: 'building-2' }
                                        ] %>
                                        <% blueprints.forEach(bp => { %>
                                            <button onclick="applyMagicSuggestion('<%= bp.id %>')" 
                                                class="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50 transition-all group">
                                                <i data-lucide="<%= bp.icon %>" class="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors"></i>
                                                <span class="text-[9px] font-black text-slate-500 group-hover:text-blue-700 uppercase tracking-widest"><%= bp.label %></span>
                                            </button>
                                        <% }) %>
                                    </div>
                                </div>

                                <!-- Structural Profile (1/3 Sidepanel) -->
                                <div class="lg:col-span-4 space-y-6">
                                    <div class="bg-white rounded-[32px] border-2 border-slate-200 p-8 shadow-xl">
                                        <div class="flex items-center gap-3 mb-8">
                                            <i data-lucide="settings-2" class="w-4 h-4 text-blue-600"></i>
                                            <h4 class="text-[10px] font-black text-gray-900 uppercase tracking-widest">Structural Profile</h4>
                                        </div>

                                        <div class="space-y-8">
                                            <!-- Environment Integration -->
                                            <div class="space-y-3">
                                                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Connected Environment</label>
                                                <select name="appId" id="generatorAppId" class="w-full text-xs font-bold text-gray-700 border-2 border-slate-100 rounded-xl py-4 px-4 focus:border-blue-500 outline-none bg-slate-50 transition-all">
                                                    <% if (locals.enabledApps && enabledApps.length > 0) { %>
                                                        <% enabledApps.forEach(item => { %>
                                                            <option value="<%= item.app.id %>"><%= item.app.name %></option>
                                                        <% }) %>
                                                    <% } else { %>
                                                        <option disabled>No sandboxes active</option>
                                                    <% } %>
                                                </select>
                                            </div>

                                            <!-- Communication Style -->
                                            <div class="space-y-4">
                                                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Communication Style</label>
                                                <div class="grid grid-cols-2 gap-2">
                                                    <% ['Professional', 'Modern', 'Direct', 'Creative'].forEach(t => { %>
                                                        <button type="button" onclick="selectTone(this, '<%= t.toLowerCase() %>')" 
                                                            class="tone-badge py-3 border-2 border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 hover:border-blue-200 transition-all <%= t === 'Professional' ? 'border-blue-600 bg-blue-50 text-blue-700' : '' %>">
                                                            <%= t %>
                                                        </button>
                                                    <% }) %>
                                                </div>
                                            </div>

                                            <!-- Visual Identity -->
                                            <div class="space-y-4">
                                                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Visual Identity</label>
                                                <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                                                    <% const themes = [
                                                        { id: 'modern', color: 'bg-blue-600' },
                                                        { id: 'minimal', color: 'bg-slate-900' },
                                                        { id: 'corporate', color: 'bg-indigo-900' },
                                                        { id: 'vibrant', color: 'bg-rose-500' }
                                                    ] %>
                                                    <% themes.forEach(th => { %>
                                                        <button type="button" onclick="selectTheme(this, '<%= th.id %>')"
                                                            class="theme-pellet w-10 h-10 rounded-xl <%= th.color %> shadow-lg hover:scale-110 transition-transform <%= th.id === 'modern' ? 'ring-4 ring-blue-100 ring-offset-2' : '' %>"></button>
                                                    <% }) %>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Asset Control -->
                                    <div class="bg-white rounded-[32px] border-2 border-slate-200 p-8 shadow-xl">
                                        <div class="flex items-center justify-between mb-8">
                                            <div class="flex items-center gap-3">
                                                <i data-lucide="database" class="w-4 h-4 text-slate-400"></i>
                                                <h4 class="text-[10px] font-black text-gray-900 uppercase tracking-widest">Source Assets</h4>
                                            </div>
                                            <button type="button" onclick="document.getElementById('fileInput').click()" 
                                                class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                                <i data-lucide="plus" class="w-4 h-4"></i>
                                            </button>
                                            <input type="file" id="fileInput" class="hidden" multiple accept=".pdf,.doc,.docx,.txt,.csv,.xlsx">
                                        </div>
                                        <div id="fileList" class="space-y-3 mb-6 empty:hidden"></div>
                                        <div class="p-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                                            <p class="text-[9px] font-bold text-slate-300 uppercase tracking-widest">PDF, DOCX, XLSX Supported</p>
                                        </div>
                                    </div>

                                    <!-- Context Extension -->
                                    <div class="bg-slate-900 rounded-[32px] p-8 shadow-2xl">
                                        <div class="flex items-center gap-3 mb-6">
                                            <i data-lucide="cpu" class="w-4 h-4 text-blue-400"></i>
                                            <h4 class="text-[10px] font-black text-blue-100 uppercase tracking-widest">Context Extension</h4>
                                        </div>
                                        <textarea name="context" class="w-full bg-slate-800 border-none rounded-2xl p-4 text-xs font-medium text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-blue-500 min-h-[120px]" 
                                            placeholder="Append specific data or rules..."></textarea>
                                    </div>
                                </div>
"""

lines[99:240] = [new_content + '\n']

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)
