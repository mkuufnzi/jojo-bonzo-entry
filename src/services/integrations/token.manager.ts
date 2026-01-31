import prisma from '../../lib/prisma';
// import { encrypt, decrypt } from '../../utils/encryption';

/**
 * Manages OAuth token lifecycle.
 * Handles expiration checks and refresh flows.
 */
export class TokenManager {
    
    /**
     * Ensures an integration has a valid access token.
     * If expired, uses refresh_token to get a new one and updates DB.
     * @param integrationId 
     */
    static async getValidAccessToken(integrationId: string): Promise<string> {
        const integration = await prisma.integration.findUnique({
            where: { id: integrationId }
        });

        if (!integration) throw new Error(`Integration ${integrationId} not found`);

        // Check expiration (buffer of 5 minutes)
        const now = new Date();
        const expiresAt = integration.expiresAt ? new Date(integration.expiresAt) : null;
        
        // If no expiry set, assume valid (or handle legacy) -> But for OAuth, usually assumes expired if missing
        const isExpired = !expiresAt || (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000);

        if (!isExpired) {
            return integration.accessToken!;
        }

        console.log(`[TokenManager] Token for ${integration.provider} expired. Refreshing...`);
        return await this.refreshAccessToken(integration);
    }

    private static async refreshAccessToken(integration: any): Promise<string> {
        if (!integration.refreshToken) {
            throw new Error(`No refresh token available for ${integration.provider}:${integration.id}`);
        }

        const { ProviderRegistry } = await import('./providers');
        const erp = ProviderRegistry.createInstance(integration.provider);
        
        const result = await erp.refreshToken(integration.refreshToken, integration.metadata);
        
        const newAccessToken = result.access_token;
        const newRefreshToken = result.refresh_token; 
        const newExpiresIn = result.expires_in;

        // Update DB
        const expiresAt = new Date(Date.now() + (newExpiresIn * 1000));
        await prisma.integration.update({
            where: { id: integration.id },
            data: {
                accessToken: newAccessToken,
                ...(newRefreshToken && { refreshToken: newRefreshToken }),
                expiresAt: expiresAt
            }
        });

        return newAccessToken;
    }
}
