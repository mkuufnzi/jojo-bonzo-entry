import prisma from '../lib/prisma';

async function main() {
    const email = 'bwj.afs.tools.test@gmail.com';
    const slug = 'html-to-pdf';

    console.log(`\n\n--- Debugging Access for ${email} -> ${slug} ---`);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { subscription: true }
    });

    if (!user) {
        console.log('❌ User not found.');
        return;
    }
    console.log(`User found: ${user.id}`);
    console.log(`Subscription Status: ${user.subscription?.status || 'None'}`);

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) {
        console.log('❌ Service not found.');
        return;
    }
    console.log(`Service found: ${service.name} (Restricted: ${!!(service as any).requiredFeatureKey})`);

    // Check App Linkage
    const apps = await prisma.app.findMany({
        where: {
            userId: user.id,
            services: {
                some: {
                    serviceId: service.id
                }
            }
        },
        include: {
            services: {
                where: { serviceId: service.id }
            }
        }
    });

    console.log(`\nFound ${apps.length} Apps owned by user with this service linked:`);
    let hasEnabledApp = false;
    
    apps.forEach(app => {
        const link = app.services[0];
        console.log(`- App: "${app.name}" (ID: ${app.id})`);
        console.log(`  -> Link Enabled: ${link.isEnabled}`);
        if (link.isEnabled && app.isActive) hasEnabledApp = true;
        if (!app.isActive) console.log(`  -> ⚠️ App itself is DISABLED`);
    });

    console.log('\n--- FINAL VERDICT ---');
    const hasValidSub = ['active', 'canceling'].includes(user.subscription?.status || '');
    
    if (hasValidSub && hasEnabledApp) {
        console.log('✅ ACCESS GRANTED');
        console.log('Why? User has an Active Subscription AND at least one Active App with this Service enabled.');
        console.log('Client Logic: If they use the App ID of the working app, it will pass.');
    } else {
        console.log('❌ ACCESS DENIED');
        if (!hasValidSub) console.log('Reason: Subscription is not active.');
        if (!hasEnabledApp) console.log('Reason: No Apps have this service enabled (or Apps are disabled).');
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
