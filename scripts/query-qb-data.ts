import prisma from '../src/lib/prisma';

async function queryQBData() {
    const biz = await prisma.business.findFirst({
        where: {
            integrations: {
                some: {
                    provider: 'quickbooks',
                    status: 'connected'
                }
            }
        },
        include: {
            integrations: {
                where: { provider: 'quickbooks' }
            }
        }
    });

    console.log('BIZ:', biz?.id, biz?.name);

    if (biz?.integrations[0]) {
        const int = biz.integrations[0];
        console.log('INT_ID:', int.id);
        console.log('INT_STATUS:', int.status);
        console.log('INT_META:', JSON.stringify(int.metadata));
    } else {
        console.log('NO QB INTEGRATION FOUND');
    }

    // Check existing dunning data
    const actions = await prisma.dunningAction.findMany({ take: 5 });
    console.log('DUNNING_ACTIONS:', JSON.stringify(actions, null, 2));

    const seq = await prisma.dunningSequence.findFirst();
    console.log('DUNNING_SEQ:', JSON.stringify(seq, null, 2));

    await prisma.$disconnect();
}

queryQBData().catch(console.error);
