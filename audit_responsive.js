const fs = require('fs');
const path = require('path');
const glob = require('glob');

const VIEWS_DIR = path.resolve('src/views');
const OUTPUT_FILE = 'responsive_audit_results.json';

const scanFile = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(VIEWS_DIR, filePath);
    
    // Heuristics
    const hasHead = content.includes('partials/head');
    const hasSidebar = content.includes('partials/sidebar');
    const responsiveClasses = (content.match(/((sm|md|lg|xl|2xl):)/g) || []).length;
    const gridLayouts = (content.match(/grid-cols-/g) || []).length;
    const flexLayouts = (content.match(/flex/g) || []).length;
    
    // Potential Issues
    // match w-[123px] or width: 123px (simple regex)
    const fixedWidths = (content.match(/w-\[\d+px\]|width:\s*\d+px/g) || []);
    const fixedWidthCount = fixedWidths.length;

    let status = 'Review';
    let notes = [];

    if (responsiveClasses > 0 || (gridLayouts > 0 && flexLayouts > 0)) {
        status = 'Likely Responsive';
    }
    
    if (fixedWidthCount > 2) {
        status = 'Potential Issues';
        notes.push(`Found ${fixedWidthCount} fixed widths`);
    }

    if (!hasHead && !filePath.includes('partials') && !filePath.includes('email')) {
         notes.push('Missing Global Head');
         status = 'FAIL'; // Critical for CSS loading
    }
    
    return {
        file: relativePath,
        category: relativePath.split(path.sep)[0],
        hasHead,
        hasSidebar,
        responsiveScore: responsiveClasses,
        status,
        notes: notes.join(', ') || 'OK'
    };
};

glob(path.join(VIEWS_DIR, '**/*.ejs'), (err, files) => {
    if (err) {
        console.error('Glob error:', err);
        return;
    }

    const results = files.map(scanFile);
    // Sort by Category then File
    results.sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file));

    console.log(JSON.stringify(results, null, 2));
});
