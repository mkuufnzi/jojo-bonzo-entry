import { templateGenerator } from './src/services/template-generator.service';
import prisma from './src/lib/prisma';

async function main() {
    const docId = '352adaa0-29ce-4ae9-840f-2b646fe6a483'; // From user's URL
    const document = await prisma.processedDocument.findUnique({
        where: { id: docId },
        include: { business: true }
    });

    if (!document || !document.rawPayload) {
        console.error('Document not found or has no rawPayload');
        process.exit(1);
    }

    const envelope: any = document.rawPayload;
    const trigger = envelope.data?.trigger || envelope.trigger || {};
    
    // Normalize logic from TransactionalController.renderPreview
    let items: any[] = [];
    const qboLines = trigger.Line || trigger._raw?.Line || [];
    if (Array.isArray(trigger.items) && trigger.items.length > 0) {
        items = trigger.items;
    } else if (Array.isArray(qboLines) && qboLines.length > 0) {
        items = qboLines.filter((l: any) => l.DetailType === 'SalesItemLineDetail').map((l: any, i: number) => ({ id: i+1, name: 'Item' }));
    }

    const payload = {
        documentId: document.id,
        ...trigger,
        items: items,
        smartContent: envelope.data?.smart_content || {}
    };

    const html = await templateGenerator.generateHtml(
        document.userId || 'system',
        document.businessId,
        document.resourceType,
        payload,
        'test-nonce'
    );

    const fs = require('fs');
    fs.writeFileSync('rendered-output.html', html);
    console.log('✅ HTML dumped to rendered-output.html');
}

main().catch(console.error);
