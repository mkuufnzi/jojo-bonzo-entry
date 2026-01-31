import prisma from '../src/lib/prisma';

async function main() {
    console.log('🔄 Syncing Apps with Service Registry...');

    // 1. Fetch ALL Active Services
    const services = await prisma.service.findMany({
        where: { isActive: true }
    });
    console.log(`📋 Found ${services.length} active services.`);

    // 2. Fetch ALL Apps
    const apps = await prisma.app.findMany();
    console.log(`📦 Found ${apps.length} apps.`);

    let totalLinked = 0;

    for (const app of apps) {
        for (const service of services) {
            try {
                // Upsert to ensure link exists
                await prisma.appService.upsert({
                    where: {
                        appId_serviceId: {
                            appId: app.id,
                            serviceId: service.id
                        }
                    },
                    update: {
                        // Don't auto-enable if it was explicitly disabled, mostly just ensure existence
                        // For this repair, we force enable new ones or ensure record exists
                    },
                    create: {
                        appId: app.id,
                        serviceId: service.id,
                        isEnabled: true // Auto-enable new services for existing apps
                    }
                });
                totalLinked++;
            } catch (error) {
                console.error(`❌ Failed to link ${app.name} -> ${service.name}`, error);
            }
        }
    }

    console.log(`✅ Sync Complete. Verified/Linked ${totalLinked} connections.`);
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
