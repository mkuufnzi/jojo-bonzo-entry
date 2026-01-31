/**
 * Test script for AI Document Generator endpoints
 * Uses a real user from the database to simulate requests
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load development environment
dotenv.config({ path: '.env.development' });

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

interface TestResult {
    endpoint: string;
    status: number;
    success: boolean;
    data?: any;
    error?: string;
}

async function getTestUser() {
    const user = await prisma.user.findFirst({
        where: { isActive: true },
        include: {
            apps: {
                where: { isActive: true },
                take: 1
            }
        }
    });
    
    if (!user) {
        throw new Error('No active user found in database');
    }
    
    if (!user.apps || user.apps.length === 0) {
        throw new Error(`User ${user.email} has no active apps`);
    }
    
    return {
        userId: user.id,
        email: user.email,
        appId: user.apps[0].id,
        apiKey: user.apps[0].apiKey
    };
}

async function testEndpoint(url: string, method: string, body?: any, headers?: Record<string, string>): Promise<TestResult> {
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: body ? JSON.stringify(body) : undefined
        });
        
        const data = await response.json().catch(() => null);
        
        return {
            endpoint: url,
            status: response.status,
            success: response.ok,
            data
        };
    } catch (error: any) {
        return {
            endpoint: url,
            status: 0,
            success: false,
            error: error.message
        };
    }
}

async function checkWebhookConfig() {
    console.log('\n📋 Checking webhook configuration...\n');
    
    const service = await prisma.service.findUnique({
        where: { slug: 'ai-doc-generator' }
    });
    
    if (!service) {
        console.log('❌ Service "ai-doc-generator" not found!');
        return null;
    }
    
    console.log('✅ Service found:', service.name);
    console.log('   ID:', service.id);
    console.log('   Active:', service.isActive);
    
    const config = service.config as any;
    
    if (!config?.webhooks) {
        console.log('❌ No webhooks configuration found!');
        console.log('   Current config:', JSON.stringify(config, null, 2));
        return null;
    }
    
    console.log('\n🔗 Webhook URLs:');
    const requiredActions = ['analyze', 'generate', 'format'];
    const webhooks = config.webhooks;
    let allConfigured = true;
    
    for (const action of requiredActions) {
        if (webhooks[action]) {
            console.log(`   ✅ ${action}: ${webhooks[action]}`);
        } else {
            console.log(`   ❌ ${action}: MISSING!`);
            allConfigured = false;
        }
    }
    
    return allConfigured ? webhooks : null;
}

async function testAnalyzeEndpoint(appId: string, apiKey: string) {
    console.log('\n🔍 Testing /analyze endpoint...\n');
    
    const result = await testEndpoint(
        `${BASE_URL}/services/ai-doc-generator/analyze`,
        'POST',
        {
            prompt: 'Create a simple invoice for testing',
            documentType: 'invoice',
            appId,
            context: 'Test context data'
        },
        {
            'x-api-key': apiKey
        }
    );
    
    console.log('Status:', result.status);
    console.log('Success:', result.success);
    
    if (result.data) {
        console.log('Response:', JSON.stringify(result.data, null, 2));
        
        if (result.data.jobId) {
            console.log('\n✅ Job created with ID:', result.data.jobId);
            return result.data.jobId;
        }
    }
    
    if (result.error) {
        console.log('Error:', result.error);
    }
    
    return null;
}

async function pollJobStatus(jobId: string, apiKey: string, maxAttempts = 10) {
    console.log(`\n⏳ Polling job ${jobId} status...`);
    
    for (let i = 0; i < maxAttempts; i++) {
        const result = await testEndpoint(
            `${BASE_URL}/services/ai-doc-generator/jobs/${jobId}`,
            'GET',
            undefined,
            { 'x-api-key': apiKey }
        );
        
        console.log(`   Attempt ${i + 1}: Status=${result.status}, State=${result.data?.status || 'unknown'}`);
        
        if (result.data?.status === 'completed') {
            console.log('\n✅ Job completed!');
            console.log('Result preview:', JSON.stringify(result.data.result, null, 2).substring(0, 500));
            return result.data;
        }
        
        if (result.data?.status === 'failed') {
            console.log('\n❌ Job failed!');
            console.log('Error:', result.data.error);
            return null;
        }
        
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n⚠️ Max polling attempts reached');
    return null;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   AI Document Generator Endpoint Test Script');
    console.log('═══════════════════════════════════════════════════════\n');
    
    try {
        // Step 1: Get test user
        console.log('👤 Getting test user from database...');
        const testUser = await getTestUser();
        console.log(`   Email: ${testUser.email}`);
        console.log(`   App ID: ${testUser.appId}`);
        console.log(`   API Key: ${testUser.apiKey?.substring(0, 20)}...`);
        
        // Step 2: Check webhook configuration
        const webhooks = await checkWebhookConfig();
        
        if (!webhooks) {
            console.log('\n⚠️ Webhook configuration issues detected.');
            console.log('   The analyze/generate/format endpoints will fail without proper webhook URLs.');
        }
        
        // Step 3: Test analyze endpoint
        const jobId = await testAnalyzeEndpoint(testUser.appId, testUser.apiKey!);
        
        if (jobId) {
            // Step 4: Poll for job status
            await pollJobStatus(jobId, testUser.apiKey!);
        }
        
    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   Test Complete');
    console.log('═══════════════════════════════════════════════════════\n');
}

main();
