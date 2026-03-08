import { Request, Response } from 'express';
import { workflowService } from '../services/workflow.service';
import { logger } from '../lib/logger';

export class WorkflowsController {
  
  static async index(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const serviceFilter = req.query.service as string;
        const tagFilter = req.query.tag as string;
        
        // Fetch workflows
        let workflows = await workflowService.listWorkflows(user.id);

        // Filter by Tag if present (Client-side filtering for now since Service doesn't support it yet)
        if (tagFilter) {
            if (tagFilter === 'recovery') {
                workflows = workflows.filter(wf => 
                    wf.triggerType === 'invoice_overdue' || 
                    wf.name.toLowerCase().includes('recovery')
                );
            }
        }
        
        // Real Stats Aggregation
        const prisma = (await import('../lib/prisma')).default;
        
        // 1. Total Runs (24h)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const totalRuns24h = await prisma.workflowExecutionLog.count({
            where: {
                workflow: { businessId: user.businessId },
                createdAt: { gte: twentyFourHoursAgo }
            }
        });

        // 2. Success Rate (All Time)
        const totalRuns = await prisma.workflowExecutionLog.count({
            where: { workflow: { businessId: user.businessId } }
        });
        const successfulRuns = await prisma.workflowExecutionLog.count({
            where: { 
                workflow: { businessId: user.businessId },
                status: 'success'
            }
        });
        const successRate = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : '100.0';

        // 3. Last Run Time
        const lastRun = await prisma.workflowExecutionLog.findFirst({
            where: { workflow: { businessId: user.businessId } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true }
        });
        
        // Helper for "12 mins ago"
        const timeAgo = (date: Date) => {
            const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " years ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " months ago";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + " days ago";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + " hours ago";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + " minutes ago";
            return Math.floor(seconds) + " seconds ago";
        };

        const stats = {
            runs24h: totalRuns24h,
            successRate: successRate + '%',
            avgTime: '~1.2s', // Still hardcoded until we avg duration column
            lastRun: lastRun ? timeAgo(lastRun.createdAt) : 'Never'
        };
        
        const activeService = serviceFilter === 'transactional' ? 'transactional' : 'workflows';
        
        res.render('dashboard/workflows', {
            title: 'Automations',
            workflows,
            stats,
            activeService, 
            nonce: res.locals.nonce
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to load Workflows Index');
        res.status(500).send('Error loading workflows');
    }
  }

  static async show(req: Request, res: Response) {
      const user = (req as any).user;
      const { id } = req.params;
      
      const prisma = (await import('../lib/prisma')).default;
      
      const workflow = await prisma.workflow.findUnique({
          where: { id },
          include: { 
              executionLogs: {
                  orderBy: { createdAt: 'desc' },
                  take: 50
              }
          }
      });
      
      if (!workflow || workflow.businessId !== user.businessId) {
          req.session.notification = { type: 'error', message: 'Workflow not found.' };
          return res.redirect('/dashboard/workflows');
      }
      
      res.render('dashboard/workflow-detail', {
          title: workflow.name,
          workflow,
          logs: workflow.executionLogs,
          activeService: 'workflows',
          nonce: res.locals.nonce
      });
  }

  static async toggle(req: Request, res: Response) {
      const user = (req as any).user;
      const { id } = req.params;
      
      const prisma = (await import('../lib/prisma')).default;
      const workflow = await prisma.workflow.findUnique({ where: { id } });
      
      if (workflow && workflow.businessId === user.businessId) {
          await prisma.workflow.update({
              where: { id },
              data: { isActive: !workflow.isActive }
          });
          req.session.notification = { type: 'success', message: `Workflow ${workflow.isActive ? 'paused' : 'activated'}.` };
      }
      
      res.redirect(`/dashboard/workflows/${id}`);
  }

  static async create(req: Request, res: Response) {
    const user = (req as any).user;
    const { name, triggerEvent, actionType } = req.body;

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
          const result = await workflowService.testWorkflow(user.id, id, req.body.payload || {});
          
          // Enhanced Success Message with Data Preview if possible
          const cleanData = JSON.stringify('data' in result ? result.data : result, null, 2);
          
          req.session.notification = { 
              type: 'success', 
              message: 'Test run initiated successfully.' 
          };
          // We might want to pass the result to the view via flash or query param
          // For now, redirect to details
      } catch (error: any) {
          req.session.notification = { type: 'error', message: `Test failed: ${error.message}` };
      }
      res.redirect(`/dashboard/workflows/${id}`);
  }
}
