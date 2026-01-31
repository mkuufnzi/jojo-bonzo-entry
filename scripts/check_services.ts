
    import prisma from '../src/lib/prisma';

    async function main() {
        try {
            const count = await prisma.service.count();
            console.log(`\n📊 Service Count: ${count}`);

            const services = await prisma.service.findMany();
            if (services.length === 0) {
                console.log('❌ No services found in database.');
            } else {
                console.log('✅ Services found:');
                services.forEach(s => console.log(`   - ${s.name} (${s.slug})`));
            }
        } catch (error) {
            console.error('❌ Error checking services:', error);
        } finally {
            await prisma.$disconnect();
        }
    }

    main();
    
