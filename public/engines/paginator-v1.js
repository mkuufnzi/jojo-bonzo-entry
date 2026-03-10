/**
 * Universal Paginator v1.3.2 (Enterprise Edition)
 * Handles recursive splitting across A4 pages with Alpine.js sanitization.
 */
if (typeof window.Paginator === 'undefined') {
    window.Paginator = class Paginator {
        constructor(sourceId, targetId) {
            this.source = document.querySelector(sourceId);
            this.target = document.querySelector(targetId);
            this.config = this.readConfig();
            this.pageCount = 0;
            this.currentPage = null;
            this.nonFlowBuffer = [];
            console.log('[Paginator] v1.3.2 Initialized.');
        }

        readConfig() {
            const docConfig = document.getElementById('doc-config');
            return {
                pageSize: (docConfig?.getAttribute('data-page-size')) || 'A4',
                marginTop: parseInt(docConfig?.getAttribute('data-margin-top') || '50'),
                marginBottom: parseInt(docConfig?.getAttribute('data-margin-bottom') || '50'),
                bleedFirstPage: docConfig?.hasAttribute('data-bleed-first-page')
            };
        }

        async paginate() {
            if (!this.source || !this.target) {
                 console.error('[Paginator] Missing source (#source-document) or target (#preview-stage)');
                 return;
            }
            
            console.log('[Paginator] v1.3.2 Splitting Document into Pages...');
            
            this.target.innerHTML = '';
            this.pageCount = 0;
            this.currentPage = null;
            this.nonFlowBuffer = [];
            
            // 1. Wait for images to ensure scrollHeight is accurate
            const images = Array.from(this.source.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = img.onerror = resolve;
                });
            }));

            // 2. Clone and Sanitize
            const sourceClone = this.source.cloneNode(true);
            this.sanitizeSource(sourceClone);
            const nodes = Array.from(sourceClone.childNodes);
            
            // 3. Process each top-level node
            for (const node of nodes) {
                this.placeNode(node);
                if (this.pageCount > 50) {
                     console.warn('[Paginator] Safety break: Document exceeds 50 pages.');
                     break;
                }
            }
            
            this.cleanupEmptyLastPage();
            this.target.classList.remove('opacity-0');
            console.log(`[Paginator] Done. Total Pages: ${this.pageCount}`);
            window.dispatchEvent(new CustomEvent('paginator:done', { detail: { pages: this.pageCount } }));
        }

        sanitizeSource(source) {
            const toDelete = Array.from(source.querySelectorAll('script, style, [data-paginator-ignore]'));
            toDelete.forEach(n => n.parentNode.removeChild(n));
        }

        createNewPage() {
            this.pageCount++;
            const page = document.createElement('div');
            page.className = `print-page sheet ${this.config.pageSize} relative bg-white shadow-lg mx-auto overflow-hidden mb-8`;
            
            const totalHeight = 1123;
            const totalWidth = 794;
            
            page.style.width = totalWidth + 'px';
            page.style.height = totalHeight + 'px';

            const availableHeight = totalHeight - this.config.marginTop - this.config.marginBottom;

            const content = document.createElement('div');
            content.className = 'page-main-content relative w-full';
            content.style.boxSizing = 'border-box';
            content.style.marginTop = this.config.marginTop + 'px';
            content.style.height = availableHeight + 'px';
            content.style.overflow = 'hidden';
            content.style.paddingLeft = '40px';
            content.style.paddingRight = '40px';

            page.appendChild(content);
            this.target.appendChild(page);
            this.currentPage = content;

            if (this.nonFlowBuffer.length > 0) {
                this.nonFlowBuffer.forEach(n => this.currentPage.appendChild(n));
                this.nonFlowBuffer = [];
            }

            return content;
        }

        placeNode(node) {
            if (node.nodeType === 3) {
                if (!node.textContent.trim()) return;
            }
            if (node.nodeType !== 1) return;

            if (this.isNonFlow(node)) {
                const clone = node.cloneNode(true);
                if (node.hasAttribute('data-full-bleed') && this.pageCount <= 1) {
                    if (!this.currentPage) this.createNewPage();
                    this.currentPage.parentElement.appendChild(clone);
                    clone.style.position = 'absolute';
                    clone.style.top = '0';
                    clone.style.left = '0';
                    clone.style.width = '100%';
                    clone.style.zIndex = '5';
                } else {
                    if (this.currentPage) this.currentPage.appendChild(clone);
                    else this.nonFlowBuffer.push(clone);
                }
                return;
            }

            if (node.hasAttribute('data-break-before')) this.createNewPage();
            if (!this.currentPage) this.createNewPage();
            
            const clone = node.cloneNode(true);
            this.currentPage.appendChild(clone);
            
            if (this.isOverflown(this.currentPage)) {
                const flowItems = Array.from(this.currentPage.children).filter(n => !this.isNonFlow(n));
                const isCont = this.isContainer(node);
                
                if (isCont) {
                    if (flowItems.length > 1) {
                        this.currentPage.removeChild(clone);
                        this.createNewPage();
                        this.currentPage.appendChild(clone);
                        
                        if (this.isOverflown(this.currentPage)) {
                            this.currentPage.removeChild(clone);
                            this.splitContainer(node, []);
                        }
                    } else {
                        this.currentPage.removeChild(clone);
                        this.splitContainer(node, []);
                    }
                } else if (flowItems.length > 1) {
                    this.currentPage.removeChild(clone);
                    this.createNewPage();
                    this.currentPage.appendChild(clone);
                }
            }
        }

        splitContainer(container, stack = []) {
            if (stack.length > 5) return;
            const myClone = container.cloneNode(false);
            const newStack = [...stack, myClone];
            this.ensureStack(newStack);
            const children = Array.from(container.childNodes);
            for (const child of children) {
                if (child.nodeType === 3) {
                    if (!child.textContent.trim()) continue;
                    const textClone = child.cloneNode(true);
                    this.appendToLeaf(newStack, textClone);
                    if (this.isOverflown(this.currentPage)) {
                        this.removeFromLeaf(newStack, textClone);
                        this.createNewPage();
                        this.ensureStack(newStack);
                        this.appendToLeaf(newStack, textClone);
                    }
                    continue;
                }
                if (child.nodeType !== 1) continue;
                if (this.isNonFlow(child)) {
                    this.appendToLeaf(newStack, child.cloneNode(true));
                    continue;
                }
                if (this.isContainer(child)) {
                    this.splitContainer(child, newStack);
                    continue;
                }
                const childClone = child.cloneNode(true);
                this.appendToLeaf(newStack, childClone);
                if (this.isOverflown(this.currentPage)) {
                    this.removeFromLeaf(newStack, childClone);
                    this.createNewPage();
                    this.ensureStack(newStack);
                    this.appendToLeaf(newStack, childClone);
                }
            }
        }

        ensureStack(stack) {
            if (!this.currentPage) this.createNewPage();
            let parent = this.currentPage;
            for (const el of stack) {
                const existing = Array.from(parent.children).find(c => 
                    c.tagName === el.tagName && 
                    c.className === el.className && 
                    (el.id ? c.id === el.id : true)
                );
                if (existing) {
                    parent = existing;
                } else {
                    const newClone = el.cloneNode(false);
                    newClone.setAttribute('data-paginator-split-part', 'true');
                    parent.appendChild(newClone);
                    parent = newClone;
                }
            }
        }

        appendToLeaf(stack, node) {
            let leaf = this.currentPage;
            for (const el of stack) {
                const found = Array.from(leaf.children).find(c => 
                    c.tagName === el.tagName && 
                    c.className === el.className && 
                    (el.id ? c.id === el.id : true)
                );
                if (found) leaf = found;
            }
            leaf.appendChild(node);
        }

        removeFromLeaf(stack, node) {
            let leaf = this.currentPage;
            for (const el of stack) {
                 const found = Array.from(leaf.children).find(c => 
                    c.tagName === el.tagName && 
                    c.className === el.className && 
                    (el.id ? c.id === el.id : true)
                );
                if (found) leaf = found;
            }
            if (leaf.contains(node)) leaf.removeChild(node);
        }

        isOverflown(el) {
            if (!el) return false;
            return el.scrollHeight > (el.clientHeight + 5); 
        }

        isNonFlow(node) {
            if (node.nodeType !== 1) return false;
            if (node.hasAttribute('data-page-overlay') || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return true;
            if (node.classList.contains('hidden') || node.style.display === 'none') return true;
            const style = window.getComputedStyle(node);
            return style.position === 'absolute' || style.position === 'fixed' || style.display === 'none';
        }

        isContainer(node) {
            if (!node || node.nodeType !== 1) return false;
            if (node.hasAttribute('data-no-split') || node.getAttribute('data-split') === 'false') return false;
            if (node.hasAttribute('data-split') || node.hasAttribute('data-container') || node.classList.contains('doc-section')) return true;
            const splitTags = ['TABLE', 'TBODY', 'UL', 'OL', 'SECTION', 'ARTICLE', 'MAIN', 'BLOCKQUOTE'];
            if (splitTags.includes(node.tagName)) return true;
            const classes = node.className || '';
            if (classes.includes('flex') || classes.includes('grid') || classes.includes('gap-') || classes.includes('container') || classes.includes('mx-auto') || classes.includes('wrapper')) {
                return true;
            }
            const flowChildren = Array.from(node.children).filter(n => !this.isNonFlow(n));
            if (node.tagName === 'DIV' && flowChildren.length >= 1) {
                if (node.parentNode?.id === 'source-document' || flowChildren.length > 1) return true;
            }
            return false;
        }

        cleanupEmptyLastPage() {
            if (!this.currentPage) return;
            const pages = Array.from(this.target.querySelectorAll('.page-main-content'));
            const lastPageContent = pages[pages.length - 1];
            if (!lastPageContent) return;
            const allLeafs = Array.from(lastPageContent.querySelectorAll('*')).filter(n => 
                !this.isNonFlow(n) && 
                n.children.length === 0 && 
                n.textContent.trim()
            );
            if (allLeafs.length === 0 && this.pageCount > 1) {
                const pageDiv = lastPageContent.parentElement;
                pageDiv.parentElement.removeChild(pageDiv);
                this.pageCount--;
                this.currentPage = pages[pages.length - 2];
            }
        }
    };

    const runPaginator = async () => {
        console.log('[Paginator] v1.3.2 Execution Triggered.');
        setTimeout(async () => {
            if (document.getElementById('source-document') && document.getElementById('preview-stage')) {
                const p = new window.Paginator('#source-document', '#preview-stage');
                await p.paginate();
            }
        }, 300);
    };

    window.addEventListener('smart-engine:ready', runPaginator);
    window.addEventListener('DOMContentLoaded', runPaginator);

    // Immediate check for SSR/Snapshots where scripts might load after DOM
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        runPaginator();
    }
}
