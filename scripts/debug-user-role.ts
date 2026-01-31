
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
import prisma from '../src/lib/prisma';
import { ROLE_PERMISSIONS } from '../src/config/roles';

async function debugUser() {
    const query = process.argv[2];
    if (!query) {
        console.log('Provide a name or email');
        return;
    }
    
    console.log(`🔍 Searching for user matching: "${query}"...`);
    
    // Find user
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: { contains: query } },
                { name: { contains: query } }
            ]
        }
    });
    
    if (!user) {
        console.log('❌ User not found.');
        return;
    }
    
    console.log(`✅ Found User: ${user.name} (${user.email})`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   IsAdmin: ${user.isAdmin}`);
    
    // Simulate Permission Expansion
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    console.log(`\n🔑 Effective Permissions (${permissions.length}):`);
    console.log(permissions.join(', '));
    
    // Check key permissions for sidebar
    const check = (perm: string) => permissions.includes(perm) ? '✅' : '❌';
    console.log('\n📋 Sidebar Checks:');
    console.log(`   Users (view_users): ${check('view_users')}`);
    console.log(`   Services (manage_services): ${check('manage_services')}`);
    console.log(`   Plans (view_revenue): ${check('view_revenue')}`);
}

debugUser();
