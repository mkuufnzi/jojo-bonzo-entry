import { DashboardController } from './src/controllers/dashboard.controller';
import prisma from './src/lib/prisma';

async function testDashboardUnified() {
    try {
        const user = await prisma.user.findFirst({
            where: { businessId: { not: null } }
        });
        
        if (!user) {
            console.log("No user with businessId found.");
            return;
        }

        console.log(`Testing with user: ${user.email}, businessId: ${user.businessId}`);

        const req: any = {
            session: { userId: user.id },
            query: {}
        };
        
        const res: any = {
            locals: { user, nonce: '123' },
            render: (view: string, data: any) => {
                console.log(`RENDER CALLED: ${view}`);
                console.log(`DATA STATS:`, data.stats);
            },
            redirect: (url: string) => {
                console.log(`REDIRECT CALLED: ${url}`);
            },
            status: (code: number) => {
                console.log(`STATUS CALLED: ${code}`);
                return res;
            }
        };

        await DashboardController.dashboardUnified(req, res);
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

testDashboardUnified();
