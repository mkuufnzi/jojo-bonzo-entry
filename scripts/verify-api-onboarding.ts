
import 'dotenv/config'; // Load from .env file
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Setup Cookie Jar for Session Persistence
const jar = new CookieJar();
const client = wrapper(axios.create({ 
    jar,
    withCredentials: true,
    validateStatus: () => true // Don't throw 
}));

// Configuration from Environment
const APP_URL = process.env.APP_URL || 'http://localhost:3002';
const TEST_EMAIL = process.env.TEST_EMAIL || `verify_api_${Date.now()}@example.com`;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Password123!';

const prisma = new PrismaClient();

async function main() {
    console.log(`🧪 Starting API Verification against ${APP_URL}`);

    // 0. SEED USER (Bypass Email Verification)
    console.log('\n🌱 [0/5] Seeding Test User...');
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    
    // Create Config for Notification/Profile if needed? 
    // Usually User creation triggers signals, but direct Prisma bypasses signals unless we fire them.
    // However, we just need login to work.
    
    const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: { 
            password: hashedPassword,
            emailVerified: new Date(),
            isActive: true
        },
        create: {
            email: TEST_EMAIL,
            password: hashedPassword,
            name: 'API Verifier',
            emailVerified: new Date(),
            isActive: true, // Boolean
            role: 'USER'
        }
    });

    // Seed UserProfile (Required for Onboarding Step 4)
    await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
            userId: user.id,
            firstName: 'API',
            lastName: 'Verifier'
        }
    });

    console.log(`   User seeded: ${user.id}`);

    // SKIPPING API REGISTRATION (Use seeded user)
    // Register step skipped.

    // 2. LOGIN (Ensure Session)
    console.log('\n🔑 [2/5] Logging In...');
    const loginRes = await client.post(`${APP_URL}/auth/login`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
    });
    console.log(`   Status: ${loginRes.status}`);
    console.log(`   Cookies:`, loginRes.headers['set-cookie']);

    if (loginRes.status !== 200 && loginRes.status !== 302) {
        throw new Error(`Login failed with status ${loginRes.status}`);
    }

    // 3. STEP 1: PROILE
    console.log('\n🏢 [3/5] Step 1: Save Profile (Trigger: onboarding_profile)...');
    const profileRes = await client.post(`${APP_URL}/onboarding/api/profile`, {
        name: 'API Test Corp',
        sector: 'Technology',
        taxId: 'US-999',
        address: '123 Cloud St',
        city: 'Serverless',
        country: 'US'
    });
    
    // Check if redirect to login (HTML response instead of JSON)
    if (typeof profileRes.data === 'string' && profileRes.data.includes('Sign in')) {
         console.error('   ❌ Failed: Redirected to Login Page (Session Lost)');
         console.log('   Response Preview:', profileRes.data.substring(0, 500));
         throw new Error('Session lost during Profile Step. Cookie not sticking?');
    }

    console.log(`   Response: ${JSON.stringify(profileRes.data)}`);
    if (!profileRes.data.success) throw new Error('Profile Failed');

    // 4. STEP 3: BRANDING
    console.log('\n🎨 [4/5] Step 3: Save Branding (Trigger: onboarding_branding)...');
    const brandRes = await client.post(`${APP_URL}/onboarding/api/business/branding`, {
        voiceProfile: { tone: 'Premium' },
        brandColors: { primary: '#FF0000', secondary: '#00FF00' },
        fontSettings: { heading: 'Inter', body: 'Open Sans' }
    });
    console.log(`   Response: ${JSON.stringify(brandRes.data)}`);
    if (!brandRes.data.success) throw new Error('Branding Failed');

    // 5. STEP 4: DOCUMENTS
    console.log('\n📄 [5/5] Step 4: Documents (Trigger: onboarding_branding/completion)...');
    const docRes = await client.post(`${APP_URL}/onboarding/api/documents`, {
        documentTypes: ['invoice', 'receipt', 'statement']
    });
    console.log(`   Response: ${JSON.stringify(docRes.data)}`);
    if (!docRes.data.success) throw new Error('Documents Failed');

    console.log('\n✅ API Flow Verification Complete. Check n8n/Backend Logs for Webhooks.');
}

if (require.main === module) {
    main()
      .catch(console.error)
      .finally(async () => {
          await prisma.$disconnect();
      });
}
