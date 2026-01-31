import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Prune Logs Script
 * 
 * Usage: npm run db:prune
 * 
 * Deletes UsageLogs and AdminLogs older than X days to prevent database bloat.
 * Recommended schedule: Daily or Weekly via Cron.
 */

async function main() {
    console.log('🧹 Starting Database Pruning...');

    const RETENTION_DAYS = 90;
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - RETENTION_DAYS);

    console.log(`   Threshold: ${dateThreshold.toISOString()} (${RETENTION_DAYS} days retention)`);

    // 1. Prune UsageLogs (High Volume)
    // We do this in batches if possible, but Prisma deleteMany is usually efficient enough for <1M rows.
    // If table is huge, this might lock.
    
    try {
        const deletedUsage = await prisma.usageLog.deleteMany({
            where: {
                createdAt: {
                    lt: dateThreshold
                }
            }
        });
        console.log(`   ✅ Deleted ${deletedUsage.count} old Usage Logs.`);
    } catch (e: any) {
        console.error('   ❌ Failed to prune Usage Logs:', e.message);
    }

    // 2. Prune AdminLogs (Optional, lower volume but good hygiene)
    try {
         const deletedAdmin = await prisma.adminLog.deleteMany({
            where: {
                createdAt: {
                    lt: dateThreshold
                }
            }
        });
        console.log(`   ✅ Deleted ${deletedAdmin.count} old Admin Logs.`);
    } catch (e: any) {
         console.error('   ❌ Failed to prune Admin Logs:', e.message);
    }
    
    // 3. Prune old LoginHistory (Security/Audit)
    try {
         const deletedLogin = await prisma.loginHistory.deleteMany({
            where: {
                createdAt: {
                    lt: dateThreshold
                }
            }
        });
        console.log(`   ✅ Deleted ${deletedLogin.count} old Login History records.`);
    } catch (e: any) {
         console.error('   ❌ Failed to prune Login History:', e.message);
    }

    console.log('🏁 Pruning Complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
