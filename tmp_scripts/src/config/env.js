"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env file
// Load .env file
const envPath = process.env.DOTENV_CONFIG_PATH
    ? path_1.default.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
    : path_1.default.resolve(__dirname, '../../environments/.env');
const result = dotenv_1.default.config({ path: envPath });
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
const envSchema = zod_1.z.object({
    // Application
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('3002'),
    APP_URL: zod_1.z.string().url('Invalid APP_URL').default('http://localhost:3002'),
    // Database (PostgreSQL)
    // Database (PostgreSQL)
    // Auto-append ?sslmode=require in production if missing to ensure security
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required').transform((url) => {
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
    REDIS_URL: zod_1.z.string().optional(), // Optional for development, falls back to in-memory
    // Session
    SESSION_SECRET: zod_1.z.string().min(1, 'SESSION_SECRET is required'),
    // Stripe Payment
    STRIPE_SECRET_KEY: zod_1.z.string().min(1, 'STRIPE_SECRET_KEY is required'),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
    STRIPE_PUBLIC_KEY: zod_1.z.string().min(1, 'STRIPE_PUBLIC_KEY is required'),
    // QuickBooks Online
    QBO_CLIENT_ID: zod_1.z.string().optional(),
    QBO_CLIENT_SECRET: zod_1.z.string().optional(),
    QBO_WEBHOOK_VERIFIER_TOKEN: zod_1.z.string().optional(),
    // Email Configuration
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.string().optional(),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    FROM_EMAIL: zod_1.z.string().default('no-reply@afstools.com'),
    FROM_NAME: zod_1.z.string().default('Floovioo '),
    NOTIFICATION_EMAILS: zod_1.z.string().optional(),
    AI_GENERATION_WEBHOOK_URL: zod_1.z.string().url().optional(),
    AI_WEBHOOK_SECRET: zod_1.z.string().optional(),
    AI_GENERATION_TIMEOUT: zod_1.z.string().optional(),
    // Transactional Branding
    TRANSACTIONAL_WEBHOOK_URL: zod_1.z.string().url().optional(),
    // Security
    ALLOWED_ORIGINS: zod_1.z.string().optional(),
    // Social Auth (Optional)
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    FACEBOOK_APP_ID: zod_1.z.string().optional(),
    FACEBOOK_APP_SECRET: zod_1.z.string().optional(),
    LINKEDIN_KEY: zod_1.z.string().optional(),
    LINKEDIN_SECRET: zod_1.z.string().optional(),
    X_CLIENT_ID: zod_1.z.string().optional(),
    X_CLIENT_SECRET: zod_1.z.string().optional(),
    // Observability
    SENTRY_DSN: zod_1.z.string().url().optional(),
    // Admin Seeding
    INITIAL_ADMIN_PASSWORD: zod_1.z.string().optional(),
});
const env = envSchema.safeParse(process.env);
if (!env.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 2));
    process.exit(1);
}
exports.config = env.data;
