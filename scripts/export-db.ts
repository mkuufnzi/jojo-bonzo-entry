/**
 * Database Export Script
 * Exports all tables to a JSON file for backup/restore purposes.
 * Usage: npx ts-node scripts/export-db.ts
 */
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3002';
process.env.NODE_ENV = 'development';

import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function exportDatabase() {
    console.log('🔄 Starting database export...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(__dirname, `../backups/db_export_${timestamp}.json`);
    
    // Ensure backups directory exists
    const backupsDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
    }

    const data: Record<string, any[]> = {};
    
    try {
        // Core Identity
        console.log('  Exporting Users...');
        data.users = await prisma.user.findMany();
        
        console.log('  Exporting Businesses...');
        data.businesses = await prisma.business.findMany();
        
        console.log('  Exporting UserProfiles...');
        data.userProfiles = await prisma.userProfile.findMany();
        
        // Billing & Plans
        console.log('  Exporting Plans...');
        data.plans = await prisma.plan.findMany();
        
        console.log('  Exporting Features...');
        data.features = await prisma.feature.findMany();
        
        console.log('  Exporting PlanFeatures...');
        data.planFeatures = await prisma.planFeature.findMany();
        
        console.log('  Exporting Subscriptions...');
        data.subscriptions = await prisma.subscription.findMany();
        
        // Services & Apps
        console.log('  Exporting Services...');
        data.services = await prisma.service.findMany();
        
        console.log('  Exporting IntegrationDefinitions...');
        data.integrationDefinitions = await prisma.integrationDefinition.findMany();
        
        console.log('  Exporting Apps...');
        data.apps = await prisma.app.findMany();
        
        console.log('  Exporting AppServices...');
        data.appServices = await prisma.appService.findMany();
        
        console.log('  Exporting ApiKeys...');
        data.apiKeys = await prisma.apiKey.findMany();
        
        // Integrations & Data
        console.log('  Exporting Integrations...');
        data.integrations = await prisma.integration.findMany();
        
        console.log('  Exporting BrandingProfiles...');
        data.brandingProfiles = await prisma.brandingProfile.findMany();
        
        console.log('  Exporting Workflows...');
        data.workflows = await prisma.workflow.findMany();
        
        console.log('  Exporting WorkflowExecutionLogs...');
        data.workflowExecutionLogs = await prisma.workflowExecutionLog.findMany();
        
        console.log('  Exporting ProcessedDocuments...');
        data.processedDocuments = await prisma.processedDocument.findMany();
        
        console.log('  Exporting Contacts...');
        data.contacts = await prisma.contact.findMany();
        
        console.log('  Exporting Products...');
        data.products = await prisma.product.findMany();
        
        console.log('  Exporting ExternalDocuments...');
        data.externalDocuments = await prisma.externalDocument.findMany();
        
        // Revenue/Dunning (V2)
        console.log('  Exporting RecommendationRules...');
        data.recommendationRules = await prisma.recommendationRule.findMany();
        
        console.log('  Exporting Campaigns...');
        data.campaigns = await prisma.campaign.findMany();
        
        console.log('  Exporting DunningSequences...');
        data.dunningSequences = await prisma.dunningSequence.findMany();
        
        // Write to file
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        
        // Summary
        console.log('\n✅ Database export complete!');
        console.log(`📁 Output: ${outputPath}`);
        console.log('\n📊 Record counts:');
        for (const [table, records] of Object.entries(data)) {
            console.log(`   ${table}: ${records.length}`);
        }
        
    } catch (error) {
        console.error('❌ Export failed:', error);
        throw error;
    }
}

exportDatabase()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
