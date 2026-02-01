import prisma from '../src/lib/prisma';

async function main() {
    console.log('🔄 Migrating DB from "qbo" back to "quickbooks"...');

    // 1. IntegrationDefinition
    const qboDef = await prisma.integrationDefinition.findUnique({ where: { slug: 'qbo' } });
    const qbDef = await prisma.integrationDefinition.findUnique({ where: { slug: 'quickbooks' } });

    if (qboDef) {
        if (qbDef) {
            console.log('⚠️ Both definitions exist. Deleting "qbo" and keeping "quickbooks"...');
            await prisma.integrationDefinition.delete({ where: { slug: 'qbo' } });
        } else {
            console.log('Renaming "qbo" definition to "quickbooks"...');
            await prisma.integrationDefinition.update({
                where: { slug: 'qbo' },
                data: { 
                    slug: 'quickbooks',
                    config: {
                        ...(qboDef.config as any),
                        provider: 'quickbooks'
                    }
                }
            });
        }
    } else if (!qbDef) {
        console.log('❌ No definition found for qbo or quickbooks. Seeder will handle it.');
    } else {
        console.log('✅ "quickbooks" definition already exists.');
    }

    // 2. Integration (Connected Users)
    const updateCount = await prisma.integration.updateMany({
        where: { provider: 'qbo' },
        data: { provider: 'quickbooks' }
    });
    console.log(`Updated ${updateCount.count} Integration records from 'qbo' to 'quickbooks'.`);

    // 3. Service (Global Config)
    const qboService = await prisma.service.findUnique({ where: { slug: 'qbo' } });
    if (qboService) {
        const qbService = await prisma.service.findUnique({ where: { slug: 'quickbooks' } });
        if (qbService) {
             await prisma.service.delete({ where: { slug: 'qbo' } });
        } else {
             await prisma.service.update({
                 where: { slug: 'qbo' },
                 data: { slug: 'quickbooks' }
             });
        }
        console.log('Updated Service slug to quickbooks.');
    }

    // 4. Workflow (Trigger Configs)
    // We need to fetch all workflows and check their json config
    const workflows = await prisma.workflow.findMany({ where: { triggerType: 'webhook' } });
    let wfCount = 0;
    for (const wf of workflows) {
        const config = wf.triggerConfig as any;
        if (config?.provider === 'qbo') {
            config.provider = 'quickbooks';
            await prisma.workflow.update({
                where: { id: wf.id },
                data: { triggerConfig: config }
            });
            wfCount++;
        }
    }
    console.log(`Updated ${wfCount} Workflows from 'qbo' to 'quickbooks'.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
