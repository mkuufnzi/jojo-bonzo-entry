import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStats() {
    try {
        console.log("Fetching first business with unified invoices...");
        const invoice = await prisma.unifiedInvoice.findFirst();
        if (!invoice) {
            console.log("No invoices found.");
            return;
        }

        const businessId = invoice.businessId;
        console.log(`Found businessId: ${businessId}`);

        console.log("Running aggregation...");
        const invoiceStats = await prisma.unifiedInvoice.aggregate({
            where: { businessId },
            _sum: { amount: true, balance: true },
            _count: { id: true }
        });

        console.log("Aggregation Result:", invoiceStats);
        
        const customerCount = await prisma.unifiedCustomer.count({ where: { businessId } });
        console.log("Customer Count:", customerCount);

        let orderCount = 0;
        try {
            orderCount = await (prisma as any).unifiedOrder.count({ where: { businessId } });
        } catch (e: any) {
            console.log("UnifiedOrder count failed:", e.message);
        }
        console.log("Order Count:", orderCount);

    } catch (error) {
        console.error("Diagnostic script failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkStats();
