
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Scanning for External API Calls in codebase...');

const SEARCH_PATTERNS = [
    { pattern: 'axios\\.', type: 'Axios Request' },
    { pattern: 'fetch\\(', type: 'Fetch API' },
    { pattern: 'stripe\\.', type: 'Stripe SDK' },
    { pattern: 'sendgrid', type: 'SendGrid' },
    { pattern: 'webhook', type: 'Webhook (Generic)' }
];

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                scanDirectory(fullPath);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            SEARCH_PATTERNS.forEach(({ pattern, type }) => {
                const regex = new RegExp(pattern, 'g');
                if (regex.test(content)) {
                    // Extract line context
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (new RegExp(pattern).test(line)) {
                            // Filter out imports and comments
                            if (!line.trim().startsWith('import') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                                console.log(`[${type}] ${path.relative(process.cwd(), fullPath)}:${index + 1}`);
                                console.log(`   > ${line.trim().substring(0, 100)}`);
                            }
                        }
                    });
                }
            });
        }
    });
}

try {
    scanDirectory(path.join(process.cwd(), 'src/services'));
    console.log('\n✅ Scan Complete.');
} catch (e) {
    console.error('Scan failed:', e);
}
