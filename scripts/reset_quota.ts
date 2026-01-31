
import { getRedisClient, disconnectRedis } from '../src/lib/redis';

const userId = '0836c90b-0911-4200-b1f2-a1040c5b12c1';
const featureKey = 'ai_generation';
const year = 2026;
const month = 1;
const key = `quota:${userId}:${featureKey}:${year}-${month}`;

async function resetQuota() {
    console.log(`Connecting to Redis...`);
    const redis = getRedisClient();
    
    if (!redis) {
        console.error('Redis client not initialized. Check REDIS_URL.');
        process.exit(1);
    }

    try {
        console.log(`Checking key: ${key}`);
        const currentUsage = await redis.get(key);
        console.log(`Current Usage: ${currentUsage}`);

        // Reset to 0 or delete? Let's delete it so it re-initializes from DB (which might be safer if DB has lower count)
        // Or just set to 0. Log indicates "Usage: 51/50".
        // If we delete, QuotaService will re-fetch from DB. 
        // Let's see what the DB usage is. usageService.getFeatureUsage...
        // For now, let's just set it to something safe like 0 to unblock immediately.
        
        await redis.set(key, 0);
        console.log(`✅ Reset quota for user ${userId} to 0.`);
        
        // Verify
        const newUsage = await redis.get(key);
        console.log(`New Usage: ${newUsage}`);

    } catch (error) {
        console.error('Error resetting quota:', error);
    } finally {
        await disconnectRedis();
        process.exit(0);
    }
}

resetQuota();
