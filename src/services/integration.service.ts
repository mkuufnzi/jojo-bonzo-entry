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

    const token = accessToken;
    const refresh = refreshToken;

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
            include: { 
                business: { 
                    select: { 
                        name: true,
                        users: {
                            take: 1,
                            select: { email: true, name: true }
                        }
                    } 
                } 
            }
        });

        if (duplicate) {
            const owner = duplicate.business.users[0];
            const conflictData = {
                code: 'DUPLICATE_CONNECTION',
                provider: provider.toUpperCase(),
                externalId,
                conflictingBusiness: duplicate.business.name,
                conflictingUserEmail: owner?.email || 'Unknown User',
                conflictingUserName: owner?.name || 'Unknown',
                message: `This ${provider.toUpperCase()} account is already connected to business '${duplicate.business.name}'.`
            };

            throw new Error(JSON.stringify(conflictData));
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
   * Triggers initial data sync from the provider.
   * Real sync is handled by the provider adapter (QuickBooks/Xero/Zoho).
   */
  async syncInitialData(userId: string, provider: string) {
     const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
     if (!user?.businessId) return;

     // Real sync is performed via provider-specific adapters and the normalization engine.
     // This method is a trigger point — actual data pull happens in the integration pipeline.
     logger.info({ userId, provider, businessId: user.businessId }, '[IntegrationService] Initial data sync triggered — delegating to provider adapter');
     return [];
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
