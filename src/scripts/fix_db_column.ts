
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Checking User table schema...');
  
  try {
    // 1. Check if column exists
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'businessId';
    `;
    
    console.log('Current Columns Check:', result);

    // 2. Add Column if missing (Postgres)
    // We use quotes "User" and "businessId" to match Prisma's likely case sensitivity if it was created with quotes
    console.log('Attempting to add column...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'User' AND column_name = 'businessId'
        ) THEN
          ALTER TABLE "User" ADD COLUMN "businessId" TEXT;
          RAISE NOTICE 'Added businessId column';
        ELSE
          RAISE NOTICE 'businessId column already exists';
        END IF;
      END $$;
    `);
    
    console.log('✅ Fix script completed.');
  } catch (e) {
    console.error('❌ Error fixing DB:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
