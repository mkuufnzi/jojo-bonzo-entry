import prisma from './src/lib/prisma';

async function diagnose() {
    console.log("Looking up user 'AFS Tools Test'...");
    const user = await prisma.user.findFirst({
        where: { name: { contains: 'AFS Tools' } },
        include: { business: true }
    });

    if (!user) {
        console.log("No user found.");
        process.exit(0);
    }

    let businessId = user.businessId || user.business?.id;
    let business = null;

    if (businessId) {
        business = await prisma.business.findUnique({ where: { id: businessId } });
    }

    if (!business) {
        console.log("Failed to resolve business.");
        process.exit(0);
    }

    console.log("Resolved Business:", business.name, "ID:", business.id);

    // Using "any" assertion for dynamic models that throw TS errors
    const p: any = prisma;

    const integrations = await p.integration.count({ where: { businessId: business.id } });
    const invoices = await p.unifiedInvoice.count({ where: { businessId: business.id } });
    const customers = await p.unifiedCustomer.count({ where: { businessId: business.id } });
    const processedDocs = await p.processedDocument.count({ where: { businessId: business.id } });
    const usageLogs = await p.usageLog.count({ where: { app: { userId: user.id } } });
    const extDocs = await p.externalDocument.count({ where: { businessId: business.id } });

    console.log("--- UNIFIED DATA ---");
    console.log("Integrations:", integrations);
    console.log("UnifiedInvoices:", invoices);
    console.log("UnifiedCustomers:", customers);

    console.log("--- TRANSACTIONAL DATA ---");
    console.log("ProcessedDocuments:", processedDocs);
    console.log("UsageLogs (App):", usageLogs);
    console.log("ExternalDocuments:", extDocs);
}

diagnose()
    .catch(console.error)
    .finally(() => process.exit(0));
