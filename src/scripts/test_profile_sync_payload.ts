
import { N8nPayloadFactory, ServiceContext } from '../services/n8n/n8n-payload.factory';
import { Business, OnboardingStatus } from '@prisma/client';

async function testPayloadRefinement() {
    const factory = new N8nPayloadFactory();
    
    // Mock Business with "dirty" metadata (contains Step 4 data)
    const mockBusiness: Business = {
        id: '1a98aaf1-9c92-4d1f-b854-3da8899a310f',
        name: 'Test Business',
        sector: 'technology',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
        country: 'Testland',
        taxId: 'TX-123',
        website: 'https://test.com',
        onboardingStatus: OnboardingStatus.IN_PROGRESS,
        currentOnboardingStep: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
            niche: 'B2B SaaS',
            slogan: 'Test Slogan',
            about: 'Test About',
            documentTypes: ['invoice', 'receipt', 'quote', 'statement'], // Should be filtered out
            ui_theme: 'Dark' // Should be filtered out
        }
    };

    const mockContext: ServiceContext = {
        serviceId: 'transactional-branding',
        serviceTenantId: mockBusiness.id,
        appId: 'system',
        requestId: 'test_req_123'
    };

    const payload = factory.createProfilePayload(mockBusiness, '0836c90b-0911-4200-b1f2-a1040c5b12c1', mockContext);

    console.log('--- Generated Payload Metadata ---');
    console.log(JSON.stringify(payload.data.business.metadata, null, 2));

    const metadataKeys = Object.keys(payload.data.business.metadata);
    const hasDocumentTypes = metadataKeys.includes('documentTypes');
    const hasNiche = metadataKeys.includes('niche');

    if (!hasDocumentTypes && hasNiche && metadataKeys.length === 3) {
        console.log('✅ SUCCESS: Payload correctly filtered to Step 1 fields (niche, slogan, about).');
    } else {
        console.error('❌ FAILURE: Payload contains unexpected fields or is missing required profile fields.');
        console.error('Keys found:', metadataKeys);
        process.exit(1);
    }
}

testPayloadRefinement().catch(e => {
    console.error(e);
    process.exit(1);
});
