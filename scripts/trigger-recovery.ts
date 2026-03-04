
import dotenv from 'dotenv';
import path from 'path';

// Specify environment file - using development by default
const envPath = path.resolve(__dirname, '../environments/.env.development');
dotenv.config({ path: envPath });

import { PrismaClient } from '@prisma/client';
import { RecoveryService } from '../src/modules/transactional/recovery/recovery.service';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();
const recoveryService = new RecoveryService();

async function main() {
    console.log('🚀 Starting Smart Recovery Manual Trigger...');

    // 1. Identify a Target Business (or create a dummy one if safe)
    // For safety, we will list businesses and ask to hardcode one, or pick the first one with a user.
    // 2. Target Business
    // For manual trigger, we strongly suggest using a known ID or the first one found.
    // const business = await prisma.business.findFirst({ include: { users: true } });
    const businessId = '726496ca-c4e9-4f37-9a9f-649721ac64da'; // Hardcoded for this test session
    
    logger.info(`🚀 Triggering Smart Recovery for Business: ${businessId}`);

    // 1. Mock an Overdue Invoice (Data normally comes from QBO)
    const mockInvoice = {
        id: 'mock-inv-001', // Internal ID
        externalId: '137',  // QBO ID
        docNumber: '1037',
        total: 1500.00,
        balance: 1500.00,
        dueDate: '2023-01-01', // Very overdue
        currency: 'USD',
        contactName: 'Test Customer',
        rawData: {
            CustomerRef: {
                value: '1', // QBO Customer ID
                name: 'Test Customer'
            }
        }
    };

    logger.info(`📝 Mocking Invoice: ${mockInvoice.docNumber}`);

    // 2. Sync Overdue Invoices (Creates Session)
    // The service expects an array of invoices
    // It will check for existing sessions and create new ones if needed
    await recoveryService.syncOverdueInvoices(businessId, [mockInvoice]);

    // 3. Trigger Action Processing
    await recoveryService.processBusinessOverdues(businessId);

    // 4. Verify Session Created
    const session = await prisma.recoverySession.findFirst({
        where: {
            businessId,
            externalInvoiceId: mockInvoice.externalId
        },
        include: {
            actions: true
        }
    });

    if (session) {
        logger.info('✅ Recovery Session Found:');
        logger.info(`   - ID: ${session.id}`);
        logger.info(`   - Status: ${session.status}`);
        logger.info(`   - Step: ${session.currentStepIndex}`);
        logger.info(`   - Next Action: ${session.nextActionAt}`);

        if (session.actions.length > 0) {
            logger.info(`✅ ${session.actions.length} Actions Generated:`);
            session.actions.forEach(action => {
                logger.info(`   - [${action.actionType}] Status: ${action.status} (ID: ${action.id})`);
            });
        } else {
            logger.warn('⚠️ No actions found yet (Worker might be processing)');
        }
    } else {
        logger.error('❌ Failed to create recovery session');
    }

    console.log('\n🏁 Test Complete. Check your n8n dashboard for the webhook hit!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
