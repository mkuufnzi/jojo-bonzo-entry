import { PrismaClient } from '@prisma/client';
import { QBOProvider } from '../src/services/integrations/providers/quickbooks.provider';

const prisma = new PrismaClient();

async function repairGhostRecoveries() {
    console.log('🚀 Starting Data Repair: Ghost Recoveries...');

    try {
        // Find all businesses with active QBO integrations
        const integrations = await prisma.integration.findMany({
            where: { provider: 'quickbooks', status: 'connected' }
        });

        console.log(`Found ${integrations.length} active Quickbooks integrations.`);

        for (const integration of integrations) {
            console.log(`\n===========================================`);
            console.log(`🔄 Processing Business ID: ${integration.businessId}`);
            
            // 1. Initialize Provider
            const provider = new QBOProvider();
            await provider.initialize(integration as any);

            // 2. Fetch the true source of truth (ALL Unpaid Invoices > 0 balance)
            const unpaidInvoices = await provider.getAllUnpaidInvoices();
            const unpaidIds = new Set(unpaidInvoices.map(inv => inv.externalId));

            console.log(`📊 Found ${unpaidIds.size} truly UNPAID invoices in QBO.`);

            // 3. Find all currently "RECOVERED" sessions in our DB
            const recoveredSessions = await prisma.recoverySession.findMany({
                where: { businessId: integration.businessId, status: 'RECOVERED' }
            });

            console.log(`🔍 Found ${recoveredSessions.length} sessions marked as RECOVERED in DB.`);

            let falsePositives = 0;

            // 4. Cross-Reference. If a "Recovered" session is STILL in the Unpaid list, it's a Ghost!
            for (const session of recoveredSessions) {
                if (unpaidIds.has(session.externalInvoiceId)) {
                    falsePositives++;
                    
                    const existingActive = await prisma.recoverySession.findFirst({
                        where: {
                            businessId: integration.businessId,
                            externalInvoiceId: session.externalInvoiceId,
                            status: 'ACTIVE'
                        }
                    });

                    if (existingActive) {
                        // Delete the ghost redundant session completely to avoid P2002
                        await prisma.recoverySession.delete({ where: { id: session.id } });
                    } else {
                        // Revert it back to ACTIVE
                        await prisma.recoverySession.update({
                            where: { id: session.id },
                            data: {
                                status: 'ACTIVE',
                                updatedAt: new Date(),
                                metadata: {
                                    ...(typeof session.metadata === 'object' ? session.metadata as object : {}),
                                    repairLog: `Reverted from RECOVERED to ACTIVE by Ghost Wipe Script`
                                }
                            }
                        });
                    }
                }
            }

            console.log(`🎯 Reverted ${falsePositives} GHOST sessions back to ACTIVE.`);
            console.log(`===========================================\n`);
        }

        console.log('✅ Repair Complete. The dashboard should now reflect accurate truth.');

    } catch (error) {
        console.error('❌ Repair Script Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

repairGhostRecoveries();
