const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const logFile = 'debug_output.txt';

if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function debugUser() {
  const target = 'bwj.afs.tools';
  log(`Checking user: ${target}`);

  try {
      let user = await prisma.user.findFirst({
        where: { 
          OR: [
            { email: { contains: target, mode: 'insensitive' } },
            { name: { contains: target, mode: 'insensitive' } }
          ]
        },
        include: {
          subscription: {
            include: {
              plan: {
                include: {
                  planFeatures: {
                    include: {
                      feature: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!user) {
        log('User not found. Listing first 10 users:');
        const users = await prisma.user.findMany({ take: 10 });
        users.forEach(u => log(`- ${u.email} (${u.id})`));
        return;
      }

      log('User Found:');
      log(`- ID: ${user.id}`);
      log(`- Email: ${user.email}`);
      log(`- Name: ${user.name}`);
      log(`- Subscription Status: ${user.subscription?.status || 'No Subscription'}`);
      log(`- Plan Name: ${user.subscription?.plan?.name || 'No Plan'}`);
      log(`- AI Quota: ${user.subscription?.plan?.aiQuota}`);
      log(`- PDF Quota: ${user.subscription?.plan?.pdfQuota}`);
      log(`- Features (Legacy): ${user.subscription?.plan?.features}`);
      log('- Plan Features:');
      if (user.subscription?.plan?.planFeatures) {
          user.subscription.plan.planFeatures.forEach(pf => {
            log(`  - ${pf.feature.key}: ${pf.isEnabled ? 'ENABLED' : 'DISABLED'}`);
          });
      }
  } catch (err) {
      log(`ERROR: ${err.message}`);
  } finally {
      await prisma.$disconnect();
  }
}

debugUser();
