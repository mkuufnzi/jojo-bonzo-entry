
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️ Purging non-admin users...');

  // 0. Find target users
  const users = await prisma.user.findMany({
      where: { role: { not: 'ADMIN' } },
      select: { id: true }
  });
  const userIds = users.map(u => u.id);
  console.log(`🎯 Found ${userIds.length} non-admin users to purge.`);

  // 1. Delete Dependencies (Reverse topological order of dependencies)
  
  // Invoices (depend on User, Subscription, PaymentMethod)
  await prisma.invoice.deleteMany({
      where: { userId: { in: userIds } }
  });
  console.log(' - Deleted Invoices');

  // UsageLogs (depend on User)
  await prisma.usageLog.deleteMany({
      where: { userId: { in: userIds } }
  });
  console.log(' - Deleted UsageLogs');
  
  // Subscriptions (depend on User)
  await prisma.subscription.deleteMany({
      where: { userId: { in: userIds } }
  });
  console.log(' - Deleted Subscriptions');

  // PaymentMethods (depend on User)
  await prisma.paymentMethod.deleteMany({
      where: { userId: { in: userIds } }
  });
  console.log(' - Deleted PaymentMethods');

  // Apps (depend on User)
  // Note: AppServices cascade on App delete usually, but let's trust Prisma schema
  await prisma.app.deleteMany({
      where: { userId: { in: userIds } }
  });
  console.log(' - Deleted Apps');

  // Notifications (User has Cascade, but safe to be explicit)
  await prisma.notification.deleteMany({
      where: { userId: { in: userIds } }
  });

  // AdminLogs (Fix for Foreign Key Constraint)
  await prisma.adminLog.deleteMany({
      where: { adminId: { in: userIds } }
  });
  console.log(' - Deleted AdminLogs');
  
  // UserProfile (User has Cascade)
  // NotificationConfig (User has Cascade)

  // 2. Delete Users who are not ADMIN
  const { count } = await prisma.user.deleteMany({
    where: {
      id: { in: userIds }
    }
  });

  console.log(`✅ Deleted ${count} non-admin users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
