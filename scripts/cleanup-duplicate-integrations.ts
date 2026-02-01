/**
 * Cleanup Duplicate Integrations Script
 * 
 * This script finds integrations with duplicate realmIds (same QB account connected 
 * to multiple businesses) and removes all but the most recent one.
 * 
 * Usage: npx dotenv -e .env.development -- ts-node scripts/cleanup-duplicate-integrations.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface IntegrationWithRealm {
    id: string;
    businessId: string;
    provider: string;
    createdAt: Date;
    realmId: string | null;
    businessName: string;
}

async function findDuplicates(): Promise<Map<string, IntegrationWithRealm[]>> {
    // Find all QBO integrations (handle both normalized and legacy names)
    const integrations = await prisma.integration.findMany({
        where: { provider: 'quickbooks' },
        include: { business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
    });

    // Group by realmId
    const byRealm = new Map<string, IntegrationWithRealm[]>();
    
    console.log(`Scanning ${integrations.length} integrations for duplicates...`);

    for (const i of integrations) {
        const meta = i.metadata as any;
        // Check both possible locations for realmId
        const realmId = meta?.realmId || meta?.companyId || (meta?.rawData?.realmId); 
        
        // Debug Log
        // console.log(`[DEBUG] Integration ${i.id.substring(0,8)}: realmId=${realmId} (Provider: ${i.provider})`);

        if (!realmId) {
            console.log(`[WARN] Integration ${i.id} has no realmId in metadata. Metadata keys: ${Object.keys(meta || {})}`);
            continue;
        }
        
        const entry: IntegrationWithRealm = {
            id: i.id,
            businessId: i.businessId,
            provider: i.provider,
            createdAt: i.createdAt,
            realmId,
            businessName: i.business.name
        };

        if (!byRealm.has(realmId)) {
            byRealm.set(realmId, []);
        }
        byRealm.get(realmId)!.push(entry);
    }

    // Filter to only duplicates
    const duplicates = new Map<string, IntegrationWithRealm[]>();
    for (const [realmId, integrations] of byRealm) {
        if (integrations.length > 1) {
            duplicates.set(realmId, integrations);
        }
    }

    return duplicates;
}

async function cleanupDuplicates(dryRun: boolean = true) {
    console.log('\n🔍 Finding duplicate integrations...\n');
    
    const duplicates = await findDuplicates();

    if (duplicates.size === 0) {
        console.log('✅ No duplicate integrations found!');
        return;
    }

    console.log(`Found ${duplicates.size} realmId(s) with multiple integrations:\n`);

    for (const [realmId, integrations] of duplicates) {
        console.log(`═══════════════════════════════════════════════════════`);
        console.log(`  RealmId: ${realmId}`);
        console.log(`  Duplicates: ${integrations.length}`);
        console.log(`───────────────────────────────────────────────────────`);
        
        // Sort by createdAt desc - first one is the keeper
        integrations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        for (let i = 0; i < integrations.length; i++) {
            const int = integrations[i];
            const status = i === 0 ? '✅ KEEP (most recent)' : '❌ DELETE';
            console.log(`  ${status}`);
            console.log(`    ID:       ${int.id}`);
            console.log(`    Business: ${int.businessName} (${int.businessId})`);
            console.log(`    Created:  ${int.createdAt.toISOString()}`);
            console.log('');
        }
    }

    if (dryRun) {
        console.log('\n⚠️  DRY RUN - No changes made. Run with --confirm to delete duplicates.\n');
        return;
    }

    // Actually delete duplicates
    console.log('\n🗑️  Deleting duplicate integrations...\n');
    
    let deleted = 0;
    for (const [realmId, integrations] of duplicates) {
        // Skip the first one (most recent), delete the rest
        const toDelete = integrations.slice(1);
        
        for (const int of toDelete) {
            // Also delete related ExternalDocuments
            await prisma.externalDocument.deleteMany({
                where: { integrationId: int.id }
            });
            
            await prisma.integration.delete({
                where: { id: int.id }
            });
            
            console.log(`  ✅ Deleted: ${int.id} (${int.businessName})`);
            deleted++;
        }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deleted} duplicate integration(s).\n`);
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--confirm');

    try {
        await cleanupDuplicates(dryRun);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
