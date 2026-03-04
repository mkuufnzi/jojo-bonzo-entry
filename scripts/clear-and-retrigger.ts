import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../environments/.env.development') });

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Clearing Recovery Engine Queue...');
    const queue = new Queue('recovery-engine', { connection: { host: '127.0.0.1', port: 6379 } });

    await queue.drain(true);
    await queue.clean(0, 1000, 'failed');
    await queue.clean(0, 1000, 'completed');
    console.log('✅ Queue Cleared.');

    const businessId = '726496ca-c4e9-4f37-9a9f-649721ac64da';
    
    // 1. Reset all sessions to ACTIVE for this test
    console.log('🔄 Resetting sessions and actions for test...');
    await (prisma as any).debtCollectionSession.updateMany({
        where: { businessId },
        data: { 
            status: 'ACTIVE',
            nextActionAt: new Date() // Force it to be DUE
        }
    });

    await (prisma as any).debtCollectionAction.deleteMany({
        where: { businessId, status: 'FAILED' }
    });

    // 2. Add Trigger Jobs
    console.log('🚀 Triggering full sync and processing business...');
    
    // Process business overdues (this will find active sessions where nextActionAt <= NOW and queue recovery:execute)
    await queue.add('recovery:process-business', { businessId }, { jobId: `test_pb_${Date.now()}` });

    console.log('🎯 Jobs Added. Monitor worker logs.');
    await queue.close();
    await prisma.$disconnect();
}

main().catch(console.error);
