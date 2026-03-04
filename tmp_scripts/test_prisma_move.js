const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customerId = '5f873a7f-e8bb-4dfb-a693-71a8768484d2'; 
  const businessId = 'c0288ebf-410a-4293-80b4-3bc8ba9e8976'; // Usually hardcoded default in this app for testing or I'll look it up
  
  try {
    const profile = await prisma.debtCollectionCustomerProfile.findFirst({
      where: { debtCustomerId: customerId }
    });
    
    console.log('Found profile:', profile);
    
    if (profile) {
      const res = await prisma.debtCollectionCustomerProfile.update({
        where: { id: profile.id },
        data: { clusterId: null } // Just test update independently
      });
      console.log('Update success', res);
    } else {
        console.log('Profile not found for customerId:', customerId);
    }
  } catch (err) {
    console.error('Prisma Error:', err);
  }
}

main().finally(() => prisma.$disconnect());
