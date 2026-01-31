import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis';

/**
 * API Rate Limiter
 * 
 * Uses Redis for persistence in production (rate limits survive restarts)
 * Falls back to in-memory storage in development if Redis is not available
 * 
 * Configuration:
 * - Window: 15 minutes
 * - Max requests: 100 per IP per window
 * - Headers: Standard rate limit headers (RateLimit-*)
 */

const redisClient = getRedisClient();

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to support polling (approx 1 req/sec avg is fine)
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  // Use Redis store if available, otherwise fall back to in-memory
  ...(redisClient && {
    store: new RedisStore({
      // @ts-expect-error - ioredis types are compatible
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: 'rl:', // Key prefix in Redis
    }),
  }),

  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },

  // Ensure we don't block traffic if Redis is down (fail open)
  // This is crucial for production reliability
  // @ts-ignore
  passOnStoreError: true,

  skip: (req) => {
    // Example: Skip rate limiting for health checks
    return req.path === '/health';
  },
});

export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Temporarily increased for testing
  standardHeaders: true,
  legacyHeaders: false,
  ...(redisClient && {
    store: new RedisStore({
      // @ts-expect-error - ioredis types are compatible
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: 'sl:', // Strict Limit prefix
    }),
  }),
  message: {
    status: 'error',
    message: 'Too many requests. Please try again after 15 minutes.',
  },
});

export const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 requests per hour per IP (Adjust based on plan?)
  // Note: We also track usage via DB/Plan limits, this is a safety net against abuse/DDoS
  standardHeaders: true,
  legacyHeaders: false,
  ...(redisClient && {
    store: new RedisStore({
      // @ts-expect-error - ioredis types are compatible
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: 'ai_rl:', // AI Rate Limit prefix
    }),
  }),
  message: {
    status: 'error',
    message: 'Too many AI requests. Please try again later.',
  },
});
