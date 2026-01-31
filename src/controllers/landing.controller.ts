import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export class LandingController {
  private static implementedTools = ['html-to-pdf', 'ai-doc-generator'];

  static async index(req: Request, res: Response) {
    const services = await prisma.service.findMany({
      where: { isActive: true }
    });

    const serviceIcons: Record<string, string> = {
      'html-to-pdf': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>', // Standard Doc
      'ai-doc-generator': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />', // Lightning/AI
      'chat-with-page': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />',
      'brand-with-jojo': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />',
      'automation-for-smes': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />',
      'default': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />'
    };

    const paidSubscriptionCount = await prisma.subscription.count({
      where: {
        plan: {
          price: { gt: 0 }
        },
        status: 'active'
      }
    });

    res.render('landing/index', {
      services,
      serviceIcons,
      paidSubscriptionCount: 500 + paidSubscriptionCount, // Base 500 + real count
      implementedTools: LandingController.implementedTools,
      user: (req.session as any).userId ? true : false // Simple check for logged in state
    });
  }

  static async tools(req: Request, res: Response) {
    const services = await prisma.service.findMany({
      where: { isActive: true }
    });

    res.render('landing/tools', {
      services,
      implementedTools: LandingController.implementedTools,
      user: (req.session as any).userId ? true : false
    });
  }

  static async showTool(req: Request, res: Response) {
    const { slug } = req.params;
    const service = await prisma.service.findUnique({
      where: { slug }
    });

    // Fetch all services for the navbar
    const services = await prisma.service.findMany({
      where: { isActive: true }
    });

    // If service exists and is active
    if (service && service.isActive) {
      // If implemented, show the tool
      if (LandingController.implementedTools.includes(service.slug)) {
        // Public Guest Token (injected by frontend for guest users)
        const guestToken = 'guest-access-token';

        return res.render(`landing/tools/${slug}`, {
          service,
          services,
          guestApiKey: '', // Deprecated, use token
          guestToken,
          user: (req.session as any).userId ? true : false
        }, (err, html) => {
          if (err) {
            if (err.message.includes('Failed to lookup view')) {
              // Fallback to generic container
              return res.render('landing/tool', {
                service,
                services,
                guestApiKey: '',
                guestToken,
                user: (req.session as any).userId ? true : false
              });
            }
            throw err;
          }
          res.send(html);
        });
      } else {
        // Define external URLs for SaaS tools
        const externalUrls: Record<string, string> = {
          'chat-with-page': 'https://chat-with-page.floovioo.com',
          'brand-with-jojo': 'https://brand-with-jojo.floovioo.com',
          'automation-for-smes': 'https://automation-for-smes.floovioo.com'
        };

        // Render Coming Soon page
        return res.render('landing/coming-soon', {
          service,
          services,
          externalUrl: externalUrls[service.slug] || null,
          user: (req.session as any).userId ? true : false
        });
      }
    }

    // If tool is not found or not active, redirect to tools list
    return res.redirect('/tools');
  }

  static async pricing(req: Request, res: Response) {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });
    const services = await prisma.service.findMany();

    res.render('landing/pricing', {
      plans,
      services,
      user: (req.session as any).userId ? true : false
    });
  }

  static async docs(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/docs', {
      services,
      user: (req.session as any).userId ? true : false
    });
  }

  static async brandWithJojo(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/brand-with-jojo', {
      services,
      user: (req.session as any).userId ? true : false
    });
  }

  static async automationForSmes(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/automation-for-smes', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  // New Product Pages (Enterprise Pillars)
  static async productTransactional(req: Request, res: Response) {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.render('landing/products/transactional', { // Renamed from docs to transactional
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async productRetention(req: Request, res: Response) {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.render('landing/products/retention', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async productSales(req: Request, res: Response) {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.render('landing/products/sales', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async productContent(req: Request, res: Response) {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.render('landing/products/content', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async productWorkflows(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/products/workflows', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  // Resources
  static async templates(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/templates', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async blog(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/blog', {
        services,
        user: (req.session as any).userId ? true : false
    });
  }

  static async requestTool(req: Request, res: Response) {
    const services = await prisma.service.findMany();
    res.render('landing/request-tool', {
      services,
      user: (req.session as any).userId ? true : false
    });
  }

  static async contactPage(req: Request, res: Response) {
    const services = await prisma.service.findMany({ where: { isActive: true } });
    res.render('landing/contact', {
        services, // For sidebar/footer if needed
        user: (req.session as any).userId ? true : false,
        success: null,
        error: null,
        presetMessage: req.query.message || null
    });
  }

  static async contactSubmit(req: Request, res: Response) {
      const { name, email, message } = req.body;
      const services = await prisma.service.findMany({ where: { isActive: true } });
      
      try {
          const { emailService } = require('../services/email.service');
          await emailService.sendContactEmail(name, email, message);
          
          res.render('landing/contact', {
              services,
              user: (req.session as any).userId ? true : false,
              success: 'Message sent! We will get back to you soon.',
              error: null
          });
      } catch (error) {
          console.error('Contact Form Error:', error);
          res.render('landing/contact', {
              services,
              user: (req.session as any).userId ? true : false,
              success: null,
              error: 'Failed to send message. Please try again later.'
          });
      }
  }

  static async terms(req: Request, res: Response) {
      const services = await prisma.service.findMany({ where: { isActive: true } });
      res.render('terms', {
          services,
          user: (req.session as any).userId ? true : false
      });
  }

  static async privacy(req: Request, res: Response) {
      const services = await prisma.service.findMany({ where: { isActive: true } });
      res.render('privacy', {
          services,
          user: (req.session as any).userId ? true : false
      });
  }
}

