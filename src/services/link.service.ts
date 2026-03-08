import crypto from 'crypto';
import { config } from '../config/env';

export class LinkService {
    private secret: string;

    constructor() {
        this.secret = config.RECOVERY_SIGNING_SECRET || 'dev-secret-32-chars-min-length-123456';
    }

    /**
     * Generates a signed interaction token
     * @param payload - Plain object containing d (docId), a (action), c (channel), s (sku)
     * @returns Base64URL encoded token with HMAC signature
     */
    generateToken(payload: any): string {
        const data = JSON.stringify({
            ...payload,
            iat: Math.floor(Date.now() / 1000)
        });

        const signature = crypto
            .createHmac('sha256', this.secret)
            .update(data)
            .digest('hex');

        // Format: JSON_BASE64.SIGNATURE
        const base64Data = Buffer.from(data).toString('base64url');
        return `${base64Data}.${signature}`;
    }

    /**
     * Verifies the signed token
     * @param token - The token string from the URL
     * @returns Decoded payload if valid, null otherwise
     */
    verifyToken(token: string): any | null {
        try {
            const [base64Data, signature] = token.split('.');
            if (!base64Data || !signature) return null;

            const data = Buffer.from(base64Data, 'base64url').toString('utf8');
            const expectedSignature = crypto
                .createHmac('sha256', this.secret)
                .update(data)
                .digest('hex');

            if (signature !== expectedSignature) {
                return null;
            }

            return JSON.parse(data);
        } catch (err) {
            return null;
        }
    }

    /**
     * Generates a full interaction URL
     * @param action - Interaction type
     * @param params - Additional context (docId, channel, sku)
     * @returns Absolute URL for the interaction
     */
    generateActionLink(action: string, params: { docId: string; channel?: string; sku?: string }): string {
        const payload = {
            d: params.docId,
            a: action,
            c: params.channel,
            s: params.sku
        };

        const token = this.generateToken(payload);
        return `${config.APP_URL}/i/${token}`;
    }
}

export const linkService = new LinkService();
