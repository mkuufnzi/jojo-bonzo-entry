import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import session from 'express-session';
import compression from 'compression';
import morgan from 'morgan';
import RedisStore from 'connect-redis';
import { config } from './config/env';
import { getRedisClient } from './lib/redis';
import pdfRoutes from './routes/pdf.routes';
import dashboardRoutes from './routes/dashboard.routes';
import authRoutes from './routes/auth.routes';
import appsRoutes from './routes/apps.routes';
import billingRoutes from './routes/billing.routes';
import subscriptionRoutes from './routes/subscription.routes';
import notificationRoutes from './routes/notification.routes';
import analyticsRoutes from './routes/analytics.routes';
import userRoutes from './routes/user.routes';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { apiKeyAuth } from './middleware/auth.middleware';
import { injectNotificationCount } from './middleware/notification.middleware';
import { injectServices } from './middleware/service.middleware';
import prisma from './lib/prisma';
import { checkOnboarding } from './middleware/check-onboarding.middleware';

import landingRoutes from './routes/landing.routes';

import integrationsRoutes from './routes/integrations.routes';
import brandingRoutes from './routes/branding.routes';
import workflowsRoutes from './routes/workflows.routes';

import adminRoutes from './routes/admin';
import passport from './config/passport';
import docRoutes from './routes/doc.routes';


const app = express();
const PORT = config.PORT;

// Initialize Sentry (Observability)
import { initSentry } from './config/sentry';
import { logger } from './lib/logger';
import { healthCheck } from './lib/redis';
import * as Sentry from '@sentry/node';

initSentry(app);

// Sentry Request Handler (Must be the first middleware)
// Note: In Sentry v8, many handlers are auto-instrumented or use new APIs.
// For legacy/explicit setup:
// app.use(Sentry.Handlers.requestHandler());
// app.use(Sentry.Handlers.tracingHandler());
// Keeping it simple for now as v8 auto-instruments http.

// Trust Proxy for sessions/cookies behind Nginx Proxy Manager
app.set('trust proxy', 1);

logger.info('------------------------------------------------');
logger.info(`[Startup] APP_URL Configured as: '${config.APP_URL}'`);
logger.info('------------------------------------------------');

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Assets - Quick Handling (Before heavy middleware)
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/robots.txt', (req, res) => res.status(204).end());

// Global 400 Debugger
app.use((req, res, next) => {
    const originalStatus = res.status;
    res.status = function(code) {
        if (code === 400) {
            const rawBodyStr = (req as any).rawBody ? (req as any).rawBody.toString('utf8').substring(0, 1000) : 'N/A';
            logger.warn({
                method: req.method,
                url: req.originalUrl || req.url,
                headers: req.headers,
                body: req.body,
                rawBody: rawBodyStr,
                rawBodyLength: (req as any).rawBody?.length || 0
            }, `[400 DEBUG] Bad Request Detection`);
        }
        return originalStatus.call(this, code);
    };
    next();
});

// View Engine Setup
const engine = require('ejs-mate');
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));

app.use(compression());
// Replaced morgan with custom strictRequestLogger if strictly needed, 
// OR keep morgan for simple CLI output but pipe to logger in production.
// For now, keeping morgan for dev visibility, but Sentry/logger handles the heavy lifting.
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, '../public')));

import { traceMiddleware } from './middleware/trace.middleware';
app.use(traceMiddleware);

// CSP Nonce & Globals Middleware
app.use((req, res, next) => {
  const crypto = require('crypto');
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  res.locals.appUrl = config.APP_URL; // [FIX] Expose APP_URL to views for absolute paths (PDF generation)
  next();
});

import { strictRequestLogger } from './middleware/strict-logger.middleware';
app.use(strictRequestLogger);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // [Security] Strict CSP for Tags (Nonce-based), Loose for Attributes (Migration in progress)
      // Added unpkg.com, cdn.jsdelivr.net, etc. explicitly
      scriptSrc: ["'self'", (req: any, res: any) => `'nonce-${res.locals.nonce}'`, "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", config.APP_URL, "'unsafe-eval'", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", (req: any, res: any) => `'nonce-${res.locals.nonce}'`, "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", config.APP_URL, "'unsafe-eval'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], 
      
      styleSrc: ["'self'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", config.APP_URL, "'unsafe-inline'"],
      styleSrcElem: ["'self'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", config.APP_URL, "'unsafe-inline'"],
      styleSrcAttr: ["'unsafe-inline'"], 
      
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", config.APP_URL],
      imgSrc: ["'self'", "data:", "https:", "blob:", config.APP_URL],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://api.stripe.com", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://ka-f.fontawesome.com", "https://cdnjs.cloudflare.com", config.APP_URL],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "blob:", config.APP_URL],
    },
  },
  hsts: process.env.COOKIE_SECURE !== 'false', // Disable HSTS if secure cookies are disabled
}));
logger.info('CSP Configured');

// ============================================================================
// CORS Configuration - Applied ONLY to API routes
// ============================================================================
const allowedOrigins = config.ALLOWED_ORIGINS?.split(',') || [config.APP_URL, 'http://localhost:3000', 'http://localhost:3002'];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // 1. Allow requests with no origin (mobile apps, server-to-server, etc.)
    if (!origin) return callback(null, true);

    // 2. Allow if the origin is explicitly in our config
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // 3. Allow any localhost/127.0.0.1 in development
    const isDev = config.NODE_ENV === 'development';
    if (isDev && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.match(/^http:\/\/192\.168\.\d+\.\d+/))) {
      return callback(null, true);
    }

    // 4. Otherwise, block and log for security
    logger.warn(`⚠️ CORS BLOCKED: Origin '${origin}' is not allowed. Check ALLOWED_ORIGINS in .env.`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

// ============================================================================
// WEBHOOKS - Must come before body parsers to access raw body
// ============================================================================
// WEBHOOKS - Must come before body parsers to access raw body
// ============================================================================
// DEV ONLY: Test Design Engine (Removed in Production)
if (config.NODE_ENV === 'development') {
    app.get('/test-design-engine', async (req: any, res: any) => {
        try {
            const { designEngineService } = await import('./services/design-engine.service');

            // Use query param or session user. No hardcoded emails.
            const email = req.query.email as string || req.session?.user?.email;
            if (!email) return res.status(400).send('Missing email query param or session.');

            const user = await prisma.user.findUnique({ where: { email } });
            if(!user) return res.status(404).send(`User ${email} not found`);

            const payload = {
                type: 'invoice',
                options: { templateId: 'invoice_standard' }, 
                data: { number: 'INV-TEST-001', date: '2023-01-01', items: [{ desc: 'Test Item', price: 100 }] }
            };

            const result = await designEngineService.composeLayout(payload, user.id);
            res.json({ success: true, result });
        } catch (e: any) {
            res.status(500).json({ error: e.message, stack: e.stack });
        }
    });
}


// ============================================================================
// Body Parsers
// ============================================================================
// Capture raw body for webhook verification
const rawBodySaver = (req: any, res: any, buf: Buffer, encoding: string) => {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
};

app.use(express.json({ limit: '50mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '50mb', verify: rawBodySaver }));

/**
 * Session Configuration
 * 
 * Uses Redis for session storage in production (sessions persist across restarts)
 * Falls back to in-memory storage in development if Redis is not configured
 */
const redisClient = getRedisClient();

app.use(session({
  // Use Redis store if available
  ...(redisClient && {
    store: new RedisStore({
      client: redisClient,
      prefix: 'sess:', // Key prefix in Redis
    }),
  }),

  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  cookie: {
    // HTTPS only in production, unless explicitly disabled (e.g. for local prod testing)
    secure: config.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    httpOnly: true, // Prevent XSS attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax', // CSRF protection
  },

  name: 'sessionId', // Custom session cookie name
  rolling: true, // Reset maxAge on every response (Inactivity Timeout implementation)
}));

app.use(passport.initialize());

import { requestLogger } from './middleware/request-logger.middleware';
app.use(requestLogger);

import { injectUser } from './middleware/user.middleware';
// Inject user into all views if session exists
app.use(injectUser);

app.get('/debug/user', (req, res) => {
  res.json({
    session: req.session,
    localsUser: res.locals.user,
    reqUser: (req as any).user,
    checks: {
        hasAiAccess: res.locals.user ? (res.locals.user as any).hasAiAccess : 'N/A',
        isPaid: res.locals.user ? (res.locals.user as any).isPaidUser : 'N/A'
    }
  });
});

// Inject notification count into all views
app.use(injectNotificationCount);
// Inject available services into all views
app.use(injectServices);

import { checkQuota } from './middleware/quota.middleware';
import { logUsage } from './middleware/logging.middleware';
import { requireAuth } from './middleware/session.middleware';
import { injectPermissions } from './middleware/rbac.middleware';

import servicesRoutes from './routes/services.routes';

import swaggerUi from 'swagger-ui-express';
import { specs } from './config/swagger';
import profileRoutes from './routes/profile.routes';

import businessRoutes from './routes/business.routes';

// Public Routes (Web Pages)
app.use('/', landingRoutes);

app.use('/auth', authRoutes);                   // Login, register, social auth
app.use('/invoice', docRoutes);                 // Public Smart Invoice Viewer

// Dashboard & App Routes - Protected + Onboarding Check
// Dashboard & App Routes - Protected
app.use('/dashboard/connections', integrationsRoutes); // Integrations (Config allowed during onboarding)
app.use('/dashboard', requireAuth, checkOnboarding);
app.use('/onboarding', businessRoutes);       // New Business Onboarding Wizard
app.use('/dashboard/brand', brandingRoutes);     // Brand Standards
app.use('/dashboard/workflows', workflowsRoutes); // Workflows
app.use('/dashboard', checkOnboarding, dashboardRoutes);         // User dashboard
app.use('/apps', checkOnboarding, appsRoutes);                   // App management UI
app.use('/services', checkOnboarding, logUsage, servicesRoutes);           // Service configuration UI
app.use('/billing', checkOnboarding, billingRoutes);             // Billing pages
app.use('/subscription', checkOnboarding, subscriptionRoutes);   // Subscription management
app.use('/notifications', checkOnboarding, notificationRoutes);  // Notification center
app.use('/analytics', checkOnboarding, analyticsRoutes);         // Analytics dashboard
app.use('/user', checkOnboarding, userRoutes);                   // User profile pages
app.use('/tools', checkOnboarding, logUsage, servicesRoutes);              // Tools catalog (alias for services)
app.use('/admin', injectPermissions, adminRoutes);                 // Admin dashboard
import devRoutes from './routes/dev.routes';
app.use('/dev', devRoutes);                     // Internal Dev Tools
app.use(profileRoutes);                         // Profile management (includes /profile endpoint)


// ============================================================================
// API ROUTES (JSON-based, API Key/Token Auth, CORS enabled)
// ============================================================================
const apiRouter = express.Router();

// Apply CORS to API routes only
apiRouter.use(cors(corsOptions));

// API Documentation
apiRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));

// API Middleware Stack
import { publicAuthMiddleware } from './middleware/public-auth.middleware';
import { requireSubscriptionValid } from './middleware/service.middleware';

apiRouter.use(apiLimiter);           // 1. DDOS Protection
apiRouter.use(publicAuthMiddleware); // 2. Guest/Anonymous Context
import { checkStorageLimit } from './middleware/storage.middleware';
apiRouter.use(apiKeyAuth);           // 3. User Identification
apiRouter.use(checkStorageLimit);    // 3.5 Storage Guard (Plan Limits)
apiRouter.use(requireSubscriptionValid); // 4. Global Status Gate (Production Ready)
apiRouter.use(checkQuota);           // 5. Dynamic Quota Enforcement
apiRouter.use(logUsage);             // 6. Audit Logging

// API Routes
import apiRoutes from './routes/api.routes';
import aiRoutes from './routes/ai.routes';
import jobsRoutes from './routes/jobs.routes';
import transactionalRoutesV1 from './routes/v1/transactional.routes';
import webhookRoutes from './routes/webhook.routes';

apiRouter.use('/', apiRoutes);       // /api/me, /api/usage, /api/services
apiRouter.use('/pdf', pdfRoutes);    // /api/pdf/convert
apiRouter.use('/ai', aiRoutes);      // /api/ai/generate
apiRouter.use('/jobs', jobsRoutes);  // /api/jobs/status
  apiRouter.use('/v1/transactional', transactionalRoutesV1); // Enterprise V1
// Mount API router
// Mount API router
app.use('/api/v1/webhooks', webhookRoutes); // Public Webhooks (Signature Verification handled inside)

import v2Router from './routes/v2';

if (config.ARCHITECTURE_VERSION === 'v2') {
    logger.warn('🚀 [BOOT] V2 Architecture (Service Composition) ENABLED. V1 API Suspended.');
    
    // Create V2 specific router to inherit middleware
    const v2ApiRouter = express.Router();
    
    // Apply Schema/Security Middleware Stack (Same as V1 for now)
    v2ApiRouter.use(cors(corsOptions));
    v2ApiRouter.use(apiLimiter);
    v2ApiRouter.use(publicAuthMiddleware);
    v2ApiRouter.use(apiKeyAuth);         // Enforce API Key / App ID
    v2ApiRouter.use(checkStorageLimit);
    v2ApiRouter.use(requireSubscriptionValid);
    v2ApiRouter.use(checkQuota);
    v2ApiRouter.use(logUsage);

    // Mount V2 Routes
    v2ApiRouter.use('/', v2Router);
    
    app.use('/api/v2', v2ApiRouter);
} else {
    app.use('/api', apiRouter);
}


/**
 * Health Check Endpoint
 * 
 * Verifies:
 * - Application is running
 * - Database connection
 * - Redis connection (if configured)
 */
app.get('/health', async (req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  };

  // Check database connection
  try {
    const { default: prisma } = await import('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'degraded';
  }

  // Check Redis connection
  const redisHealthy = await healthCheck();
  health.redis = redisHealthy ? 'connected' : (config.REDIS_URL ? 'disconnected' : 'not_configured');
  
  if (config.REDIS_URL && !redisHealthy) {
     health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Sentry Error Handler (Must be before other error handlers)
// app.use(Sentry.Handlers.errorHandler());


app.use(errorHandler);

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ promise, reason }, 'Unhandled Rejection');
});

// Import Seeder
// Import Boot Manager
import { BootManager } from './lib/boot';

const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Dashboard available at http://localhost:${PORT}/dashboard`);

  // Robust Boot Sequence
  await BootManager.initialize();
  
  // Initialize Service Registry (route auto-discovery)
  await BootManager.initializeServiceRegistry(app);
});

server.on('error', (err) => {
  logger.error({ err }, 'Server startup error');
});

// Keep alive check
setInterval(() => {
  // logger.debug('Heartbeat');
}, 10000);
 
 
