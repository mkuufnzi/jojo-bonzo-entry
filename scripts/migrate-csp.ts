
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Migration Script: Add CSP Nonce to EJS Templates
 * 
 * Usage: ts-node scripts/migrate-csp.ts
 */

const VIEWS_DIR = path.join(__dirname, '../src/views');

async function main() {
    console.log(`🔍 Scanning ${VIEWS_DIR} for EJS files...`);
    
    // Find all EJS files
    const files = await glob('**/*.ejs', { cwd: VIEWS_DIR, absolute: true });
    console.log(`Found ${files.length} EJS files.`);

    let modifiedCount = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let originalContent = content;

        // 1. Add nonce to <script> tags that don't have it
        // Avoid replacing <script src="..."> if it already has nonce
        // Regex: <script (attributes)> -> check if nonce present -> add it
        
        // We use a Replacer function
        content = content.replace(/<script(\s+[^>]*)?>/gi, (match, attrs) => {
            if (match.includes('nonce=')) return match; // Already migrated
            
            if (!attrs) return '<script nonce="<%= nonce %>">';
            return `<script${attrs} nonce="<%= nonce %>">`;
        });

        // 2. Add nonce to <style> tags
        content = content.replace(/<style(\s+[^>]*)?>/gi, (match, attrs) => {
            if (match.includes('nonce=')) return match;
            
            if (!attrs) return '<style nonce="<%= nonce %>">';
            return `<style${attrs} nonce="<%= nonce %>">`;
        });
        
        // 3. (Optional) Report inline styles for manual review?
        // We won't auto-fix style="..." because it's context dependent.
        // But we can log them.
        const inlineStyles = content.match(/style=["'][^"']*["']/gi);
        if (inlineStyles && !file.includes('admin')) { // Skip admin for noise reduction if needed
             // console.log(`   ⚠️  Inline styles in ${path.basename(file)}: ${inlineStyles.length}`);
        }

        if (content !== originalContent) {
            fs.writeFileSync(file, content, 'utf-8');
            console.log(`   ✅ Updated: ${path.relative(VIEWS_DIR, file)}`);
            modifiedCount++;
        }
    }

    console.log(`\n🎉 Migration Complete. Modified ${modifiedCount} files.`);
}

main().catch(console.error);
