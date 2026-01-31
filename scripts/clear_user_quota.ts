import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

async function main() {
    await client.connect();
    const userId = 'f9eab686-43d3-4ee4-8f33-5f23f58a18f1';
    const keys = await client.keys(`quota:${userId}:*`);
    
    if (keys.length === 0) {
        console.log('No quota keys found for user.');
    } else {
        for (const key of keys) {
            await client.del(key);
            console.log(`Deleted ${key}`);
        }
    }
    await client.disconnect();
}

main().catch(console.error);
