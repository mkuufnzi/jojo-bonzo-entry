/**
 * Universal Paginator v1.0.0
 * Handles splitting of content across A4 pages for Smart Templates.
 */

class Paginator {
    constructor(sourceId, targetId) {
        this.source = document.querySelector(sourceId);
        this.target = document.querySelector(targetId);
        this.config = this.readConfig();
        
        // A4 Specs (mm to px at 96 DPI) - approximated for screen
        // A4 Height = 297mm ~= 1123px
        // We use a safe render height to account for margins
        this.pageHeight = 1123; 
        this.currentHeight = 0;
        this.currentPage = null;
        this.pageCount = 0;
    }

    readConfig() {
        const el = document.getElementById('doc-config');
        return {
            marginTop: parseInt(el?.dataset.marginTop || 0),
            marginBottom: parseInt(el?.dataset.marginBottom || 0),
            pageSize: el?.dataset.pageSize || 'A4'
        };
    }

    paginate() {
        if (!this.source || !this.target) return;
        
        // convert source children to array to avoid live collection issues
        const nodes = Array.from(this.source.children);
        this.createNewPage();

        for (const node of nodes) {
            this.processNode(node);
        }
        
        // Cleanup content source
        this.source.innerHTML = '';
        this.source.style.display = 'none';
        
        // Show result
        this.target.classList.remove('opacity-0');
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('paginator:done', { 
            detail: { pages: this.pageCount } 
        }));
    }

    createNewPage() {
        this.pageCount++;
        const page = document.createElement('div');
        page.className = 'print-page relative bg-white shadow-lg mx-auto overflow-hidden custom-scrollbar';
        // Tailwind dimensions for A4
        page.style.width = '794px'; // 210mm
        page.style.height = '1123px'; // 297mm
        page.style.paddingLeft = '40px';
        page.style.paddingRight = '40px';
        page.style.marginBottom = '2rem';
        
        // Apply Template Background logic if needed (cloned from source if static)
        // For now, we assume the template handles its own background via the copied nodes
        
        this.target.appendChild(page);
        this.currentPage = page;
        this.currentHeight = this.config.marginTop;
        
        // Render Header/Footer if marked sticky (Not fully implemented in v1)
    }

    processNode(node) {
        if (node.nodeType !== 1) return; // Skip text nodes at root level
        
        // Check if node wants to force a break
        if (node.hasAttribute('data-break-before')) {
            this.createNewPage();
        }

        const nodeHeight = this.getNodeHeight(node);
        
        // Check if fits
        if (this.currentHeight + nodeHeight < (this.pageHeight - this.config.marginBottom)) {
            // Fits
            this.appendNode(node, this.currentPage);
            this.currentHeight += nodeHeight;
        } else {
            // Doesn't fit. Can we split it?
            if (this.isContainer(node)) {
                 this.processContainer(node);
            } else {
                 // Move to next page
                 this.createNewPage();
                 this.appendNode(node, this.currentPage);
                 this.currentHeight += nodeHeight;
            }
        }
    }
    
    // Recursive splitting logic
    processContainer(node) {
        // Simple implementation: clone the container wrapper, then walk children
        // detailed implementation would go here (similar to the complex logic we had in document-master)
        // For v1 import, we will use the "Move Whole" strategy if strict splitting isn't enabled
        // or re-implement the detailed recursive logic if the user needs it.
        
        // RE-IMPLEMENTING THE RECURSIVE LOGIC FROM PREVIOUS SESSION:
        
        const children = this.getFlowNodes(node);
        if (children.length === 0) {
             this.createNewPage();
             this.appendNode(node, this.currentPage);
             this.currentHeight += this.getNodeHeight(node);
             return;
        }

        // Create a clone of the container for the current page
        let currentContainer = node.cloneNode(false); // shallow clone (wrapper)
        this.appendNode(currentContainer, this.currentPage); 
        // Note: we don't add height yet, we add as we put children in

        for (const child of children) {
            const childHeight = this.getNodeHeight(child);
            
            if (this.currentHeight + childHeight < (this.pageHeight - this.config.marginBottom)) {
                 // Fits in current container on current page
                 currentContainer.appendChild(child); // Moving the actual child
                 this.currentHeight += childHeight;
            } else {
                 // Overflow
                 this.createNewPage();
                 // Create new container clone for new page
                 currentContainer = node.cloneNode(false);
                 this.appendNode(currentContainer, this.currentPage);
                 
                 currentContainer.appendChild(child);
                 this.currentHeight = this.config.marginTop + childHeight;
            }
        }
    }

    isContainer(node) {
        if (node.tagName === 'TABLE') return false; 
        if (node.hasAttribute('data-split')) return true; 
        return false;
    }

    getFlowNodes(node) {
        if (node.tagName === 'TBODY') return Array.from(node.children);
        // exclude absolute positioned elements from flow
        return Array.from(node.children).filter(c => {
            const style = window.getComputedStyle(c);
            return style.position !== 'absolute' && style.position !== 'fixed';
        });
    }

    getNodeHeight(node) {
        // Clone off-screen to measure
        const clone = node.cloneNode(true);
        clone.style.visibility = 'hidden';
        clone.style.position = 'absolute';
        clone.style.width = '794px'; // constrain to page width
        document.body.appendChild(clone);
        const height = clone.offsetHeight + parseFloat(window.getComputedStyle(clone).marginTop) + parseFloat(window.getComputedStyle(clone).marginBottom);
        document.body.removeChild(clone);
        return height;
    }
    
    appendNode(node, target) {
        target.appendChild(node);
        // Re-initialize Alpine if needed (not needed if using x-data on body)
    }
}

// Auto-init logic
window.Paginator = Paginator;
