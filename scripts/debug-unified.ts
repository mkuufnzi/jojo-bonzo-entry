import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const businessId = "181a05e7-66b0-47e0-94fe-1f7bbaaca735";
    
    console.log(`[Diagnostic] Analyzing Business: ${businessId}`);
    
    // 1. Total Count
    const total = await prisma.unifiedInvoice.count({ where: { businessId } });
    console.log(`- Total Invoices: ${total}`);

    // 2. Status Distribution
    const statusGroups = await prisma.unifiedInvoice.groupBy({
        by: ['status'],
        where: { businessId },
        _count: true,
        _sum: { amount: true }
    });
    console.log('- Status Distribution:', statusGroups);

    // 3. Source Distribution
    const sourceGroups = await prisma.unifiedInvoice.groupBy({
        by: ['source'],
        where: { businessId },
        _count: true
    });
    console.log('- Source Distribution:', sourceGroups);

    // 4. Date Check (Sample)
    const samples = await prisma.unifiedInvoice.findMany({
        where: { businessId },
        select: { issuedDate: true, createdAt: true, amount: true, status: true },
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log('- Sample Data (Newest 5):', samples);

    // 5. Check "Last 30 Days" Query Logic directly
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const recentCount = await prisma.unifiedInvoice.count({
        where: {
            businessId,
            OR: [
                { issuedDate: { gte: startDate } },
                { AND: [{ issuedDate: null }, { createdAt: { gte: startDate } }] }
            ],
            status: { notIn: ['VOIDED', 'DELETED'] }
        }
    });
    console.log(`- Invoices in Last 30 Days (Non-Voided): ${recentCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
