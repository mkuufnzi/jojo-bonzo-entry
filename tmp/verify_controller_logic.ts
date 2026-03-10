import { logger } from './src/lib/logger';

// Mocking the extraction logic from TransactionalController.renderPreview
function testExtraction(document: any) {
    const envelope = document.rawPayload;
    if (!envelope) return 'No Payload';

    const trigger = envelope.data?.trigger || envelope.trigger || {};
    const rawBody = trigger._raw || trigger;

    // Items
    let items: any[] = [];
    const qboLines = trigger.Line || rawBody.Line || [];
    if (Array.isArray(trigger.items) && trigger.items.length > 0) {
        items = trigger.items;
    } else if (Array.isArray(qboLines) && qboLines.length > 0) {
        items = qboLines
            .filter((l: any) => l.DetailType === 'SalesItemLineDetail' || l.Amount)
            .map((l: any, i: number) => ({
                id: i + 1,
                name: l.SalesItemLineDetail?.ItemRef?.name || l.Description || 'Item'
            }));
    }

    // Customer
    let customerName = 'Unknown';
    if (trigger.customer?.name) {
        customerName = trigger.customer.name;
    } else {
        customerName = rawBody.CustomerRef?.name || rawBody.BillAddr?.Line1 || 'Valued Customer';
    }

    // ID
    const docId = trigger.DocNumber || trigger.Id || trigger.entityId || trigger.id || document.resourceId;

    return { docId, customerName, itemsCount: items.length };
}

const mockDoc = {
    resourceId: 'unknown',
    rawPayload: {
        data: {
            trigger: {
                _raw: {
                    DocNumber: 'INV-2025-0847',
                    CustomerRef: { name: 'Acme Corp' },
                    Line: [{ DetailType: 'SalesItemLineDetail', Amount: 100 }]
                }
            }
        }
    }
};

console.log('Test Result:', testExtraction(mockDoc));
