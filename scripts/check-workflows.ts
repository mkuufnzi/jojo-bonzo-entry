
import prisma from '../src/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

async function main() {
    const businessId = '84706cb5-b0c8-4011-b669-5ea8cf7b6ff7'; // From User Logs

    console.log(`🔍 Checking Workflows for Business: ${businessId}`);

    const workflows = await prisma.workflow.findMany({
        where: { businessId }
    });

    console.log(`Found ${workflows.length} workflows.`);
    
    workflows.forEach(wf => {
        console.log(` - [${wf.isActive ? 'ACTIVE' : 'INACTIVE'}] ${wf.name} (Trigger: ${wf.triggerType})`);
        console.log(`   Config:`, JSON.stringify(wf.triggerConfig));
    });

    if (workflows.length === 0) {
        console.log('\n⚠️ No workflows found! Seeding a default QuickBooks workflow...');
        
        await prisma.workflow.create({
            data: {
                id: uuidv4(),
                businessId,
                name: 'Auto-Brand New Invoices (QuickBooks)',
                description: 'Automatically applies branding when an invoice is created in QuickBooks',
                isActive: true,
                triggerType: 'webhook',
                triggerConfig: {
                    provider: 'quickbooks',
                    event: 'invoice.*'
                },
                actionConfig: {
                    type: 'apply_branding',
                    profileId: 'default'
                }
            }
        });
        console.log('✅ Created default QuickBooks workflow.');
    } else {
        // Ensure at least one is compatible
        const compatible = workflows.find(w => 
            w.triggerType === 'webhook' && 
            w.isActive && 
            (w.triggerConfig as any)?.provider === 'quickbooks'
        );

        if (!compatible) {
             console.log('\n⚠️ No compatible QuickBooks workflow found. creating one...');
             await prisma.workflow.create({
                data: {
                    id: uuidv4(),
                    businessId,
                    name: 'Auto-Brand New Invoices (QuickBooks)',
                    description: 'Automatically applies branding when an invoice is created in QuickBooks',
                    isActive: true,
                    triggerType: 'webhook',
                    triggerConfig: {
                        provider: 'quickbooks',
                        event: 'invoice.*'
                    },
                    actionConfig: {
                        type: 'apply_branding',
                        profileId: 'default'
                    }
                }
            });
            console.log('✅ Created default QuickBooks workflow.');
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
