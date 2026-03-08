/**
 * TRACE: Simulates exactly what DashboardController.dashboardUnified() runs
 * for the logged-in test user to identify the data loading failure point.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The test user discovered from debug-all-test-users.ts
const TEST_USER_ID = '71c15a09-da77-4966-81bf-8034d8313f91';

async function run() {
    console.log('[TRACE] Step 1: Fetch User by ID');
    const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });

    if (!user) {
        console.error('[TRACE] ERROR: User not found for ID', TEST_USER_ID);
        return;
    }
    console.log('[TRACE] User:', user.email, '| businessId field:', user.businessId);

    console.log('\n[TRACE] Step 2: Fetch Business (using user.businessId as priority)');
    const business = await prisma.business.findFirst({
        where: user.businessId ? { id: user.businessId } : { users: { some: { id: user.id } } },
        include: { integrations: true }
    });

    if (!business) {
        console.error('[TRACE] ERROR: No business found! This is the root cause of the empty dashboard.');
        return;
    }
    console.log('[TRACE] Business ID:', business.id);
    console.log('[TRACE] Integrations count:', business.integrations.length);
    business.integrations.forEach(i => console.log('  -', i.provider, '| status:', i.status));

    console.log('\n[TRACE] Step 3: Count existing UnifiedInvoices');
    const existingInvoiceCount = await prisma.unifiedInvoice.count({ where: { businessId: business.id } });
    console.log('[TRACE] Existing UnifiedInvoices:', existingInvoiceCount);

    if (existingInvoiceCount === 0 && business.integrations.length > 0) {
        console.log('[TRACE] Would trigger AUTO-SYNC (invoices table empty with active integrations)');
    } else {
        console.log('[TRACE] Skipping auto-sync. Fetching stats directly from DB...');
    }

    console.log('\n[TRACE] Step 4: Fetch Stats');
    const totalCustomers = await prisma.unifiedCustomer.count({ where: { businessId: business.id } });
    const totalInvoices = await prisma.unifiedInvoice.count({ where: { businessId: business.id } });
    console.log('[TRACE] totalCustomers:', totalCustomers);
    console.log('[TRACE] totalInvoices:', totalInvoices);

    console.log('\n[TRACE] Step 5: Fetch 10 recent invoices');
    const recent = await prisma.unifiedInvoice.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });
    console.log('[TRACE] Recent invoices count:', recent.length);

    console.log('\n[TRACE] === FINAL RENDER PAYLOAD ===');
    console.log('integrations.length:', business.integrations.length);
    console.log('stats.totalInvoices:', totalInvoices);
    console.log('stats.totalCustomers:', totalCustomers);
    console.log('recentTransactions.length:', recent.length);

    if (business.integrations.length === 0) {
        console.log('\n[TRACE] ⚠️  PROBLEM: integrations is EMPTY - dashboard will show 0 data sources');
    } else {
        console.log('\n[TRACE] ✅ Data resolved correctly. If dashboard is still empty, the issue is in the EJS template or session mismatch.');
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
