import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDecimal() {
    try {
        const invoice = await prisma.unifiedInvoice.findFirst();
        if (!invoice) return;

        const invoiceStats = await prisma.unifiedInvoice.aggregate({
            where: { businessId: invoice.businessId },
            _sum: { amount: true, balance: true },
            _count: { id: true }
        });

        const rev = invoiceStats._sum.amount || 0;
        const bal = invoiceStats._sum.balance || 0;
        
        console.log("Type of amount:", typeof rev, rev.constructor?.name);
        
        try {
            const totalPaid = (rev as any) - (bal as any);
            console.log("totalPaid calculation:", totalPaid);
        } catch (e: any) {
            console.log("totalPaid error:", e.message);
        }

        try {
            console.log("toLocaleString on amount:", (rev as any).toLocaleString(undefined, {minimumFractionDigits: 2}));
        } catch (e: any) {
            console.log("toLocaleString error:", e.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}
checkDecimal();
