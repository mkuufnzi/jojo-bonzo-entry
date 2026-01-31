
import { PrismaClient } from '@prisma/client';
import { integrationService } from '../services/integration.service';
import { businessService } from '../services/business.service';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

async function verifyOnboardingFlow() {
  logger.info('--- Starting Onboarding Verification ---');

  // 1. Setup Test User
  const email = `test_onboarding_${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      password: 'mock_password_hash',
      isActive: true,
      name: 'Verification User'
    }
  });
  logger.info({ userId: user.id }, 'Step 0: Created Verification User');

  // 2. Simulate Step 1: Create Business Profile
  const business = await businessService.createBusiness(user.id, {
      name: 'Test Corp',
      sector: 'technology',
      taxId: 'US-999-999',
      website: 'https://testcorp.com'
  });
  logger.info({ businessId: business.id }, 'Step 1: Created Business Profile');

  // Verify Business Link
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (updatedUser?.businessId !== business.id) throw new Error('User not linked to business!');

  // 3. Simulate Step 2: Connect Provider (OAuth Callback Logic)
  // We call connectProvider directly as the controller would
  await integrationService.connectProvider(user.id, 'quickbooks', {
      realmId: 'mock_realm_123' 
  });
  logger.info('Step 2a: Connected QuickBooks');

  // 3b. Simulate Data Sync (Controller calls this)
  const invoices = await integrationService.syncInitialData(user.id, 'quickbooks');
  logger.info({ count: invoices?.length }, 'Step 2b: Synced Initial Data');
  
  if (!invoices || invoices.length === 0) throw new Error('Data sync failed or returned empty');

  // 4. Simulate Step 3: Document Config
  // We mimic the controller logic of updating metadata
  await businessService.updateBusiness(business.id, {
    // service update doesn't support generic json metadata update easily if types are strict
    // mimicking what we did in controller with raw prisma or casting
  } as any); 

  await prisma.business.update({
      where: { id: business.id },
      data: {
          metadata: {
              documentTypes: ['invoice', 'receipt']
          }
      }
  });
  logger.info('Step 3: Saved Document Preferences');

  // 5. Final Verification
  const finalBusiness = await prisma.business.findUnique({ 
      where: { id: business.id },
      include: { integrations: true }
  });

  if (finalBusiness?.integrations.length !== 1) throw new Error('Integration Verification Failed');
  if ((finalBusiness?.metadata as any)?.documentTypes?.[0] !== 'invoice') throw new Error('Metadata Verification Failed');

  logger.info('--- Onboarding Verification SUCCESS ---');
}

verifyOnboardingFlow()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
