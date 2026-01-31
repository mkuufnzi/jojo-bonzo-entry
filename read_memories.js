
const Redis = require('ioredis');

async function readMemories() {
    const client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    
    const keysToRead = [
        'project:afs_doc_tools:critical_rules',
        'project:afs_doc_tools:architecture:hitl_flow',
        'project:afs_doc_tools:constraints:ui:ai-doc-generator',
        'saas:billing:quota_model',
        'saas:service:pdf:stack'
    ];

    console.log('📖 Reading Memories...');
    
    for (const key of keysToRead) {
        try {
            const val = await client.get(key);
            console.log(`\n🔑 KEY: ${key}`);
            console.log('----------------------------------------');
            console.log(val);
            console.log('----------------------------------------');
        } catch (e) {
            console.error(`Failed to read ${key}:`, e.message);
        }
    }
    
    await client.quit();
}

readMemories();
