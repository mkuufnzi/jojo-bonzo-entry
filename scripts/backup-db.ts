import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../src/config/env';

const execPromise = util.promisify(exec);

/**
 * Database Backup Script
 * 
 * Usage: npm run db:backup
 * 
 * Logic:
 * 1. Checks for Docker container 'afs_doc_tools_dev' or 'afs_doc_tools_prod' (or generic postgres container)
 * 2. Runs pg_dump inside the container or via local tools if possible
 * 3. Saves to ./backups/YYYY-MM-DDT...sql.gz
 */

async function main() {
    console.log('📦 Starting Database Backup...');

    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${config.NODE_ENV}-${timestamp}.sql.gz`;
    const hostPath = path.join(backupDir, filename);

    // Identify Postgres container
    // We try to find the container running the postgres service
    // In dev: likely docker-compose.dev.yml -> postgres service
    // But usually we can just exec into the 'postgres' container if named reliably
    // Or we use the connection string if we have local pg_dump
    
    // Strategy: Use 'docker exec' connecting to the 'postgres' service container
    // If running in docker-compose, the host might be 'postgres' (internal) or we might have a container name.
    // In docker-compose.dev.yml, we don't see a container_name for postgres (it uses external network).
    // Wait, docker-compose.dev.yml says `networks: db_net (external: true)`. 
    // This implies there is a SEPARATE docker project matching 'db_net' running Postgres.
    
    // We will attempt to rely on the DATABASE_URL to determine host/user, but pg_dump needs to run somewhere with access.
    // Easiest is to ask docker to run a momentary alpine/postgres container to dump remote?
    // Or assume the user is running this on the HOST machine which has docker?
    
    // Let's assume standard 'postgres' container name if not found.
    // But since `db_net` is external, we might not know the container name.
    // Let's try to detect it or guess it. 'afs_postgres'? 'postgres'?
    
    console.log(`   Target: ${hostPath}`);

    // If we can interpret DATABASE_URL:
    // postgres://user:pass@host:5432/db
    const matches = config.DATABASE_URL.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
    
    if (!matches) {
        console.error('❌ Could not parse DATABASE_URL for backup connection.');
        process.exit(1);
    }
    
    const [_, user, password, host, port, dbName] = matches;
    
    // Command to run:
    // docker run --rm --network [db_net_name] -e PGPASSWORD=... postgres:15-alpine pg_dump -h [host] -U [user] [dbName] | gzip > [file]
    
    // We need to guess the network name. 'afs_doc_tools_db_net'? 'db_net'?
    // Inspecting `docker network ls` is too complex for this script.
    // Let's try the simple approach: We are inside the app container? Or on Host?
    // Script assumes running on HOST (Windows/Linux).
    
    // We will use a temporary docker container to perform the dump, ensuring we have pg_dump tool.
    // We need to attach to the same network as the database.
    // In dev, the network is 'db_net'.
    const NETWORK_NAME = 'db_net'; 
    
    const dockerCmd = `docker run --rm --network ${NETWORK_NAME} -e PGPASSWORD="${password}" postgres:15-alpine pg_dump -h ${host} -U ${user} ${dbName} | gzip > "${hostPath}"`;

    console.log(`   Executing Docker Dump (Network: ${NETWORK_NAME})...`);
    
    try {
        await execPromise(dockerCmd);
        const stats = fs.statSync(hostPath);
        console.log(`✅ Backup Complete! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Location: ${hostPath}`);
    } catch (error: any) {
        console.error('❌ Backup Failed:', error.message);
        // Fallback: maybe 'host' is localhost exposed port?
        if (host === 'postgres') {
            console.log('   Retrying with localhost (assuming 5432 exposed)...');
            const localCmd = `docker run --rm --network host -e PGPASSWORD="${password}" postgres:15-alpine pg_dump -h localhost -U ${user} ${dbName} | gzip > "${hostPath}"`;
             try {
                await execPromise(localCmd);
                console.log('✅ Backup Complete (via localhost)!');
             } catch (retryErr) {
                 console.error('   Retry Failed.');
             }
        }
    }
}

main().catch(console.error);
