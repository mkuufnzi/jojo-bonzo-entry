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
      // Mock OAuth Flow: Immediately connect
      await integrationService.connectProvider(user.id, provider, { internal: true, scopes: '' });
      
      req.session.notification = { type: 'success', message: `${provider} connected successfully.` };
      res.redirect('/dashboard/connections');
    } catch (error) {
      logger.error({ error }, 'Connect Error');
      req.session.notification = { type: 'error', message: 'Failed to connect provider.' };
      res.redirect('/dashboard/connections');
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
    res.redirect('/dashboard/connections');
  }
}
