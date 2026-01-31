
        import { PrismaClient } from '@prisma/client';
        const prisma = new PrismaClient();
        
        async function main() {
            try {
                const s = await prisma.service.findFirst({ where: { slug: 'ai-doc-generator' } });
                console.log('--- AI DOC GENERATOR CONFIG ---');
                console.log(JSON.stringify(s?.config, null, 2));
            } catch (e) {
                console.error(e);
            } finally {
                await prisma.$disconnect();
            }
        }
        main();
        
