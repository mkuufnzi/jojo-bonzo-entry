import { PrismaClient } from '@prisma/client';

// Use production credentials
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://root_admin:ChangeMe123!@127.0.0.1:5432/postgres?schema=application"
    },
  },
});

async function main() {
    const slugToDelete = 'transactional-branding';
    const slugToKeep = 'transactional-core'; // Floovioo Transactional

    console.log(`🔎 checking for service: ${slugToDelete}...`);

    const service = await prisma.service.findUnique({
        where: { slug: slugToDelete }
    });

    if (!service) {
        console.log(`⚠️ Service '${slugToDelete}' not found. It may have already been deleted.`);
    } else {
        await prisma.service.delete({
            where: { slug: slugToDelete }
        });
        console.log(`✅ Successfully deleted service: ${service.name} (${slugToDelete})`);
    }

    const keeper = await prisma.service.findUnique({
        where: { slug: slugToKeep }
    });
    
    if (keeper) {
        console.log(`ℹ️ Service '${keeper.name}' (${slugToKeep}) is ACTIVE.`);
    } else {
        console.warn(`⚠️ WARNING: Critical service '${slugToKeep}' was not found!`);
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
