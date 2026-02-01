
import { FeatureSeeder } from '../src/services/feature-seeder.service';
import prisma from '../src/lib/prisma';

async function main() {
    console.log('🧪 Verifying Feature Seeder Correction...');

    // 1. Run Seeder
    await FeatureSeeder.seedFeatures();

    // 2. Verify 'branded_workflows' feature exists
    const feature = await prisma.feature.findUnique({
        where: { key: 'branded_workflows' }
    });

    if (!feature) {
        console.error('❌ Feature "branded_workflows" NOT FOUND');
        process.exit(1);
    }
    console.log('✅ Feature "branded_workflows" exists.');

    // 3. Verify 'BrandWithJojo' features
    const planName = 'BrandWithJojo - Branded Document Creation and Management Workflows';
    const plan = await prisma.plan.findUnique({ where: { name: planName } });

    if (!plan) {
         console.error(`❌ Plan "${planName}" NOT FOUND`);
         process.exit(1);
    }

    const planFeatures = await prisma.planFeature.findMany({
        where: { planId: plan.id },
        include: { feature: true }
    });

    const featureKeys = planFeatures.map(pf => pf.feature.key);
    console.log(`ℹ️  Features for BrandWithJojo:`, featureKeys);

    const required = ['ai_generation', 'branded_workflows', 'priority_support'];
    const missing = required.filter(k => !featureKeys.includes(k));

    if (missing.length > 0) {
        console.error('❌ Missing expected features:', missing);
        process.exit(1);
    }

    console.log('🚀 Feature Seeder Verification SUCCESS');
}

main().catch(console.error);
