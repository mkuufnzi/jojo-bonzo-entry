import { PrismaClient } from '@prisma/client';
import { RecoveryService } from '../modules/recovery/recovery.service';

const prisma = new PrismaClient();
const svc = new RecoveryService();

async function main() {
    console.log('\n========================================================================');
    console.log('🤖 Floovioo Enterprise AI - E2E Recovery Webhook Dispatch Test');
    console.log('========================================================================\n');
    
    console.log('📖 Story: Searching external registries and active sessions for target customer: "BONIFACE GACHUI MUTHAKA"...\n');
    
    // Find the customer or related recovery session
    const targetSession = await prisma.debtCollectionSession.findFirst({
        where: {
            customerName: {
                contains: 'BONIFACE',
                mode: 'insensitive'
            },
            status: 'ACTIVE'
        },
        include: {
            business: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    if (!targetSession) {
        console.log('❌ Could not find an ACTIVE recovery session specifically for BONIFACE.');
        console.log('Attempting to find any active session instead to demonstrate the architecture... \n');
        
        const anySession = await prisma.debtCollectionSession.findFirst({
            where: { status: 'ACTIVE' },
            include: { business: true },
            orderBy: { createdAt: 'desc' }
        });
        
        if (!anySession) {
             console.log('❌ No active recovery sessions found in the database. Please generate test data first via UI.');
             process.exit(1);
        }
        console.log(`⚠️ Falling back to test session for: ${anySession.customerName} (Invoice: ${anySession.externalInvoiceId})\n`);
        await triggerForSession(anySession);
        return;
    }

    console.log(`✅ MATCH! Found active recovery session for ${targetSession.customerName}!`);
    console.log(`   Invoice ID: ${targetSession.externalInvoiceId}`);
    console.log(`   Business ID: ${targetSession.businessId}`);
    
    await triggerForSession(targetSession);
}

async function triggerForSession(session: any) {
    console.log('\n🔔 Story: Initiating automated dunning follow-up sequence...');
    
    // Defaulting email so the webhook ensures it pushes downstream without short-circuiting at the email check
    const targetEmail = (session.metadata as any)?.customerEmail || 'boniface@example.com';
    
    const request = {
        businessId: session.businessId,
        externalInvoiceId: session.externalInvoiceId,
        customerEmail: targetEmail,
        amount: (session.metadata as any)?.amount || 100,
        currency: (session.metadata as any)?.currency || 'USD',
        dueDate: (session.metadata as any)?.dueDate || new Date().toISOString(),
        userId: 'system'
    };

    console.log(`   Payload built for Invoice ${request.externalInvoiceId}. Total Outstanding: ${request.currency} ${request.amount}.`);
    console.log(`   Target Email: ${request.customerEmail}`);
    console.log('\n⚙️ Story: Handing over to Floovioo Recovery Engine (processRecovery)...');
    console.log('------------------------------------------------------------------------');
    
    try {
        const result = await svc.processRecovery(request);
        console.log('------------------------------------------------------------------------');
        console.log('\n🎯 Story: Recovery Engine evaluation completed.');
        console.log('   Service Return:', JSON.stringify(result, null, 2));
        
        // Let background axios/db persist tasks finish
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        console.log('\n📋 Story: Validating Webhook Audit Log & Processed Documents Tracking...');
        const pdoc = await prisma.processedDocument.findFirst({
            where: { businessId: session.businessId, eventType: 'recovery_email' },
            orderBy: { createdAt: 'desc' }
        });
        
        if (pdoc) {
            console.log(`   Webhook Dispatch ID: ${pdoc.flooviooId}`);
            console.log(`   Status: ${pdoc.status} (Verified in tracking table)`);
            console.log(`   Logged At: ${pdoc.createdAt}`);
            console.log(`\n🎉 Success! The Floovioo architecture successfully processed a recovery notification for ${session.customerName} via the Debt Collection n8n webhook!`);
        } else {
            console.log(`   ⚠️ Could not locate the corresponding ProcessedDocument. Check if the eventType matched or if the workflow returned earlier.`);
        }
        
    } catch (e: any) {
        console.log('\n❌ Story: Error during execution!');
        console.error(e.message);
        if (e.response && e.response.data) {
            console.error('Response Body:', e.response.data);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
