import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    try {
        const id: any = undefined;
        const user = await prisma.user.findUnique({ where: { id } });
        console.log("Returned:", user);
    } catch (e: any) {
        console.log("Error thrown:", e.message);
    }
}
run().catch(console.error).finally(() => prisma.$disconnect());
