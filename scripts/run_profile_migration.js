const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
    console.log('🔄 Running Prisma migration on VPS...\n');
    
    const cmd = `
cd /home/bonzo/afs_doc_tools && \
echo "=== GENERATING PRISMA CLIENT ===" && \
docker compose exec -T app npx prisma generate && \
echo && echo "=== RUNNING MIGRATION ===" && \
docker compose exec -T app npx prisma migrate deploy && \
echo && echo "=== CHECKING TABLES ===" && \
docker compose exec -T db psql -U bpma_afs_tools_admin -d bpma_afs_tools -c "\\dt bpma_afs_tools_schema.*" && \
echo && echo "=== VERIFYING USERPROFILE TABLE ===" && \
docker compose exec -T db psql -U bpma_afs_tools_admin -d bpma_afs_tools -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'bpma_afs_tools_schema' AND table_name = 'user_profiles' ORDER BY ordinal_position;"
    `.trim();
    
    conn.exec(cmd, (err, stream) => {
        if (err) {
            console.error('❌ Error:', err);
            conn.end();
            return;
        }
        
        stream.on('close', (code) => {
            console.log(`\n✅ Migration completed with code: ${code}`);
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
    });
}).connect({
    host: '72.62.16.140',
    port: 22,
    username: 'bonzo',
    password: 'bonzo@vps'
});
