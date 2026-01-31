import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({
    where: { businessId: { not: null } },
    include: { business: true }
  });

  if (!user || !user.businessId) {
    console.log('No business user found. Please complete onboarding first.');
    return;
  }

  console.log(`Found User: ${user.email} (Business: ${user.business?.name})`);

  // Create Workflow
  const wf = await prisma.workflow.create({
    data: {
      businessId: user.businessId,
      name: 'Auto-Brand Zoho Invoices',
      description: 'Apply branding to PDF and email client when invoice is created in Zoho.',
      isActive: true,
      triggerType: 'webhook',
      triggerConfig: {
        provider: 'zoho',
        event: 'invoice.created'
      },
      actionConfig: {
        type: 'brand_and_email',
        emailTo: user.email // Send to self for testing
      }
    }
  });

  console.log(`✅ Created Workflow: ${wf.id}`);
  console.log('\n--- Test Command ---');
  console.log(`curl -X POST http://localhost:3002/onboarding/api/webhook/erp/zoho/${user.id}?userId=${user.id} \\
  -H "Content-Type: application/json" \\
  -d '{"event": "invoice.created", "entityId": "INV-100", "provider": "zoho"}'`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
