const { Client } = require('ssh2');

const config = {
  host: '72.62.16.140',
  username: 'bonzo',
  password: 'bonzo@vps',
  port: 22,
};

const conn = new Client();
console.log('🔄 Starting Remote Migration on ' + config.host);

conn.on('ready', () => {
  console.log('✅ SSH Connection established');
  console.log('🚀 Running Prisma Migration...');
  
  // Explicitly pass the correct DATABASE_URL to avoid loading conflict or default to localhost
  const dbUrl = 'postgresql://bpma_afs_tools_admin:BPMA_Admin-Floovioo-Tools!@postgres:5432/bpma_afs_tools?schema=bpma_afs_tools_schema';
  const command = `docker run --rm --network db_net -e DATABASE_URL="${dbUrl}" afs_doc_tools-app:latest npx prisma migrate deploy`;

  conn.exec(command, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`\nMigration finished with code: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
