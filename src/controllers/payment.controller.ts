import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { BillingService } from '../services/billing.service';
import { pdfService } from '../services/pdf.service';
import { ConvertPdfSchema } from '../schemas/pdf.schema';
import { config } from '../config/env';
import { UsageService } from '../services/usage.service';
import { escapeHtml } from '../utils/security.utils';

export class PaymentController {
  static async index(req: Request, res: Response) {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/auth/login');
    const billingService = new BillingService();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } }
    });

    const paymentMethods = await billingService.getPaymentMethods(userId);
    
    // Invoice Pagination
    const invoicePage = parseInt(req.query.invoicePage as string) || 1;
    const invoiceLimit = 10;
    const invoiceSkip = (invoicePage - 1) * invoiceLimit;

    const [invoices, totalInvoices] = await Promise.all([
      billingService.getInvoices(userId, invoiceLimit, invoiceSkip),
      billingService.getInvoiceCount(userId)
    ]);

    const totalInvoicePages = Math.ceil(totalInvoices / invoiceLimit);

    const usageService = new UsageService();
    
    // Calculate Usage Stats (Current Month Cycle)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Fetch available services for filter dropdown AND pricing table
    const services = await prisma.service.findMany({
        where: { isActive: true },
        select: { 
            id: true, 
            name: true,
            slug: true,
            description: true,
            pricePerRequest: true 
        },
        orderBy: { name: 'asc' }
    });

    // Parse Filters
    const filterServiceId = req.query.serviceId as string;
    // Default to true if not present (undefined), otherwise check value
    const hideFailed = req.query.hideFailed === undefined ? true : (req.query.hideFailed === 'on' || req.query.hideFailed === 'true');

    // Build Where Clause
    const where: any = {
        userId,
        createdAt: { gte: startOfMonth, lte: endOfMonth }
    };

    if (filterServiceId) {
        where.serviceId = filterServiceId;
    }

    if (hideFailed) {
        where.status = 'success';
    }

    // Pagination for Usage Logs
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const [usageLogs, totalLogs] = await Promise.all([
        prisma.usageLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { service: true, app: true },
            take: limit,
            skip: skip
        }),
        prisma.usageLog.count({ where })
    ]);

    const totalPages = Math.ceil(totalLogs / limit);

    // Calculate Totals (Always calculate totals based on ALL logs for accurate billing, 
    // OR based on filtered? Standard billing dashboards usually show totals for the period 
    // regardless of table filters, but usually have a separate "Filtered Total". 
    // For simplicity and transparency, let's keep totals based on the FULL period usage, 
    // so we should fetch ALL logs for stats, and FILTERED logs for table.
    // However, to save DB calls, we might want to just calculate stats on the filtered list?
    // User Cost/Usage should represent ACTUAL billing. 
    // So let's do a separate count for the totals to be correct.)
    
    // Aggregation for Totals (Cost & Usage Count for Limit)
    // We only bill/count successful requests for the Plan Limit and Cost.
    const usageStats = await prisma.usageLog.aggregate({
        where: {
            userId,
            status: 'success', 
            createdAt: { gte: startOfMonth, lte: endOfMonth },
            cost: { gt: 0 }, 
            resourceType: { not: 'dashboard_visit' }
        },
        _sum: { cost: true }
    });

    const usageCost = usageStats._sum.cost || 0;

    // Calculate Usage by Type using centralized Service (DB-driven)
    const pdfUsage = await usageService.getFeatureUsage(userId, 'pdf_conversion', startOfMonth, endOfMonth);
    const aiUsage = await usageService.getFeatureUsage(userId, 'ai_generation', startOfMonth, endOfMonth);

    // Grouped Usage by Service for compact list
    const groupedUsage = await prisma.usageLog.groupBy({
        by: ['serviceId'],
        where: {
            userId,
            status: 'success',
            createdAt: { gte: startOfMonth, lte: endOfMonth },
            resourceType: { not: 'dashboard_visit' }
        },
        _count: {
            _all: true
        },
        _sum: {
            cost: true
        }
    });

    // Fetch service details for labeling the breakdown
    const usageBreakdown = await Promise.all(groupedUsage.map(async (item) => {
        if (!item.serviceId) return null;
        const service = services.find(s => s.id === item.serviceId);
        return {
            name: service?.name || 'Unknown Protocol',
            slug: service?.slug || 'unknown',
            count: item._count._all,
            cost: item._sum.cost || 0
        };
    }));

    const filteredUsageBreakdown = usageBreakdown.filter(i => i !== null).sort((a, b) => (b?.count || 0) - (a?.count || 0));

    // Get Plan Limit
    // Get Plan Quotas
    let planName = 'Free';
    let planPrice = 0;
    let currency = 'USD';
    let pdfQuota = 0;
    let aiQuota = 0;
    
    if (user && user.subscription && user.subscription.plan) {
         planName = user.subscription.plan.name;
         planPrice = user.subscription.plan.price;
         currency = (user.subscription.plan as any).currency;
         pdfQuota = (user.subscription.plan as any).pdfQuota ?? 0; // Cast to any temporarily if types update is lagging
         aiQuota = (user.subscription.plan as any).aiQuota ?? 0;
    }

    // Add currency for usage logs that might not have it
    const usageLogsWithCurrency = usageLogs.map(log => ({
        ...log,
        currency: (log as any).currency || currency
    }));

    res.render('dashboard/billing', {
      user,
      paymentMethods,
      invoices,
      title: 'Billing',
      activeService: 'hub',
      invoicePagination: {
          page: invoicePage,
          limit: invoiceLimit,
          total: totalInvoices,
          totalPages: totalInvoicePages,
          hasNext: invoicePage < totalInvoicePages,
          hasPrev: invoicePage > 1
      },
      usageLogs: usageLogsWithCurrency,
      usageCost,
      usageBreakdown: filteredUsageBreakdown,
      pdfUsage,
      aiUsage,
      pdfQuota,
      aiQuota,
      planName,
      planPrice,
      currency,
      services,
      pagination: {
          page,
          limit,
          totalLogs,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
      },
      filters: {
          serviceId: filterServiceId,
          hideFailed: hideFailed
      },
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  static async create(req: Request, res: Response) {
    const userId = req.session.userId!; // Assert exists based on middleware or check explicitly
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const billingService = new BillingService();
    let clientSecret = '';

    try {
      clientSecret = await billingService.createSetupIntent(userId);
    } catch (e) {
      console.error('Failed to create setup intent:', e);
    }

    res.render('billing/create', {
      user,
      req, // Pass request to access query params
      clientSecret,
      stripePublicKey: config.STRIPE_PUBLIC_KEY,
      error: null
    });
  }

  static async store(req: Request, res: Response) {
    const userId = req.session.userId!; // Assert exists based on middleware or check explicitly
    const { paymentMethodId } = req.body;
    const billingService = new BillingService();

    try {
      await billingService.savePaymentMethod(userId, paymentMethodId);

      res.redirect('/billing?success=Payment method added');
    } catch (error) {
      console.error('Failed to save payment method:', error);
      res.redirect('/billing/payment-methods/create?error=' + encodeURIComponent('Failed to save payment method'));
    }
  }

  static async destroy(req: Request, res: Response) {
    const userId = req.session.userId!; // Assert exists based on middleware or check explicitly
    const { id } = req.params;
    const billingService = new BillingService();

    try {
      // Check for active non-free subscription
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: { include: { plan: true } } }
      });

      if (user?.subscription && user.subscription.plan.name !== 'Free') {
        // If subscription is active OR (canceled but still within period)
        const now = new Date();
        const isStillActive = user.subscription.status === 'active' ||
          user.subscription.status === 'past_due' ||
          (user.subscription.status === 'canceled' && user.subscription.endDate && user.subscription.endDate > now);

        if (isStillActive) {
          return res.redirect('/billing?error=' + encodeURIComponent('Cannot remove payment method while you have an active paid subscription. Please wait until the subscription period ends.'));
        }
      }

      await billingService.removePaymentMethod(userId, id);
      res.redirect('/billing?success=Payment method removed');
    } catch (error) {
      console.error(error);
      res.redirect('/billing?error=Failed to remove payment method');
    }
  }

  static async setDefault(req: Request, res: Response) {
    const userId = req.session.userId!; // Assert exists based on middleware or check explicitly
    const { id } = req.params;
    const billingService = new BillingService();

    try {
      await billingService.setDefaultPaymentMethod(userId, id);
      res.redirect('/billing?success=Default payment method updated');
    } catch (error) {
      res.redirect('/billing?error=Failed to update default payment method');
    }
  }

  static async downloadInvoice(req: Request, res: Response) {
    const userId = req.session.userId!; // Assert exists based on middleware or check explicitly
    const { id } = req.params;
    const billingService = new BillingService();

    try {
      // We need to ensure the invoice belongs to the user.
      // The service getInvoiceById doesn't check userId, so we check it here or update service.
      // For now, check here.
      const invoice = await billingService.getInvoiceById(id);

      if (!invoice || invoice.userId !== userId) {
        return res.status(404).send('Invoice not found');
      }

      // We need user and paymentMethod included. 
      // Repo findInvoiceById includes paymentMethod.
      // We need user details for the invoice PDF.
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Helvetica, Arial, sans-serif; padding: 40px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .title { font-size: 24px; font-weight: bold; }
            .meta { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
            .total { font-weight: bold; font-size: 18px; margin-top: 20px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">INVOICE</div>
            <div>
              Floovioo <br>
              123 SaaS Street<br>
              Cloud City, Web
            </div>
          </div>

          <div class="meta">
            <strong>Invoice ID:</strong> ${invoice.id}<br>
            <strong>Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}<br>
            <strong>Status:</strong> ${invoice.status.toUpperCase()}<br>
            <strong>Billed To:</strong> ${escapeHtml(user.name)} (${escapeHtml(user.email)})
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Subscription Charge</td>
                <td>${invoice.currency} ${invoice.amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="total">
            Total: ${invoice.currency} ${invoice.amount.toFixed(2)}
          </div>
          
          <div style="margin-top: 40px; font-size: 12px; color: #666;">
            Paid via ${invoice.paymentMethod?.provider || 'Card'} ending in ${invoice.paymentMethod?.last4 || '****'}
          </div>
        </body>
        </html>
      `;

      const pdfRequest = ConvertPdfSchema.parse({
        source: { type: 'html', content: htmlContent },
        options: {
          format: 'A4',
          landscape: false,
          printBackground: true,
          scale: 1.0,
          margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
          displayHeaderFooter: false
        }
      });

      const pdfBuffer = await pdfService.generatePdf(pdfRequest);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length.toString(),
        'Content-Disposition': `attachment; filename="invoice-${invoice.id}.pdf"`
      });

      res.send(pdfBuffer);

    } catch (error) {
      console.error('Invoice generation error:', error);
      res.status(500).send('Failed to generate invoice PDF');
    }
  }
}
