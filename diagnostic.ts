import prisma from './src/lib/prisma';

async function diagnoseLogs() {
    console.log('--- USAGE LOG DIAGNOSTIC ---');

    // 1. Get all logs
    const allLogs = await prisma.usageLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { service: true, app: true }
    });

    console.log(`Total Logs in DB: ${await prisma.usageLog.count()}`);
    
    allLogs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}] ID: ${log.id}`);
        console.log(`  User: ${log.userId}`);
        console.log(`  App: ${log.appId} (${log.app?.name || 'N/A'})`);
        console.log(`  Service: ${log.serviceId} (${log.service?.slug || 'N/A'})`);
        console.log(`  Action: ${log.action}`);
        console.log(`  Status: ${log.status}`);
        console.log(`  Cost: ${log.cost}`);
        console.log('---------------------------');
    });

    // 2. Check for logs missing serviceId or userId
    const missingService = await prisma.usageLog.count({ where: { serviceId: null } });
    const missingUser = await prisma.usageLog.count({ where: { userId: null } });

    console.log(`Logs missing ServiceId: ${missingService}`);
    console.log(`Logs missing UserId: ${missingUser}`);

    // 3. Search for a specific user if provided (hardcoding some IDs from previous context if possible, or just skip)
    // No specific user ID known, but we can look for the most active user.
    const activeUser = await prisma.usageLog.groupBy({
        by: ['userId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1
    });

    if (activeUser.length > 0 && activeUser[0].userId) {
        const uid = activeUser[0].userId;
        console.log(`Inspecting active user: ${uid}`);
        
        const userLogs = await prisma.usageLog.findMany({
            where: { userId: uid },
            take: 5,
            include: { service: true }
        });

        userLogs.forEach(log => {
            console.log(`- Action: ${log.action}, Service: ${log.service?.slug}, CreatedAt: ${log.createdAt}`);
        });
    }
}

diagnoseLogs().catch(console.error);
