import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file
// Load .env file
const envPath = process.env.DOTENV_CONFIG_PATH 
    ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
    : path.resolve(__dirname, '../../environments/.env');

const result = dotenv.config({ path: envPath });

// In Docker/Production, variables are often injected directly, so missing .env is not always an error.
if (result.error && process.env.NODE_ENV !== 'production') {
  console.warn('Note: .env file not found, using system environment variables.');
}

// Manual variable expansion for DATABASE_URL since dotenv doesn't do it automatically
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('${')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    .replace('${DB_USER}', process.env.DB_USER || '')
    .replace('${DB_PASSWORD}', process.env.DB_PASSWORD || '')
    .replace('${DB_HOST}', process.env.DB_HOST || 'localhost')
    .replace('${DB_PORT}', process.env.DB_PORT || '5432')
    .replace('${DB_NAME}', process.env.DB_NAME || '')
    .replace('${DB_SCHEMA}', process.env.DB_SCHEMA || 'public');
}

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3002'),
  APP_URL: z.string().url('Invalid APP_URL').default('http://localhost:3002'),

  // Database (PostgreSQL)
  // Database (PostgreSQL)
  // Auto-append ?sslmode=require in production if missing to ensure security
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').transform((url) => {
    if (process.env.NODE_ENV === 'production') {
      const hasSSL = url.includes('sslmode=');
      const hasLimit = url.includes('connection_limit=');
      
      let newUrl = url;
      const separator = url.includes('?') ? '&' : '?';

      if (!hasSSL) {
        newUrl += `${separator}sslmode=require`;
      }
      // If we want to enforce specific connection limits in code:
      // if (!hasLimit) {
      //   const s = newUrl.includes('?') ? '&' : '?';
      //   newUrl += `${s}connection_limit=10`; 
      // }
      return newUrl;
    }
    return url;
  }),

  // Redis (Sessions, Rate Limiting, Caching)
  REDIS_URL: z.string().optional(), // Optional for development, falls back to in-memory

  // Session
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),

  // Stripe Payment
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
  STRIPE_PUBLIC_KEY: z.string().min(1, 'STRIPE_PUBLIC_KEY is required'),

  // QuickBooks Online
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  QBO_WEBHOOK_VERIFIER_TOKEN: z.string().optional(),

  // Email Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().default('no-reply@afstools.com'),
  FROM_NAME: z.string().default('Floovioo '),
  NOTIFICATION_EMAILS: z.string().optional(),

  AI_GENERATION_WEBHOOK_URL: z.string().url().optional(),
  AI_WEBHOOK_SECRET: z.string().optional(),
  AI_GENERATION_TIMEOUT: z.string().optional(),

  // Transactional Branding
  TRANSACTIONAL_WEBHOOK_URL: z.string().url().optional(),

  // Security
  ALLOWED_ORIGINS: z.string().optional(),

  // Social Auth (Optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  LINKEDIN_KEY: z.string().optional(),
  LINKEDIN_SECRET: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),

  // Admin Seeding
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
});

const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 2));
  process.exit(1);
}


export const config = env.data;
