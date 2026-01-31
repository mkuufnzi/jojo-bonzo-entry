
process.env.APP_URL = 'http://localhost:3002';
process.env.NODE_ENV = 'development';

import { n8nPayloadFactory } from './src/services/n8n/n8n-payload.factory';

async function main() {
    console.log('--- Data Normalization Test ---');

    const business: any = {
        id: 'biz_123',
        name: 'Tech Corp',
        sector: 'Software',
        metadata: {
            ui_theme: 'Dark'
        }
    };

    const context = {
        serviceId: 'transactional-core',
        appId: 'test-normalization',
        requestId: 'req_123'
    };

    // 1. Invoice Test
    const rawInvoice = {
        id: 'inv_abc',
        externalId: '1001',
        type: 'invoice',
        date: new Date('2023-10-01'),
        name: 'Invoice #1001',
        total: 1250.50,
        status: 'PAID',
        contactName: 'Alice Smith',
        rawData: {
            CurrencyRef: { value: 'KES' },
            DocNumber: '1001',
            Line: []
        }
    };

    const invoicePayload = n8nPayloadFactory.createInvoicePayload(rawInvoice, business, context);
    console.log('\n[Invoice Payload]');
    console.log(JSON.stringify(invoicePayload, null, 2));

    // 2. Contact Test
    const rawContact = {
        id: 'con_xyz',
        externalId: '50',
        type: 'contact',
        date: new Date(),
        name: 'Bob Jones',
        status: 'active',
        rawData: {
            PrimaryEmailAddr: { Address: 'bob@example.com' },
            PrimaryPhone: { FreeFormNumber: '+254700000000' }
        }
    };

    const contactPayload = n8nPayloadFactory.createContactPayload(rawContact, business, context);
    console.log('\n[Contact Payload]');
    console.log(JSON.stringify(contactPayload, null, 2));
}

main().catch(console.error);
