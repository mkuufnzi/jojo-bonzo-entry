const fs = require('fs');
const path = require('path');

const VIEWS_DIR = path.resolve('src/views');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.ejs')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const scanFile = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(VIEWS_DIR, filePath).replace(/\\/g, '/');
    
    // Heuristics
    const hasHead = content.includes('partials/head') || content.includes('include(\'partials/head\'') || content.includes('include("partials/head"');
    const hasSidebar = content.includes('partials/sidebar') || content.includes('include(\'partials/sidebar\'');
    const hasDashboardHeader = content.includes('partials/dashboard-header');
    
    // Responsive Indicators
    const responsiveClasses = (content.match(/((sm|md|lg|xl|2xl):)/g) || []).length;
    const gridLayouts = (content.match(/grid-cols-/g) || []).length;
    const flexLayouts = (content.match(/flex/g) || []).length;
    
    // Potential Issues
    const fixedWidths = (content.match(/w-\[\d+px\]|width:\s*\d+px/g) || []);
    const fixedWidthCount = fixedWidths.length;

    let status = '⚠️ Review';
    let notes = [];

    // Categorization
    const isPartial = relativePath.includes('partials/');
    const isEmail = relativePath.includes('email/');
    const isAdmin = relativePath.includes('admin/');

    if (isEmail) {
        status = 'Email Template';
        notes.push('Skipped for responsive check');
    } else if (isPartial) {
        status = 'Partial';
        if (responsiveClasses > 0) status = 'Responsive Partial';
    } else {
        // Page Level Checks
        if (!hasHead) {
             notes.push('Missing Global Head (CSS)');
             status = '❌ FAIL';
        } else {
            if (responsiveClasses > 5 || (gridLayouts > 0 && flexLayouts > 0)) {
                status = '✅ Responsive';
            } else if (content.length < 500) {
                 status = 'ℹ️ Minor/Empty';
            }
            
            if (fixedWidthCount > 0) {
                notes.push(`${fixedWidthCount} fixed widths detected`);
                if (status === '✅ Responsive') status = '⚠️ Check Fixed Widths';
            }
        }
    }
    
    return {
        file: relativePath,
        category: relativePath.split('/')[0],
        hasHead,
        responsiveScore: responsiveClasses,
        status,
        notes: notes.join(', ') || '-'
    };
};

try {
    const files = getAllFiles(VIEWS_DIR);
    const results = files.map(scanFile);
    
    // Sort: Non-partials first, then by status (FAIL top), then alphabet
    results.sort((a, b) => {
        if (a.file.includes('partials') && !b.file.includes('partials')) return 1;
        if (!a.file.includes('partials') && b.file.includes('partials')) return -1;
        return a.file.localeCompare(b.file);
    });

    console.log(JSON.stringify(results, null, 2));
} catch (e) {
    console.error('Error scanning files:', e);
    process.exit(1);
}
