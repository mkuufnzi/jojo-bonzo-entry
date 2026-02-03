import { Request, Response, NextFunction } from 'express';
import { businessService } from '../services/business.service';
import { integrationService } from '../services/integration.service';
import { ProviderRegistry } from '../services/integrations/providers';
import { onboardingService } from '../services/onboarding.service';
import { AppService } from '../services/app.service';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

const appService = new AppService();

export class BusinessController {
  
  /**
   * GET /onboarding/wizard - Render the multi-step onboarding wizard
   */
  static async showWizard(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId!;

      // Get current step from query on check previous completion
      const business = await businessService.getBusinessByUserId(userId);

      let step = parseInt(req.query.step as string) || 1;
      
      // Redirect logic if step not allowed
      if (!business && step > 1) {
          return res.redirect('/onboarding/wizard?step=1');
      }

      // Redirect to dashboard if onboarding is already completed
      if (business?.onboardingStatus === 'COMPLETED' && !req.query.step) {
          return res.redirect('/dashboard/transactional');
      }

      // Max step 4
      if (step > 4) step = 4;

      const mode = req.query.mode as string;
      const provider = req.query.provider as string;
      let importStats: any = null;

      if (business) {
          try {
              // Always fetch connection stats to show transparency
              const integrations = await integrationService.listIntegrations(userId);
              const connectedProvider = integrations.find(i => i.status === 'active' || i.status === 'connected')?.provider;
              
              const isNewlyConnected = req.query.connected === connectedProvider;

              if (connectedProvider) {
                  const contactCount = await prisma.contact.count({ where: { businessId: business.id } });
                  const productCount = await prisma.product.count({ where: { businessId: business.id } });
                  importStats = { 
                      contactCount, 
                      productCount, 
                      provider: connectedProvider,
                      isNewlyConnected: isNewlyConnected || !!req.query.connected
                  };
              }
          } catch (e) {
              console.error('Failed to fetch import stats', e);
          }
      }

      res.render('onboarding/wizard', { 
        step,
        business,
        user: res.locals.user,
        title: 'Business Onboarding',
        activeService: 'onboarding',
        importStats,
        nonce: res.locals.nonce
      });
    } catch (error) {
      console.error('[BusinessController] showWizard Error:', error);
      next(error);
    }
  }

  /**
   * POST /api/business/profile (Step 1)
   */
  static async saveProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId!;
      const { name, organization, sector, industry, taxId, address, city, state, zip, country, website, niche, slogan, about } = req.body;

      // Handle both Alpine model names and HTML input names just in case
      const finalName = name || organization;
      const finalSector = sector || industry;

      const traceId = (req as any).traceId || 'unknown';

      logger.info({ 
          traceId, 
          body: req.body, 
          userId,
          finalName,
          finalSector
      }, '[BusinessController] saveProfile Processed Data');

      if (!finalName || !finalSector) {
          logger.warn({ body: req.body, finalName, finalSector }, '[BusinessController] saveProfile 400: Missing name or sector');
          return res.status(400).json({ 
              success: false, 
              error: `Required field missing: ${!finalName ? 'Name' : 'Sector'}. Please fill all required fields (*) and try again.` 
          });
      }

      const existingBusiness = await businessService.getBusinessByUserId(userId);

      // Prepare Metadata for V2 fields
      const metadataUpdates = { niche, slogan, about };

      let business;
      if (existingBusiness) {
        const currentMeta = (existingBusiness.metadata as any) || {};
        business = await businessService.updateBusiness(existingBusiness.id, {
            name, sector, taxId, address, city, state, zip, country, website,
            onboardingStatus: 'IN_PROGRESS',
            currentOnboardingStep: 2,
            metadata: { ...currentMeta, ...metadataUpdates }
        });
      } else {
        business = await businessService.createBusiness(userId, {
            name, sector, taxId, address, city, state, zip, country, website,
            onboardingStatus: 'IN_PROGRESS',
            currentOnboardingStep: 2,
            metadata: metadataUpdates
        });
      }

      // Sync with N8N (Step 1: Profile)
      try {
           const { designEngineService } = await import('../services/design-engine.service'); 
           await designEngineService.syncBusinessProfile(userId);
           console.log(`[BusinessController] Synced Profile for ${userId}`);
      } catch (e) {
           console.error('[BusinessController] Failed to sync profile:', e);
      }

      res.json({ success: true, businessId: business.id });
    } catch (error: any) {
      console.error('[BusinessController] saveProfile Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
  }

  /**
   * POST /api/step - Persist current onboarding step and track skips
   */
  static async trackStep(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId!;
      const { step, isSkipped } = req.body;

      const business = await businessService.getBusinessByUserId(userId);
      if (!business) return res.status(404).json({ success: false, error: 'Business not found' });

      // [ENTERPRISE] Ensure all services are linked to the user's default app
      try {
        await appService.ensureAllServicesLinked(userId);
      } catch (e) {
        logger.warn({ userId, err: e }, '[BusinessController] Failed lazy app-service linkage during trackStep');
      }

      const currentMetadata = (business.metadata as any) || {};
      const skippedSteps = currentMetadata.skippedSteps || [];

      if (isSkipped && !skippedSteps.includes(step)) {
        skippedSteps.push(step);
      } else if (!isSkipped) {
        const index = skippedSteps.indexOf(step);
        if (index > -1) skippedSteps.splice(index, 1);
      }

      await prisma.business.update({
        where: { id: business.id },
        data: {
          currentOnboardingStep: step,
          metadata: {
            ...currentMetadata,
            skippedSteps
          }
        }
      });

      logger.info({ userId, step, isSkipped }, '🚀 [Onboarding] Step Tracked');
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ userId: req.user?.id || req.session.userId, err: error }, '[BusinessController] trackStep Error');
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

    static async listIntegrations(req: Request, res: Response, next: NextFunction) {
        res.json({ 
            available: ['quickbooks', 'xero', 'zoho'],
            connected: await integrationService.listIntegrations(req.user?.id || req.session.userId!)
        });
    }

   /**
    * POST /api/business/branding (Step 3)
    * Accepts multipart/form-data with optional logo file upload
    */
   /**
    * POST /api/business/branding (Step 3)
    * Accepts multipart/form-data with optional logo file upload
    */
  static async saveBrandConfig(req: Request, res: Response, next: NextFunction) {
   try {
       const userId = req.user?.id || req.session.userId!;

       const business = await businessService.getBusinessByUserId(userId);
       if (!business) return res.status(400).json({ success: false, error: 'Business not found' });

       // Parse FormData fields (multer populates req.body for text fields)
       const persona = req.body.persona || '';
       const toneAdjectives = JSON.parse(req.body.toneAdjectives || '[]');
       const aiRules = req.body.aiRules || '';
       const emailSignature = req.body.emailSignature || '';
       const colors = JSON.parse(req.body.colors || '{}');
       const fonts = JSON.parse(req.body.fonts || '{}');

       // Construct structured profile data
       const voiceProfile = { persona, toneAdjectives, aiRules, emailSignature };
       const brandColors = colors;
       const fontSettings = { headerFontFamily: fonts.heading, bodyFontFamily: fonts.body };

       // Handle logo upload (if provided)
       let logoUrl: string | undefined;
       if (req.file) {
           const fs = await import('fs/promises');
           const path = await import('path');
           const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
           await fs.mkdir(uploadDir, { recursive: true });
           
           const filename = `${business.id}-${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
           const filepath = path.join(uploadDir, filename);
           await fs.writeFile(filepath, req.file.buffer);
           logoUrl = `/uploads/logos/${filename}`;
       }

       // Upsert default branding profile
       const profile = await prisma.brandingProfile.findFirst({
           where: { businessId: business.id, isDefault: true }
       });

       const updateData: any = {
           brandColors,
           fontSettings,
           voiceProfile
       };
       if (logoUrl) updateData.logoUrl = logoUrl;

       // Correct update for onboarding step (it's on the Business model)
       await prisma.business.update({
           where: { id: business.id },
           data: { currentOnboardingStep: 4 }
       });

       if (profile) {
           await prisma.brandingProfile.update({
               where: { id: profile.id },
               data: updateData
           });
       } else {
           await prisma.brandingProfile.create({
               data: {
                   businessId: business.id,
                   name: 'Default Brand',
                   isDefault: true,
                   logoUrl,
                   brandColors,
                   fontSettings,
                   voiceProfile
               }
           });
       }

       // Sync with N8N
       try {
           const { designEngineService } = await import('../services/design-engine.service'); 
           await designEngineService.syncBrandingProfile(userId);
       } catch (e) {
            console.error('[BusinessController] Failed to sync branding:', e);
       }

       res.json({ success: true });
   } catch (error: any) {
       console.error('[BusinessController] saveBrandConfig Error:', error);
       res.status(500).json({ success: false, error: 'Internal Server Error' });
   }
  }

     /**
   * POST /api/business/documents (Step 4)
   */
  static async saveDocumentConfig(req: Request, res: Response, next: NextFunction) {
      try {
          const userId = req.user?.id || req.session.userId!;
          const { documentTypes } = req.body; // ['invoice', 'receipt']

          const business = await businessService.getBusinessByUserId(userId);
          if (!business) return res.status(400).json({ success: false, error: 'Business not found' });

          // Update metadata
          const currentMetadata = (business.metadata as any) || {};
          
          await prisma.business.update({
               where: { id: business.id },
               data: {
                   metadata: {
                       ...currentMetadata,
                       documentTypes
                   },
                   onboardingStatus: 'COMPLETED'
               }
           });

          // Mark onboarding completed on profile
          await prisma.userProfile.update({
              where: { userId },
              data: { onboardingCompleted: true }
          });

           // Sync with N8N (Step 4: Completion)
            try {
                const { designEngineService } = await import('../services/design-engine.service'); 
                await designEngineService.syncOnboardingComplete(userId); // Fixed to use Completion event
                console.log(`[BusinessController] Synced Documents/Completion for ${userId}`);
            } catch (e) {
                 console.error('[BusinessController] Failed to sync documents:', e);
            }

          res.json({ success: true });
      } catch (error) {
          next(error);
      }
  }

  /**
   * GET /api/business/oauth/:provider
   * Initiates OAuth flow
   */
    static async startOAuth(req: Request, res: Response, next: NextFunction) {
        const { provider } = req.params;
        const userId = req.user?.id || req.session.userId!;
        
        try {
            const business = await businessService.getBusinessByUserId(userId);
            if (!business) {
                console.log('[OAuth] Blocked: No business account check.');
                return res.redirect('/onboarding/wizard?step=1&error=business_required');
            }

            const state = Buffer.from(JSON.stringify({ userId, businessId: business.id, provider, nonce: Date.now() })).toString('base64');
            const providerInstance = ProviderRegistry.createInstance(provider);
            let envPrefix = provider.toUpperCase();
            if (provider === 'quickbooks') {
                envPrefix = 'QB';
            }
            const redirectUri = process.env[`${envPrefix}_REDIRECT_URI`] || 
                                `${process.env.APP_URL}/onboarding/api/business/oauth/callback/${provider}`;

            const authUrl = providerInstance.getAuthUrl(state, redirectUri);
            
            console.log(`[OAuth] Redirecting to ${provider}:`, authUrl);
            res.redirect(authUrl);

        } catch (error: any) {
            console.error(`[BusinessController] OAuth Start Failed for ${provider}:`, error);
            res.status(500).send(`Failed to start OAuth for ${provider}: ${error.message}`);
        }
    }

  /**
   * GET /api/business/oauth/callback/:provider
   */
    static async handleOAuthCallback(req: Request, res: Response, next: NextFunction) {
        const { provider } = req.params;
        const { code, state } = req.query;
        
        // Standardization: quickbooks is the standard. No mapping needed.
        const dbProvider = provider;

        try {
            if (!state || !code) return res.status(400).send('Missing state or code');

            const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
            const userId = stateData.userId;

            const providerInstance = ProviderRegistry.createInstance(provider);
            let envPrefix = provider.toUpperCase();
            // Map quickbooks to QB env vars
            if (provider === 'quickbooks') {
                envPrefix = 'QB';
            }

            const redirectUri = process.env[`${envPrefix}_REDIRECT_URI`] || 
                                `${process.env.APP_URL}/onboarding/api/business/oauth/callback/${provider}`;

            const { realmId } = req.query; // QBO specific
            const authResult = await providerInstance.exchangeCode(code as string, redirectUri, { realmId });
            
            const expiresAt = authResult.expiresIn ? new Date(Date.now() + (authResult.expiresIn * 1000)) : undefined;

            await integrationService.connectProvider(
                userId,
                provider,
                authResult.metadata,
                authResult.accessToken,
                authResult.refreshToken,
                expiresAt
            );

            console.log(`[OAuth] Successfully connected ${provider} for ${userId}`);
            
            // Sync with N8N (Step 2: Connection)
            try {
                const integrations = await integrationService.listIntegrations(userId);
                // Lookup using dbProvider
                const integration = integrations.find(i => i.provider === dbProvider && i.status === 'connected');
                console.log(`[BusinessController] OAuth Success for ${provider}. Integration found:`, integration?.id || 'NO');
                
                if (integration) {
                    const { designEngineService } = await import('../services/design-engine.service');
                    await designEngineService.syncIntegrationConnection(userId, integration.id, dbProvider);
                    console.log(`[BusinessController] Synced Connection for ${userId}`);
                } else {
                    console.warn(`[BusinessController] Could not find 'connected' integration for ${provider} after OAuth.`);
                }
            } catch (e) {
                console.error('[BusinessController] Failed to sync connection:', e);
            }

            res.redirect('/onboarding/wizard?step=2&connected=' + dbProvider);

        } catch (error: any) {
            console.error(`[BusinessController] OAuth Callback Failed for ${provider}:`, error);
            
            // Redirect to wizard with error context instead of raw text
            const errorType = error.message.includes('already connected') ? 'duplicate_connection' : 'oauth_failed';
            const errorContext = encodeURIComponent(error.message);
            res.redirect(`/onboarding/wizard?step=2&error=${errorType}&context=${errorContext}`);
        }
    }

    static async submitCompleteOnboarding(req: Request, res: Response, next: NextFunction) {
        console.log('🚀 [BusinessController] submitCompleteOnboarding called', { userId: req.user?.id || req.session.userId, body: req.body });
        try {
            const userId = req.user?.id || req.session.userId!;
            const config = req.body.config || {};
            const documentTypes = config.documents || [];

            const business = await businessService.getBusinessByUserId(userId);
            if (!business) return res.status(400).json({ success: false, error: 'Business not found' });

            // 1. Update Business Metadata and Status
            const currentMetadata = (business.metadata as any) || {};
            const skippedSteps = currentMetadata.skippedSteps || [];
            const needsRemediation = skippedSteps.includes(2) || skippedSteps.includes('integrations');

            await prisma.business.update({
                where: { id: business.id },
                data: { 
                    onboardingStatus: 'COMPLETED',
                    metadata: {
                        ...currentMetadata,
                        documentTypes,
                        needsRemediation
                    }
                }
            });

            // 2. Mark Profile as completed (Defensive Upsert for Social Auth users)
            await prisma.userProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    firstName: req.user?.name?.split(' ')[0] || '',
                    lastName: req.user?.name?.split(' ')[1] || '',
                    onboardingCompleted: true,
                    accountType: 'BUSINESS'
                },
                update: { onboardingCompleted: true }
            });

            // 3. Sync with design engine (Webhook)
            try {
                const { designEngineService } = await import('../services/design-engine.service');
                await designEngineService.syncOnboardingComplete(userId);
            } catch (e) {
                console.error('[BusinessController] Failed to sync completion:', e);
            }

            // 4. [NEW] Automate Default Workflow Creation
            try {
                // Find primary provider
                const integrations = await integrationService.listIntegrations(userId);
                const connected = integrations.filter(i => i.status === 'connected' || i.status === 'active');
                
                // Priority: quickbooks > xero > zoho
                let primaryProvider = connected.find(i => i.provider === 'quickbooks')?.provider;
                if (!primaryProvider) primaryProvider = connected.find(i => i.provider === 'xero')?.provider;
                if (!primaryProvider) primaryProvider = connected.find(i => i.provider === 'zoho')?.provider;

                if (primaryProvider) {
                    const { workflowService } = await import('../services/workflow.service');
                    await workflowService.ensureDefaultWorkflow(userId, business.id, primaryProvider);
                }
            } catch (e) {
                console.error('[BusinessController] Failed to auto-create workflow:', e);
                // Non-blocking error
            }

            res.json({ success: true });
        } catch (error: any) {
            console.error('[BusinessController] submitCompleteOnboarding Error:', error);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    }

    static async triggerDunningFollowup(req: Request, res: Response) {
        try {
            const userId = req.user?.id || req.session.userId!;
            const { invoiceId } = req.body;
            
            const business = await businessService.getBusinessByUserId(userId);
            if (!business) return res.status(400).json({ success: false, error: 'Business not found' });

            const { dunningService } = await import('../services/dunning.service');
            const result = await dunningService.triggerFollowup(userId, business.id, invoiceId);

            res.json(result);
        } catch (error: any) {
            console.error('[BusinessController] triggerDunningFollowup Error:', error);
            res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
        }
    }
}
