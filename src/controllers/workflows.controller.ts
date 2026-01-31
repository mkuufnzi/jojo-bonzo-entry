import { Request, Response } from 'express';
import { workflowService } from '../services/workflow.service';
import { logger } from '../lib/logger';

export class WorkflowsController {
  
  static async index(req: Request, res: Response) {
    const user = (req as any).user;
    const serviceFilter = req.query.service as string;
    
    // TODO: Implement filtering in listWorkflows. For now, we fetch all.
    // If we had a serviceId on workflows, we'd filter here.
    // const workflows = await workflowService.listWorkflows(user.id, serviceFilter);
    const workflows = await workflowService.listWorkflows(user.id);
    
    // If filtering, we might want to change the title or activeService context
    const activeService = serviceFilter === 'transactional' ? 'transactional' : 'workflows';
    
    res.render('dashboard/workflows', {
      title: 'Automations',
      workflows,
      activeService, // Dynamically set active sidebar item
      nonce: res.locals.nonce
    });
  }

  static async create(req: Request, res: Response) {
    const user = (req as any).user;
    const { name, triggerEvent, actionType } = req.body;

    // Simple simplified creation for MVP
    try {
      await workflowService.createWorkflow(user.id, {
        name,
        triggerType: 'webhook',
        triggerConfig: { event: triggerEvent || 'invoice.created' },
        actionConfig: { type: actionType || 'apply_branding' }
      });
      
      req.session.notification = { type: 'success', message: 'Workflow created.' };
    } catch (error) {
       req.session.notification = { type: 'error', message: 'Failed to create workflow.' };
    }
    
    res.redirect('/dashboard/workflows');
  }

  static async delete(req: Request, res: Response) {
    const user = (req as any).user;
    const { id } = req.params;
    
    try {
      await workflowService.deleteWorkflow(user.id, id);
      req.session.notification = { type: 'success', message: 'Workflow deleted.' };
    } catch (error) {
       req.session.notification = { type: 'error', message: 'Failed to delete.' };
    }
    res.redirect('/dashboard/workflows');
  }

  static async test(req: Request, res: Response) {
      const user = (req as any).user;
      const { id } = req.params;

      try {
          const result = await workflowService.testWorkflow(user.id, id);
          req.session.notification = { 
              type: 'success', 
              message: `Test successful! Response: ${JSON.stringify(result.data).substring(0, 100)}...` 
          };
      } catch (error: any) {
          req.session.notification = { type: 'error', message: `Test failed: ${error.message}` };
      }
      res.redirect('/dashboard/workflows');
  }
}
