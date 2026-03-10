import { SmartInvoice } from './src/models/smart-documents/smart-invoice.model';

const mockTheme = {
    name: 'Test',
    primary: '#000',
    secondary: '#000',
    accent: '#000',
    light: '#000',
    text: '#000',
    logoUrl: '',
    tagline: '',
    gradient: '',
    layoutOrder: []
};

const mockConfig = {};

const payload = {
    items: [
        { name: 'Bad Item', metadata: { img: '✨' } },
        { name: 'Good Item', metadata: { img: '📦' } }
    ],
    smartContent: {
        recommendations: [
            { id: 1, name: 'Bad Rec', img: '✨ produkt.png' },
            { id: 2, name: 'Good Rec', img: 'https://cdn.com/img.png' }
        ]
    }
};

const invoice = SmartInvoice.fromPayload('test-123', mockTheme as any, mockConfig as any, payload);
const data = invoice.toJSON().data;

console.log('--- ITEMS ---');
data.items.forEach((item: any) => {
    console.log(`Item: ${item.name}, Img: ${item.img}`);
});

console.log('\n--- RECOMMENDATIONS ---');
data.recommendations.forEach((rec: any) => {
    console.log(`Rec: ${rec.name}, Img: ${rec.img}`);
});

const allClear = data.items.every((i: any) => !i.img.includes('✨')) && 
                 data.recommendations.every((r: any) => !r.img.includes('✨'));

if (allClear) {
    console.log('\n✅ SUCCESS: All sparkle emojis sanitized!');
} else {
    console.log('\n❌ FAILURE: Some sparkle emojis remain!');
    process.exit(1);
}
