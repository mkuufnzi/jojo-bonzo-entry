import { Request, Response } from 'express';
import { checkoutService } from '../services/checkout.service';
import { logger } from '../lib/logger';

export class CheckoutController {
    /**
     * Handle the one-click upsell checkout.
     * GET /checkout/upsell?token=...&sig=...
     */
    static async handleUpsell(req: Request, res: Response) {
        const { token, sig } = req.query;

        if (!token || !sig) {
            return res.render('checkout/error', {
                title: 'Invalid Checkout Link',
                message: 'This checkout link is missing required parameters.'
            });
        }

        const params = checkoutService.verifyToken(token as string, sig as string);

        if (!params) {
            return res.render('checkout/error', {
                title: 'Checkout Link Expired',
                message: 'This secure checkout link has expired or is invalid.'
            });
        }

        try {
            const result = await checkoutService.processCheckout(params);

            if (result.success) {
                return res.render('checkout/success', {
                    title: 'Order Confirmed!',
                    invoiceId: result.invoiceId,
                    url: result.url
                });
            } else {
                return res.render('checkout/error', {
                    title: 'Checkout Failed',
                    message: result.reason || 'We could not process your order at this time.'
                });
            }
        } catch (error: any) {
            logger.error({ error: error.message, params }, '[CheckoutController] Execution failed');
            return res.render('checkout/error', {
                title: 'System Error',
                message: 'An unexpected error occurred while processing your request.'
            });
        }
    }
}
