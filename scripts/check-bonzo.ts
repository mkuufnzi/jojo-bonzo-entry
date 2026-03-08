import prisma from '../src/lib/prisma';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const b = await prisma.business.findFirst({
            where: { name: { contains: 'Bonzo' } }
        });
        const businessId = b.id;
        
        console.log("Checking UnifiedInvoice count...");
        const invoiceCount = await prisma.unifiedInvoice.count({ where: { businessId } });
        console.log("Total Unified Invoices:", invoiceCount);
        
        console.log("Checking Unified Order count...");
        const orderCount = await (prisma as any).unifiedOrder.count({ where: { businessId } }).catch(e => {
            console.error("Order Count failed:", e.message);
            return 0;
        });
        console.log("Total Orders:", orderCount);

        console.log("Checking Aggregate...");
        const invoiceStats = await prisma.unifiedInvoice.aggregate({
            where: { businessId },
            _sum: { amount: true, balance: true },
            _count: { id: true }
        });
        console.log("Aggregate:", JSON.stringify(invoiceStats));
    } catch (e) {
        console.error("Error:", e.stack);
    } finally {
        await prisma.$disconnect();
    }
}
check();
