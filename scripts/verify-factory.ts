import { N8nPayloadFactory } from '../src/services/n8n/n8n-payload.factory';
import { Business, Integration, BrandingProfile } from '@prisma/client';

const factory = new N8nPayloadFactory();

// MOCK DATA
const mockBusiness: Business = {
    id: 'bus_123',
    name: 'Tech Corp Inc.', // Should become 'TechCorpInc'
    sector: 'SaaS',
    address: '123 Tech Lane',
    city: 'San Fran',
    state: 'CA',
    zip: '94105',
    country: 'USA',
    taxId: 'US-999',
    website: 'https://techcorp.com',
    metadata: { ui_theme: 'Dark' },
    createdAt: new Date(),
    updatedAt: new Date()
};

const mockIntegration: Integration = {
    id: 'int_456',
    businessId: 'bus_123',
    provider: 'quickbooks',
    name: 'QB Primary',
    accessToken: '***',
    refreshToken: '***',
    expiresAt: new Date(),
    status: 'connected',
    metadata: { realmId: 'realm_999' }, // Critical for ERP
    settings: { invoice_map: true },
    createdAt: new Date(),
    updatedAt: new Date()
};

const mockProfile: BrandingProfile = {
    id: 'brand_789',
    businessId: 'bus_123',
    name: 'Default',
    isDefault: true,
    logoUrl: 'https://logo.com/img.png',
    faviconUrl: null,
    brandColors: { primary: '#000' },
    fontSettings: { heading: 'Inter' },
    templates: {},
    upsellConfig: {},
    supportConfig: {},
    voiceProfile: { persona: 'Friendly', tone: 'Casual' }, // Critical for Brand Voice
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date()
};

const context = {
    serviceId: 'test-service',
    appId: 'test-app',
    requestId: 'req_test'
};

console.log('🧪 Verifying N8nPayloadFactory...');

// TEST 1: Business Profile
console.log('\n[1] Testing Profile Payload...');
const profilePayload = factory.createProfilePayload(mockBusiness, context);
console.log('   Floovioo ID:', profilePayload.metadata.floovioo_id); // Expect: TechCorpInc
if (profilePayload.metadata.floovioo_id !== 'TechCorpInc') console.error('❌ FAIL: Slug generation incorrect');
else console.log('✅ PASS: Slug generation');

if (!profilePayload.payload.config_id.startsWith('config_TechCorpInc')) console.error('❌ FAIL: Config ID format');
else console.log('✅ PASS: Config ID format');

// TEST 2: Integration
console.log('\n[2] Testing Integration Payload...');
const intPayload = factory.createIntegrationPayload(mockIntegration, mockBusiness, 'QuickBooks Online', context);
console.log('   Data Source ID:', intPayload.payload.data_source_id);
if (intPayload.payload.source_type !== 'QuickBooks Online') console.error('❌ FAIL: Provider mapping');
else console.log('✅ PASS: Provider mapping');

if ((intPayload.payload.connection as any).externalId !== 'realm_999') console.error('❌ FAIL: External ID extraction');
else console.log('✅ PASS: Realm ID extraction');

// TEST 3: Branding & Voice
console.log('\n[3] Testing Branding Payload...');
const brandPayload = factory.createBrandingPayload(mockProfile, mockBusiness, context);
if ((brandPayload.payload.brand_voice as any).persona !== 'Friendly') console.error('❌ FAIL: Brand Voice missing');
else console.log('✅ PASS: Brand Voice mapped');

if ((brandPayload.payload.tenant_config as any).ui_theme !== 'Dark') console.error('❌ FAIL: Tenant Config missing');
else console.log('✅ PASS: Tenant Config mapped');

console.log('\n✨ Verification Complete.');
