
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const customers = await prisma.unifiedCustomer.findMany({
      take: 5,
      include: { orders: true, invoices: true }
    });
    
    console.log('--- SAMPLE CUSTOMERS ---');
    customers.forEach(c => {
      console.log(`ID: ${c.id}, Name: ${c.name}, BusinessId: ${c.businessId}, Orders: ${c.orders.length}, Invoices: ${c.invoices.length}`);
    });

    const products = await prisma.unifiedProduct.findMany({
      take: 5
    });

    console.log('\n--- SAMPLE PRODUCTS ---');
    products.forEach(p => {
      console.log(`SKU: ${p.sku}, Name: ${p.name}`);
    });
  } catch (err) {
    console.error('Prisma Error:', err);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
