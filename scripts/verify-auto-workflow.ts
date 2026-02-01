
import { workflowService } from '../src/services/workflow.service';
import prisma from '../src/lib/prisma';
import { v4 as uuid } from 'uuid';

async function main() {
    console.log('🧪 Starting Workflow Automation Verification...');

    // 1. Setup Test Data
    const businessId = `test-biz-${uuid()}`;
    const userId = `test-user-${uuid()}`;
    const provider = 'quickbooks';

    // Mock Business/User existence? 
    // Actually the service doesn't check User/Business existence for DB constraints if we assume they exist or we just pass strings.
    // Wait, Workflow table has ForeignKey to Business. So we MUST create a business.

    // Let's create a dummy business
    console.log('Creating dummy business...');
    await prisma.business.create({
        data: {
            id: businessId,
            name: 'Test Business Auto',
            users: {
                create: {
                    id: userId,
                    email: `test-${uuid()}@example.com`,
                    password: 'hash',
                    role: 'OWNER'
                }
            }
        }
    });

    console.log(`✅ Created Business: ${businessId}`);

    // 2. Run Ensure Default Workflow (Should Create)
    console.log('▶️ Calling ensureDefaultWorkflow (First Run)...');
    await workflowService.ensureDefaultWorkflow(userId, businessId, provider);

    // 3. Verify Creation
    const wf1 = await prisma.workflow.findFirst({
        where: { businessId, triggerType: 'webhook' }
    });

    if (!wf1) {
        console.error('❌ FAILED: Workflow not created.');
        process.exit(1);
    }
    console.log(`✅ Success: Workflow created! ID: ${wf1.id}, Name: ${wf1.name}`);

    // 4. Run Again (Should Skip)
    console.log('▶️ Calling ensureDefaultWorkflow (Second Run)...');
    await workflowService.ensureDefaultWorkflow(userId, businessId, provider);

    const count = await prisma.workflow.count({
        where: { businessId, triggerType: 'webhook' }
    });

    if (count !== 1) {
        console.error(`❌ FAILED: Duplicate workflows created. Count: ${count}`);
    } else {
        console.log('✅ Success: Idempotency verified (Count is still 1).');
    }

    // Cleanup
    console.log('🧹 Cleaning up...');
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    console.log('✨ Done.');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
