import prisma from '../src/lib/prisma';
import { dunningService } from '../src/services/dunning.service';

async function testDunning() {
    console.log('🧪 Testing Dunning Service...');

    // 1. Find a business
    const business = await prisma.business.findFirst({
        include: { users: { take: 1 } }
    });

    if (!business || !business.users[0]) {
        console.error('❌ No business or user found for testing.');
        return;
    }

    const userId = business.users[0].id;
    const businessId = business.id;

    console.log(`📍 Using Business: ${business.name} (${businessId})`);

    // 2. Create a mock overdue invoice
    const mockInvoice = await (prisma as any).externalDocument.create({
        data: {
            businessId,
            integrationId: (await prisma.integration.findFirst({ where: { businessId } }))?.id || 'mock-id',
            externalId: `test_inv_${Date.now()}`,
            type: 'invoice',
            data: { amount: 5000, status: 'unpaid' },
            normalized: {
                amount: 5000,
                status: 'unpaid',
                contactName: 'Test Customer',
                date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                externalId: `test_inv_${Date.now()}`
            },
            syncedAt: new Date()
        }
    });

    console.log(`✅ Created mock overdue invoice: ${mockInvoice.id}`);

    // 3. Test detection
    const overdue = await dunningService.getOverdueInvoices(businessId);
    if (overdue.some(i => i.id === mockInvoice.id)) {
        console.log('✅ Overdue invoice correctly detected.');
    } else {
        console.error('❌ Overdue invoice NOT detected.');
    }

    // 4. Test trigger (Will fail/mock webhook in service)
    try {
        console.log('📡 Triggering followup...');
        const result = await dunningService.triggerFollowup(userId, businessId, mockInvoice.id);
        console.log('✅ Followup triggered:', result);
    } catch (error: any) {
        console.error('❌ Followup trigger error (expected if webhook fails):', error.message);
    }

    // Clean up mock invoice
    await (prisma as any).externalDocument.delete({ where: { id: mockInvoice.id } });
    console.log('🧹 Cleanup complete.');
}

testDunning().catch(console.error).finally(() => prisma.$disconnect());
