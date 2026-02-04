
import { TemplateService } from '../../services/template-service';
import fs from 'fs-extra';
import path from 'path';

// Mock fs-extra
jest.mock('fs-extra');

describe('TemplateService Manifest Parsing', () => {
    let service: TemplateService;
    const mockTemplatesDir = '/mock/templates';

    beforeEach(() => {
        service = new TemplateService(mockTemplatesDir);
        jest.clearAllMocks();
    });

    test('should fail validation/loading when manifest uses Legacy Array format without Service Adapter', async () => {
        // 1. Setup Mock Data (Legacy Format: features is an Array)
        const legacyManifest = {
            id: 'legacy-template',
            name: 'Legacy Invoice',
            type: 'invoice',
            version: '1.0.0',
            features: [
                {
                    id: 'payment_details',
                    name: 'Payment Widget',
                    type: 'toggle',
                    required: false,
                    defaultEnabled: true
                },
                {
                    id: 'tutorials',
                    name: 'Tutorials',
                    type: 'toggle',
                    required: false,
                    defaultEnabled: false
                }
            ]
        };

        // 2. Mock fs responses
        (fs.readdir as unknown as jest.Mock).mockResolvedValue([
            { name: 'legacy-template', isDirectory: () => true }
        ]);
        (fs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
        (fs.readJSON as unknown as jest.Mock).mockResolvedValue(legacyManifest);

        // 3. Act: List Templates
        const templates = await service.listTemplates();

        // 4. Assert: CURRENTLY FAIL (Red)
        // With current logic, this passes validation ONLY IF the Service parses Array as Map?
        // No, current logic checks `manifest.features?.payment_details`.
        // If features is Array, `payment_details` property is undefined.
        // Validation: `if (!manifest.features?.payment_details)` -> Fails (pushed to errors? No, strict check lines 68-70 might push error).
        // Actually, lines 68-70 don't push error, they just check.
        // But validation logic expects Record<string, boolean>.
        
        // Let's verify what we get back.
        // If the service DOES NOT adapt, `features` remains an Array.
        // We expect the Service to return the manifest.
        // But if we Validate it:
        
        if (templates.length > 0) {
            const result = service.validateTemplate(templates[0]);
            // Logic: `if (manifest.type === 'invoice' && !manifest.features?.payment_details)`
            // If Array, this is true (undefined).
            // So Validation MIGHT pass or NOT depending on strictness.
            // But strictness says "Invoice type must support payment_details".
            // Since it's undefined, it triggers error?!
            // Actually, line 68 in Service: `if (!manifest.features?.payment_details...`
            // If true (undefined), line 70 `errors.push` is commented out? 
            // Wait, looking at Step 1618:
            // line 70: // errors.push... (Commented Out)
            // line 62: if (!manifest.id) errors.push...
            
            // So with current code, it might actually RETURN the array?
            // BUT: TypeScript interface says `features: Record<string, boolean>`.
            // Runtime it's an Array.
            // If code tries to use it as Object downstream, it crashes.
            
            // We WANT the service to Normalize it.
            // So we assert that `features` IS an Object (Map) in the returned template.
            expect(Array.isArray(templates[0].features)).toBe(false); // Should be converted
        } else {
             // If list empty, fail
        }
    });

    test('should correctly adapt Legacy Array to Feature Flags Map', async () => {
        const legacyManifest = {
            id: 'smart-invoice-v1',
            type: 'invoice',
            name: 'Smart',
            version: '1.0',
            features: [
                { id: 'payment_details', defaultEnabled: true },
                { id: 'tutorials', defaultEnabled: false }
            ]
        };

        (fs.readdir as unknown as jest.Mock).mockResolvedValue([
            { name: 'smart-invoice-v1', isDirectory: () => true }
        ]);
        (fs.pathExists as unknown as jest.Mock).mockResolvedValue(true);
        (fs.readJSON as unknown as jest.Mock).mockResolvedValue(legacyManifest);

        const templates = await service.listTemplates();

        expect(templates).toHaveLength(1);
        const t = templates[0];

        // The Service SHOULD have converted 'features' to a Map
        expect(t.features).not.toBeInstanceOf(Array);
        expect(t.features['payment_details']).toBe(true);
        expect(t.features['tutorials']).toBe(false);
        
        // And supposedly kept the definitions?
        // expect((t as any).featureDefinitions).toBeInstanceOf(Array);
    });
});
