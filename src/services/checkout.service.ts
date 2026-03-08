import crypto from 'crypto';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { config } from '../config/env';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/** Parameters required to generate a signed checkout link */
export interface CheckoutLinkParams {
    businessId: string;
    sku: string;
    customerId?: string;
    originalDocId?: string;
    appId?: string;
}

/** Shape of the signed token payload (serialized to JSON then base64url) */
interface TokenPayload {
    biz: string;
    sku: string;
    cust?: string;
    orig?: string;
    app?: string;
    exp: number;
}

/** Result of a successful checkout processing */
interface CheckoutResult {
    success: boolean;
    invoiceId?: string;
    url?: string;
    reason?: string;
}

// ────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────

/**
 * CheckoutService handles secure, time-limited upsell checkout URLs.
 *
 * Security Model:
 * - URLs are HMAC-SHA256 signed so parameters cannot be tampered with
 * - Tokens expire after 7 days by default
 * - Signature verification uses constant-time comparison (via crypto.timingSafeEqual)
 *
 * Flow:
 * 1. Smart document includes upsell link → generateSignedUrl()
 * 2. Customer clicks link → verifyToken() validates signature + expiry
 * 3. Checkout completes → processCheckout() creates secondary ERP invoice
 */
export class CheckoutService {
    /** HMAC secret used for signing checkout tokens */
    private readonly secret: string = process.env.CHECKOUT_SECRET || 'floovioo-checkout-secret-v1';

    /** Token validity duration in milliseconds (7 days) */
    private readonly TOKEN_TTL_MS: number = 7 * 24 * 60 * 60 * 1000;

    /**
     * Generate a secure, HMAC-signed checkout URL for an upsell product.
     *
     * The URL encodes the business, SKU, customer, and original document context
     * into a base64url token with an HMAC-SHA256 signature appended as a query param.
     *
     * @param params - Checkout link parameters
     * @returns Fully qualified checkout URL with token and signature
     */
    generateSignedUrl(params: CheckoutLinkParams): string {
        const { businessId, sku, customerId, originalDocId, appId } = params;

        const tokenPayload: TokenPayload = {
            biz: businessId,
            sku,
            cust: customerId,
            orig: originalDocId,
            app: appId,
            exp: Date.now() + this.TOKEN_TTL_MS,
        };

        const data = JSON.stringify(tokenPayload);

        const signature = crypto
            .createHmac('sha256', this.secret)
            .update(data)
            .digest('hex');

        const baseUrl = config.APP_URL || 'http://localhost:3002';
        const encodedData = Buffer.from(data).toString('base64url');

        return `${baseUrl}/checkout/upsell?token=${encodedData}&sig=${signature}`;
    }

    /**
     * Verify a signed checkout token and extract the original parameters.
     *
     * Performs:
     * 1. Base64url decode of the token
     * 2. HMAC-SHA256 signature verification (constant-time comparison)
     * 3. Expiry check against current time
     *
     * @param token - Base64url-encoded token from the URL
     * @param sig   - HMAC-SHA256 hex signature from the URL
     * @returns Decoded CheckoutLinkParams on success, null on failure
     */
    verifyToken(token: string, sig: string): CheckoutLinkParams | null {
        try {
            const data = Buffer.from(token, 'base64url').toString('utf8');

            const expectedSig = crypto
                .createHmac('sha256', this.secret)
                .update(data)
                .digest('hex');

            // Constant-time comparison to prevent timing attacks
            const sigBuffer = Buffer.from(sig, 'hex');
            const expectedBuffer = Buffer.from(expectedSig, 'hex');

            if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
                logger.warn('[CheckoutService] Invalid signature attempt');
                return null;
            }

            const parsed: TokenPayload = JSON.parse(data);

            if (parsed.exp < Date.now()) {
                logger.warn('[CheckoutService] Token expired');
                return null;
            }

            return {
                businessId: parsed.biz,
                sku: parsed.sku,
                customerId: parsed.cust,
                originalDocId: parsed.orig,
                appId: parsed.app,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ error: message }, '[CheckoutService] Verification failed');
            return null;
        }
    }

    /**
     * Process an upsell checkout by creating a secondary invoice in the connected ERP.
     *
     * Steps:
     * 1. Fetch the Product by SKU from the business catalog
     * 2. Locate the active QuickBooks (or other ERP) integration
     * 3. Dispatch a secondary invoice creation via IntegrationService → n8n
     *
     * @param params - Verified checkout parameters
     * @returns CheckoutResult indicating success/failure and invoice details
     * @throws Error if the product is not found in the business catalog
     */
    async processCheckout(params: CheckoutLinkParams): Promise<CheckoutResult> {
        const { businessId, sku, customerId, originalDocId } = params;
        logger.info({ businessId, sku, customerId }, '[CheckoutService] Processing upsell checkout');

        // 1. Fetch Product details
        const product = await prisma.product.findFirst({
            where: { businessId, sku },
        });

        if (!product) throw new Error('Product not found for upsell');

        // 2. Locate Integration (QuickBooks, etc.)
        const integration = await prisma.integration.findFirst({
            where: { businessId, status: 'connected', provider: 'quickbooks' },
        });

        if (!integration) {
            logger.warn({ businessId }, '[CheckoutService] No active QuickBooks integration found for secondary invoice');
            return { success: false, reason: 'No integration found' };
        }

        // 3. Create secondary invoice via IntegrationService → n8n
        const { integrationService } = await import('./integration.service');

        const secondaryInvoice = await integrationService.createSecondaryInvoice(integration.id, {
            customerId,
            items: [{
                description: `UPSELL: ${product.name}`,
                quantity: 1,
                price: product.price,
            }],
            metadata: {
                originalInvoiceId: originalDocId,
                source: 'Floovioo Smart Upsell',
            },
        });

        return {
            success: true,
            invoiceId: secondaryInvoice.id,
            url: secondaryInvoice.url,
        };
    }
}

export const checkoutService = new CheckoutService();
