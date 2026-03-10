import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../environments/.env.development') });
import { logger } from '../src/lib/logger';
import prisma from '../src/lib/prisma';
import { templateGenerator } from '../src/services/template-generator.service';
import fs from 'fs';

async function test() {
    console.log('🧪 [Test] Simulating RECOVERY_EMAIL_DISPATCH Preview with Unified Rendering...');
    
    const businessId = '352adaa0-29ce-4ae9-840f-2b646fe6a483';
    const userId = '1c766e40-dc57-4180-874b-577881c1ced5';

    try {
        // 0. Ensure Branding Profile exists for this user/business
        await (prisma as any).brandingProfile.upsert({
            where: { businessId },
            update: { isDefault: true, activeTemplateId: 'smart_invoice_v1' },
            create: {
                userId,
                businessId,
                isDefault: true,
                activeTemplateId: 'smart_invoice_v1',
                companyName: 'Floovioo Test Biz',
                brandColors: { primary: '#6366F1', secondary: '#8B5CF6', accent: '#C4B5FD' },
                components: {
                    layoutOrder: ['header', 'customer_info', 'line_items', 'totals', 'footer']
                }
            }
        });

        // 1. Mock Payload (Recovery Batch)
        const payload = {
            batchMode: true,
            customerName: 'Test Batch Customer',
            customerEmail: 'test@example.com',
            totalAmount: 'USD 122.31',
            invoices: [
                { invoiceNumber: 'INV-001', amount: '42.32', stepName: 'Initial Reminder', img: '📦' },
                { invoiceNumber: 'INV-002', amount: '79.99', stepName: 'Follow-up', img: '✨' }
            ],
            normalizedEventType: 'RECOVERY_EMAIL_DISPATCH',
            smartContent: {
                recommendations: [
                    { id: 'uuid-rec-1', name: 'Emoji Product', price: 10, img: '🍵', reason: 'High Quality', match: 94 },
                    { id: 'uuid-rec-2', name: 'Image Product', price: 20, img: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7', reason: 'Best Seller', match: 88 }
                ],
                nurtureMessages: [
                    { icon: '✨', headline: 'VIP Loyalty', body: 'You are our best customer!' }
                ]
            }
        };

        const html = await templateGenerator.generateHtml(userId, businessId, 'INVOICE', payload, 'test-nonce');
        const outputPath = path.join(process.cwd(), 'tmp/test_output.html');
        fs.writeFileSync(outputPath, html);
        console.log(`✅ [Test] Preview generated: ${outputPath}`);
        
        // 2. Automated Checks for Unified Rendering
        const hasMatcha = html.includes('🍵');
        const hasBox = html.includes('📦');
        const hasSparkles = html.includes('✨');
        const hasRealImg = html.includes('src="https://images.unsplash.com/photo-1515823064-d6e0c04616a7"');
        const hasUuidQuoted = html.includes('uuid-rec-1');

        console.log(`🔍 [Check] Matcha Emoji found: ${hasMatcha}`);
        console.log(`🔍 [Check] Box Emoji found: ${hasBox}`);
        console.log(`🔍 [Check] Sparkles Emoji found: ${hasSparkles}`);
        console.log(`🔍 [Check] Real Image found: ${hasRealImg}`);
        console.log(`🔍 [Check] UUID in Alpine logic: ${hasUuidQuoted}`);

        if (hasMatcha && hasBox && hasSparkles && hasRealImg) {
            console.log('✨ [Success] Unified rendering (Emojis + Images) verified in HTML output!');
        } else {
            console.error('❌ [Failure] Rendering inconsistencies detected.');
        }

    } catch (e: any) {
        console.error('❌ [Test] Generation failed:', e.stack || e.message);
    }
}

test();
