
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const features = [
    {
        name: 'ai-doc-generator',
        description: 'AI Service for generating documents via n8n.',
        files: ['src/services/ai.service.ts', 'src/workers/ai.processor.ts', 'src/views/services/ai-doc-generator.ejs'],
        associated_constraints: ['hitl-flow', 'strict-endpoint-separation', 'n8n-joblog-wrapper']
    },
    {
        name: 'pdf-conversion',
        description: 'High-performance HTML to PDF conversion engine.',
        files: ['src/services/pdf.service.ts', 'src/workers/pdf.processor.ts'],
        associated_constraints: ['async-polling', 'puppeteer-isolation']
    },
    {
        name: 'authentication',
        description: 'User and API authentication layer.',
        files: ['src/services/auth.service.ts', 'src/middleware/auth.middleware.ts', 'src/middleware/public-auth.middleware.ts'],
        associated_constraints: ['zero-trust-api', 'public-guest-token']
    },
    {
        name: 'billing-quotas',
        description: 'Subscription management and strict usage limits.',
        files: ['src/services/billing.service.ts', 'src/services/quota.service.ts', 'src/services/usage.service.ts', 'src/services/subscription.service.ts'],
        associated_constraints: ['strict-quota-enforcement']
    },
    {
        name: 'infrastructure',
        description: 'Core system plumbing (Queues, Webhooks, Email).',
        files: ['src/workers/index.ts', 'src/services/webhook.service.ts', 'src/services/email.service.ts'],
        associated_constraints: ['worker-process-separation']
    }
];

const constraints = [
    {
        name: 'async-polling',
        description: 'Long-running tasks MUST return 202 Accepted + Job ID.',
        technical_detail: 'Client polls /jobs/:id. Never await PDF generation in the HTTP request loop.',
        severity: 'CRITICAL'
    },
    {
        name: 'puppeteer-isolation',
        description: 'Puppeteer must run in worker process with sandbox flags.',
        technical_detail: 'Use --no-sandbox, --disable-dev-shm-usage. Managed by PdfService singleton.',
        severity: 'WARNING'
    },
    {
        name: 'zero-trust-api',
        description: 'All API endpoints require X-API-Key or valid Session.',
        technical_detail: 'Verified by auth.middleware.ts. Do not expose public routes without public-auth middleware.',
        severity: 'CRITICAL'
    },
    {
        name: 'strict-quota-enforcement',
        description: 'Hard stop when limits are reached.',
        technical_detail: 'Backend throws 403 Forbidden. Frontend triggers full page reload to show Limit UI.',
        severity: 'CRITICAL'
    },
    {
        name: 'worker-process-separation',
        description: 'CPU intensive tasks run in Worker thread/process.',
        technical_detail: 'API handles HTTP. Workers handle BullMQ jobs. Do not run heavy computation in API controllers.',
        severity: 'INFO'
    },
    // AI Specifics (re-seeding to be safe)
    {
        name: 'hitl-flow',
        description: 'Two-Phase Analysis -> Generation flow.',
        technical_detail: 'Phase 1: /analyze. Phase 2: /generate. Stateless between phases (client passes context).',
        severity: 'CRITICAL'
    }
];

const fileContexts = [
    {
        path: 'src/services/pdf.service.ts',
        summary: 'Orchestrates PDF jobs and Browser instance.',
        fragility_score: 'MEDIUM',
        key_responsibilities: ['Browser Singleton', 'Queue Management']
    },
    {
        path: 'src/workers/pdf.processor.ts',
        summary: 'The actual Puppeteer rendering logic.',
        fragility_score: 'HIGH',
        key_responsibilities: ['Page.pdf()', 'HTML Injection', 'Error Handling']
    },
    {
        path: 'src/services/quota.service.ts',
        summary: 'Calculates and enforces limits.',
        fragility_score: 'HIGH',
        key_responsibilities: ['Redis Counters', 'Plan Limits']
    }
];

async function seed() {
    console.log('🌱 Seeding Full Knowledge Base...');
    let count = 0;

    try {
        // Save Features
        for (const f of features) {
            await redis.set(`codex:feature:${f.name}`, JSON.stringify({ ...f, last_updated: new Date().toISOString() }));
            console.log(`  + Feature: ${f.name}`);
            count++;
        }

        // Save Constraints
        for (const c of constraints) {
            await redis.set(`codex:constraint:${c.name}`, JSON.stringify({ ...c, created_at: new Date().toISOString() }));
            console.log(`  + Constraint: ${c.name}`);
            count++;
        }

        // Save Files
        for (const f of fileContexts) {
            await redis.set(`codex:file:${f.path}`, JSON.stringify({ ...f, last_updated: new Date().toISOString() }));
            console.log(`  + File: ${f.path}`);
            count++;
        }

        console.log(`✅ Seeded ${count} items into The Codex.`);
    } catch (e) {
        console.error('❌ Seeding Failed:', e);
    } finally {
        redis.disconnect();
    }
}

seed();
