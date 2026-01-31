import dotenv from 'dotenv';
dotenv.config({ path: 'environments/.env.development' });
import prisma from '../lib/prisma';

async function auditScopes() {
  try {
    console.log('--- Database Scope Audit ---');
    const definitions = await prisma.integrationDefinition.findMany({
      where: { slug: { in: ['zoho', 'zoho-crm'] } }
    });

    for (const def of definitions) {
      const config = def.config as any;
      console.log(`Provider: ${def.name} (${def.slug})`);
      console.log(`Current Scope in DB: ${config?.scope}`);
      
      // Also audit actual integration records
      const connections = await prisma.integration.findMany({
          where: { provider: { in: ['zoho', 'zoho-crm'] } }
      });
      for (const conn of connections) {
          console.log(`  Connection ID: ${conn.id}`);
          console.log(`  Status: ${conn.status}`);
          console.log(`  Metadata: ${JSON.stringify(conn.metadata, null, 2)}`);
          console.log(`  Has Refresh Token: ${!!conn.refreshToken}`);
          console.log(`  Expires At: ${conn.expiresAt}`);
      }
      
      const desiredScope = 'ZohoBooks.fullaccess.all';
      
      if (config?.scope !== desiredScope) {
        console.log('⚠️ Scope mismatch! Updating...');
        await prisma.integrationDefinition.update({
          where: { id: def.id },
          data: {
            config: {
              ...config,
              scope: desiredScope
            }
          }
        });
        console.log('✅ Updated successfully.');
      } else {
        console.log('✅ Scope matches desired configuration.');
      }
      console.log('---');
    }
  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    process.exit(0);
  }
}

auditScopes();
