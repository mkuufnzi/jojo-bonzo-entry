const { Client } = require('ssh2');

const conn = new Client();

conn.on('ready', () => {
    console.log('🔍 Querying user from app container...\n');
    
    const cmd = `cd /home/bonzo/afs_doc_tools && docker compose exec -T app node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  try {
    // Search for exact email
    const user = await prisma.user.findUnique({
      where: { email: 'bwj.afs.tools@gmail.com' }
    });
    
    console.log('=== EXACT EMAIL SEARCH ===');
    console.log(user ? JSON.stringify(user, null, 2) : 'User not found with exact email');
    
    // Search with case-insensitive
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'bwj',
          mode: 'insensitive'
        }
      }
    });
    
    console.log('\\n=== CASE-INSENSITIVE SEARCH (contains bwj) ===');
    console.log(users.length > 0 ? JSON.stringify(users, null, 2) : 'No users found containing bwj');
    
    // List all users
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true, emailVerified: true }
    });
    
    console.log('\\n=== ALL USERS (first 10) ===');
    console.log(JSON.stringify(allUsers.slice(0, 10), null, 2));
    
    await prisma.\\$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUser();
" 2>&1`;
    
    conn.exec(cmd, (err, stream) => {
        if (err) {
            console.error('❌ Error:', err);
            conn.end();
            return;
        }
        
        stream.on('close', (code) => {
            console.log(`\n✅ Query completed with code: ${code}`);
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
