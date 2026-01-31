
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verifying User Table access...');
  try {
    // Try to find a user (any user) to ensure column mapping is correct
    const user = await prisma.user.findFirst();
    console.log('✅ User query successful. Found user:', user ? user.email : 'None');
    
    // Explicitly check if we can query strictly
    const count = await prisma.user.count();
    console.log('✅ User count successful:', count);

  } catch (error) {
    console.error('❌ User query failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
