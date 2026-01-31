import { PrismaClient } from '@prisma/client';
import { designEngineService } from '../src/services/design-engine.service';
import { logger } from '../src/lib/logger';

async function testSync() {
    logger.info('🚀 Starting n8n Sync Verification Test...');
    
    // We'll use a placeholder user ID (non-existent) or a real one if available
    const testUserId = '00000000-0000-0000-0000-000000000000'; // Placeholder UUID
    
    try {
        logger.info('Testing syncBusinessProfile with placeholder ID...');
        // This will attempt to fetch a user, which will return null, 
        // but it shouldn't crash on validation if we pass 'unknown' during the wrap.
        // Wait, syncBusinessProfile fetches the user from DB. 
        // Let's mock a context or test the underlying factory.
        
        const { n8nPayloadFactory } = await import('../src/services/n8n/n8n-payload.factory');
        const context = {
            serviceId: 'transactional-branding',
            appId: 'system',
            requestId: 'test-req-123'
        };
        
        logger.info('Testing N8nPayloadFactory._wrap with "unknown" service_tenant_id...');
        const payload = (n8nPayloadFactory as any)._wrap(
            'test_event', 
            { hello: 'world' }, 
            'df8b5555-5555-4444-a999-999999999999', // Valid User UUID
            { ...context, serviceTenantId: 'unknown' }
        );
        
        logger.info({ payload }, '✅ Payload Wrapped Successfully');
        
        logger.info('Testing N8nPayloadFactory._wrap with "unknown" floovioo_id (should now work)...');
        // Actually the change to validateUuid allows 'unknown'
        const payload2 = (n8nPayloadFactory as any)._wrap(
            'test_event_2', 
            { foo: 'bar' }, 
            'unknown', 
            context
        );
        logger.info({ payload: payload2 }, '✅ Payload with "unknown" ID Wrapped Successfully');

    } catch (error: any) {
        logger.error({ err: error.message }, '❌ Sync Verification Failed');
        process.exit(1);
    }
}

testSync().catch(console.error);
