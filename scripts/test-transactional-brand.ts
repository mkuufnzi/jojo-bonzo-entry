import { workflowService } from '../src/services/workflow.service';
import { brandingService } from '../src/services/branding.service';
import prisma from '../src/lib/prisma';
import axios from 'axios';

async function main() {
    console.log("Starting Transactional Branding E2E Test...");

    // 1. Find a user with a business and a branding profile
    const profile = await prisma.brandingProfile.findFirst({
        where: { isDefault: true },
        include: { business: { include: { users: true } } }
    });

    if (!profile || !profile.business || profile.business.users.length === 0) {
        console.error("No suitable business profile found for testing.");
        return;
    }

    const userId = profile.business.users[0].id;
    const businessId = profile.businessId;

    console.log(`Using Business: ${profile.business.name} (ID: ${businessId})`);

    // 2. Ensure an active workflow exists for 'generate_local_template'
    let wf = await prisma.workflow.findFirst({
        where: { businessId, triggerType: 'webhook', name: 'Test Local Branding Workflow' }
    });

    if (!wf) {
        wf = await prisma.workflow.create({
            data: {
                businessId,
                name: 'Test Local Branding Workflow',
                description: 'Test E2E for Local EJS',
                isActive: true,
                triggerType: 'webhook',
                triggerConfig: {
                    provider: 'test_erp',
                    event: 'invoice.*'
                },
                actionConfig: {
                    type: 'generate_local_template',
                    profileId: 'default'
                }
            }
        });
        console.log("Created test workflow:", wf.id);
    }

    // 3. Mock Webhook Payload
    const mockPayload = {
        type: 'invoice.created',
        provider: 'test_erp',
        entityId: `TEST-INV-${Date.now()}`,
        amount: 899.99,
        currency: 'USD',
        customer: { name: 'E2E Test Customer', email: 'e2e@example.com' },
        items: [
            { description: 'Consulting Services', amount: 500, quantity: 1, rate: 500 },
            { description: 'Software License', amount: 399.99, quantity: 1, rate: 399.99 }
        ]
    };

    console.log("Dispatching Mock Webhook Payload...");
    
    // Process the webhook as if it arrived at the controller
    const results = await workflowService.processWebhook(userId, mockPayload);
    
    console.log("Webhook Processing Results:", JSON.stringify(results, null, 2));

    if (results.length > 0 && results[0].status === 'success') {
        // We should have a ProcessedDocument now
        const latestDoc = await prisma.processedDocument.findFirst({
            where: { businessId },
            orderBy: { createdAt: 'desc' }
        });

        if (latestDoc && latestDoc.status === 'processing') {
            const flooviooId = latestDoc.flooviooId;
            console.log(`\nDocument is processing. flooviooId: ${flooviooId}`);
            
            // 4. Simulate N8n Callback
            console.log("Simulating N8n Callback POST to /api/callbacks/n8n/transactional-complete");
            
            // Wait a sec
            await new Promise(r => setTimeout(r, 1000));
            
            // Direct call to controller logic without HTTP for absolute internal test, or we could test HTTP if server is up
            // Here we test the direct DB side of the callback logic since server might not be running
            // Assuming this is integration test level
            
            const reqBody = {
                flooviooId,
                status: 'success',
                pdfUrl: 'https://storage.floovioo.com/fake-e2e.pdf',
                html: '<html>E2E Generated</html>'
            };
            
            // Mimic controller logic
            await prisma.processedDocument.update({
                where: { id: latestDoc.id },
                data: {
                    status: 'completed',
                    brandedUrl: reqBody.pdfUrl,
                    updatedAt: new Date()
                }
            });

            console.log(`✅ Document ${flooviooId} marked as COMPLETE.`);
            
        } else {
            console.error("Failed to find 'processing' document.");
        }
    } else {
        console.error("Workflow failed or no workflows matched.");
    }

}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
    console.log("Done.");
});
