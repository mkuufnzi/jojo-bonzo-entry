import prisma from '../lib/prisma';

export class SeederService {
    static async seed() {
        console.log('🌱 Starting Database Seed...');

        const plans = [
            {
                name: 'Free',
                price: 0,
                requestLimit: 0,
                pdfQuota: 5,
                aiQuota: 3,
                currency: 'GBP',
                features: JSON.stringify(['Dashboard Access', 'View Documentation', 'Community Support']),
            },
            {
                name: 'Teaser',
                price: 0.10,
                requestLimit: 30,
                pdfQuota: 25,
                aiQuota: 5,
                currency: 'GBP',
                features: JSON.stringify(['25 PDF Conversions', '5 AI Documents', 'AI Content Generation', 'Community Support']),
            },
            {
                name: 'Starter',
                price: 12.00,
                requestLimit: 550,
                pdfQuota: 500,
                aiQuota: 50,
                currency: 'GBP',
                features: JSON.stringify(['500 PDF Conversions', '50 AI Documents', 'AI Content Generation', 'Basic Support', 'API Access']),
            },
            {
                name: 'Pro',
                price: 39.00,
                requestLimit: 5500,
                pdfQuota: 5000,
                aiQuota: 500,
                currency: 'GBP',
                features: JSON.stringify(['5,000 PDF Conversions', '500 AI Documents', 'AI Content Generation', 'Priority Support', 'Analytics']),
            },
            {
                name: 'Enterprise',
                price: 149.00,
                requestLimit: 50000,
                pdfQuota: -1,  // Unlimited
                aiQuota: 5000,
                currency: 'GBP',
                features: JSON.stringify(['Unlimited PDF Conversions', '5,000 AI Documents', 'AI Content Generation', 'Dedicated Support', 'Custom Integrations', 'SLA']),
            },
            {
                name: 'BrandWithJojo - Branded Document Creation and Management Workflows',
                price: 8.99,
                requestLimit: 1000,
                pdfQuota: 500,
                aiQuota: 500,
                currency: 'GBP',
                features: JSON.stringify(['AI Content Generation', 'Branded Workflows', 'Priority Support']),
            },
        ];

        for (const plan of plans) {
            await prisma.plan.upsert({
                where: { name: plan.name },
                update: {
                    // Price is managed by Stripe sync - don't overwrite here
                    requestLimit: plan.requestLimit,
                    pdfQuota: plan.pdfQuota,
                    aiQuota: plan.aiQuota,
                    currency: plan.currency,
                    features: plan.features
                },
                create: plan, // Initial seed with default price
            });
        }

        console.log('✅ Plans seeded.');
        
        // --- SEED FEATURES ---
        const features = [
            {
                key: 'ai_generation',
                name: 'AI Document Generation',
                description: 'Access to AI-powered document generation tools.',
                category: 'advanced'
            },
            {
                key: 'pdf_conversion',
                name: 'PDF Conversion',
                description: 'Basic HTML to PDF and file format conversions.',
                category: 'core'
            },
            {
                key: 'api_access',
                name: 'API Access',
                description: 'Full access to developer API and API Keys.',
                category: 'pro'
            },
            {
                key: 'unlimited_pdf',
                name: 'Unlimited PDF Conversions',
                description: 'Remove daily/monthly limits on PDF conversions.',
                category: 'pro'
            }
        ];

        for (const feature of features) {
            await prisma.feature.upsert({
                where: { key: feature.key },
                update: {
                    name: feature.name,
                    description: feature.description,
                    category: feature.category
                },
                create: feature
            });
        }
        console.log('✅ Features seeded.');

        // --- MAP FEATURES TO PLANS ---
        const planFeatureMap: { [key: string]: string[] } = {
            'Free': [],
            'Teaser': ['ai_generation', 'pdf_conversion'],
            'Starter': ['ai_generation', 'pdf_conversion', 'api_access'],
            'Pro': ['ai_generation', 'pdf_conversion', 'api_access'],
            'Enterprise': ['ai_generation', 'pdf_conversion', 'api_access', 'unlimited_pdf']
        };

        for (const [planName, featureKeys] of Object.entries(planFeatureMap)) {
            const plan = await prisma.plan.findUnique({ where: { name: planName } });
            if (!plan) continue;

            for (const featureKey of featureKeys) {
                const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
                if (!feature) continue;

                await prisma.planFeature.upsert({
                    where: {
                        planId_featureId: {
                            planId: plan.id,
                            featureId: feature.id
                        }
                    },
                    update: { isEnabled: true },
                    create: {
                        planId: plan.id,
                        featureId: feature.id,
                        isEnabled: true
                    }
                });
            }
        }
        console.log('✅ Plan Features linked.');

        // --- SEED ADMIN USERS ---
        const admins = [
            { email: 'bwj.floovioo.test@gmail.com', name: 'SaaS Super Admin', role: 'ROOT' },
            { email: 'ceo@floovioo.com', name: 'Chief Executive Officer', role: 'CEO' },
            { email: 'coo@floovioo.com', name: 'Chief Operating Officer', role: 'COO' },
            { email: 'devops@floovioo.com', name: 'DevOps Lead', role: 'DEVOPS' },
            { email: 'marketing@floovioo.com', name: 'Marketing Lead', role: 'MARKETING' },
            { email: 'support@floovioo.com', name: 'Customer Support', role: 'SUPPORT' }
        ];

        const { hash } = await import('bcryptjs');
        const { config } = await import('../config/env');
        
        // Determine Admin Password
        let adminPassword = config.INITIAL_ADMIN_PASSWORD;
        let isRandomPassword = false;

        if (!adminPassword) {
            // Generate robust random password if not provided
            const crypto = require('crypto');
            adminPassword = crypto.randomBytes(16).toString('hex');
            isRandomPassword = true;
        }

        const hashedPassword = await hash(adminPassword!, 10);

        for (const admin of admins) {
            // Check if user exists first to strict avoid overwriting passwords of existing admins
            const existingAdmin = await prisma.user.findUnique({ where: { email: admin.email } });
            
            if (existingAdmin) {
                // Determine if we need to promote them or just ensure they exist
                if (!existingAdmin.isAdmin || existingAdmin.role !== admin.role) {
                     await prisma.user.update({
                        where: { email: admin.email },
                        data: {
                            role: admin.role,
                            isAdmin: true,
                            isActive: true
                        }
                    });
                    console.log(`   Admin updated: ${admin.email} (Role: ${admin.role})`);
                }
                // Do NOT touch the password
            } else {
                // Create new admin
                await prisma.user.create({
                    data: {
                        email: admin.email,
                        name: admin.name,
                        password: hashedPassword,
                        role: admin.role,
                        isAdmin: true,
                        isActive: true,
                        emailVerified: new Date()
                    }
                });
                console.log(`   ✅ Admin created: ${admin.email}`);
            }
        }
        
        if (isRandomPassword) {
            console.log('\n⚠️  [SECURITY NOTICE] -----------------------------------------------------------');
            console.log('   No INITIAL_ADMIN_PASSWORD found in env.');
            console.log(`   Generated Random Password for new Admins: ${adminPassword}`);
            console.log('   Please change this immediately after login!');
            console.log('--------------------------------------------------------------------------------\n');
        } else {
             console.log('✅ Admin passwords set from INITIAL_ADMIN_PASSWORD env var (only for new accounts).');
        }

        console.log('✅ Admin Roles verification complete.');

        // Seed Guest User and App
        const guestEmail = 'guest@floovioo.com';
        let guestUser = await prisma.user.findUnique({ where: { email: guestEmail } });

        if (!guestUser) {
            guestUser = await prisma.user.create({
                data: {
                    email: guestEmail,
                    name: 'Guest User',
                    password: '', // No password login
                    isActive: true,
                }
            });
            console.log('✅ Guest User created.');
        }

        // Ensure Guest has a Free subscription
        const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
        if (freePlan && guestUser) {
            const sub = await prisma.subscription.findUnique({ where: { userId: guestUser.id } });
            if (!sub) {
                await prisma.subscription.create({
                    data: {
                        userId: guestUser.id,
                        planId: freePlan.id,
                        status: 'active'
                    }
                });
                console.log('✅ Guest Subscription created.');
            }
        }

        // Ensure Guest App exists
        if (guestUser) {
            const guestAppName = 'Public Demo App';
            let guestApp = await prisma.app.findFirst({ where: { userId: guestUser.id, name: guestAppName } });

            if (!guestApp) {
                guestApp = await prisma.app.create({
                    data: {
                        name: guestAppName,
                        description: 'App used for public landing page demos',
                        userId: guestUser.id,
                        apiKey: 'guest_pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
                        isActive: true
                    }
                });
                console.log(`✅ Guest App created.`);
            }
        }

        const services = [
            {
                name: 'Floovioo Transactional',
                slug: 'transactional-core',
                description: 'The core engine for the Transactional Branding product. Handles triggers from ERPs and dispatches to specific n8n workflows.',
                pricePerRequest: 0.00, // Usage tracked but billed via Plan level
                requiredFeatureKey: 'ai_generation', 
                config: {
                    webhooks: {
                        invoice_created: {
                            url: 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Invoice Branding Workflow'
                        },
                        receipt_created: {
                            url: process.env.N8N_WEBHOOK_TRANSACTIONAL_RECEIPT || '',
                            label: 'Receipt Branding Workflow'
                        },
                        periodic_report: {
                            url: process.env.N8N_WEBHOOK_TRANSACTIONAL_REPORT || '',
                            label: 'Periodic Report Generator'
                        },
                        onboarding_profile: {
                            url: 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Onboarding: Business Profile'
                        },
                        onboarding_integration: {
                            url: 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Onboarding: Integration Connected'
                        },
                        onboarding_branding: {
                            url: 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Onboarding: Brand Settings'
                        },
                        default: {
                            url: process.env.N8N_WEBHOOK_TRANSACTIONAL_DEFAULT || '',
                            label: 'Catch-All / Router'
                        }
                    }
                }
            },
            {
                name: 'Transactional Branding',
                slug: 'transactional-branding',
                description: 'Automatic branding and delivery of transactional documents (invoices, estimates, etc.) from connected ERPs.',
                pricePerRequest: 0.00, // Usage tracked at plan level
                requiredFeatureKey: 'ai_generation',
                config: {
                    webhooks: {
                        default: {
                            url: process.env.N8N_WEBHOOK_TRANSACTIONAL_DEFAULT || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Default Transactional Router'
                        },
                        data_sync: {
                            url: process.env.N8N_WEBHOOK_DATA_SYNC || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'ERP Data Sync'
                        },
                        apply_invoice: {
                            url: process.env.N8N_WEBHOOK_APPLY_INVOICE || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Apply Branding to Invoice'
                        },
                        apply_estimate: {
                            url: process.env.N8N_WEBHOOK_APPLY_ESTIMATE || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Apply Branding to Estimate'
                        },
                        ai_product_support: {
                            url: process.env.N8N_WEBHOOK_AI_PRODUCT_SUPPORT || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Generate AI Product Support'
                        },
                        ai_recommendations: {
                            url: process.env.N8N_WEBHOOK_AI_RECOMMENDATIONS || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Generate AI Recommended Products'
                        },
                        deliver_document: {
                            url: process.env.N8N_WEBHOOK_DELIVER_DOCUMENT || 'https://n8n.automation-for-smes.com/webhook/d8045423-38f0-48eb-97c9-89171fb9c080',
                            label: 'Deliver Compiled Document'
                        }
                    }
                }
            },
            {
                name: 'AI Document Generator',
                slug: 'ai-doc-generator',
                description: 'Generate GDPR notices, Employment Contracts, and Health & Safety policies instantly.',
                pricePerRequest: 0.05,
                requiredFeatureKey: 'ai_generation',
                config: {
                    supportedDocTypes: [
            'resume', 
            'cover_letter', 
            'invoice', 
            'proposal', 
            'contract', 
            'letter', 
            'receipt', 
            'report', 
            'memo', 
            'presentation',
            'gdpr-notice', 
            'employment-contract', 
            'risk-assessment', 
            'letterhead'
        ],
                    maxFiles: 3,
                    // Webhooks (n8n integration)
                    webhooks: {
                        generate: {
                            url: process.env.N8N_WEBHOOK_AI_GENERATE || '',
                            method: 'POST',
                            label: 'Generate Document',
                            description: 'Main AI document generation workflow'
                        },
                        analyze: {
                            url: process.env.N8N_WEBHOOK_AI_ANALYZE || '',
                            method: 'POST',
                            label: 'Analyze Context',
                            description: 'Pre-generation context analysis'
                        },
                        format: {
                            url: process.env.N8N_WEBHOOK_AI_FORMAT || '',
                            method: 'POST',
                            label: 'Format Document',
                            description: 'Phase 3: Final HTML formatting'
                        }
                    },
                    // API Endpoints & Paths
                    paths: [
                        { path: '/generate', billable: true },
                        { path: '/analyze', billable: false },
                        { path: '/convert', billable: true }
                    ],
                    endpoints: [
                        { path: '/services/ai-doc-generator', method: 'GET', description: 'Main Tool Page' },
                        { path: '/services/ai-doc-generator/analyze', method: 'POST', description: 'Analyze Request (HITL)', billable: false },
                        { path: '/services/ai-doc-generator/generate', method: 'POST', description: 'Generate Document', billable: true },
                        { path: '/services/ai-doc-generator/jobs/:jobId', method: 'GET', description: 'Poll Job Status' },
                        { path: '/services/ai-doc-generator/preview', method: 'POST', description: 'Preview PDF' },
                        { path: '/services/ai-doc-generator/convert', method: 'POST', description: 'Convert to PDF', billable: true }
                    ],

                    // Dependencies on other services
                    dependencies: [
                        { service: 'html-to-pdf', endpoint: '/convert', purpose: 'PDF conversion', required: false }
                    ]
                }
            },
            {
                name: 'HTML to PDF Converter',
                slug: 'html-to-pdf',
                description: 'Convert raw HTML or URLs to PDF.',
                pricePerRequest: 0.002,
                requiredFeatureKey: 'pdf_conversion',
                config: {
                    // Webhooks (n8n integration)
                    webhooks: {
                        convert: {
                            url: process.env.N8N_WEBHOOK_PDF_CONVERT || '',
                            method: 'POST',
                            label: 'Convert to PDF',
                            description: 'HTML to PDF conversion workflow'
                        }
                    },
                    // API Endpoints
                    endpoints: [
                        { path: '/api/pdf/convert', method: 'POST', billable: true, description: 'Convert HTML to PDF', requiresAuth: true },
                        { path: '/api/pdf/status/:id', method: 'GET', billable: false, description: 'Check job status', requiresAuth: true }
                    ],
                    // Paths for billing
                    paths: [
                        { path: '/convert', billable: true },
                        { path: '/status', billable: false }
                    ],
                    dependencies: []
                }
            },
            {
                name: 'HMRC VAT Invoice Generator', // Was docx-to-pdf
                slug: 'docx-to-pdf',
                description: 'Convert Word invoices into HMRC-compliant PDF format.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'GDPR SAR Compiler', // Was merge-pdf
                slug: 'merge-pdf',
                description: 'Combine multiple client record files into a single Subject Access Request bundle.',
                pricePerRequest: 0.02,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Bank Statement Extractor', // Was split-pdf
                slug: 'split-pdf',
                description: 'Extract specific pages from monthly bank statement PDFs for accounting.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Email Attachment Optimizer', // Was compress-pdf
                slug: 'compress-pdf',
                description: 'Compress large scan PDFs to meet email server size limits.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Right to Rent Proof Extractor', // Was pdf-to-image
                slug: 'pdf-to-image',
                description: 'Convert passport PDF pages to images for ID verification checks.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Receipt Digitizer', // Was image-to-pdf
                slug: 'image-to-pdf',
                description: 'Convert photos of receipts into professional PDF expense reports.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Contract Encryptor', // Was protect-pdf
                slug: 'protect-pdf',
                description: 'Password protect sensitive employee contracts and wage slips.',
                pricePerRequest: 0.01,
                requiredFeatureKey: 'pdf_conversion'
            },
            {
                name: 'Debt Collection AI',
                slug: 'floovioo_transactional_debt-collection',
                description: 'AI-powered dunning and payment recovery automation with risk scoring',
                pricePerRequest: 0.10,
                requiredFeatureKey: 'ai_generation',
                config: {
                    ml: { model: 'xgboost', features: ['payment_history', 'invoice_amount', 'days_overdue'], retrainInterval: '7d' },
                    prioritization: { minAmount: 100, riskThreshold: 0.7 },
                    webhooks: {
                        recovery_action: { 
                            label: 'Trigger Recovery Action',
                            description: 'Triggers the n8n workflow for sending recovery communications (email/sms)',
                            url: process.env.N8N_WEBHOOK_RECOVERY_EXECUTE || 'https://n8n.automation-for-smes.com/webhook/ce76d8c1-5242-49c7-a350-02f55b7c2db4', 
                            method: 'POST' 
                        },
                        data_sync: {
                            label: 'CRM Data Synchronization',
                            description: 'Pushes synchronized customer and invoice data to n8n CRM cache',
                            url: process.env.N8N_WEBHOOK_DATA_SYNC || 'https://n8n.automation-for-smes.com/webhook/ce76d8c1-5242-49c7-a350-02f55b7c2db4',
                            method: 'POST'
                        }
                    },
                    // Billable Paths: Only the recovery action dispatch is billable
                    paths: [
                        { path: '/recovery/action', billable: true },
                        { path: '/recovery/status', billable: false },
                        { path: '/recovery/sequences', billable: false },
                        { path: '/recovery/invoices', billable: false }
                    ],
                    // API Endpoints for Service Discovery
                    endpoints: [
                        { path: '/dashboard/recovery', method: 'GET', description: 'Recovery Dashboard', billable: false },
                        { path: '/dashboard/recovery/sequences', method: 'GET', description: 'List Dunning Sequences', billable: false },
                        { path: '/dashboard/recovery/sequences', method: 'POST', description: 'Create/Update Dunning Sequence', billable: false },
                        { path: '/dashboard/recovery/invoices', method: 'GET', description: 'List Tracked Invoices', billable: false },
                        { path: '/api/callbacks/recovery', method: 'POST', description: 'N8N Recovery Callback', billable: false }
                    ],
                    // External Service Dependencies
                    externalCalls: [
                        { domain: 'n8n.automation-for-smes.com', purpose: 'Recovery email orchestration & AI content generation' },
                        { domain: 'quickbooks.api.intuit.com', purpose: 'ERP invoice sync for overdue detection' }
                    ]
                }
            },
            {
                name: 'Legacy Doc Unlocker',
                slug: 'unlock-pdf',
                description: 'Remove lost passwords from old archived business documents.',
                pricePerRequest: 0.05, // Premium service
                requiredFeatureKey: 'pdf_conversion'
            }
        ];

        // Cleanup legacy/conflicting services
        await prisma.service.deleteMany({
            where: {
                slug: {
                    in: ['web-to-pdf', 'html-to-pdf-converter', 'n8n-echo-test'] 
                }
            }
        });

        // Pre-rename html-to-pdf to free up 'AI Document Generator' name
        // This is needed because ai-doc-generator comes first in the loop below
        // and if html-to-pdf still has the name 'AI Document Generator', it will crash.
        try {
            const existingClassic = await prisma.service.findUnique({ where: { slug: 'html-to-pdf' } });
            if (existingClassic && existingClassic.name === 'AI Document Generator') {
                console.log('Renaming html-to-pdf to avoid collision...');
                await prisma.service.update({
                    where: { slug: 'html-to-pdf' },
                    data: { name: 'HTML to PDF Converter' }
                });
            }
        } catch (e) {
            console.log('Pre-rename failed or not needed:', e);
        }

        for (const service of services) {
            try {
                // Determine if we can set requiredFeatureKey
                // Check existing service to preserve config
                const existingService = await prisma.service.findUnique({ where: { slug: service.slug } });
                
                let mergedConfig = (service as any).config || {};

                // 1. Get Code Manifest (Source of Truth for Endpoints/External)
                const { serviceRegistry } = await import('./service-registry.service');
                const manifest = serviceRegistry.getManifest(service.slug);

                if (existingService && existingService.config && typeof existingService.config === 'object') {
                    const currentConfig = existingService.config as any;
                    
                    // Smart Merge:
                    // 1. Start with Seeded Config
                    // 2. Overlay Existing Config (preserves user edits)
                    // 3. Re-assert System Fields (Endpoints, DocTypes, ExternalCalls) from Code Manifest
                    mergedConfig = {
                        ...currentConfig, // Start with existing
                        ...mergedConfig,  // Overlay seeded (Env/Code URLs win)
                        
                        // System Managed Fields (Source of Truth is Code/Manifest)
                        endpoints: manifest?.endpoints || mergedConfig.endpoints || [], // Manifest > Seed > Empty
                        externalCalls: manifest?.externalCalls || [], // New Field from Manifest
                        supportedDocTypes: mergedConfig.supportedDocTypes,
                        paths: manifest?.endpoints?.map((e: any) => ({ path: e.path.split('?')[0], billable: e.billable ?? true })) || mergedConfig.paths, // Derive paths from endpoints if manifest exists
                        dependencies: mergedConfig.dependencies, // Enforce Dependencies from Code

                        // Webhook merge order: DB fills in gaps, but Seeder/Env wins for keys it defines.
                        // This ensures process.env.N8N_WEBHOOK_* overrides are always authoritative.
                        webhooks: {
                            ...(currentConfig.webhooks || {}),  // DB: base layer (fills gaps)
                            ...(mergedConfig.webhooks || {})    // Seeder/Env: always wins (authoritative)
                        }
                    };
                } else if (manifest) {
                     // New Service with Manifest
                     mergedConfig.endpoints = manifest.endpoints || [];
                     mergedConfig.externalCalls = manifest.externalCalls || [];
                     if (manifest.endpoints) {
                        mergedConfig.paths = manifest.endpoints.map(e => ({ path: e.path.split('?')[0], billable: e.billable ?? true }));
                     }
                }

                // --- AUTO-DISCOVERY: Webhooks from Manifest ---
                if (manifest && manifest.actions) {
                    const webhooks = mergedConfig.webhooks || {};
                    let discoveryCount = 0;
                    
                    for (const action of manifest.actions) {
                        // If webhook config doesn't exist for this action key, create it
                        if (!webhooks[action.key]) {
                            // console.log(`   ✨ Auto-discovering webhook action: ${action.key} for ${service.slug}`);
                            webhooks[action.key] = {
                                url: '', // Empty by default, must be configured
                                method: action.method || 'POST',
                                label: action.label,
                                description: action.description
                            };
                            discoveryCount++;
                        }
                    }
                    mergedConfig.webhooks = webhooks;
                    if(discoveryCount > 0) console.log(`   ✨ Auto-discovered ${discoveryCount} webhook actions for ${service.slug}`);
                }
                // ----------------------------------------------

                const baseData: any = {
                    name: service.name,
                    description: service.description,
                    pricePerRequest: service.pricePerRequest,
                    executionType: (service as any).executionType || 'local',
                    endpointUrl: (service as any).endpointUrl || null,
                    config: mergedConfig
                };

                await (prisma.service as any).upsert({
                    where: { slug: service.slug },
                    update: {
                        ...baseData,
                        requiredFeatureKey: (service as any).requiredFeatureKey || null,
                    },
                    create: {
                        ...baseData,
                        slug: service.slug,
                        requiredFeatureKey: (service as any).requiredFeatureKey || null,
                    },
                });
            } catch (error: any) {
                console.error(`❌ Failed to seed service ${service.slug}:`, error?.message);
                // Continue to next service
            }
        }

        console.log('✅ Services seeded.');

        // Link Services to Guest App
        if (guestUser) {
            const guestAppName = 'Public Demo App';
            const guestApp = await prisma.app.findFirst({ where: { userId: guestUser.id, name: guestAppName } });

            if (guestApp) {
                const allServices = await prisma.service.findMany();
                for (const service of allServices) {
                    await prisma.appService.upsert({
                        where: {
                            appId_serviceId: {
                                appId: guestApp.id,
                                serviceId: service.id
                            }
                        },
                        update: { isEnabled: true },
                        create: {
                            appId: guestApp.id,
                            serviceId: service.id,
                            isEnabled: true
                        }
                    });
                }
                console.log('✅ All services enabled for Guest App.');
            }
        }

        // --- SEED INTEGRATION CATALOG ---
        console.log('🌱 Seeding Integration Catalog...');

        // Cleanup legacy slugs
        await prisma.integrationDefinition.deleteMany({
            where: { slug: 'quickbooks-online' }
        });

        const integrations = [
            {
                name: 'Zoho CRM',
                slug: 'zoho-crm',
                description: 'Sync clients and invoices with Zoho CRM & Books.',
                category: 'CRM',
                isPopular: true,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/zoho-1.svg', // Placeholder/Public URL
                config: {
                    provider: 'zoho',
                    authUrl: 'https://accounts.zoho.com/oauth/v2/auth',
                    tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
                    scope: 'ZohoBooks.fullaccess.all',
                    responseType: 'code',
                    accessType: 'offline',
                    env: {
                        clientId: 'ZOHO_CLIENT_ID',
                        clientSecret: 'ZOHO_CLIENT_SECRET',
                        redirectUri: 'ZOHO_REDIRECT_URI'
                    }
                }
            },
            {
                name: 'QuickBooks Online',
                slug: 'quickbooks',
                description: 'Automated accounting sync for invoices and expenses.',
                category: 'Accounting',
                isPopular: true,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/quickbooks-1.svg',
                config: {
                    provider: 'quickbooks',
                    authUrl: 'https://appcenter.intuit.com/connect/oauth2',
                    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
                    scope: 'com.intuit.quickbooks.accounting',
                    env: {
                        clientId: 'QB_CLIENT_ID',
                        clientSecret: 'QB_CLIENT_SECRET',
                        redirectUri: 'QB_REDIRECT_URI'
                    }
                }
            },
            {
                name: 'Xero',
                slug: 'xero',
                description: 'Beautiful accounting software integration.',
                category: 'Accounting',
                isPopular: true,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/xero.svg',
                config: {
                     provider: 'xero',
                     authUrl: 'https://login.xero.com/identity/connect/authorize',
                     tokenUrl: 'https://identity.xero.com/connect/token',
                     scope: 'offline_access openid profile email accounting.transactions accounting.contacts accounting.settings',
                     env: {
                        clientId: 'XERO_CLIENT_ID',
                        clientSecret: 'XERO_CLIENT_SECRET',
                        redirectUri: 'XERO_REDIRECT_URI'
                     }
                }
            },
            {
                name: 'Salesforce',
                slug: 'salesforce',
                description: 'Enterprise CRM integration.',
                category: 'CRM',
                isPopular: false,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/salesforce-2.svg'
            },
            {
                name: 'HubSpot',
                slug: 'hubspot',
                description: 'Marketing and CRM automation.',
                category: 'CRM',
                isPopular: false,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/hubspot.svg'
            },
             {
                name: 'Sage',
                slug: 'sage',
                description: 'Accounting and payroll solutions.',
                category: 'Accounting',
                isPopular: false,
                logoUrl: 'https://cdn.worldvectorlogo.com/logos/sage-2.svg'
            }
        ];

        for (const integration of integrations) {
            await prisma.integrationDefinition.upsert({
                where: { slug: integration.slug },
                update: {
                    name: integration.name,
                    description: integration.description,
                    category: integration.category,
                    isPopular: integration.isPopular,
                    logoUrl: integration.logoUrl,
                    config: integration.config as any
                },
                create: {
                   ...integration,
                   config: integration.config as any,
                   status: 'active'
                }
            });
        }
        console.log('✅ Integration Catalog seeded.');

        console.log('🌱 Database Seed Completed.');
    }
}
