
import prisma from '../../src/lib/prisma';
import { RecoveryService } from '../../src/modules/transactional/recovery/recovery.service';
import { workflowService } from '../../src/services/workflow.service';
import * as fs from 'fs';
import * as path from 'path';

// Use same test business from the previous script
const TEST_BUSINESS_ID = '1a98aaf1-9c92-4d1f-b854-3da8899a310f'; 

async function runPhase3E2ETest() {
    console.log('🚀 [E2E] Starting Smart Recovery Phase 3 Verification...');
    
    const service = new RecoveryService();

    try {
        // 1. Verify Template Existence
        console.log('\n📄 [1/4] Verifying Email Templates Existence...');
        const templateDir = path.join(process.cwd(), 'src/views/templates/recovery');
        const templates = ['reminder_gentle.ejs', 'reminder_firm.ejs', 'reminder_final.ejs'];
        
        for (const t of templates) {
            const exists = fs.existsSync(path.join(templateDir, t));
            if (exists) {
                console.log(`✅ Template found: ${t}`);
            } else {
                console.error(`❌ Template MISSING: ${t}`);
                throw new Error(`Missing template: ${t}`);
            }
        }

        // 2. Simulate Daily Dispatch Trigger
        console.log('\n⏰ [2/4] Simulating Daily Dispatch Cycle...');
        try {
            await service.processPendingActions();
            console.log('✅ Daily Dispatch initiated (Jobs queued to Redis)');
        } catch (queueErr: any) {
            console.warn('⚠️ Queue Dispatch failed (Expected if Redis is offline):', queueErr.message);
            console.log('Continuing with direct execution test...');
        }

        // 3. Test Selective Execution (Deep Dive into Payload)
        console.log('\n🎯 [3/4] Testing Direct Action Execution (Step 1 -> Gentle)...');
        
        // Ensure an active sequence exists
        await service.updateSequence(TEST_BUSINESS_ID, { isActive: true });

        // Ensure an overdue-looking action exists
        let action = await prisma.dunningAction.findFirst({
            where: { businessId: TEST_BUSINESS_ID, status: 'pending' }
        });

        if (!action) {
            console.log('📝 Creating dummy dunning action for test...');
            action = await prisma.dunningAction.create({
                data: {
                    businessId: TEST_BUSINESS_ID,
                    externalInvoiceId: 'E2E-INV-P3-' + Date.now().toString().slice(-4),
                    actionType: 'email_reminder',
                    status: 'pending',
                    aiGeneratedCopy: null,
                    sentAt: new Date()
                }
            });
        }

        const actionData = action as any;
        console.log(`Using Action ID: ${actionData.id} for Invoice: ${actionData.externalInvoiceId}`);

        // Define test metadata (since these are not in DB yet)
        const testMetadata = {
            customerEmail: 'test-recipient@example.com',
            amount: 450.00,
            currency: 'USD',
            dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
        };


        // Monkey-patch workflowService.executeAction to verify the payload
        // This avoids calling real n8n if url is missing
        const originalExecute = workflowService.executeAction;
        let capturedPayload: any = null;
        
        // Cast to any to override private/protected if needed, though it's public
        (workflowService as any).executeAction = async (wfId: string, config: any, payload: any, userId: string) => {
            capturedPayload = payload;
            console.log('📍 Captured Workflow Payload:', JSON.stringify(payload, null, 2));
            return { success: true, message: 'Mocked successful execution' };
        };

        const result = await service.processRecovery({
            businessId: TEST_BUSINESS_ID,
            externalInvoiceId: actionData.externalInvoiceId,
            customerEmail: testMetadata.customerEmail,
            amount: testMetadata.amount,
            currency: testMetadata.currency,
            dueDate: testMetadata.dueDate
        });


        // Restore original method
        workflowService.executeAction = originalExecute;

        if (capturedPayload) {
            console.log('✅ Verification: Payload contains expected fields:');
            console.log(' - templateId:', capturedPayload.templateId);
            console.log(' - invoiceLink:', capturedPayload.invoiceLink);
            
            if (['reminder_gentle', 'reminder_firm', 'reminder_final'].includes(capturedPayload.templateId)) {
                console.log('✅ Template selection logic PASSED');
            } else {
                 console.error('❌ Template selection logic FAILED (Invalid templateId)');
            }
        } else {
            console.warn('⚠️ No workflow executed. Check if an active "invoice_overdue" workflow exists for this business.');
        }

        // 4. Verify Workflow Execution Log via Audit Trail
        console.log('\n📑 [4/4] Checking for Workflow Execution Logs...');
        let workflows = await prisma.workflow.findMany({
            where: { businessId: TEST_BUSINESS_ID, triggerType: 'invoice_overdue' }
        });

        if (workflows.length === 0) {
            console.log('📝 Creating recovery workflow for test...');
            const wf = await prisma.workflow.create({
                data: {
                    businessId: TEST_BUSINESS_ID,
                    name: 'Smart Recovery Workflow (E2E Test)',
                    isActive: true,
                    triggerType: 'invoice_overdue',
                    actionConfig: {
                        type: 'apply_branding',
                        profileId: 'default'
                    }
                }
            });
            workflows = [wf];
        }

        console.log(`✅ Using recovery workflow: ${workflows[0].id}`);
        
        // Re-run execution now that workflow exists
        console.log('\n🔄 Re-executing action with workflow present...');
        
        // Monkey-patch workflowService.executeAction again
        (workflowService as any).executeAction = async (wfId: string, config: any, payload: any, userId: string) => {
            capturedPayload = payload;
            console.log('📍 Captured Workflow Payload:', JSON.stringify(payload, null, 2));
            return { success: true, message: 'Mocked successful execution' };
        };

        await service.processRecovery({
            businessId: TEST_BUSINESS_ID,
            externalInvoiceId: actionData.externalInvoiceId + '-WF',
            customerEmail: testMetadata.customerEmail,
            amount: testMetadata.amount,
            currency: testMetadata.currency,
            dueDate: testMetadata.dueDate
        });

        if (capturedPayload) {
            console.log('✅ Final Verification: Payload captured successfully!');
            console.log(' - Template ID:', capturedPayload.templateId);
            console.log(' - Invoice Link:', capturedPayload.invoiceLink);
        } else {
            console.error('❌ Final Verification FAILED: No payload captured even with workflow.');
        }

        console.log('\n🏁 Phase 3 E2E Verification Complete.');


    } catch (error) {
        console.error('\n❌ E2E Test Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
runPhase3E2ETest();
