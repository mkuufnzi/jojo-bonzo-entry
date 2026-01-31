/**
 * E2E Test: App Management CRUD
 * Verifies create, read, toggle, and delete operations for apps.
 */
import prisma from '../../lib/prisma';

async function main() {
    console.log('📱 E2E Test: App Management');
    console.log('============================\n');

    let testAppId: string | null = null;

    try {
        // Find a user
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error('❌ No users found');
            process.exit(1);
        }

        console.log(`👤 Testing as user: ${user.email}\n`);

        // Test 1: Create App
        console.log('📋 Test 1: Create new app...');
        const testApp = await prisma.app.create({
            data: {
                name: 'E2E Test App',
                description: 'Temporary app for E2E testing',
                userId: user.id,
                isActive: true,
                apiKey: `e2e_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
            }
        });
        testAppId = testApp.id;
        console.log(`✅ App created: ${testApp.name} (${testApp.id})`);
        console.log(`   API Key: ${testApp.apiKey.substring(0, 20)}...`);

        // Test 2: Read App
        console.log('\n📋 Test 2: Read app by ID...');
        const readApp = await prisma.app.findUnique({
            where: { id: testAppId }
        });
        if (readApp) {
            console.log(`✅ App found: ${readApp.name}`);
        } else {
            throw new Error('App not found after creation');
        }

        // Test 3: List User Apps
        console.log('\n📋 Test 3: List all user apps...');
        const allApps = await prisma.app.findMany({
            where: { userId: user.id }
        });
        console.log(`✅ User has ${allApps.length} app(s)`);

        // Test 4: Toggle App Status
        console.log('\n📋 Test 4: Toggle app status...');
        const toggledApp = await prisma.app.update({
            where: { id: testAppId },
            data: { isActive: false }
        });
        console.log(`✅ App toggled: isActive = ${toggledApp.isActive}`);

        // Toggle back
        await prisma.app.update({
            where: { id: testAppId },
            data: { isActive: true }
        });
        console.log('✅ App toggled back to active');

        // Test 5: Delete App
        console.log('\n📋 Test 5: Delete app...');
        await prisma.app.delete({
            where: { id: testAppId }
        });
        testAppId = null;
        console.log('✅ App deleted successfully');

        // Verify deletion
        const deletedCheck = await prisma.app.findUnique({
            where: { id: testApp.id }
        });
        if (!deletedCheck) {
            console.log('✅ Deletion verified - app not found');
        } else {
            throw new Error('App still exists after deletion');
        }

        console.log('\n🏆 ALL APP MANAGEMENT TESTS PASSED');

    } catch (error) {
        console.error('❌ Test Error:', error);
        
        // Cleanup on error
        if (testAppId) {
            try {
                await prisma.app.delete({ where: { id: testAppId } });
                console.log('🧹 Cleaned up test app');
            } catch { /* ignore cleanup errors */ }
        }
        
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
