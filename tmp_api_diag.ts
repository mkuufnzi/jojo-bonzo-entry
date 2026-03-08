import express from 'express';
import { UnifiedDataController } from './src/modules/unified-data/unified-data.controller';
import prisma from './src/lib/prisma';

async function testApiEndpoints() {
    try {
        const user = await prisma.user.findFirst({
            where: { businessId: { not: null } }
        });
        
        if (!user) {
            console.log("No user with businessId found.");
            return;
        }

        console.log(`Testing with user: ${user.email}, businessId: ${user.businessId}`);

        const reqStats: any = {
            user: { businessId: user.businessId },
            query: {}
        };
        
        const resStats: any = {
            status: (code: number) => ({
                json: (data: any) => console.log(`[Stats] STATUS: ${code}, ERROR:`, data)
            }),
            json: (data: any) => {
                console.log(`[Stats] GET SUCCESS. Keys:`, Object.keys(data));
                console.log(`[Stats] Content:`, data);
            }
        };

        const reqInventory: any = {
            user: { businessId: user.businessId },
            query: { page: '1', limit: '5' }
        };
        
        const resInventory: any = {
            status: (code: number) => ({
                json: (data: any) => console.log(`[Inventory] STATUS: ${code}, ERROR:`, data)
            }),
            json: (data: any) => {
                console.log(`[Inventory] GET SUCCESS. Items count:`, data.length);
            }
        };

        const controller = new UnifiedDataController();
        
        console.log("--- Testing getStats ---");
        await controller.getStats(reqStats, resStats);
        
        console.log("--- Testing getInventory ---");
        await controller.getInventory(reqInventory, resInventory);

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

testApiEndpoints();
