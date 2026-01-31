
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Scanning Service Configurations...');
  const services = await prisma.service.findMany({
    orderBy: { slug: 'asc' }
  });

  console.log(`Found ${services.length} services.`);
  
  for (const service of services) {
    const config = service.config as any;
    console.log(`\n---------------------------------------------------`);
    console.log(`SERVICE: ${service.name} (${service.slug})`);
    
    if (config && config.webhooks) {
        console.log(`WEBHOOKS:`);
        Object.entries(config.webhooks).forEach(([action, hook]: [string, any]) => {
            const url = typeof hook === 'string' ? hook : hook.url;
            console.log(`  - ${action}: ${url || '(EMPTY)'}`);
        });
    } else {
        console.log(`WEBHOOKS: (None configured)`);
    }
  }
  console.log(`\n---------------------------------------------------`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
