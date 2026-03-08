import prisma from '../lib/prisma';
import { UnifiedDataService } from '../modules/unified-data/unified-data.service';
import { logger } from '../lib/logger';

/**
 * Verification Script: Trigger Unified Hub Orchestrator
 * 
 * This script manually invokes the orchestrator to ensure it correctly 
 * identifies businesses with connected integrations and queues sync jobs.
 */
async function verifyOrchestrator() {
    console.log('--- Unified Sync Orchestrator Verification ---');
    
    try {
        // 1. Check if there are any connected integrations
        const count = await prisma.integration.count({
            where: { status: 'connected' }
        });
        
        console.log(`Checking Database... Found ${count} connected integrations.`);
        
        if (count === 0) {
            console.warn('⚠️ No connected integrations found. Consider creating one via seed or dashboard before running this.');
            // We can still try to run it to see if it gracefully skips
        }

        // 2. Trigger Orchestrator
        console.log('Triggering Unified Hub Orchestrator...');
        const result = await UnifiedDataService.orchestrate();
        
        console.log('Orchestrator Result:', JSON.stringify(result, null, 2));

        if (result.queued > 0) {
            console.log('✅ Successfully queued jobs. Check BullMQ logs or Redis to confirm.');
        } else if (count > 0) {
            console.error('❌ Expected to queue jobs but none were queued.');
        } else {
            console.log('ℹ️ No jobs queued as expected (zero connected integrations).');
        }

    } catch (error: any) {
        console.error('❌ Verification failed:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

verifyOrchestrator();
