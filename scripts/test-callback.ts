
import dotenv from 'dotenv';
import path from 'path';

// Specify environment file - using development by default
const envPath = path.resolve(__dirname, '../environments/.env.development');
dotenv.config({ path: envPath });

import { PrismaClient } from '@prisma/client';
import { RecoveryCallbackController } from '../src/controllers/recovery-callback.controller';
import { logger } from '../src/lib/logger';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Starting Recovery Callback Unit-Style Verification...');

    // 1. Setup Test Data
    const business = await prisma.business.findFirst({ include: { users: true } });
    if (!business || !business.users.length) {
        console.error('❌ No business or user found in DB. Please seed the database first.');
        return;
    }

    const businessId = business.id;
    const userId = business.users[0].id;
    const externalInvoiceId = 'test-inv-' + Math.random().toString(36).substring(7);

    console.log(`📍 Using Business: ${business.name} (${businessId})`);

    // Ensure a sequence exists
    let sequence = await prisma.dunningSequence.findFirst({ where: { businessId } });
    if (!sequence) {
        sequence = await prisma.dunningSequence.create({
            data: {
                businessId,
                name: 'Test Sequence',
                steps: []
            }
        });
    }

    // Create a Session
    const session = await prisma.recoverySession.create({
        data: {
            businessId,
            sequenceId: sequence.id,
            externalInvoiceId,
            status: 'ACTIVE',
            currentStepIndex: 0,
            metadata: { amount: 100 }
        }
    });

    // Create a DunningAction
    const action = await prisma.dunningAction.create({
        data: {
            businessId,
            sessionId: session.id,
            externalInvoiceId,
            actionType: 'email',
            status: 'queued'
        }
    });

    console.log(`✅ Test Action Created: ${action.id}`);

    // 2. Mock Request and Response
    const req = {
        body: {
            actionId: action.id,
            sessionId: session.id,
            businessId: businessId,
            status: 'success',
            aiCopy: 'This is a simulated AI-generated recovery email body.',
            metadata: {
                n8nExecutionId: 'exec_sim_123',
                deliveryStatus: 'delivered'
            }
        },
        headers: {},
        params: {},
        query: {}
    } as any;

    let resData: any;
    let resStatus: number = 200;

    const res = {
        status: (code: number) => {
            resStatus = code;
            return res;
        },
        json: (data: any) => {
            resData = data;
            return res;
        }
    } as any;

    // 3. Directly Invoke Controller
    console.log('🔗 Invoking RecoveryCallbackController.receiveRecoveryAction...');
    await RecoveryCallbackController.receiveRecoveryAction(req, res);

    // 4. Verify Results
    if (resStatus === 200 && resData.success) {
        console.log('✅ Controller responded successfully.');
        
        // Verify DB updates
        const updatedAction = await prisma.dunningAction.findUnique({
            where: { id: action.id }
        });

        if (updatedAction?.status === 'sent' && updatedAction.aiGeneratedCopy === req.body.aiCopy) {
            console.log('✅ Action successfully updated to SENT with AI copy.');
        } else {
            console.error('❌ Action DB update mismatch!', updatedAction);
        }

        const updatedSession = await prisma.recoverySession.findUnique({
            where: { id: session.id }
        });
        
        // updatedAt should be recent
        if (updatedSession && (new Date().getTime() - updatedSession.updatedAt.getTime()) < 10000) {
            console.log('✅ Session heartbeat updated.');
        } else {
            console.error('❌ Session heartbeat update failed.');
        }

        // Verify UsageLog
        const usageLog = await prisma.usageLog.findFirst({
            where: { action: 'recovery_callback', metadata: { contains: action.id } },
            orderBy: { createdAt: 'desc' }
        });

        if (usageLog) {
            console.log('✅ UsageLog entry found for follow-up callback.');
        } else {
            console.error('❌ UsageLog entry not found.');
        }

    } else {
        console.error(`❌ Controller failed with status ${resStatus}:`, resData);
    }

    // Cleanup (optional)
    // await prisma.dunningAction.delete({ where: { id: action.id } });
    // await prisma.recoverySession.delete({ where: { id: session.id } });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
