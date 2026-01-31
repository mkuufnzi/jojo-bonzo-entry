
import prisma from '../src/lib/prisma';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.log('ADMIN_EMAIL not set');
    return;
  }
  console.log(`Checking admin user: ${email}`);
  const user = await prisma.user.findUnique({
    where: { email }
  });
  console.log('User found:', user ? 'Yes' : 'No');
  if (user) {
    console.log('ID:', user.id);
  }
}

main();
