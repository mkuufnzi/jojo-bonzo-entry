import { templateRegistry } from '../services/template-registry.service';
import { BrandingController } from '../controllers/branding.controller';
import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import path from 'path';
import ejs from 'ejs';

async function verifyAllPreviews() {
    console.log('🚀 Starting Preview Verification...');
    
    // Set logger to SILENT to avoid overwhelming output from app
    logger.level = 'silent';

    const templates = templateRegistry.getAll();
    console.log(`Found ${templates.length} templates.`);

    const results: { id: string, success: boolean, error?: string }[] = [];

    for (const template of templates) {
        console.log(`\n--- Testing Template: ${template.name} (${template.id}) ---`);
        
        const req = {
            method: 'GET',
            query: { templateId: template.id },
            session: { userId: 'clzbz3z5r00003b6tq5f5q5f5' }
        } as unknown as Request;

        let resSuccess = false;
        let resError = '';

        const res = {
            status: (code: number) => ({
                send: (msg: string) => {
                    resSuccess = code === 200;
                    resError = msg;
                    console.log(`[${template.id}] Result: ${code} - ${msg.substring(0, 100)}...`);
                },
                json: (data: any) => {
                    resSuccess = code === 200;
                    console.log(`[${template.id}] Result: ${code} - JSON`);
                }
            }),
            send: (msg: string) => {
                resSuccess = true;
                console.log(`[${template.id}] Result: 200 - SUCCESS (Length: ${msg.length})`);
                if (msg.includes('item is not defined')) {
                    console.error(`❌ [${template.id}] ERROR: 'item is not defined' found in output!`);
                    resSuccess = false;
                    resError = 'item is not defined';
                }
            },
            render: (view: string, options: any, callback: (err: any, str: string) => void) => {
                const viewsDir = path.join(process.cwd(), 'src/views');
                const viewPath = path.join(viewsDir, view + '.ejs');
                
                // Add common helpers that ejs-mate or express might add
                options.filename = viewPath; 
                options.root = viewsDir; // Ensure absolute includes work
                options.views = [viewsDir]; // Ensure relative includes find other views
                options.layout = (l: string) => {}; 
                options.block = (name: string) => ({ append: () => {}, prepend: () => {} }); 
                
                ejs.renderFile(viewPath, options, (err, str) => {
                    if (err) {
                        console.error(`[${template.id}] EJS Error:`, err.message);
                        callback(err, '');
                    } else {
                        callback(null, str || '');
                    }
                });
            },
            locals: { nonce: 'test-nonce' }
        } as unknown as Response;

        try {
            await BrandingController.getPreview(req, res);
            results.push({ id: template.id, success: resSuccess, error: resError });
        } catch (error: any) {
            console.error(`❌ [${template.id}] Preview Generation Failed: ${error.message}`);
            results.push({ id: template.id, success: false, error: error.message });
        }
    }

    console.log('\n=========================================');
    console.log('         VERIFICATION SUMMARY           ');
    console.log('=========================================');
    results.forEach(r => {
        const icon = r.success ? '✅' : '❌';
        console.log(`${icon} ${r.id.padEnd(30)}: ${r.success ? 'PASS' : 'FAIL'} ${r.error ? '(' + r.error.substring(0, 50) + ')' : ''}`);
    });

    const allPassed = results.every(r => r.success);
    if (allPassed) {
        console.log('\n🔥 ALL PREVIEWS PASSING!');
        process.exit(0);
    } else {
        console.log('\n⚠️ SOME PREVIEWS FAILED.');
        process.exit(1);
    }
}

// Note: This script needs a database/mock to run BrandingController.getPreview correctly.
// Since getPreview calls brandingService.getProfile(userId), it might fail if DB is not ready.
// I'll wrap it in a try-catch and just run it via ts-node.
verifyAllPreviews().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
