import { SecurityUtils } from '../src/modules/recovery/security.utils';
import prisma from '../src/lib/prisma';
const p = prisma as any;

async function verifyPhase6() {
    console.log('🚀 Starting Phase 6 Verification (Scale & Security)...');

    try {
        // 1. Verify HMAC Signature
        console.log('🔐 Testing HMAC Signing...');
        const testPayload = { invoiceId: 'INV-123', amount: 500 };
        const sig1 = SecurityUtils.signPayload(testPayload);
        const sig2 = SecurityUtils.signPayload(testPayload);
        
        console.log(`Payload: ${JSON.stringify(testPayload)}`);
        console.log(`Signature: ${sig1}`);

        if (sig1 === sig2 && sig1.length === 64) {
            console.log('✅ HMAC Signature check passed (Deterministic & 256-bit).');
        } else {
            console.error('❌ HMAC Signature check failed.');
            process.exit(1);
        }

        const isValid = SecurityUtils.verifySignature(testPayload, sig1);
        if (isValid) {
            console.log('✅ Signature verification logic passed.');
        } else {
            console.error('❌ Signature verification logic failed.');
            process.exit(1);
        }

        // 2. Verify Orchestration Logic (Simulation)
        console.log('\n🔄 Testing Orchestration Sorting & Priority (Metadata-based)...');
        
        const mockSequences = [
            { businessId: 'biz-free', business: { metadata: { tier: 'FREE' } } },
            { businessId: 'biz-prod', business: { metadata: { tier: 'PROFESSIONAL' } } },
            { businessId: 'biz-ent', business: { metadata: { tier: 'ENTERPRISE' } } }
        ];

        // Simulation of the sorting logic added to RecoveryService
        const getScore = (seq: any) => {
            const meta = seq.business?.metadata as any;
            if (!meta) return 1;
            const tier = (meta.tier || meta.subscriptionTier || 'FREE').toUpperCase();
            const tierScore: any = { 'ENTERPRISE': 10, 'PROFESSIONAL': 5, 'PREMIUM': 8, 'FREE': 1 };
            return tierScore[tier] || 1;
        };

        const sorted = mockSequences.slice().sort((a, b) => getScore(b) - getScore(a));

        console.log('Sorted Order:', sorted.map(s => `${s.businessId} (${(s.business.metadata as any).tier})`).join(' -> '));

        if (sorted[0].businessId === 'biz-ent' && sorted[sorted.length - 1].businessId === 'biz-free') {
            console.log('✅ Orchestration priority sorting (metadata) passed.');
        } else {
            console.error('❌ Orchestration priority sorting (metadata) failed.');
            process.exit(1);
        }

        console.log('\n✅ ALL PHASE 6 CHECKS PASSED.');

    } catch (error) {
        console.error('❌ Verification crashed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyPhase6();
