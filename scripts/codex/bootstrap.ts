
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const features = [
    {
        name: 'ai-doc-generator',
        description: 'AI Document Generator Service with Human-in-the-Loop workflow.',
        files: [
            'src/services/ai.service.ts',
            'src/views/services/ai-doc-generator.ejs'
        ],
        associated_constraints: [
            'hitl-flow',
            'strict-endpoint-separation',
            'n8n-joblog-wrapper',
            'quota-gating'
        ],
        last_updated: new Date().toISOString()
    }
];

const constraints = [
    {
        name: 'hitl-flow',
        description: 'Two-Phase Stateless Architecture. Phase 1: Analyze (Atomic). Phase 2: Generate (Atomic).',
        technical_detail: 'State is maintained via jobId/requestId passed between client and server. No server-side session state for the document generation process itself.',
        severity: 'CRITICAL',
        created_at: new Date().toISOString()
    },
    {
        name: 'strict-endpoint-separation',
        description: 'Initial Request MUST use /analyze. Generation MUST use /generate.',
        technical_detail: 'Do not conditionally change the endpoint in the generic submit handler. The Modal button has its own handler for /generate.',
        severity: 'CRITICAL',
        created_at: new Date().toISOString()
    },
    {
        name: 'n8n-joblog-wrapper',
        description: 'n8n returns 200 OK with data wrapped in stringified "jobLog" field.',
        technical_detail: 'AiService must explicitly check for responseData.jobLog and JSON.parse() it. Do not rely on axios to unwrap this.',
        severity: 'WARNING',
        created_at: new Date().toISOString()
    },
    {
        name: 'quota-gating',
        description: 'Strict hard-stop compliance for billing quotas.',
        technical_detail: 'Frontend must reload page on 403 Forbidden to show Limit Reached UI. Backend must block request before calling AI provider.',
        severity: 'CRITICAL',
        created_at: new Date().toISOString()
    }
];

const files = [
    {
        path: 'src/services/ai.service.ts',
        summary: 'Core AI Service backend logic.',
        fragility_score: 'HIGH',
        key_responsibilities: [
            'Webhook routing',
            'Payload construction',
            'Response parsing (Handling n8n quirks)'
        ],
        recent_changes: [
            'Fixed jobLog parsing logic',
            'Reverted forced analyze-webhook lookup'
        ]
    }
];

async function bootstrap() {
    console.log('🚀 Bootstrapping Codex...');

    try {
        // Save Features
        for (const f of features) {
            const key = `codex:feature:${f.name}`;
            await redis.set(key, JSON.stringify(f));
            console.log(`✅ Saved Feature: ${f.name}`);
        }

        // Save Constraints
        for (const c of constraints) {
            const key = `codex:constraint:${c.name}`;
            await redis.set(key, JSON.stringify(c));
            console.log(`✅ Saved Constraint: ${c.name}`);
        }

        // Save Files
        for (const f of files) {
            const key = `codex:file:${f.path}`;
            await redis.set(key, JSON.stringify(f));
            console.log(`✅ Saved File Context: ${f.path}`);
        }

        console.log('✨ Bootstrap Complete!');
    } catch (e) {
        console.error('❌ Bootstrap Failed:', e);
    } finally {
        redis.disconnect();
    }
}

bootstrap();
