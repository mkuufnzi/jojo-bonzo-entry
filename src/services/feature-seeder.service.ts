import prisma from '../lib/prisma';

/**
 * Seed features and assign them to plans
 */
export class FeatureSeeder {
  static async seedFeatures() {
    console.log('🎯 Seeding Features...');

    // Define all available features
    const features = [
      {
        key: 'pdf_conversion',
        name: 'PDF Conversion',
        description: 'Convert HTML to PDF documents',
        category: 'core',
      },
      {
        key: 'ai_generation',
        name: 'AI Content Generation',
        description: 'Generate documents using AI',
        category: 'advanced',
      },
      {
        key: 'api_access',
        name: 'API Access',
        description: 'Access via REST API',
        category: 'advanced',
      },
      {
        key: 'priority_support',
        name: 'Priority Support',
        description: 'Get priority customer support',
        category: 'support',
      },
      {
        key: 'analytics',
        name: 'Analytics Dashboard',
        description: 'View detailed analytics and insights',
        category: 'advanced',
      },
      {
        key: 'custom_integrations',
        name: 'Custom Integrations',
        description: 'Custom integration support',
        category: 'enterprise',
      },
      {
        key: 'branded_workflows',
        name: 'Branded Workflows',
        description: 'Access to custom branded document workflows',
        category: 'pro'
      },
      {
        key: 'sla',
        name: 'SLA Guarantee',
        description: 'Service Level Agreement',
        category: 'enterprise',
      },
    ];

    // Upsert features
    for (const feature of features) {
      await prisma.feature.upsert({
        where: { key: feature.key },
        update: feature,
        create: feature,
      });
    }

    console.log(`   ✅ Created/Updated ${features.length} features`);

    // Get all plans and features
    const plans = await prisma.plan.findMany();
    const allFeatures = await prisma.feature.findMany();

    // Define feature assignments per plan
    const planFeatureMap: Record<string, string[]> = {
      Free: ['pdf_conversion', 'ai_generation'],
      Teaser: ['pdf_conversion', 'ai_generation'],
      Starter: ['pdf_conversion', 'ai_generation', 'api_access'],
      Pro: ['pdf_conversion', 'ai_generation', 'api_access', 'priority_support', 'analytics'],
      Enterprise: ['pdf_conversion', 'ai_generation', 'api_access', 'priority_support', 'analytics', 'custom_integrations', 'sla'],
      'BrandWithJojo - Branded Document Creation and Management Workflows': ['ai_generation', 'branded_workflows', 'priority_support', 'api_access']
    };

    // Assign features to plans
    for (const plan of plans) {
      const featureKeys = planFeatureMap[plan.name] || [];
      
      for (const featureKey of featureKeys) {
        const feature = allFeatures.find(f => f.key === featureKey);
        if (!feature) continue;

        await prisma.planFeature.upsert({
          where: {
            planId_featureId: {
              planId: plan.id,
              featureId: feature.id,
            },
          },
          update: { isEnabled: true },
          create: {
            planId: plan.id,
            featureId: feature.id,
            isEnabled: true,
          },
        });
      }

      console.log(`   ✅ Assigned ${featureKeys.length} features to ${plan.name}`);
    }

    console.log('✅ Feature seeding complete!');
  }
}
