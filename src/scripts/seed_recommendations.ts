import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

async function seedRecommendationData() {
    console.log('🌱 Seeding Realistic Recommendation Data...');

    const business = await prisma.business.findFirst();
    if (!business) {
        console.error('❌ No business found to seed.');
        return;
    }

    const businessId = business.id;

    // 1. Create Products with Categories
    const products = [
        { name: 'Classic Coffee Mug', sku: 'MUG-001', category: 'Drinkware', price: 12.99, img: '☕' },
        { name: 'Double Espresso Cup', sku: 'MUG-002', category: 'Drinkware', price: 9.99, img: '🥃' },
        { name: 'Ceramic Teapot', sku: 'TEA-001', category: 'Brewing', price: 29.99, img: '🫖' },
        { name: 'Coffee Beans (Dark Roast)', sku: 'BEAN-001', category: 'Ingredients', price: 18.00, img: '🫘' },
        { name: 'Paper Filters', sku: 'ACC-001', category: 'Brewing', price: 5.50, img: '📄' }
    ];

    console.log('📦 Creating products...');
    for (const p of products) {
        await prisma.unifiedProduct.upsert({
            where: { businessId_sku: { businessId, sku: p.sku } },
            update: { metadata: { category: p.category, img: p.img } },
            create: {
                businessId,
                name: p.name,
                sku: p.sku,
                price: p.price,
                currency: 'GBP',
                metadata: { category: p.category, img: p.img }
            }
        });
    }

    // 2. Create Customers
    console.log('👥 Creating customers...');
    const customers = [];
    for (let i = 1; i <= 5; i++) {
        const c = await prisma.unifiedCustomer.upsert({
            where: { 
                businessId_email: { 
                    businessId, 
                    email: `customer${i}@example.com` 
                } 
            },
            update: {},
            create: {
                businessId,
                firstName: `Customer`,
                lastName: `${i}`,
                email: `customer${i}@example.com`,
                phone: `0770000000${i}`
            }
        });
        customers.push(c);
    }

    // 3. Create Orders (Affinity Patterns)
    // Goal: MUG-001 and BEAN-001 should have high affinity
    console.log('🧾 Creating orders...');
    if ((prisma as any).unifiedOrder) {
        // Customer 1 buys Mug + Beans
        // Customer 2 buys Mug + Beans
        // Customer 3 buys Teapot + Filters
        const scenarios = [
            { customer: customers[0], skus: ['MUG-001', 'BEAN-001'] },
            { customer: customers[1], skus: ['MUG-001', 'BEAN-001'] },
            { customer: customers[2], skus: ['MUG-001', 'MUG-002'] },
            { customer: customers[3], skus: ['TEA-001', 'ACC-001'] },
            { customer: customers[4], skus: ['BEAN-001'] }
        ];

        for (let i = 0; i < scenarios.length; i++) {
            const s = scenarios[i];
            await (prisma as any).unifiedOrder.create({
                data: {
                    businessId,
                    customerId: s.customer.id,
                    externalId: `ORD-${Date.now()}-${i}`,
                    totalAmount: 50.00,
                    status: 'completed',
                    metadata: {
                        line_items: s.skus.map(sku => ({ sku, quantity: 1, price: 10 }))
                    }
                }
            });
        }
    }

    console.log('✅ Seeding Complete!');
}

seedRecommendationData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
