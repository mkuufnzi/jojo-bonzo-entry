import { PrismaClient } from '@prisma/client';
import { RecoveryService } from '../src/modules/recovery/recovery.service';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../environments/.env.development') });

const prisma = new PrismaClient() as any;

async function runInstantTestLoop() {
    console.log('🧪 Starting "Test Instant" Rapid Fire Loop...');

    const customer = await prisma.debtCollectionCustomer.findFirst({
        where: { unpaidInvoices: { gt: 0 } },
        include: { business: true }
    });

    if (!customer) {
        console.error('❌ No customers found with unpaid invoices.');
        return;
    }

    const businessId = customer.businessId;
    console.log(`🎯 Targeting Business: ${businessId}, Customer: ${customer.name}`);

    // Create a 100-step instantaneous sequence
    const existingSeq = await prisma.debtCollectionSequence.findFirst({
        where: { businessId, name: 'Test Instant' }
    });

    let seqId = existingSeq?.id;

    if (!existingSeq) {
        console.log('📝 Creating "Test Instant" sequence with 100 0-day steps...');
        const template = await prisma.debtCollectionMessageTemplate.findFirst({ where: { businessId } });
        
        const steps = Array.from({ length: 100 }, (_, i) => ({
            dayOffset: 0, 
            actionType: 'email',
            escalationLevel: i < 33 ? 1 : i < 66 ? 2 : 3,
            templateId: template?.id || null
        }));

        const seq = await prisma.debtCollectionSequence.create({
            data: {
                businessId, name: 'Test Instant', isActive: true, isDefault: true,
                steps: JSON.stringify(steps),
                debtCollectionSequenceSteps: { create: steps }
            }
        });
        seqId = seq.id;
        
        // Disable other sequences
        await prisma.debtCollectionSequence.updateMany({
            where: { businessId, NOT: { id: seq.id } },
            data: { isDefault: false, isActive: false }
        });
    } else {
        console.log('✅ "Test Instant" sequence already exists.');
    }

    // Link customer to this sequence if not already
    await prisma.debtCollectionSession.updateMany({
        where: { customerId: customer.id, status: 'ACTIVE' },
        data: { sequenceId: seqId }
    });

    console.log('💥 RAPID FIRE ACTIVE: Triggering webhooks every 10 seconds. Press Ctrl+C to stop.');

    const service = new RecoveryService();
    let count = 0;

    setInterval(async () => {
        try {
            count++;
            console.log(`\n▶️ RUN ${count} @ ${new Date().toISOString()}`);

            // Force all ACTIVE sessions for this business to be DUE NOW
            await prisma.debtCollectionSession.updateMany({
                where: { businessId, status: 'ACTIVE' },
                data: { nextActionAt: new Date(Date.now() - 1000) }
            });

            // Process business overdues (which dispatches action to n8n)
            await service.processBusinessOverdues(businessId);
            
            console.log(`✅ Run ${count} webhooks dispatched. Waiting 10s...`);
        } catch (err: any) {
            console.error(`❌ Error in run ${count}:`, err.message);
        }
    }, 10000); // 10 seconds
}

runInstantTestLoop().catch(console.error);
