import { SeederService } from '../services/seeder.service';
import prisma from '../lib/prisma';

async function main() {
  try {
    console.log('Running seeder in isolation...');
    await SeederService.seed();
    console.log('Seeding successful!');
  } catch (error) {
    console.error('Seeder failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
