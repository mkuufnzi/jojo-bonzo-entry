
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'bonzocreatives@gmail.com'; 
  console.log(`Attempting to promote ${email} to ROOT...`);

  const user = await prisma.user.update({
    where: { email },
    data: { role: 'ROOT', isAdmin: true }
  });

  console.log('✅ Success! User updated:', user);
}

main()
  .catch(async (e) => {
    // If email specific fails, try updating the most recent user
    console.log('Email not found, trying most recent user...');
    try {
        const lastUser = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
        if(lastUser) {
            const updated = await prisma.user.update({
                where: { id: lastUser.id },
                data: { role: 'ROOT', isAdmin: true }
            });
            console.log('✅ Success! Updated most recent user:', updated.email);
        } else {
            console.error('No users found.');
        }
    } catch(err) {
        console.error('Final failure:', err);
    }
  })
  .finally(async () => await prisma.$disconnect());
