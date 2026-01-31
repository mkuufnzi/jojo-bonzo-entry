const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();
const logFile = 'bwj_check.txt';

if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function check() {
  const target = 'bwj.afs.tools';
  log(`Checking user: ${target}`);

  try {
      const user = await prisma.user.findFirst({
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
        log('User not found.');
        return;
      }

      log(`User: ${user.email}`);
      log(`Plan: ${user.subscription?.plan?.name || 'NONE'}`);
      log(`AI Quota: ${user.subscription?.plan?.aiQuota || 0}`);
      
      const features = user.subscription?.plan?.planFeatures || [];
      log(`Plan Features (${features.length}):`);
      features.forEach(pf => {
          log(`- ${pf.feature.key}: ${pf.isEnabled ? 'ENABLED' : 'DISABLED'}`);
      });

  } catch (err) {
      log(`ERROR: ${err.message}`);
  } finally {
      await prisma.$disconnect();
  }
}

check();
