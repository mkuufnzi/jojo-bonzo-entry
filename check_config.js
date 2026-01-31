
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConfig() {
  try {
    const service = await prisma.service.findFirst({
      where: { slug: 'ai-doc-generator' }
    });
    console.log('Service Found:', service ? 'Yes' : 'No');
    if (service) {
        console.log('Config:', JSON.stringify(service.config, null, 2));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkConfig();
