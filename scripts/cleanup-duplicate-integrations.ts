
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting Integration Cleanup...');

    // 1. Identify the 'Primary' business we want to keep (the one with workflows)
    const targetBusinessId = '1a98aaf1-9c92-4d1f-b854-3da8899a310f';
    const provider = 'quickbooks';
    const realmIdStr = '9341456222209689';

    // 2. Find all integrations for this Realm ID
    const allRecords = await prisma.integration.findMany({
        where: { provider }
    });

    const duplicates = allRecords.filter(r => {
        const meta = r.metadata as any;
        return meta?.realmId === realmIdStr && r.businessId !== targetBusinessId;
    });

    console.log(`🔍 Found ${duplicates.length} duplicate records to remove (not belonging to business ${targetBusinessId})`);

    for (const dup of duplicates) {
        console.log(`🗑️ Deleting duplicate: ${dup.id} (Business: ${dup.businessId})`);
        await prisma.integration.delete({ where: { id: dup.id } });
    }

    // 3. Ensure no record exists with provider='qbo' (internal normalization check)
    // In our DB, they seem to be stored as 'quickbooks'
    const qboAliased = await prisma.integration.deleteMany({
        where: { provider: 'qbo' }
    });
    if (qboAliased.count > 0) {
        console.log(`🧹 Cleaned up ${qboAliased.count} records with 'qbo' provider string.`);
    }

    console.log('✅ Cleanup complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
