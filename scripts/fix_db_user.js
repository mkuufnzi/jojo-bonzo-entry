const { Client } = require('ssh2');

const config = {
  host: '72.62.16.140',
  username: 'bonzo',
  password: 'bonzo@vps',
  port: 22,
};

const conn = new Client();
console.log('🛠️  Starting Remote Database Fix on ' + config.host);

conn.on('ready', () => {
  console.log('✅ SSH Connection established');
  console.log('🔍 Detecting Postgres Superuser...');
  
  conn.exec('docker exec postgres printenv POSTGRES_USER', (err, stream) => {
    if (err) throw err;
    let superUser = '';
    stream.on('data', (data) => {
        superUser += data.toString().trim();
    }).on('close', () => {
        superUser = superUser || 'postgres'; // Fallback
        console.log(`✅ Detected Superuser: ${superUser}`);
        
        const dbName = 'bpma_afs_tools';
        const dbUser = 'bpma_afs_tools_admin';
        const dbPass = 'BPMA_Admin-Floovioo-Tools!';

        const sqlCommands = [
            `psql -U ${superUser} -c "ALTER ROLE ${dbUser} WITH LOGIN PASSWORD '${dbPass}';"`,
            `psql -U ${superUser} -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1 || psql -U ${superUser} -c "CREATE DATABASE ${dbName} OWNER ${dbUser};"`,
            `psql -U ${superUser} -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};"`
        ];

        const remoteCommands = sqlCommands.map(cmd => `docker exec postgres ${cmd}`).join(' && ');
        
        console.log('🔄 Executing DB Creation Commands...');
        conn.exec(remoteCommands, (err, stream) => {
            if (err) throw err;
            stream.on('close', (code) => {
                console.log(`\nDatabase Fix finished with code: ${code}`);
                conn.end();
            }).pipe(process.stdout);
            stream.stderr.pipe(process.stderr);
        });
    });
  });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
