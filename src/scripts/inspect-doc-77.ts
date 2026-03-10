import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
    console.log('🔍 Deep Inspection of Document 77 (Latest)...');
    try {
        const doc = await prisma.processedDocument.findFirst({
            where: { resourceId: '77' }, // Precise target from user screenshot logic
            orderBy: { createdAt: 'desc' }
        });

        if (!doc) {
            console.log('❌ ProcessedDocument 77 not found. Checking latest 3 instead...');
            const latest = await prisma.processedDocument.findMany({
                take: 3,
                orderBy: { createdAt: 'desc' }
            });
            latest.forEach(d => {
                console.log(`- ID: ${d.id} | Resource: ${d.resourceType}/${d.resourceId} | Created: ${d.createdAt.toISOString()}`);
            });
            
            if (latest.length > 0) {
                 inspectDoc(latest[0]);
            }
        } else {
            inspectDoc(doc);
        }

    } catch (error) {
        console.error('❌ Diagnostics failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

function inspectDoc(doc: any) {
    console.log('✅ Inspecting Document:');
    console.log(JSON.stringify({
        id: doc.id,
        resourceId: doc.resourceId,
        status: doc.status,
        createdAt: doc.createdAt,
        hasSnapshot: !!doc.snapshotHtml,
        snapshotLength: doc.snapshotHtml?.length || 0,
        errorMessage: doc.errorMessage
    }, null, 2));

    const payload = doc.rawPayload as any;
    console.log('📦 Raw Payload Structure:');
    
    // Check for common QBO nesting
    const trigger = payload.data?.trigger || payload.trigger || payload;
    const items = trigger.payload?.Line || trigger.Line || trigger.items || [];
    
    console.log('Detected Items Source:', 
        trigger.payload?.Line ? 'trigger.payload.Line' : 
        (trigger.Line ? 'trigger.Line' : 
        (trigger.items ? 'trigger.items' : 'None found'))
    );
    
    console.log('Items Count:', Array.isArray(items) ? items.length : 'Not an array');
    if (Array.isArray(items) && items.length > 0) {
        console.log('First Item Sample:', JSON.stringify(items[0], null, 2));
    }

    const total = trigger.payload?.TotalAmt || trigger.TotalAmt || trigger.total || 0;
    console.log('Total Amount:', total);
    
    // Check if snapshot contains "INV-2025-0847" which is in user screenshot
    if (doc.snapshotHtml && doc.snapshotHtml.includes('INV-2025-0847')) {
        console.log('✨ Snapshot contains the target Invoice Number!');
        
        // Check for specific item text or "0.00"
        const hasZeroTotal = doc.snapshotHtml.includes('$0.00');
        console.log('Snapshot has $0.00 text:', hasZeroTotal);
    }
}

diagnose();
