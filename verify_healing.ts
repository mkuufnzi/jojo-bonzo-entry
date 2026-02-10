import { resolveLayout } from './src/services/layout-resolution.service';
import { SmartTemplateManifest } from './src/services/template-registry.service';

const mockManifest: SmartTemplateManifest = {
    id: 'test_manifest',
    name: 'Test Manifest',
    type: 'INVOICE',
    version: '1.0',
    description: 'Test',
    layoutOrder: ['header', 'customer_info', 'line_items', 'totals', 'footer'],
    features: [
        { id: 'header', name: 'Header', type: 'toggle', required: true },
        { id: 'customer_info', name: 'Customer Info', type: 'toggle', required: true },
        { id: 'line_items', name: 'Line Items', type: 'toggle', required: true },
        { id: 'totals', name: 'Totals', type: 'toggle', required: true },
        { id: 'footer', name: 'Footer', type: 'toggle', required: true },
        { id: 'optional_promo', name: 'Promo', type: 'toggle', defaultEnabled: false }
    ]
};

console.log('--- TEST 1: Missing Mandatory (customer_info) ---');
const corrupted1 = { layoutOrder: ['header', 'line_items', 'totals', 'footer'] };
const result1 = resolveLayout(mockManifest, corrupted1);
console.log('Resolved Order:', result1.layoutOrder);
console.log('Source:', result1.resolvedFrom);
console.log('Valid:', result1.layoutOrder.includes('customer_info') && result1.layoutOrder.indexOf('customer_info') === 1 ? '✅' : '❌');

console.log('\n--- TEST 2: Invalid ID (ghost_widget) ---');
const corrupted2 = { layoutOrder: ['header', 'ghost_widget', 'customer_info', 'line_items'] };
const result2 = resolveLayout(mockManifest, corrupted2);
console.log('Resolved Order:', result2.layoutOrder);
console.log('Contains ghost_widget:', result2.layoutOrder.includes('ghost_widget') ? '❌' : '✅');

console.log('\n--- TEST 3: New Optional Widget (not in DB) ---');
// mockManifest has optional_promo which is not in this DB order
const corrupted3 = { layoutOrder: ['header', 'customer_info', 'line_items', 'totals', 'footer'] };
const result3 = resolveLayout(mockManifest, corrupted3);
// Note: manifestOrder doesn't have optional_promo, but it is in features. 
// Our logic looks at manifestOrder for healing. If it's not in manifestOrder, it won't be "healed" into the array unless it's in the registry.
// Actually, optional items should probably be APPENDED if found in features but missing from order?
// Let's see current behavior.
console.log('Resolved Order:', result3.layoutOrder);

console.log('\n--- TEST 4: Out of Order (valid IDs) ---');
const swapped = { layoutOrder: ['footer', 'totals', 'line_items', 'customer_info', 'header'] };
const result4 = resolveLayout(mockManifest, swapped);
console.log('Resolved Order:', result4.layoutOrder);
console.log('Status:', result4.resolvedFrom === 'database' ? '✅ Preserved' : '❌' );
