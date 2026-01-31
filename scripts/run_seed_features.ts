
import { FeatureSeeder } from '../src/services/feature-seeder.service';
import prisma from '../src/lib/prisma';

async function main() {
    try {
        await FeatureSeeder.seedFeatures();
        console.log('✅ Feature seeding triggered successfully.');
    } catch (error) {
        console.error('❌ Error seeding features:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
