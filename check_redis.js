
const Redis = require('ioredis');

async function checkRedis() {
    // Default to localhost, or use env var
    // Note: ioredis defaults to 127.0.0.1:6379 if no args
    const connectionUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    console.log('Connecting to:', connectionUrl);

    const client = new Redis(connectionUrl);

    client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
        client.disconnect();
    });

    try {
        console.log('⏳ Pinging Redis...');
        const pong = await client.ping();
        console.log('✅ Connected! Response:', pong);
        
        // List keys (limit to 20 to avoid spamming)
        const keys = await client.keys('*');
        console.log(`Found ${keys.length} keys.`);
        
        // Filter for "memory" or "codex" related keys
        const interestingKeys = keys.filter(k => 
            !k.startsWith('bull') && !k.startsWith('sess:') && !k.startsWith('rate-limit:')
        );
        
        console.log('--- Interesting Keys ---');
        console.log(interestingKeys.slice(0, 20));

        if (interestingKeys.length > 0) {
            console.log('--- Sample Content ---');
            const sampleKey = interestingKeys[0];
            const type = await client.type(sampleKey);
            if (type === 'string') {
                const val = await client.get(sampleKey);
                console.log(`[${sampleKey}]:`, val.substring(0, 100) + '...');
            }
        }
        
        await client.quit();
    } catch (e) {
        console.error('❌ Failed:', e);
        client.disconnect();
    }
}

checkRedis();
