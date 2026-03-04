import crypto from 'crypto';
import { config } from '../../config/env';

/**
 * Security Utilities for Debt Collection
 * 
 * Provides HMAC-SHA256 signing for outgoing n8n payloads to 
 * ensure data integrity and prevent tampering between Floovioo 
 * and external workflow engines.
 */
export class SecurityUtils {

    /**
     * Generates an HMAC signature for a given payload.
     * Uses the RECOVERY_SIGNING_SECRET from environment variables.
     */
    static signPayload(payload: any): string {
        const secret = config.RECOVERY_SIGNING_SECRET || 'fallback-dev-secret-32-chars-min';
        const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
        
        return crypto
            .createHmac('sha256', secret)
            .update(data)
            .digest('hex');
    }

    /**
     * Verifies an incoming signature (useful for callbacks).
     */
    static verifySignature(payload: any, signature: string): boolean {
        const expected = this.signPayload(payload);
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expected, 'hex')
            );
        } catch {
            return false;
        }
    }
}
