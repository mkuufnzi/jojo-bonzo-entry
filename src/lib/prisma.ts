import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { logger } from './logger';

/**
 * Prisma Client Configuration for PostgreSQL
 * 
 * Connection pooling is managed by Prisma:
 * - Development: Default (usually 10)
 * - Production: Configured via environment variables or connection string
 * 
 * Connection URL is read from DATABASE_URL environment variable.
 * We rely on the 'pgbouncer=true' or 'connection_limit=X' parameters in the URL for advanced pooling.
 */

logger.debug('Initializing Prisma Client for PostgreSQL...');

// Create Prisma Client instance
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
  // In production, we only log errors to reduce noise. 
  // In dev, we log queries for debugging.
  log: config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

// Handle shutdown gracefully
const shutdown = async () => {
  logger.info('Disconnecting Prisma Client...');
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected');
  process.exit(0);
};

// Use 'once' to prevent multiple listeners
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export default prisma;
