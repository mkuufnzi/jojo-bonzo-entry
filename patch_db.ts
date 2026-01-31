import prisma from './src/lib/prisma';

async function patchDatabase() {
    console.log('--- MANUAL DATABASE PATCH ---');
    try {
        console.log('Adding "requiredFeatureKey" column to "Service" table...');
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Service' AND column_name='requiredFeatureKey') THEN
                    ALTER TABLE "Service" ADD COLUMN "requiredFeatureKey" TEXT;
                    RAISE NOTICE 'Column Added';
                ELSE
                    RAISE NOTICE 'Column already exists';
                END IF;
            END $$;
        `);
        console.log('✅ Column added or already exists.');

        // Also check Feature table
        console.log('Checking "Feature" table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Feature" (
                "id" TEXT NOT NULL,
                "key" TEXT NOT NULL,
                "name" TEXT NOT NULL,
                "description" TEXT,
                "category" TEXT NOT NULL,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,

                CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
            );
        `);
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "Feature_key_key" ON "Feature"("key");
        `);
        console.log('✅ Feature table verified.');

        // Update existing services if needed
        console.log('Patching existing service records...');
        await prisma.service.updateMany({
            where: { slug: 'ai-doc-generator', requiredFeatureKey: null },
            data: { requiredFeatureKey: 'ai_generation' }
        });
        await prisma.service.updateMany({
            where: { slug: 'html-to-pdf', requiredFeatureKey: null },
            data: { requiredFeatureKey: 'pdf_conversion' }
        });
        console.log('✅ Service records patched.');

    } catch (e) {
        console.error('❌ Patch failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

patchDatabase();
