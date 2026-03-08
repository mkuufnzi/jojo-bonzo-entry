import { Request, Response } from 'express';
import { DashboardController } from './src/controllers/dashboard.controller';

async function run() {
    console.log("Mocking Express Request to DashboardController...");
    
    // We know from debug-all-test-users that bwj.afs.tools.test is 71c15a09-da77-4966-81bf-8034d8313f91
    const req = {
        user: { id: '71c15a09-da77-4966-81bf-8034d8313f91' },
        session: { userId: '71c15a09-da77-4966-81bf-8034d8313f91' },
        path: '/dashboard/unified',
        method: 'GET'
    } as unknown as Request;

    const res = {
        locals: { nonce: 'mock-nonce' },
        status: function(code: number) {
            console.log("Status called with:", code);
            return this;
        },
        redirect: function(path: string) {
            console.log("Redirect called with:", path);
        },
        render: function(view: string, options: any) {
            console.log("RENDER CALLED!");
            console.log("View:", view);
            console.log("Options.integrations.length:", options.integrations?.length);
            console.log("Options.stats:", options.stats);
            console.log("Options.recentTransactions.length:", options.recentTransactions?.length);
            if (options.integrations?.length === 0) {
                console.log("WARNING: INTEGRATIONS IS EMPTY!");
            }
        }
    } as unknown as Response;

    try {
        await DashboardController.dashboardUnified(req, res);
    } catch (e: any) {
        console.error("Uncaught error:", e.message);
    }
}

run().catch(console.error);
