import prisma from '../lib/prisma';

/**
 * Seeds realistic recommendation data for local development / QA.
 * 
 * Creates: 5 products (with categories), 5 customers, and 5 orders
 * with affinity patterns (e.g. MUG-001 + BEAN-001 frequently bought together).
 *
 * Uses a sentinel integration to avoid FK issues — finds the first
 * connected integration or creates a "SEED" placeholder.
 */
async function seedRecommendationData() {
    console.log('🌱 Seeding Realistic Recommendation Data...');

    const business = await prisma.business.findFirst({
        include: { integrations: { take: 1 } }
    });

    if (!business) {
        console.error('❌ No business found to seed.');
        return;
    }

    const businessId = business.id;

    // Resolve or create a sentinel integration for FK satisfaction
    let integrationId = business.integrations[0]?.id;
    if (!integrationId) {
        const sentinel = await prisma.integration.create({
            data: {
                businessId,
                provider: 'seed',
                status: 'connected'
            }
        });
        integrationId = sentinel.id;
        console.log(`🔗 Created sentinel integration: ${integrationId}`);
    }

    // ───────────────────────────────────────────────────────────
    // 1. Products
    // ───────────────────────────────────────────────────────────
    const products = [
        { name: 'Classic Coffee Mug', sku: 'MUG-001', category: 'Drinkware', price: 12.99, img: '☕' },
        { name: 'Double Espresso Cup', sku: 'MUG-002', category: 'Drinkware', price: 9.99, img: '🥃' },
        { name: 'Ceramic Teapot', sku: 'TEA-001', category: 'Brewing', price: 29.99, img: '🫖' },
        { name: 'Coffee Beans (Dark Roast)', sku: 'BEAN-001', category: 'Ingredients', price: 18.00, img: '🫘' },
        { name: 'Paper Filters', sku: 'ACC-001', category: 'Brewing', price: 5.50, img: '📄' }
    ];

    console.log('📦 Creating products...');
    for (const p of products) {
        const externalId = `seed-product-${p.sku}`;
        await prisma.unifiedProduct.upsert({
            where: { businessId_integrationId_externalId: { businessId, integrationId, externalId } },
            update: { name: p.name, price: p.price, metadata: { category: p.category, img: p.img } },
            create: {
                businessId,
                integrationId,
                externalId,
                name: p.name,
                sku: p.sku,
                price: p.price,
                currency: 'GBP',
                source: 'seed',
                metadata: { category: p.category, img: p.img }
            }
        });
    }

    // ───────────────────────────────────────────────────────────
    // 2. Customers
    // ───────────────────────────────────────────────────────────
    console.log('👥 Creating customers...');
    const customers: { id: string; name: string }[] = [];
    for (let i = 1; i <= 5; i++) {
        const externalId = `seed-customer-${i}`;
        const c = await prisma.unifiedCustomer.upsert({
            where: { businessId_integrationId_externalId: { businessId, integrationId, externalId } },
            update: {},
            create: {
                businessId,
                integrationId,
                externalId,
                name: `Customer ${i}`,
                email: `customer${i}@example.com`,
                phone: `0770000000${i}`,
                source: 'seed'
            }
        });
        customers.push(c);
    }

    // ───────────────────────────────────────────────────────────
    // 3. Orders (Affinity Patterns)
    // MUG-001 + BEAN-001 should have high affinity
    // ───────────────────────────────────────────────────────────
    console.log('🧾 Creating orders...');
    const scenarios = [
        { customer: customers[0], skus: ['MUG-001', 'BEAN-001'] },
        { customer: customers[1], skus: ['MUG-001', 'BEAN-001'] },
        { customer: customers[2], skus: ['MUG-001', 'MUG-002'] },
        { customer: customers[3], skus: ['TEA-001', 'ACC-001'] },
        { customer: customers[4], skus: ['BEAN-001'] }
    ];

    for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const externalId = `seed-order-${i}-${Date.now()}`;
        await prisma.unifiedOrder.create({
            data: {
                businessId,
                integrationId,
                externalId,
                customerId: s.customer.id,
                totalAmount: 50.00,
                status: 'completed',
                source: 'seed',
                metadata: {
                    line_items: s.skus.map(sku => ({ sku, quantity: 1, price: 10 }))
                }
            }
        });
    }

    console.log('✅ Seeding Complete!');
}

seedRecommendationData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
