import { DashboardController } from '../src/controllers/dashboard.controller';
import prisma from '../src/lib/prisma';
import { Request, Response } from 'express';

async function test() {
    console.log("Starting test...");
    const user = await prisma.user.findFirst();
    if (!user) {
        console.log("No user found");
        return;
    }

    const req = {
        session: { userId: user.id },
        method: 'GET',
        path: '/dashboard/transactional'
    } as any as Request;

    const res = {
        locals: { nonce: '1234' },
        render: (view: string, data: any) => {
            console.log("RENDER SUCCESS", view);
            // console.log("Data:", Object.keys(data));
        },
        status: (code: number) => {
            console.log("STATUS CALLED:", code);
            return res;
        },
        json: (data: any) => {
            console.log("JSON SENT:", data);
        },
        redirect: (url: string) => {
            console.log("REDIRECT:", url);
        }
    } as any as Response;

    const next = (err?: any) => {
        if (err) {
            console.error("NEXT ERROR:", err);
            console.error(err.stack);
        } else {
            console.log("NEXT CALLED (OK)");
        }
    };

    try {
        await DashboardController.dashboardTransactional(req, res, next);
    } catch (e: any) {
        console.error("CAUGHT EXCEPTION:", e);
        console.error(e.stack);
    }
}

test().then(() => {
    console.log("Test finished.");
    process.exit(0);
}).catch(console.error);
