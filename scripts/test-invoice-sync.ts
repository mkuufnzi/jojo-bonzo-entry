/**
 * Test Script: Invoice Sync from Stripe
 * 
 * Run with: npx ts-node scripts/test-invoice-sync.ts
 */

import { config } from 'dotenv';
config({ path: '.env.development' });

import { BillingService } from '../src/services/billing.service';
import prisma from '../src/lib/prisma';

async function testInvoiceSync() {
    console.log('🔗 Testing Invoice Sync from Stripe...\n');

    try {
        const billingService = new BillingService();
        
        // Before sync
        const invoiceCountBefore = await prisma.invoice.count();
        const paidInvoicesBefore = await prisma.invoice.count({ where: { status: 'paid' } });
        console.log(`📊 Before Sync:`);
        console.log(`   Total Invoices in DB: ${invoiceCountBefore}`);
        console.log(`   Paid Invoices: ${paidInvoicesBefore}\n`);

        // Run sync
        console.log('🔄 Running syncInvoicesFromStripe()...\n');
        const result = await billingService.syncInvoicesFromStripe();
        
        console.log(`✅ Sync Result:`);
        console.log(`   Created: ${result.createdCount}`);
        console.log(`   Updated: ${result.updatedCount}`);
        console.log(`   Skipped (no matching user): ${result.skippedCount}`);
        console.log(`   Message: ${result.message}\n`);

        // After sync
        const invoiceCountAfter = await prisma.invoice.count();
        const paidInvoicesAfter = await prisma.invoice.count({ where: { status: 'paid' } });
        console.log(`📊 After Sync:`);
        console.log(`   Total Invoices in DB: ${invoiceCountAfter}`);
        console.log(`   Paid Invoices: ${paidInvoicesAfter}\n`);

        // Calculate MRR (same logic as AdminController)
        const activeSubs = await prisma.subscription.findMany({
            where: { status: 'active' },
            include: {
                plan: true,
                invoices: {
                    where: { status: 'paid' },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        let totalMRR = 0;
        const mrrBreakdown: Record<string, { count: number; revenue: number }> = {};

        activeSubs.forEach(sub => {
            if (sub.plan) {
                const planName = sub.plan.name;
                const revenue = sub.invoices?.[0]?.amount || 0;

                if (!mrrBreakdown[planName]) {
                    mrrBreakdown[planName] = { count: 0, revenue: 0 };
                }

                mrrBreakdown[planName].count++;
                mrrBreakdown[planName].revenue += revenue;
                totalMRR += revenue;
            }
        });

        console.log(`💰 MRR Calculation (Invoice-Based):`);
        console.log(`   Total MRR: $${totalMRR.toFixed(2)}`);
        console.log(`   Active Subscriptions: ${activeSubs.length}`);
        console.log(`\n   Breakdown by Plan:`);
        Object.entries(mrrBreakdown).forEach(([planName, data]) => {
            console.log(`     - ${planName}: ${data.count} subs, $${data.revenue.toFixed(2)} MRR`);
        });

        // Show some sample paid invoices
        const sampleInvoices = await prisma.invoice.findMany({
            where: { status: 'paid' },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { email: true } } }
        });

        console.log(`\n📋 Sample Paid Invoices (Last 5):`);
        sampleInvoices.forEach(inv => {
            console.log(`   - $${inv.amount.toFixed(2)} | ${inv.user?.email || 'Unknown'} | ${inv.createdAt.toISOString().split('T')[0]}`);
        });

    } catch (error) {
        console.error('❌ Error during sync test:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testInvoiceSync();
