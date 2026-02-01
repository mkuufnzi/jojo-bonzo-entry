import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

export class IntegrationService {
  
  async listIntegrations(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) return [];
    return await prisma.integration.findMany({
      where: { businessId: user.businessId }
    });
  }

  async connectProvider(userId: string, provider: string, metadata: any = {}, accessToken?: string, refreshToken?: string, expiresAt?: Date) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) throw new Error('Business account required');
    const businessId = user.businessId;

    // Standardization: Enforce 'quickbooks'
    // if (provider === 'quickbooks') provider = 'quickbooks';

    const token = accessToken || 'mock_access_token_' + Date.now();
    const refresh = refreshToken || (accessToken ? undefined : 'mock_refresh_' + Date.now());

    // Check if THIS provider already exists to update it
    const existing = await prisma.integration.findFirst({
      where: { businessId, provider }
    });

    // Validations: Prevent duplicate connections (1:1 Enforcement)
    // Extracts realmId (QBO), tenantId (Xero), or organization_id (Zoho)
    const externalId = metadata.realmId || metadata.tenantId || metadata.organization_id;

    if (externalId) {
        // Find if ANY business (other than this one) already has this connection
        const duplicate = await prisma.integration.findFirst({
            where: {
                provider,
                businessId: { not: businessId }, // Don't block self-updates
                metadata: {
                    path: [provider === 'quickbooks' ? 'realmId' : (provider === 'xero' ? 'tenantId' : 'organization_id')],
                    equals: externalId
                }
            },
            include: { business: { select: { name: true } } }
        });

        if (duplicate) {
            throw new Error(`This ${provider.toUpperCase()} account is already connected to business '${duplicate.business.name}'. Please disconnect it there first.`);
        }
    }

    if (existing) {
      return await prisma.integration.update({
        where: { id: existing.id },
        data: {
          status: 'connected',
          accessToken: token,
          refreshToken: refresh,
          expiresAt,
          metadata
        }
      });
    }

    return await prisma.integration.create({
      data: {
        businessId,
        provider,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Connection`,
        status: 'connected',
        accessToken: token,
        refreshToken: refresh,
        expiresAt,
        metadata
      }
    });
  }

  async disconnectProvider(userId: string, integrationId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
    if (!user?.businessId) throw new Error('Business account required');

    // Verify ownership
    const integration = await prisma.integration.findFirst({
        where: { id: integrationId, businessId: user.businessId }
    });
    
    if (!integration) throw new Error('Integration not found');

    if (!integration) throw new Error('Integration not found');

    return await prisma.integration.delete({
      where: { id: integrationId }
    });
  }

  /**
   * Simulates fetching initial data (Invoices) from the provider
   */
  async syncInitialData(userId: string, provider: string) {
     const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
     if (!user?.businessId) return;

     // Mock fetching 5 recent invoices
     const mockInvoices = Array.from({ length: 5 }).map((_, i) => ({
         businessId: user.businessId,
         externalId: `inv_${Date.now()}_${i}`,
         customerName: `Customer ${i + 1}`,
         amount: Math.floor(Math.random() * 1000) + 100,
         status: 'paid',
         date: new Date()
     }));

     // In a real app, we would upsert these into an 'Invoice' or 'ExternalDocument' table
     // For now, let's just log them to show activity
     logger.info({ userId, count: mockInvoices.length }, 'Synced mock invoices from ERP');
     
     return mockInvoices;
  }

  /**
   * Proactively verifies connectivity with n8n for the business
   */
  async verifyConnectivity(userId: string) {
      try {
          const { designEngineService } = await import('./design-engine.service');
          const { webhookService } = await import('./webhook.service');
          
          // Resolve standard 'ping' endpoint for transactional service
          const webhookUrl = await webhookService.getEndpoint('transactional-branding', 'ping').catch(() => null);
          
          return await designEngineService.executeAction('ping', {
              floovioo_id: userId,
              service_id: 'transactional-branding',
              webhookUrl // Pass resolved URL if found
          }, { id: userId });
      } catch (error) {
          logger.error({ userId, error }, 'Failed to verify connectivity');
          return { success: false, connected: false };
      }
  }

  // Future: refreshToken, fetchResource, etc.
}

export const integrationService = new IntegrationService();
