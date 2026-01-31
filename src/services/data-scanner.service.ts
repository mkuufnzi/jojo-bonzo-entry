import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { ExternalDocument } from '@prisma/client';

export interface DataInsight {
    type: 'unsent_invoices' | 'pending_orders' | 'overdue_payments';
    count: number;
    value: number;
    currency: string;
    actionable: boolean;
    metadata?: any;
}

export class DataScannerService {
    
    /**
     * Scan a specific business's data for actionable insights
     * Used by DataScanWorker and Dashboard (on-demand reqs)
     */
    async scanBusiness(businessId: string): Promise<DataInsight[]> {
        logger.info(`[DataScanner] Scanning business ${businessId}...`);
        const insights: DataInsight[] = [];

        // 1. Scan Invoices
        const invoiceStats = await this.scanInvoices(businessId);
        if (invoiceStats) insights.push(invoiceStats);

        // 2. Scan Orders (Future placeholder)
        // const orderStats = await this.scanOrders(businessId);
        
        return insights;
    }

    /**
     * Identify Draft/Unsent Invoices that represent potential revenue
     */
    private async scanInvoices(businessId: string): Promise<DataInsight | null> {
        // Fetch invoices that are likely "Draft" or "Submitted" but not "Paid"
        // Status mapping depends on the Provider (QuickBooks: 'Draft', Xero: 'DRAFT', etc.)
        // For MVP, we look for common "Open" statuses
        
        const openInvoices = await prisma.externalDocument.findMany({
            where: {
                businessId,
                type: 'invoice',
                // We want normalized status usually, but raw status helps if normalized is missing
                OR: [
                    { normalized: { path: ['status'], equals: 'Draft' } },
                    { normalized: { path: ['status'], equals: 'Submitted' } },
                    { normalized: { path: ['status'], equals: 'Open' } },
                    { normalized: { path: ['status'], equals: 'Awaiting Payment' } } 
                ]
            },
            select: {
                normalized: true
            }
        });

        if (openInvoices.length === 0) return null;

        let totalValue = 0;
        let currency = 'USD'; // Default, should detect from first item

        for (const inv of openInvoices) {
            const data = inv.normalized as any;
            if (data?.amount) {
                totalValue += Number(data.amount);
            }
            if (data?.currency) currency = data.currency;
        }

        return {
            type: 'unsent_invoices',
            count: openInvoices.length,
            value: totalValue,
            currency,
            actionable: true,
            metadata: {
                description: 'Invoices created but not yet marked as Paid/Sent'
            }
        };
    }
}

export const dataScannerService = new DataScannerService();
