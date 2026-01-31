
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
import { serviceRegistry } from '../src/services/service-registry.service';
import prisma from '../src/lib/prisma';

async function listServices() {
    console.log('🔄 Loading Service Registry...');
    
    try {
        await serviceRegistry.loadServices();
        
        // Access private map if possible, or use public getter if available?
        // The class has `getService(slug)` but maybe not `getAll()`.
        // Let's check the code for `ServiceRegistry` again or just rely on DB + Manifests.
        
        // Actually, checking the file previously:
        // ServiceRegistry has `private services: Map<string, any> = new Map();`
        // It does NOT expose all services publicly via a getter.
        
        // Workaround: We query the DB, which is the Source of Truth for the Registry's list.
        const services = await prisma.service.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });

        console.log(`\n📋 Found ${services.length} Active Services:\n`);
        
        for (const s of services) {
            const manifest = serviceRegistry.getManifest(s.slug);
            const provider = serviceRegistry.getProvider(s.slug);
            
            console.log(`🔹 [${s.slug}] ${s.name}`);
            console.log(`   Description: ${s.description}`);
            console.log(`   Price: $${s.pricePerRequest}`);
            console.log(`   Source: ${manifest ? '✅ Code Manifest' : '📄 DB Only'}`);
            console.log(`   Provider: ${provider ? '⚡ Runtime Provider Loaded' : '⚠️ No Provider (Webhook Only)'}`);
            
            // Webhooks
            const config = s.config as any;
            if (config?.webhooks) {
                console.log(`   Webhooks: ${Object.keys(config.webhooks).join(', ')}`);
            }
            console.log('');
        }
        
    } catch (e) {
        console.error('Error:', e);
    }
}

listServices();
