
import dotenv from 'dotenv';
dotenv.config({ path: 'environments/.env.development' });
import prisma from '../lib/prisma';

async function main() {
  const integrations = await prisma.integration.findMany();
  console.log(`Found ${integrations.length} total integrations.`);

  const validZoho = integrations.find(i => i.accessToken && i.accessToken.startsWith('1000.'));

  if (!validZoho) {
      console.log('Use Caution: No obvious Real Zoho token found. Listing all to be safe:');
      integrations.forEach(i => console.log(`${i.provider}: ${i.accessToken?.substring(0,10)}`));
      return;
  }

  console.log(`Keeping Valid Zoho Integration: ${validZoho.id} (${validZoho.provider})`);

  const toDelete = integrations.filter(i => i.id !== validZoho.id);
  
  if (toDelete.length > 0) {
      console.log(`Deleting ${toDelete.length} legacy/mock integrations...`);
      const res = await prisma.integration.deleteMany({
          where: {
              id: { in: toDelete.map(i => i.id) }
          }
      });
      console.log(`Deleted ${res.count} records.`);
  } else {
      console.log('No legacy integrations found to delete.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
