import { toolOrchestrator } from '../services/tools/tool.orchestrator';
import prisma from '../lib/prisma';
import { SeederService } from '../services/seeder.service';

async function verify() {
    console.log('--- Starting Verification ---');

    // 1. Ensure Seed Data
    console.log('Seeding DB...');
    await SeederService.seed();

    // 2. Mock Context with Real User
    const user = await prisma.user.findUnique({ where: { email: 'guest@afs-tools.com' } });
    const userId = user?.id || 'test-user-id';

    const context = {
        userId: userId,
        ipAddress: '127.0.0.1',
        userAgent: 'TestScript/1.0'
    };

    // 3. Test Local Execution (PDF)
    console.log('\nTesting Local Strategy (html-to-pdf)...');
    try {
        // We expect this to fail if puppeteer is headless or inputs are mock, 
        // but we want to ensure it REACHES the PdfService.
        // Or we pass valid minimal HTML
        const result = await toolOrchestrator.executeTool('html-to-pdf', {
            html: '<h1>Hello World</h1>'
        }, context);
        console.log('Local PDF Success:', result instanceof Buffer ? 'Buffer received' : result);
    } catch (error: any) {
        console.error('Local PDF Error (Expected if Puppeteer issues):', error.message);
    }

    // 4. Test HTTP Execution (N8N Echo)
    console.log('\nTesting HTTP Strategy (n8n-echo-test)...');
    try {
        // This will likely fail with 404 or connection refused if the endpoint is fake, 
        // but we check if it TRIES to call axios.
        // We can't easily mock axios here without installing jest or similar, 
        // so we rely on the error message showing it tried the URL.
        await toolOrchestrator.executeTool('n8n-echo-test', {
            message: 'Hello N8N'
        }, context);
    } catch (error: any) {
        if (error.message.includes('n8n-echo-test') || error.message.includes('ECONNREFUSED')) {
            console.log('HTTP Strategy Correctly Attempted Request:', error.message);
        } else {
            console.error('HTTP Strategy Failed unexpectedly:', error);
        }
    }

    console.log('\n--- Verification Complete ---');
}

verify()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
