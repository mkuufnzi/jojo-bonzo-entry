import { Request, Response } from 'express';
import { integrationService } from '../services/integration.service';
import { logger } from '../lib/logger';

export class IntegrationsController {
  
  // View: List Connections
  static async index(req: Request, res: Response) {
    const user = (req as any).user;
    const integrations = await integrationService.listIntegrations(user.id);
    
    // Pass active integrations to view to show status
    res.render('dashboard/connections', {
      title: 'Data Connections',
      integrations,
      activeService: 'connections' // For sidebad highlighting
    });
  }

  // API: Connect (Start Flow)
  static async connect(req: Request, res: Response) {
    const user = (req as any).user;
    const { provider } = req.params;

    try {
      // Instead of mock flow, redirect to the actual OAuth initialization endpoint 
      // managed by BusinessController. This ensures consistent OAuth state mechanics.
      return res.redirect(`/api/business/oauth/${provider}`);
    } catch (error) {
      logger.error({ error }, 'Connect Error');
      req.session.notification = { type: 'error', message: 'Failed to connect provider.' };
      res.redirect('/dashboard/integrations');
    }
  }

  // API: Disconnect
  static async disconnect(req: Request, res: Response) {
    const user = (req as any).user;
    const { id } = req.params;

    try {
      await integrationService.disconnectProvider(user.id, id);
      req.session.notification = { type: 'success', message: 'Integration disconnected.' };
    } catch (error) {
      logger.error({ error }, 'Disconnect Error');
      req.session.notification = { type: 'error', message: 'Failed to disconnect.' };
    }
    res.redirect('/dashboard/integrations');
  }
}
