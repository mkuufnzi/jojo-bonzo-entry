import { RecoveryService } from './src/modules/recovery/recovery.service';
import prisma from './src/lib/prisma';

async function test() {
    const s = new RecoveryService();
    const user = await prisma.user.findFirst({ where: { businessId: { not: null } } });
    if (!user || !user.businessId) {
        console.log("No business found");
        process.exit(0);
    }
    const stats = await s.getStatus(user.businessId);
    console.log('Recovery Metrics:', stats);
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
