import { unifiedDataService } from '../src/modules/unified-data/unified-data.service';
import { unifiedAnalyticsService } from '../src/modules/unified-data/unified-analytics.service';
import prisma from '../src/lib/prisma';

async function main() {
    const businessId = "181a05e7-66b0-47e0-94fe-1f7bbaaca735";
    console.log('[Test] Calling getUnifiedBusinessStats...');
    try {
        const stats = await unifiedDataService.getUnifiedBusinessStats(businessId);
        console.log('[Test] Stats Result:', stats);
    } catch (e: any) {
        console.error('[Test] Stats Error:', e.message);
    }
    
    console.log('\n[Test] Calling analytics methods...');
    try {
       const trend = await unifiedAnalyticsService.getRevenueTrend(businessId, 30);
       console.log('[Test] Trend lengths:', trend.length);
    } catch (e: any) {
        console.error('[Test] Trend Error:', e.message);
    }
    
    try {
       const customers = await unifiedAnalyticsService.getTopCustomers(businessId, 5);
       console.log('[Test] Customers count:', customers.length);
    } catch (e: any) {
        console.error('[Test] Customers Error:', e.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
