import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';
import { config } from './env';
import { logger } from '../lib/logger';

export const initSentry = (app?: Express) => {
  if (!config.SENTRY_DSN) {
    logger.warn('SENTRY_DSN not found. Sentry disabled.');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions (adjust for prod)
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
    environment: config.NODE_ENV,
  });

  logger.info('✅ Sentry initialized');
};
