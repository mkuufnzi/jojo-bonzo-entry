import { PrismaClient } from '@prisma/client';
import { templateGenerator } from '../services/template-generator.service';

const prisma = new PrismaClient();

async function run() {
  const document = await prisma.processedDocument.findUnique({
    where: { id: '97878ea6-9d61-4a05-b568-97c21e73d1ab' }
  });

  if (!document) return console.log('Doc not found');

  const envelope = document.rawPayload as any;
  const trigger = envelope.data?.trigger || envelope.trigger || envelope;
  
  let items: any[] = [];
  const qboLines = trigger.Line || trigger._raw?.Line || [];
  if (Array.isArray(qboLines) && qboLines.length > 0) {
      items = qboLines
          .filter((l: any) => l.DetailType === 'SalesItemLineDetail' || l.Amount)
          .map((l: any, i: number) => ({
              id: i + 1,
              name: l.SalesItemLineDetail?.ItemRef?.name || l.Description || 'Item',
              description: l.Description || '',
              sku: l.SalesItemLineDetail?.ItemRef?.value || 'SKU',
              qty: l.SalesItemLineDetail?.Qty || 1,
              price: l.SalesItemLineDetail?.UnitPrice || (l.Amount / (l.SalesItemLineDetail?.Qty || 1)) || 0,
              category: l.SalesItemLineDetail?.ItemAccountRef?.name || 'General',
              img: '📦'
          }));
  }

  const rawBody = trigger._raw || trigger;
  const customerDetails = {
      name: rawBody.CustomerRef?.name || 'Valued Customer',
      email: rawBody.BillEmail?.Address || '',
      address: 'Address not provided'
  };

  const payload = {
      documentId: document.id,
      ...trigger,
      items: items,
      customer: customerDetails,
      subtotal: items.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0),
      total: rawBody.TotalAmt || trigger.totalAmount || rawBody.Amount || 0,
      businessName: envelope.data?.brand?.business?.name || '',
      businessEmail: '',
      businessWebsite: envelope.data?.brand?.business?.website || '',
      smartContent: envelope.data?.smart_content || {}
  };

  console.log('Payload items:', items.length);

  try {
      const html = await templateGenerator.generateHtml(
          document.userId || 'system',
          document.businessId,
          document.resourceType || 'invoice',
          payload
      );
      console.log('Success! HTML length:', html.length);
  } catch (e: any) {
      console.error('Template Generate Failed:', e.message);
      console.error(e.stack);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
