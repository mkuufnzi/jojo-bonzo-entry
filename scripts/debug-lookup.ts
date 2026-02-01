import prisma from '../src/lib/prisma';

async function main() {
    console.log('🔍 Inspecting Integration 21ba903f-c2d1-4d33-aee6-17c96bed3e85 (Floovioo 2)');

    const integration = await prisma.integration.findUnique({
        where: { id: '21ba903f-c2d1-4d33-aee6-17c96bed3e85' },
        include: { 
            business: { 
                include: { 
                    users: true // Get ALL users to check roles
                } 
            } 
        }
    });

    if (!integration) {
        console.log('❌ Integration not found!');
        return;
    }

    console.log(`✅ Integration Found:`);
    console.log(`   Provider (DB): '${integration.provider}'`);
    console.log(`   RealmId (Meta): ${(integration.metadata as any)?.realmId}`);
    
    console.log('   Users:');
    for (const u of integration.business.users) {
        console.log(`     - ID: ${u.id}`);
        console.log(`       Email: ${u.email}`);
        console.log(`       Role: '${u.role}'`);
    }

    console.log('\n🧪 Testing Webhook Lookup Query:');
    
    // Test exact query from controller
    const lookup = await prisma.integration.findFirst({
        where: { 
            provider: 'quickbooks', 
            metadata: {
                path: ['realmId'], 
                equals: '9341456222209689'
            }
        },
        include: { business: { include: { users: { where: { role: { in: ['OWNER', 'ROOT', 'ADMIN'] } }, take: 1 } } } }
    });

    if (lookup) {
        console.log('   ✅ Lookup SUCCESS!');
        console.log(`   Found User: ${lookup.business.users[0]?.email}`);
    } else {
        console.log('   ❌ Lookup FAILED!');
    }


    await prisma.$disconnect();
}

main().catch(console.error);
