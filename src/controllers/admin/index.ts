import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import prisma from '../../lib/prisma';

export class AdminController {
  
  static async loginPage(req: Request, res: Response) {
      if ((req as any).isAuthenticated() && res.locals.user?.isAdmin) {
          return res.redirect('/admin');
      }
      res.render('admin/login', { error: (req as any).flash('error') });
  }

  static login(req: Request, res: Response, next: NextFunction) {
      passport.authenticate('local', {
          successRedirect: '/admin',
          failureRedirect: '/admin/login',
          failureFlash: true
      })(req, res, next);
  }
  /**
   * Helper: Get Date Range from Period String
   */
  private static getPeriodDates(period: string): { startDate: Date, endDate: Date } {
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
          case '7d': startDate.setDate(endDate.getDate() - 7); break;
          case '30d': startDate.setDate(endDate.getDate() - 30); break;
          case '90d': startDate.setDate(endDate.getDate() - 90); break;
          case 'ytd': startDate.setMonth(0, 1); break;
          case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
          case 'all': startDate.setFullYear(2000); break;
          default: startDate.setDate(endDate.getDate() - 30); // Default 30d
      }
      return { startDate, endDate };
  }

  /**
   * Admin Dashboard Home
   */
  static async index(req: Request, res: Response) {
    console.log('🔍 [AdminController] Index Called. User:', res.locals.user?.email, 'Role:', res.locals.role);
    try {
      const period = (req.query.period as string) || '30d';
      const { startDate } = AdminController.getPeriodDates(period);

      // Parallel data fetching for performance
      const [
        activeSubs,
        totalUsers,
        subscriberCount,
        invoiceStats,
        usageStats,
        recentUsers
      ] = await Promise.all([
        // 1. Active Subscriptions with Plans (Snapshot - always current)
        prisma.subscription.findMany({
          where: { status: 'active' },
          include: { 
            plan: true,
            invoices: {
              where: { status: 'paid' },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
        }),
        // 2. Total users (Snapshot)
        prisma.user.count(),
        // 3. Subscribers only (Snapshot)
        prisma.user.count({ where: { isAdmin: false } }),
        // 4. Billing from Invoices (Filtered by Period)
        prisma.invoice.aggregate({
          _sum: { amount: true },
          _count: true,
          where: { 
              status: 'paid',
              createdAt: { gte: startDate }
          }
        }),
        // 5. Usage Stats (Filtered by Period)
        prisma.usageLog.aggregate({
          _count: true,
          where: {
            createdAt: { gte: startDate }
          }
        }),
        // 6. Recent signups
        prisma.user.findMany({
          where: { isAdmin: false },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, email: true, createdAt: true }
        })
      ]);

      // Calculate MRR and breakdown by plan
      const mrrBreakdown: Record<string, { count: number; revenue: number }> = {};
      let totalMRR = 0;

      activeSubs.forEach(sub => {
        if (sub.plan) {
          const planName = sub.plan.name;
          // Use actual paid invoice amount (Source of Truth), or 0 if no paid invoice (e.g. Free/Trial)
          const revenue = sub.invoices?.[0]?.amount || 0;
          
          if (!mrrBreakdown[planName]) {
            mrrBreakdown[planName] = { count: 0, revenue: 0 };
          }
          
          mrrBreakdown[planName].count++;
          mrrBreakdown[planName].revenue += revenue;
          totalMRR += revenue;
        }
      });

      // Calculate error rate (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [totalLogs24h, errorLogs24h] = await Promise.all([
        prisma.usageLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
        prisma.usageLog.count({ where: { createdAt: { gte: oneDayAgo }, status: 'error' } })
      ]);

      const errorRate = totalLogs24h > 0 ? ((errorLogs24h / totalLogs24h) * 100).toFixed(1) : '0.0';

      const stats = {
        // Revenue Metrics
        mrr: totalMRR.toFixed(2),
        mrrBreakdown,
        totalRevenue: (invoiceStats._sum.amount || 0).toFixed(2),
        totalInvoices: invoiceStats._count || 0,
        
        // User Metrics
        totalUsers,
        subscriberCount,
        activeSubscriptions: activeSubs.length,
        
        // Usage Metrics (Filtered)
        totalUsage30d: usageStats._count || 0, // Label in view might need update or variable name change

        
        // System Health
        errorRate,
        
        // Recent Activity
        recentUsers
      };

      console.log('✅ [AdminController] Data fetched successfully. Rendering view...');

      res.render('admin/index', {
        user: res.locals.user,
        role: res.locals.role,
        permissions: res.locals.permissions,
        stats,
        currentPeriod: period // Pass period to view
      });
    } catch (error) {
      console.error('❌ [AdminController] Admin dashboard error:', error);
      res.status(500).send('Error loading admin dashboard: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Feature Management - List all features
   */
  static async listFeatures(req: Request, res: Response) {
    try {
      const features = await prisma.feature.findMany({
        orderBy: { category: 'asc' },
      });

      res.render('admin/features/index', {
        user: res.locals.user,
        role: res.locals.role,
        permissions: res.locals.permissions,
        features,
      });
    } catch (error) {
      console.error('Error listing features:', error);
      res.status(500).send('Error loading features');
    }
  }

  /**
   * Plan Feature Management - Assign features to plans
   */
  static async managePlanFeatures(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        include: {
          planFeatures: {
            include: {
              feature: true,
            },
          },
        },
        orderBy: { price: 'asc' },
      });

      const allFeatures = await prisma.feature.findMany({
        where: { isActive: true },
        orderBy: { category: 'asc' },
      });

      res.render('admin/plan-features/index', {
        user: res.locals.user,
        role: res.locals.role,
        permissions: res.locals.permissions,
        plans,
        allFeatures,
      });
    } catch (error) {
      console.error('Error loading plan features:', error);
      res.status(500).send('Error loading plan features');
    }
  }

  /**
   * Toggle feature for a plan
   */
  static async togglePlanFeature(req: Request, res: Response) {
    try {
      const { planId, featureId } = req.body;

      const existing = await prisma.planFeature.findUnique({
        where: {
          planId_featureId: { planId, featureId },
        },
      });

      if (existing) {
        // Toggle or delete
        await prisma.planFeature.update({
          where: { id: existing.id },
          data: { isEnabled: !existing.isEnabled },
        });
      } else {
        // Create new assignment
        await prisma.planFeature.create({
          data: {
            planId,
            featureId,
            isEnabled: true,
          },
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error toggling plan feature:', error);
      res.status(500).json({ error: 'Failed to toggle feature' });
    }
  }

  /**
   * User Management - List all users with multi-tab support
   * Tab 1: End Users (role = USER)
   * Tab 2: System Users (role != USER)
   * Tab 3: Banned IPs
   */
  static async listUsers(req: Request, res: Response) {
    try {
        const search = (req.query.search as string) || '';
        const tab = (req.query.tab as string) || 'end-users';
        
        // Fetch end users (role = USER or no role)
        const endUsers = await prisma.user.findMany({
            where: {
                role: 'USER',
                OR: search ? [
                    { email: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } }
                ] : undefined
            },
            include: {
                subscription: { include: { plan: true } },
                loginHistory: { orderBy: { createdAt: 'desc' }, take: 1 }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        // Fetch system users (role != USER)
        const systemUsers = await prisma.user.findMany({
            where: {
                role: { not: 'USER' },
                OR: search ? [
                    { email: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } }
                ] : undefined
            },
            include: {
                loginHistory: { orderBy: { createdAt: 'desc' }, take: 1 }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch banned IPs (graceful fallback if table doesn't exist yet)
        let bannedIps: any[] = [];
        try {
            bannedIps = await (prisma as any).ipBan?.findMany?.({
                orderBy: { createdAt: 'desc' }
            }) || [];
        } catch (e) {
            console.log('[Users] IpBan table not available yet - run migration');
        }

        // Role statistics
        const roleStats = await prisma.user.groupBy({
            by: ['role'],
            _count: { id: true }
        });

        res.render('admin/users/index', { 
            user: res.locals.user, 
            role: res.locals.role,
            permissions: res.locals.permissions,
            endUsers,
            systemUsers,
            bannedIps,
            roleStats: roleStats.reduce((acc, r) => ({ ...acc, [r.role]: r._count.id }), {}),
            search,
            activeTab: tab,
            title: 'User Management'
        });
    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).send('Error loading users');
    }
  }

  /**
   * Ban a user (set isActive = false)
   */
  static async banUser(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        await prisma.user.update({
            where: { id },
            data: { isActive: false }
        });

        // Log the action
        await prisma.adminLog.create({
            data: {
                adminId: res.locals.user.id,
                action: 'BAN_USER',
                target: id,
                ip: req.ip || '',
                details: { reason }
            }
        });

        res.json({ success: true, message: 'User banned successfully' });
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ success: false, error: 'Failed to ban user' });
    }
  }

  /**
   * Unban a user (set isActive = true)
   */
  static async unbanUser(req: Request, res: Response) {
    try {
        const { id } = req.params;

        await prisma.user.update({
            where: { id },
            data: { isActive: true }
        });

        await prisma.adminLog.create({
            data: {
                adminId: res.locals.user.id,
                action: 'UNBAN_USER',
                target: id,
                ip: req.ip || '',
                details: {}
            }
        });

        res.json({ success: true, message: 'User unbanned successfully' });
    } catch (error) {
        console.error('Error unbanning user:', error);
        res.status(500).json({ success: false, error: 'Failed to unban user' });
    }
  }

  /**
   * Ban an IP address
   */
  static async banIp(req: Request, res: Response) {
    try {
        const { ipAddress, reason, duration } = req.body;
        
        // Calculate expiration
        let expiresAt: Date | null = null;
        if (duration && duration !== 'permanent') {
            const hours = parseInt(duration);
            if (!isNaN(hours)) {
                expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
            }
        }

        await (prisma as any).ipBan.create({
            data: {
                ipAddress,
                reason,
                bannedBy: res.locals.user.id,
                expiresAt
            }
        });

        await prisma.adminLog.create({
            data: {
                adminId: res.locals.user.id,
                action: 'BAN_IP',
                target: ipAddress,
                ip: req.ip || '',
                details: { reason, duration }
            }
        });

        res.json({ success: true, message: 'IP banned successfully' });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: 'IP is already banned' });
        }
        console.error('Error banning IP:', error);
        res.status(500).json({ success: false, error: 'Failed to ban IP' });
    }
  }

  /**
   * Unban an IP address
   */
  static async unbanIp(req: Request, res: Response) {
    try {
        const { id } = req.params;

        const ban = await (prisma as any).ipBan.delete({
            where: { id }
        });

        await prisma.adminLog.create({
            data: {
                adminId: res.locals.user.id,
                action: 'UNBAN_IP',
                target: ban.ipAddress,
                ip: req.ip || '',
                details: {}
            }
        });

        res.json({ success: true, message: 'IP unbanned successfully' });
    } catch (error) {
        console.error('Error unbanning IP:', error);
        res.status(500).json({ success: false, error: 'Failed to unban IP' });
    }
  }

  /**
   * Get user's IP history from login records
   */
  static async getUserIpHistory(req: Request, res: Response) {
    try {
        const { id } = req.params;

        const history = await prisma.loginHistory.findMany({
            where: { userId: id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        // Group by IP and count
        const ipStats = history.reduce((acc, h) => {
            if (!acc[h.ipAddress]) {
                acc[h.ipAddress] = { count: 0, lastSeen: h.createdAt, statuses: [] };
            }
            acc[h.ipAddress].count++;
            acc[h.ipAddress].statuses.push(h.status);
            return acc;
        }, {} as Record<string, { count: number; lastSeen: Date; statuses: string[] }>);

        res.json({ success: true, history, ipStats });
    } catch (error) {
        console.error('Error getting IP history:', error);
        res.status(500).json({ success: false, error: 'Failed to get IP history' });
    }
  }

  /**
   * Update user role (requires email verification)
   */
  static async updateUserRole(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { role, verificationCode } = req.body;

        // Validate role
        const validRoles = ['ROOT', 'CEO', 'COO', 'DEVOPS', 'MARKETING', 'SUPPORT', 'USER'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        // Verify the email code
        const admin = await prisma.user.findUnique({
            where: { id: res.locals.user.id }
        });

        if (!admin?.twoFactorCurrentCode || admin.twoFactorCurrentCode !== verificationCode) {
            return res.status(401).json({ success: false, error: 'Invalid verification code' });
        }

        if (admin.twoFactorCodeExpires && admin.twoFactorCodeExpires < new Date()) {
            return res.status(401).json({ success: false, error: 'Verification code expired' });
        }

        // Update role
        await prisma.user.update({
            where: { id },
            data: { role }
        });

        // Clear verification code
        await prisma.user.update({
            where: { id: res.locals.user.id },
            data: {
                twoFactorCurrentCode: null,
                twoFactorCodeExpires: null
            }
        });

        await prisma.adminLog.create({
            data: {
                adminId: res.locals.user.id,
                action: 'UPDATE_USER_ROLE',
                target: id,
                ip: req.ip || '',
                details: { newRole: role }
            }
        });

        res.json({ success: true, message: 'User role updated successfully' });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  }

  /**
   * Plan Management - List all plans
   */
  static async listPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        include: {
          _count: {
            select: { subscriptions: true },
          },
        },
        orderBy: { price: 'asc' },
      });

      res.render('admin/plans/index', {
        user: res.locals.user,
        role: res.locals.role,
        permissions: res.locals.permissions,
        plans,
      });
    } catch (error) {
      console.error('Error listing plans:', error);
      res.status(500).send('Error listing plans');
    }
  }

  static async editPlan(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const plan = await prisma.plan.findUnique({ 
              where: { id },
              include: { planFeatures: true }
          });
          const allFeatures = await prisma.feature.findMany({ 
              orderBy: { category: 'asc' } 
          });
          
          if (!plan) return res.status(404).send('Plan not found');
          res.render('admin/plans/edit', { user: res.locals.user, plan, allFeatures });
      } catch (error) {
           console.error('Error loading plan:', error);
           res.status(500).send('Error loading plan');
      }
  }

  static async updatePlan(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const { name, price, requestLimit, pdfQuota, aiQuota, stripePriceId, features } = req.body;
          
          await prisma.$transaction(async (tx) => {
              // 1. Update basic plan details
              await tx.plan.update({
                  where: { id },
                  data: {
                      name,
                      price: parseFloat(price),
                      requestLimit: parseInt(requestLimit),
                      pdfQuota: parseInt(pdfQuota),
                      aiQuota: parseInt(aiQuota),
                      stripePriceId
                  }
              });

              // 2. Update Plan Features
              // Since strict toggle, we can delete all for this plan and re-insert checked ones
              // Or smarter: find existing, compare. Delete/Insert is easier for full form submission.
              await tx.planFeature.deleteMany({ where: { planId: id } });

              if (features && Array.isArray(features)) {
                  await tx.planFeature.createMany({
                      data: features.map((featureId: string) => ({
                          planId: id,
                          featureId,
                          isEnabled: true
                      }))
                  });
              } else if (features && typeof features === 'string') {
                   // Single checkbox checked
                   await tx.planFeature.create({
                       data: {
                           planId: id,
                           featureId: features,
                           isEnabled: true
                       }
                   });
              }
          });

          res.redirect('/admin/plans');
      } catch (error) {
          console.error('Error updating plan:', error);
          res.status(500).send('Error updating plan');
      }
  }

  /**
   * Service Management - List all services
   */
  static async listServices(req: Request, res: Response) {
    try {
      const services = await prisma.service.findMany({
        orderBy: { name: 'asc' },
        include: {
             _count: { select: { apps: true, logs: true } }
        }
      });

      res.render('admin/services/index', {
        user: res.locals.user,
        role: res.locals.role,
        permissions: res.locals.permissions,
        services,
      });
    } catch (error) {
      console.error('Error listing services:', error);
      res.status(500).send('Error loading services');
    }
  }

  /**
   * Service Management - Edit Service Form
   */
  static async editService(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const service = await prisma.service.findUnique({ 
            where: { id }
        });
        
        if (!service) return res.status(404).send('Service not found');

        const configStr = JSON.stringify(service.config || {}, null, 2);

        const features = await prisma.feature.findMany({
            orderBy: { category: 'asc' }
        });

        res.render('admin/services/edit', {
            user: res.locals.user,
            service,
            features,
            configStr
        });
    } catch (error) {
        console.error('Error editing service:', error);
        res.status(500).send('Error loading service');
    }
  }

  /**
   * Send Verification Code for a Critical Action (Email OTP)
   */
  static async sendActionVerification(req: Request, res: Response) {
      if (!res.locals.user || !res.locals.user.id) {
          return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
          const { AuthService } = await import('../../services/auth.service');
          const svc = new AuthService();
          await svc.generateTwoFactorCode(res.locals.user.id, 'Service Verification');
          res.json({ success: true, message: 'Verification code sent to your email.' });
      } catch (error) {
          console.error('Error sending verification code:', error);
          res.status(500).json({ error: 'Failed to send verification code' });
      }
  }

  /**
   * Atomic Service Config Update
   */
  static async updateServiceConfig(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const { type, action, key, data, verificationCode } = req.body;

          // 0. Security Verification
          if (!verificationCode) {
              return res.status(400).json({ error: 'Verification code is required' });
          }
          const { AuthService } = await import('../../services/auth.service');
          const svc = new AuthService();
          const adminId = res.locals.user?.id;
          if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

          const isValid = await svc.verifyTwoFactorCode(adminId, verificationCode);
          if (!isValid) {
              return res.status(403).json({ error: 'Invalid or expired verification code' });
          }

          // 1. Fetch Service
          const service = await prisma.service.findUnique({ where: { id } });
          if (!service) return res.status(404).json({ error: 'Service not found' });

          const config = (service.config as any) || {};
          
          // 2. Apply Atomic Change
          if (type === 'webhook') {
              config.webhooks = config.webhooks || {};
              if (action === 'delete') {
                  delete config.webhooks[key];
              } else {
                  config.webhooks[key] = data; // data = { url, method, label, description }
              }
          } else if (type === 'path') {
              config.paths = config.paths || [];
              if (action === 'delete') {
                  // Filter out by path value? Or index? 
                  // Assuming key is the path string for deletion
                  config.paths = config.paths.filter((p: any) => p.path !== key);
              } else {
                  // Check if exists, update or push
                  const idx = config.paths.findIndex((p: any) => p.path === data.path);
                  if (idx >= 0) {
                      config.paths[idx] = data;
                  } else {
                      config.paths.push(data);
                  }
              }
          } else if (type === 'dependency') {
               config.dependencies = config.dependencies || [];
               // Key for dependency is composite: service + endpoint
               if (action === 'delete') {
                   // key format: "service:endpoint"
                   const [s, e] = key.split(':');
                   config.dependencies = config.dependencies.filter((d: any) => 
                       !(d.service === s && d.endpoint === e)
                   );
               } else {
                   // Add or Update (unlikely to update composite key, but replace if exists)
                   const idx = config.dependencies.findIndex((d: any) => 
                       d.service === data.service && d.endpoint === data.endpoint
                   );
                   if (idx >= 0) {
                       config.dependencies[idx] = data;
                   } else {
                       config.dependencies.push(data);
                   }
               }
          }

          // 3. Save
          await prisma.service.update({
              where: { id },
              data: { config }
          });

          // 4. Refresh Cache
          const { webhookService } = await import('../../services/webhook.service');
          await webhookService.refreshConfig();

          res.json({ success: true });

      } catch (error) {
          console.error('Error updating service config:', error);
          res.status(500).json({ error: 'Internal Server Error' });
      }
  }

  /**
   * Service Management - Update Service Config (With Versioning)
   */
  static async updateService(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { name, description, pricePerRequest, executionType, endpointUrl, configJson, isActive, note, verificationCode, requiredFeatureKey } = req.body;



        // 0. Security Verification (Critical Action)
        if (!verificationCode) {
            return res.status(400).send('Verification code is required for this action');
        }

        const { AuthService } = await import('../../services/auth.service');
        const svc = new AuthService();
        // Use current admin user ID for verification
        const adminId = res.locals.user?.id;
        if (!adminId) return res.status(401).send('Unauthorized');

        const isValid = await svc.verifyTwoFactorCode(adminId, verificationCode);
        if (!isValid) {
            return res.status(403).send('Invalid or expired verification code');
        }

        // 1. Fetch current service state for backup
        const currentService = await prisma.service.findUnique({ where: { id } });
        if (!currentService) return res.status(404).send('Service not found');

        // 2. Parse New Config JSON (Only if provided)
        let config: any = undefined;
        if (configJson) {
            try {
                config = JSON.parse(configJson);
            } catch (e) {
                 console.error('JSON Parse Error:', e);
                 return res.status(400).send('Invalid JSON Config');
            }
        }

        // 3. Create Version & Update Service Atomically
        await prisma.$transaction(async (tx) => {
            // Service Update Data
            const updateData: any = {
                name,
                description,
                pricePerRequest: parseFloat(pricePerRequest || '0'),
                executionType,
                endpointUrl,
                isActive: isActive === 'on',
                requiredFeatureKey: requiredFeatureKey || null
            };
            if (config) updateData.config = config;

            // Update Service
            await tx.service.update({
                where: { id },
                data: updateData
            });
        });
        
        // 5. Refresh Cache
        const { webhookService } = await import('../../services/webhook.service');
        await webhookService.refreshConfig();

        res.redirect(`/admin/services/${id}/edit?success=true`);

    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).send('Error updating service');
    }
  }

  /**
   * Rollback Service to Previous Version (DISABLED - requires ServiceConfigVersion model)
   */
  static async rollbackService(req: Request, res: Response) {
      // Versioning feature removed - requires ServiceConfigVersion model in schema
      return res.status(501).send('Service versioning not implemented. Add ServiceConfigVersion model to enable this feature.');
  }

  /**
   * Force Sync Services from DB (Cache Clear)
   */
  /**
   * Force Sync Services from DB (Cache Clear) & Register Code Manifests
   */
  static async syncServices(req: Request, res: Response) {
      try {
           // 1. Refresh Dynamic Config from Webhooks (Legacy)
           const { webhookService } = await import('../../services/webhook.service');
           await webhookService.refreshConfig();

           // 2. Sync Code Manifests (Enterprise Pattern)
           const { serviceRegistry } = await import('../../services/service-registry.service');
           await serviceRegistry.loadServices(); // Reload to get latest DB state
           
           // Upsert 'Design Engine' and 'AI Generator' if missing
           const paramsToSync = ['design-engine', 'ai-doc-generator'];
           const synced: string[] = [];

           for(const slug of paramsToSync) {
               const manifest = serviceRegistry.getManifest(slug);
               if(manifest) {
                   await prisma.service.upsert({
                       where: { slug: manifest.slug },
                       update: {
                           // Only update core metadata, leave config/webhooks for Admin UI to manage
                           name: manifest.name,
                           description: manifest.description,
                       },
                       create: {
                           slug: manifest.slug,
                           name: manifest.name,
                           description: manifest.description,
                           isActive: true,
                           config: {
                               paths: manifest.endpoints?.map(e => ({ path: e.path, billable: e.billable })),
                               webhooks: {}
                           }
                       }
                   });
                   synced.push(slug);
               }
           }

           res.redirect('/admin/services');
      } catch (error) {
          console.error('Error syncing services:', error);
          res.status(500).send('Error syncing services');
      }
  }

  /**
   * Create Feature
   */
  static async createFeature(req: Request, res: Response) {
      try {
          // Destructure but handle checkbox for isActive
          const { key, name, description, category, isActive } = req.body;
          
          await prisma.feature.create({
              data: {
                  key, 
                  name,
                  description,
                  category,
                  isActive: isActive === 'on'
              }
          });
          res.redirect('/admin/features');
      } catch (error) {
          console.error('Error creating feature:', error);
          res.status(500).send('Error creating feature');
      }
  }

  /**
   * Edit Feature Form
   */
  static async editFeature(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const feature = await prisma.feature.findUnique({ where: { id } });
          if (!feature) return res.status(404).send('Feature not found');

          res.render('admin/features/edit', {
              user: res.locals.user,
              feature
          });
      } catch (error) {
          console.error('Error loading feature:', error);
          res.status(500).send('Error loading feature');
      }
  }

  /**
   * Update Feature
   */
  static async updateFeature(req: Request, res: Response) {
      try {
          const { id } = req.params;
          const { key, name, description, category, isActive } = req.body;

          await prisma.feature.update({
              where: { id },
              data: {
                  key,
                  name,
                  description,
                  category,
                  isActive: isActive === 'on'
              }
          });
          res.redirect('/admin/features');
      } catch (error) {
           console.error('Error updating feature:', error);
           res.status(500).send('Failed to update feature');
      }
  }

  /**
   * Toggle Feature Status (AJAX)
   */
  static async toggleFeature(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const feature = await prisma.feature.findUnique({ where: { id } });
            if (feature) {
                await prisma.feature.update({
                    where: { id },
                    data: { isActive: !feature.isActive }
                });
            }
            res.json({ success: true });
        } catch (error) {
             res.status(500).json({ error: 'Failed to toggle' });
        }
    }

  /**
   * Delete Feature
   */
  static async deleteFeature(req: Request, res: Response) {
       try {
            const { id } = req.params;
             // Check if used in plans first? Constraint will handle it usually, but let's be safe.
             // On Delete Cascade might be set, if not we catch error.
             await prisma.feature.delete({ where: { id } });
             res.redirect('/admin/features');
       } catch (error) {
           console.error('Error deleting feature:', error);
           res.status(500).send('Cannot delete feature (likely in use)');
       }
  }



   static async listBilling(req: Request, res: Response) {
       try {
           const period = (req.query.period as string) || '30d';
           const { startDate } = AdminController.getPeriodDates(period);

           // 1. Fetch Invoices for Charts (Filtered by Period)
           // We fetch ALL paid invoices in period for accurate trend calculation
           const invoices = await prisma.invoice.findMany({
               where: {
                   status: 'paid',
                   createdAt: { gte: startDate }
               },
               include: {
                   user: { select: { name: true, email: true } },
                   subscription: { include: { plan: true } },
                   paymentMethod: true
               },
               orderBy: { createdAt: 'desc' }
           });

           // 2. Aggregate Data for Charts (Group by Day)
           const dailyStats = new Map<string, { date: string, total: number, plans: Record<string, number> }>();
           const planRevenue: Record<string, number> = {};
           const methodStats: Record<string, number> = {};
           const statusBreakdown: Record<string, number> = { 'paid': 0, 'pending': 0, 'failed': 0 };

           // Helper to init day entry
           const getDayKey = (date: Date) => date.toISOString().split('T')[0];

           // Process Invoices
           invoices.forEach(inv => {
               const dayKey = getDayKey(inv.createdAt);
               
               if (!dailyStats.has(dayKey)) {
                   dailyStats.set(dayKey, { date: dayKey, total: 0, plans: {} });
               }
               const dayEntry = dailyStats.get(dayKey)!;
               
               // Total Revenue Trend
               dayEntry.total += inv.amount;

               // Plan Revenue Breakdown
               const planName = inv.subscription?.plan?.name || 'Unknown';
               dayEntry.plans[planName] = (dayEntry.plans[planName] || 0) + inv.amount;
               
               // Summary by Plan
               planRevenue[planName] = (planRevenue[planName] || 0) + inv.amount;

               // Method Stats
               const method = inv.paymentMethod?.provider || 'stripe'; 
               methodStats[method] = (methodStats[method] || 0) + 1;
           });

           // 3. Status Breakdown (Need all statuses, not just paid)
           // We do a separate quick query for this to be accurate across all invoices in period
           const statusCounts = await prisma.invoice.groupBy({
                by: ['status'],
                _count: true,
                where: { createdAt: { gte: startDate } }
           });
           statusCounts.forEach(s => statusBreakdown[s.status] = s._count);


           // 4. Sort Trend by Date
           const revenueTrend = Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));

           // 5. Prepare Stacked Chart Data (Revenue by Plan Trend)
           const allPlanNames = Array.from(new Set(invoices.map(i => i.subscription?.plan?.name || 'Unknown')));
           
           const revenueByPlanTrend = {
               dates: revenueTrend.map(d => d.date),
               datasets: allPlanNames.map(plan => ({
                   label: plan,
                   data: revenueTrend.map(day => day.plans[plan] || 0)
               }))
           };

           // 6. Aggregates
           const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
           const totalInvoices = Object.values(statusBreakdown).reduce((a, b) => a + b, 0); 
           const avgInvoice = invoices.length > 0 ? totalRevenue / invoices.length : 0;

           // 7. Recent Invoices List (Re-fetch or slice? Slice is fine since we fetched details)
           // Actually, we fetched 'paid' invoices primarily. 
           // Usually 'Recent Invoices' table shows mixed statuses. 
           // Let's do a separate small query for the table to ensure we see 'failed'/'pending' invoices too.
           const recentInvoices = await prisma.invoice.findMany({
               where: { createdAt: { gte: startDate } },
               take: 50,
               orderBy: { createdAt: 'desc' },
               include: { 
                   user: { select: { name: true, email: true } },
                   paymentMethod: true 
               }
           });


           res.render('admin/billing/index', {
               user: res.locals.user,
               invoices: recentInvoices,
               stats: {
                   totalRevenue,
                   totalInvoices,
                   avgInvoice,
                   revenueTrend,
                   revenueByPlanTrend, // NEW: Stacked trend data
                   planRevenue,
                   methodStats,
                   statusBreakdown: Object.entries(statusBreakdown).map(([k, v]) => ({ status: k, _count: v }))
               },
               currentPeriod: period,
               title: 'Billing Analytics'
           });
       } catch (error) {
           console.error('Error loading billing:', error);
           res.status(500).send('Error loading billing');
       }
   }

   /**
    * Subscriptions - System-wide subscription management
    */
   static async listSubscriptions(req: Request, res: Response) {
       try {
           const period = (req.query.period as string) || '30d';
           // Note: Subscriptions list usually shows ALL valid subs, 
           // but charts might want to reflect the period. 
           // For now, we fetch all to maintain management capability, 
           // but we can pass the period for the UI to use if needed.
           
           const subscriptions = await prisma.subscription.findMany({
               take: 100,
               orderBy: { createdAt: 'desc' },
               include: {
                   user: { select: { name: true, email: true } },
                   plan: true
               }
           });

           const statusBreakdown = await prisma.subscription.groupBy({
               by: ['status'],
               _count: true
           });

           res.render('admin/subscriptions/index', {
               user: res.locals.user,
               subscriptions,
               statusBreakdown,
               currentPeriod: period,
               title: 'Subscription Management'
           });
       } catch (error) {
           console.error('Error loading subscriptions:', error);
           res.status(500).send('Error loading subscriptions');
       }
   }

   /**
    * Sync Invoices from Stripe manually
    */
   static async syncInvoices(req: Request, res: Response) {
       try {
           const { BillingService } = await import('../../services/billing.service');
           const billingService = new BillingService();
           const result = await billingService.syncInvoicesFromStripe();
           
           // If called via AJAX/Fetch, return JSON
           if (req.xhr || req.headers.accept?.indexOf('json') !== undefined && req.headers.accept.indexOf('json') > -1) {
               return res.json(result);
           }

           // Otherwise redirect back
           console.log('Sync Result:', result);
           res.redirect('/admin/subscriptions');
       } catch (error) {
           console.error('Error syncing invoices:', error);
           res.status(500).send('Error syncing invoices');
       }
   }

   /**
    * Usage Analytics - System-wide usage and performance metrics
    */
   static async listAnalytics(req: Request, res: Response) {
    try {
        const period = (req.query.period as string) || '30d';
        const { startDate } = AdminController.getPeriodDates(period);

        // Fetch raw usage logs for trend calculation
        const usageLogs = await prisma.usageLog.findMany({
            where: { createdAt: { gte: startDate } },
            select: { createdAt: true, status: true, resourceType: true, duration: true }
        });

        // 1. Usage by Service (Top 10)
        const serviceStats: Record<string, number> = {};
        usageLogs.forEach(log => {
            const key = log.resourceType || 'unknown';
            serviceStats[key] = (serviceStats[key] || 0) + 1;
        });
        const usageByService = Object.entries(serviceStats)
            .map(([resourceType, _count]) => ({ resourceType, _count }))
            .sort((a, b) => b._count - a._count)
            .slice(0, 10);

        // 2. Status Breakdown
        const statusStats: Record<string, number> = {};
        usageLogs.forEach(log => {
            const key = log.status || 'unknown';
            statusStats[key] = (statusStats[key] || 0) + 1;
        });

        // 3. Daily Usage Trend
        const dailyUsage = new Map<string, { total: number, errors: number }>();
        usageLogs.forEach(log => {
            const day = log.createdAt.toISOString().split('T')[0];
            if (!dailyUsage.has(day)) dailyUsage.set(day, { total: 0, errors: 0 });
            const entry = dailyUsage.get(day)!;
            entry.total++;
            if (log.status === 'error') entry.errors++;
        });
        const usageTrend = Array.from(dailyUsage.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // 4. Average Response Time (if duration available)
        const durations = usageLogs.filter(l => l.duration).map(l => l.duration!);
        const avgDuration = durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) 
            : 0;

        const totalRequests = usageLogs.length;
        const errorCount = statusStats['error'] || 0;

        res.render('admin/analytics/index', {
            user: res.locals.user,
            usageByService,
            statusStats,
            usageTrend,
            totalRequests,
            errorCount,
            avgDuration,
            errorRate: totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(2) : '0',
            currentPeriod: period,
            title: 'Usage Analytics'
        });
    } catch (error) {
        console.error('Error loading analytics:', error);
        res.status(500).send('Error loading analytics');
    }
}
  static async syncPrices(req: Request, res: Response) {
      try {
          const { BillingService } = await import('../../services/billing.service');
          const billingService = new BillingService();
          
          const result = await billingService.syncPlansFromStripe();
          
          if (result.count === 0) {
             (req as any).flash('info', 'No prices found in Stripe.');
          } else {
             (req as any).flash('success', `Synced ${result.updatedCount} plans and created ${result.createdCount} new plans from Stripe.`);
          }
          
          res.redirect('/admin/plans');
      } catch (error: any) {
          console.error('Error syncing prices:', error);
          (req as any).flash('error', `Failed to sync prices: ${error.message}`);
          res.redirect('/admin/plans');
      }
  }
}

