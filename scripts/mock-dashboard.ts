import { DashboardController } from '../src/controllers/dashboard.controller';
import prisma from '../src/lib/prisma';

async function testDashboardUnified() {
    console.log('[Mock] Starting test of dashboardUnified...');
    const req = {
        session: { userId: "06663d73-ee45-4764-8519-2ee0a2eeff79" }
    } as any;
    
    // We need to fetch the mock user exactly like session.middleware.ts
    const user = await prisma.user.findUnique({
        where: { id: req.session.userId }
    });

    const res = {
        locals: { user: user, nonce: "nonce-123" },
        redirect: (url: string) => console.log('[Mock Res] REDIRECTED TO:', url),
        render: (view: string, options: any) => {
            console.log('[Mock Res] RENDERED VIEW:', view);
            console.log('[Mock Res] Render Options keys:', Object.keys(options));
            console.log('[Mock Res] Stats:', JSON.stringify(options.stats, null, 2));
            console.log('[Mock Res] Recent Transactions Count:', options.recentTransactions?.length);
        }
    } as any;

    try {
        await DashboardController.dashboardUnified(req, res);
    } catch (e: any) {
        console.error('[Mock] Controller threw an error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

testDashboardUnified();
