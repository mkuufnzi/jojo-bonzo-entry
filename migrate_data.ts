import prisma from './src/lib/prisma';

async function main() {
    console.log('--- DATA MIGRATION START ---');
    
    // Mapping of slug to required feature key
    const mappings: Record<string, string> = {
        'ai-doc-generator': 'ai_generation',
        'html-to-pdf': 'pdf_conversion',
        'docx-to-pdf': 'pdf_conversion' // Assuming docx-to-pdf also needs pdf_conversion
    };

    for (const [slug, featureKey] of Object.entries(mappings)) {
        const service = await prisma.service.updateMany({
            where: { slug },
            data: { requiredFeatureKey: featureKey }
        });
        console.log(`Updated ${slug} with feature key: ${featureKey} (${service.count} rows)`);
    }

    console.log('--- DATA MIGRATION END ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
