const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customerId = '5f873a7f-e8bb-4dfb-a693-71a8768484d2'; 
  const clusterId = 'abb62075-37d8-4bdb-b747-d397979cee69'; 
  const businessId = '8bc0766d-b529-4f82-808f-63d4b9c85d39'; // Found from earlier test 
  
  try {
    const cluster = await prisma.debtCollectionCluster.findFirst({
        where: { id: clusterId, businessId }
    });
    if (!cluster) { console.log('Cluster not found'); process.exit(1); }

    const profile = await prisma.debtCollectionCustomerProfile.findFirst({
        where: { debtCustomerId: customerId, businessId }
    });

    if (profile) {
        console.log('Profile found, updating...');
        const res = await prisma.debtCollectionCustomerProfile.update({
            where: { id: profile.id },
            data: { clusterId }
        });
        console.log('Update success', res);
    } else {
        console.log('Profile not found, creating...');
        const res = await prisma.debtCollectionCustomerProfile.create({
            data: { debtCustomerId: customerId, clusterId, businessId }
        });
        console.log('Create success', res);
    }
  } catch (err) {
    console.error('Prisma Error:', err.message, err.stack);
  }
}

main().finally(() => prisma.$disconnect());
