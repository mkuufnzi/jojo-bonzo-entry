import { PrismaClient } from '@prisma/client';
const p = new PrismaClient() as any;

async function main() {
    const r = await p.debtCollectionSession.updateMany({
        where: { status: 'ACTIVE', nextActionAt: { gt: new Date() } },
        data: { nextActionAt: new Date() }
    });
    console.log(`✅ Updated ${r.count} sessions nextActionAt → NOW`);
    
    // Also count current active sessions
    const active = await p.debtCollectionSession.count({ where: { status: 'ACTIVE' } });
    const due = await p.debtCollectionSession.count({ 
        where: { status: 'ACTIVE', nextActionAt: { lte: new Date() } }
    });
    console.log(`📊 Active: ${active} | Due now: ${due}`);
    await p.$disconnect();
}
main().catch(console.error);
