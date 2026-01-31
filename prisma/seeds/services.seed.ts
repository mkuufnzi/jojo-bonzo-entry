import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

const coreServices = [
  {
    slug: 'floovioo_transactional_data-sync',
    name: 'Data Sync Engine',
    description: 'Internal-first service ensuring ERP data is synchronized to Floovioo/n8n datastores',
    tier: 'transactional',
    dependencies: ['floovioo_core_cache', 'floovioo_core_database', 'floovioo_core_vector-store'],
    provides: ['data-sync', 'erp-integration', 'real-time-updates'],
    endpoints: [
      { path: '/api/v1/sync/integrations/{provider}/full', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sync/integrations/{provider}/incremental', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sync/status/{integrationId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sync/entities/{entityType}/batch', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sync/entities/{entityType}/{externalId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sync/webhooks/{provider}/register', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sync/webhooks/{provider}/unregister', method: 'DELETE', scopes: ['write'] },
      { path: '/api/v1/sync/cache/invalidate', method: 'GET', scopes: ['admin'] },
      { path: '/api/v1/sync/validate', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/sync/analytics/performance', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sync/retry/{jobId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sync/conflicts', method: 'GET', scopes: ['read'] }
    ],
    defaultConfig: {
      syncInterval: '15m',
      batchSize: 100,
      retryAttempts: 3,
      redis: { ttl: 3600, keyPrefix: 'sync:' },
      qdrant: { collection: 'erp_documents', vectorSize: 1536 }
    }
  },
  {
    slug: 'floovioo_transactional_debt-collection',
    name: 'Debt Collection AI',
    description: 'AI-powered dunning and payment recovery automation with risk scoring',
    tier: 'transactional',
    dependencies: [
      'floovioo_transactional_data-sync',
      'floovioo_shared_ai-content-generator',
      'floovioo_shared_multi-channel-delivery',
      'floovioo_core_analytics'
    ],
    provides: ['dunning', 'payment-recovery', 'risk-scoring'],
    endpoints: [
      { path: '/api/v1/debt-collection/analyze/{invoiceId}', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/debt-collection/sequences/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/debt-collection/sequences', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/debt-collection/sequences/{id}', method: 'PUT', scopes: ['write'] },
      { path: '/api/v1/debt-collection/trigger/{invoiceId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/debt-collection/status/{invoiceId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/debt-collection/pause/{invoiceId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/debt-collection/escalate/{invoiceId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/debt-collection/analytics/recovery-rate', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/debt-collection/ml/train', method: 'POST', scopes: ['admin'] },
      { path: '/api/v1/debt-collection/recommendations/{customerId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/debt-collection/callbacks/payment-received', method: 'POST', scopes: ['write'] }
    ],
    defaultConfig: {
      ml: { model: 'xgboost', features: ['payment_history', 'invoice_amount', 'days_overdue'], retrainInterval: '7d' },
      prioritization: { minAmount: 100, riskThreshold: 0.7 }
    }
  },
  {
    slug: 'floovioo_shared_ai-content-generator',
    name: 'AI Content Engine',
    description: 'Shared service for generating AI content (emails, summaries, marketing copy) using GPT-4',
    tier: 'content',
    dependencies: ['floovioo_core_ai-gateway', 'floovioo_core_template-engine'],
    provides: ['ai-generation', 'personalization', 'translation'],
    endpoints: [
      { path: '/api/v1/ai/generate/email', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/generate/summary', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/generate/marketing-copy', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/translate', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/personalize', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/sentiment-analysis', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/ai/extract-entities', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/ai/templates', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/ai/templates/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/batch', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/ai/usage/{appId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/ai/feedback', method: 'POST', scopes: ['write'] }
    ],
    defaultConfig: {
      llm: { provider: 'openai', model: 'gpt-4o-mini', fallback: 'anthropic/claude-3-haiku', maxTokens: 1000 },
      rateLimit: { requestsPerMinute: 60, tokensPerDay: 100000 }
    }
  },
  {
    slug: 'floovioo_shared_publisher',
    name: 'Publisher Engine',
    description: 'High-end branded document generation (invoices, receipts, reports)',
    tier: 'content',
    dependencies: ['floovioo_core_design-engine', 'floovioo_core_cdn', 'floovioo_shared_ai-content-generator'],
    provides: ['document-generation', 'template-design', 'pdf-rendering'],
    endpoints: [
      { path: '/api/v1/publisher/render/{templateId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/publisher/templates/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/publisher/templates', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/publisher/templates/{id}', method: 'PUT', scopes: ['write'] },
      { path: '/api/v1/publisher/templates/{id}', method: 'DELETE', scopes: ['write'] },
      { path: '/api/v1/publisher/preview', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/publisher/batch', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/publisher/status/{jobId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/publisher/themes/extract', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/publisher/assets/upload', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/publisher/fonts', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/publisher/watermark', method: 'POST', scopes: ['write'] }
    ],
    defaultConfig: {
      rendering: { engine: 'chromium-headless', timeout: 30000, dpi: 300 },
      cdn: { provider: 'cloudflare-r2', ttl: 2592000 }
    }
  },
  {
    slug: 'floovioo_shared_multi-channel-delivery',
    name: 'Omnichannel Delivery',
    description: 'Unified delivery API for Email, SMS, WhatsApp, and Push notifications',
    tier: 'shared',
    dependencies: ['floovioo_core_message-queue', 'floovioo_core_analytics'],
    provides: ['email-delivery', 'sms-delivery', 'whatsapp-delivery', 'push-notifications'],
    endpoints: [
      { path: '/api/v1/delivery/send/email', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/send/sms', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/send/whatsapp', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/send/push', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/send/batch', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/status/{messageId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/delivery/webhooks/register', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/analytics/sent', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/delivery/analytics/opened', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/delivery/templates/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/opt-out', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/delivery/channels/status', method: 'GET', scopes: ['read'] }
    ],
    defaultConfig: {
      providers: { email: 'sendgrid', sms: 'twilio', whatsapp: 'twilio', push: 'firebase' },
      rateLimit: { emailPerHour: 10000, smsPerHour: 1000 }
    }
  },
  {
    slug: 'floovioo_sales_accelerator',
    name: 'Sales Accelerator',
    description: 'Post-sale customer nurturing and LTV maximization product',
    tier: 'sales',
    dependencies: [
      'floovioo_transactional_data-sync',
      'floovioo_shared_ai-content-generator',
      'floovioo_shared_publisher',
      'floovioo_shared_multi-channel-delivery',
      'floovioo_core_crm'
    ],
    provides: ['upsell-automation', 'support-automation', 'education-delivery'],
    endpoints: [
      { path: '/api/v1/sales-accel/campaigns/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/campaigns', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sales-accel/analyze/customer/{id}', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/sales-accel/recommendations/{customerId}', method: 'POST', scopes: ['read'] },
      { path: '/api/v1/sales-accel/tutorials/generate', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/support/summarize', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/triggers/purchase-thank-you', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/analytics/ltv-trend', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sales-accel/segments/create', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/health-score/{customerId}', method: 'GET', scopes: ['read'] },
      { path: '/api/v1/sales-accel/churn-prevention/{customerId}', method: 'POST', scopes: ['write'] },
      { path: '/api/v1/sales-accel/roi', method: 'GET', scopes: ['read'] }
    ],
    defaultConfig: {
      ml: { ltvModel: 'prophet', churnModel: 'random-forest', retrainInterval: '30d' },
      campaigns: { defaultJourney: [{ trigger: 'purchase', delay: '1h', action: 'send-thank-you' }] }
    }
  }
];

async function main() {
  console.log('🌱 Seeding 6 Core Microservices...');

  for (const service of coreServices) {
    console.log(`Processing service: ${service.name} (${service.slug})`);
    
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: {
        name: service.name,
        description: service.description,
        tier: service.tier,
        dependencies: service.dependencies,
        provides: service.provides,
        endpoints: service.endpoints,
        defaultConfig: service.defaultConfig,
        updatedAt: new Date()
      },
      create: {
        id: uuid(),
        slug: service.slug,
        name: service.name,
        description: service.description,
        isActive: true,
        tier: service.tier,
        dependencies: service.dependencies,
        provides: service.provides,
        requires: [],
        endpoints: service.endpoints,
        defaultConfig: service.defaultConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  console.log('✅ Service seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
