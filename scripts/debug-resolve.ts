import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = { id: "06663d73-ee45-4764-8519-2ee0a2eeff79", email: "bonzocreatives@gmail.com" };
    
    const businessId = (user as any).businessId || (user as any).business?.id;
    let business: any = null;

    if (businessId) {
        business = await prisma.business.findUnique({
            where: { id: businessId }
        });
    }

    if (!business) {
        business = await prisma.business.findFirst({
            where: { users: { some: { id: user.id } } },
            orderBy: { createdAt: 'asc' }
        });
    }

    console.log('[Test] Resolved Business:', business ? business.id : 'NULL');
}

main().catch(console.error).finally(() => prisma.$disconnect());
