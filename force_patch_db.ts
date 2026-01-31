import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Force load .env.development
dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });

const prisma = new PrismaClient();

async function forcePatch() {
    console.log('--- FORCED DB PATCH ---');
    console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

    try {
        console.log('Checking for requiredFeatureKey in Service table...');
        
        // Use a more direct check for PG
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "requiredFeatureKey" TEXT;
        `);
        console.log('✅ Column ensured in "Service" table.');

        // Initialize values for existing services
        await prisma.$executeRawUnsafe(`
            UPDATE "Service" SET "requiredFeatureKey" = 'ai_generation' WHERE slug = 'ai-doc-generator' AND "requiredFeatureKey" IS NULL;
            UPDATE "Service" SET "requiredFeatureKey" = 'pdf_conversion' WHERE slug = 'html-to-pdf' AND "requiredFeatureKey" IS NULL;
        `);
        console.log('✅ Default values applied.');

    } catch (e: any) {
        console.error('❌ Patch failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

forcePatch();
