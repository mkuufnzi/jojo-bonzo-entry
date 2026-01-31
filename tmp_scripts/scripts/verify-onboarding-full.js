"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/lib/prisma"));
async function main() {
    console.log('🧪 Starting Onboarding Flow Verification...');
    // 1. Setup Test User
    const testEmail = `verify_${Date.now()}@example.com`;
    console.log(`Creating test user: ${testEmail}`);
    const user = await prisma_1.default.user.create({
        data: {
            email: testEmail,
            password: 'mock_hash',
            name: 'Verification User'
        }
    });
    try {
        // 2. Simulate Step 1: Save Business Profile
        console.log('\n--- Step 1: Business Profile ---');
        const businessData = {
            name: 'Verification Corp',
            sector: 'technology',
            website: 'https://verify.example.com',
            taxId: 'US-123456'
        };
        // Simulating Business Service logic
        const business = await prisma_1.default.business.create({
            data: {
                ...businessData,
                users: { connect: { id: user.id } }
            }
        });
        console.log('✅ Business Created:', business.id);
        // 3. Simulate Step 3: Brand Identity (Step 2 is OAuth, mocked here by just existing)
        console.log('\n--- Step 3: Brand Identity ---');
        const brandData = {
            voiceProfile: { tone: 'professional' },
            brandColors: { primary: '#2563EB', secondary: '#1E293B' },
            fontSettings: { heading: 'Inter', body: 'Roboto' }
        };
        const profile = await prisma_1.default.brandingProfile.create({
            data: {
                businessId: business.id,
                name: 'Default Brand',
                isDefault: true,
                ...brandData
            }
        });
        console.log('✅ Branding Profile Created:', profile.id);
        // 4. Simulate Step 4: Document Setup
        console.log('\n--- Step 4: Document Setup ---');
        const docSettings = { documentTypes: ['invoice', 'receipt'] };
        await prisma_1.default.business.update({
            where: { id: business.id },
            data: {
                metadata: {
                    ...(business.metadata || {}),
                    ...docSettings
                }
            }
        });
        console.log('✅ Document Settings Saved');
        // 5. Verify Final State
        console.log('\n--- Verification ---');
        const finalUser = await prisma_1.default.user.findUnique({
            where: { id: user.id },
            include: {
                business: {
                    include: { brandingProfiles: true }
                }
            }
        });
        if (!(finalUser === null || finalUser === void 0 ? void 0 : finalUser.business))
            throw new Error('Business Missing');
        if (finalUser.business.brandingProfiles.length === 0)
            throw new Error('Branding Profile Missing');
        const savedProfile = finalUser.business.brandingProfiles[0];
        const savedMeta = finalUser.business.metadata;
        // Assertions
        const assert = (condition, msg) => {
            if (!condition) {
                console.error(`❌ Assertion Failed: ${msg}`);
                process.exit(1);
            }
            else {
                console.log(`✅ ${msg}`);
            }
        };
        assert(savedProfile.isDefault === true, 'Profile is Default');
        assert(savedProfile.brandColors.primary === '#2563EB', 'Primary Color Matches');
        assert(savedMeta.documentTypes.includes('invoice'), 'Document Type Invoice Saved');
        assert(finalUser.business.sector === 'technology', 'Sector Matches');
        console.log('\n🎉 Onboarding Flow Verification SUCCESS!');
    }
    catch (e) {
        console.error('❌ Verification Failed:', e);
        process.exit(1);
    }
    finally {
        // Cleanup
        console.log('\nCleanup...');
        await prisma_1.default.user.delete({ where: { id: user.id } });
    }
}
main();
