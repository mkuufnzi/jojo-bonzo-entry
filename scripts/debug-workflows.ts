import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Workflow Debug ---');
    const workflows = await prisma.workflow.findMany();
    console.log(`Found ${workflows.length} workflows.`);
    
    workflows.forEach(wf => {
        console.log(`[${wf.id}] ${wf.name} | Trigger: ${wf.triggerType} | Active: ${wf.isActive}`);
    });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
