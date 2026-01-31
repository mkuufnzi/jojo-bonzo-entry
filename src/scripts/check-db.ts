import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Plan'
    `;
    console.log('Columns in Plan table:', JSON.stringify(columns, null, 2));

    console.log('Testing prisma.plan.findMany()...');
    console.log('Testing prisma.plan.upsert()...');
    const testPlan = {
      name: 'Test Plan ' + Date.now(),
      price: 9.99,
      currency: 'GBP',
      requestLimit: 100,
      pdfQuota: 50,
      aiQuota: 20,
      features: '[]'
    };
    await prisma.plan.upsert({
      where: { name: testPlan.name },
      update: { currency: 'EUR' },
      create: testPlan
    });
    console.log('Upsert successful!');

    // Cleanup
    await prisma.plan.delete({ where: { name: testPlan.name } });
    console.log('Cleanup successful!');
  } catch (error) {
    console.error('Error checking DB:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
