/**
 * One-time seed script to populate the Unified Data tables
 * from existing Contact and ExternalDocument records.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedUnified() {
  console.log('--- Starting Unified Data Seed ---');

  // 1. Find all businesses with integrations
  const businesses = await prisma.business.findMany({
    include: {
      integrations: true
    }
  });

  for (const biz of businesses) {
    console.log(`\n[Business] ${biz.name} (${biz.id})`);
    console.log(`  Integrations: ${biz.integrations.length}`);

    for (const integration of biz.integrations) {
      console.log(`  [Integration] ${integration.provider} (${integration.id})`);

      // 2. Sync Contacts -> UnifiedCustomer
      const contacts = await prisma.contact.findMany({
        where: { businessId: biz.id, source: integration.provider }
      });
      console.log(`    Contacts found: ${contacts.length}`);

      for (const contact of contacts) {
        try {
          await prisma.unifiedCustomer.upsert({
            where: {
              businessId_integrationId_externalId: {
                businessId: biz.id,
                integrationId: integration.id,
                externalId: contact.externalId
              }
            },
            update: {
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              source: integration.provider,
              metadata: contact.metadata
            },
            create: {
              businessId: biz.id,
              integrationId: integration.id,
              externalId: contact.externalId,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              source: integration.provider,
              metadata: contact.metadata
            }
          });
        } catch (e) {
          console.warn(`    [WARN] Skipping contact ${contact.externalId}: ${e.message}`);
        }
      }
      console.log(`    ✅ Synced ${contacts.length} contacts -> UnifiedCustomer`);

      // 3. Sync ExternalDocuments -> UnifiedInvoice (for invoice-type docs)
      const extDocs = await prisma.externalDocument.findMany({
        where: {
          integrationId: integration.id,
          documentType: { in: ['INVOICE', 'Invoice', 'invoice'] }
        }
      });
      console.log(`    External invoice docs found: ${extDocs.length}`);

      for (const doc of extDocs) {
        try {
          // Find unified customer by externalId from doc metadata
          const rawData = typeof doc.rawData === 'string' ? JSON.parse(doc.rawData) : doc.rawData;
          const customerRef = rawData?.CustomerRef?.value || rawData?.customer_id || null;

          let customerId = null;
          if (customerRef) {
            const unifiedCustomer = await prisma.unifiedCustomer.findFirst({
              where: {
                businessId: biz.id,
                integrationId: integration.id,
                externalId: String(customerRef)
              }
            });
            customerId = unifiedCustomer?.id;
          }

          if (!customerId) {
            // Create a placeholder customer if none found
            const placeholderName = rawData?.CustomerRef?.name || rawData?.customer_name || 'Unknown Customer';
            const placeholder = await prisma.unifiedCustomer.upsert({
              where: {
                businessId_integrationId_externalId: {
                  businessId: biz.id,
                  integrationId: integration.id,
                  externalId: customerRef || `placeholder-${doc.externalId}`
                }
              },
              update: {},
              create: {
                businessId: biz.id,
                integrationId: integration.id,
                externalId: customerRef || `placeholder-${doc.externalId}`,
                name: placeholderName,
                source: integration.provider
              }
            });
            customerId = placeholder.id;
          }

          const invoiceNumber = rawData?.DocNumber || rawData?.invoice_number || doc.externalId;
          const amount = parseFloat(rawData?.TotalAmt || rawData?.total || rawData?.Balance || 0);
          const balance = parseFloat(rawData?.Balance || 0);
          const issuedDate = rawData?.TxnDate ? new Date(rawData.TxnDate) : doc.createdAt;
          const dueDate = rawData?.DueDate ? new Date(rawData.DueDate) : null;

          let status = 'SENT';
          if (balance <= 0 && amount > 0) status = 'PAID';
          else if (dueDate && new Date(dueDate) < new Date()) status = 'OVERDUE';

          await prisma.unifiedInvoice.upsert({
            where: {
              businessId_integrationId_externalId: {
                businessId: biz.id,
                integrationId: integration.id,
                externalId: doc.externalId
              }
            },
            update: {
              invoiceNumber,
              amount,
              balance,
              status,
              issuedDate,
              dueDate,
              source: integration.provider,
              metadata: rawData
            },
            create: {
              businessId: biz.id,
              integrationId: integration.id,
              customerId,
              externalId: doc.externalId,
              invoiceNumber,
              amount,
              balance,
              status,
              issuedDate,
              dueDate,
              source: integration.provider,
              metadata: rawData
            }
          });
        } catch (e) {
          console.warn(`    [WARN] Skipping invoice doc ${doc.externalId}: ${e.message}`);
        }
      }
      console.log(`    ✅ Synced ${extDocs.length} invoice docs -> UnifiedInvoice`);
    }
  }

  // Summary
  const totalCustomers = await prisma.unifiedCustomer.count();
  const totalInvoices = await prisma.unifiedInvoice.count();
  console.log(`\n--- Seed Complete ---`);
  console.log(`  UnifiedCustomers: ${totalCustomers}`);
  console.log(`  UnifiedInvoices: ${totalInvoices}`);

  await prisma.$disconnect();
}

seedUnified().catch(e => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
