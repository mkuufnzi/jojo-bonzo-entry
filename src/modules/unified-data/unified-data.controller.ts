import { Request, Response } from 'express';
import { unifiedDataService } from './unified-data.service';
import { logger } from '../../lib/logger';

export class UnifiedDataController {
    
    /**
     * Trigger a manual sync of unified data
     */
    async syncData(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            // Fire and forget the sync job
            unifiedDataService.syncBusinessData(businessId).catch(err => {
                logger.error({ businessId, err }, 'Background sync failed');
            });

            return res.json({ message: 'Sync started in the background' });
        } catch (error) {
            logger.error({ error }, 'Failed to trigger sync');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified invoices for dashboard
     */
    async getInvoices(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const source = req.query.source as string;

            const invoices = await unifiedDataService.getUnifiedInvoices(businessId, page, limit, { source });
            return res.json(invoices);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified invoices');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified customers for dashboard
     */
    async getCustomers(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized  Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const customers = await unifiedDataService.getUnifiedCustomers(businessId, page, limit);
            return res.json(customers);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified customers');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified orders for dashboard
     */
    async getOrders(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const orders = await unifiedDataService.getUnifiedOrders(businessId, page, limit);
            return res.json(orders);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified orders');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified payments for dashboard
     */
    async getPayments(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const payments = await unifiedDataService.getUnifiedPayments(businessId, page, limit);
            return res.json(payments);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified payments');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified estimates for dashboard
     */
    async getEstimates(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const source = req.query.source as string;

            const estimates = await unifiedDataService.getUnifiedEstimates(businessId, page, limit, { source });
            return res.json(estimates);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified estimates');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified stats for dashboard analytics
     */
    async getStats(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId || res.locals?.user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const stats = await unifiedDataService.getUnifiedBusinessStats(businessId);
            return res.json(stats);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified stats');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unified inventory for dashboard
     */
    async getInventory(req: Request, res: Response) {
        try {
            const businessId = (req as any).user?.businessId;
            if (!businessId) {
                return res.status(401).json({ error: 'Unauthorized: Business ID required' });
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const source = req.query.source as string;

            const products = await unifiedDataService.getUnifiedProducts(businessId, page, limit, { source });
            return res.json(products);
        } catch (error) {
            logger.error({ error }, 'Failed to fetch unified inventory');
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export const unifiedDataController = new UnifiedDataController();
