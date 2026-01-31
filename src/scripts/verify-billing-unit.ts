import { pdfService } from '../services/pdf.service';
import { AppError } from '../lib/AppError';

// Mock Dependencies
const mockServiceRepo = {
    findBySlug: async (slug: string) => {
        return { id: 'service_123', slug: 'html-to-pdf' };
    }
};

const mockAppRepo = {
    findAppService: async (appId: string, serviceId: string) => {
        if (appId === 'valid_app_id') {
            return { 
                app: { userId: 'user_123' },
                isEnabled: true 
            };
        }
        return null;
    },
    findFirstConnectedApp: async () => null // Should not be called in new logic
};

// Patch Service
(pdfService as any).serviceRepository = mockServiceRepo;
(pdfService as any).appRepository = mockAppRepo;

async function main() {
    console.log('🧪 Starting Unit Test: PdfService Strict Billing');

    // Test 1: No App ID
    try {
        console.log('Test 1: Call without App ID...');
        await pdfService.processPdfRequestSync('user_123', undefined as any, { html: 'test' }, '127.0.0.1');
        console.error('❌ FAIL: Should have thrown error');
        process.exit(1);
    } catch (e: any) {
        if (e.message.includes('App Context (appId) is required')) {
            console.log('✅ PASS: Caught Missing App ID Error');
        } else {
            console.error('❌ FAIL: Wrong error message:', e.message);
            process.exit(1);
        }
    }

    // Test 2: Valid App ID
    try {
        console.log('Test 2: Call with Valid App ID...');
        // We expect it to try generating PDF (and fail at Puppeteer step or Queue, which is fine)
        // or getting past the Guard.
        // We just want to ensure it DOES NOT throw the App Context error.
        
        // Mock Puppeteer generation to avoid error?
        (pdfService as any).generatePdf = async () => Buffer.from('mock pdf');
        (pdfService as any).logRepository = { createUsageLog: async () => {} };

        await pdfService.processPdfRequestSync('user_123', 'valid_app_id', { 
            html: '<h1>test</h1>', 
            format: 'A4' 
        }, '127.0.0.1');
        
        console.log('✅ PASS: Valid App ID accepted');
    } catch (e: any) {
        console.error('❌ FAIL: Valid request failed:', e);
        process.exit(1);
    }

    console.log('🏆 ALL UNIT TESTS PASSED');
}

main();
