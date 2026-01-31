import pino from 'pino';
import { config } from '../config/env';

/**
 * Structured Logger using Pino
 * 
 * - Pretty prints in development
 * - JSON in production for better aggregation
 * - Redacts sensitive information
 */
export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: config.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  redact: {
    paths: [
      'req.headers.authorization', 
      'req.headers.cookie', 
      'password', 
      'token', 
      'stripeSecretKey',
      'apiKey'
    ],
    remove: true,
  },
});
