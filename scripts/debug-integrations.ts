import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
    const integrations = await prisma.integration.findMany({
        where: { provider: 'quickbooks' },
        include: { 
            business: { 
                include: { 
                    users: { where: { role: 'OWNER' }, take: 1 } 
                } 
            } 
        }
    });

    console.log('\n=== QBO Integrations ===');
    for (const i of integrations) {
        console.log({
            integrationId: i.id,
            businessId: i.businessId,
            businessName: i.business.name,
            ownerId: i.business.users[0]?.id,
            ownerEmail: i.business.users[0]?.email,
            realmId: (i.metadata as any)?.realmId
        });
    }

        // Check specific failing realmId
    const realmId = '9341456222209689';
    console.log(`\n🔍 Checking RealmID: ${realmId}`);

    const integration = await prisma.integration.findFirst({
        where: {
            provider: 'quickbooks',
            metadata: {
                path: ['realmId'],
                equals: realmId
            }
        },
        include: { 
            business: { 
                include: { 
                    users: {
                        select: { id: true, email: true, role: true }
                    } 
                } 
            } 
        }
    });

    if (!integration) {
        console.log('❌ Integration NOT FOUND for this realmId');
    } else {
        console.log('✅ Integration FOUND:');
        console.log(`   ID: ${integration.id}`);
        console.log(`   Provider: ${integration.provider}`);
        console.log(`   Business: ${integration.business.name} (${integration.businessId})`);
        console.log('   Users:');
        integration.business.users.forEach(u => {
            console.log(`     - ${u.email} (Start Role: ${u.role})`);
        });

        // Test the exact lookup logic used in WebhookController
        const ownerLookup = await prisma.integration.findFirst({
            where: {
                provider: 'quickbooks',
                metadata: {
                    path: ['realmId'],
                    equals: realmId
                }
            },
            include: { 
                business: { 
                    include: { 
                        users: { 
                            where: { role: 'OWNER' }, 
                            take: 1 
                        } 
                    } 
                } 
            }
        });
        
        console.log('\n🧪 WebhookController Lookup Test:');
        if (ownerLookup && ownerLookup.business.users.length > 0) {
            console.log(`   ✅ Success! Found user: ${ownerLookup.business.users[0].email}`);
        } else {
            console.log('   ❌ FAILED! No user found with role "OWNER"');
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
