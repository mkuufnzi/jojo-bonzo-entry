
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env manually or force
dotenv.config({ path: path.resolve(__dirname, '../.env.development') });

// Force correct URL if env loading is flaky or overridden by global .env
process.env.DATABASE_URL = "postgresql://root_admin:ChangeMe123!@192.168.100.2:5432/postgres?schema=public";

if (!process.env.DATABASE_URL) {
    // Fallback if not loaded
    dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const prisma = new PrismaClient();
const BASE_URL = process.env.APP_URL || 'http://localhost:3002'; // Using 3002 as seen in user logs

async function main() {
    console.log(`Starting Admin Route Verification against ${BASE_URL}...`);

    // 1. Ensure Admin User Exists
    const adminEmail = 'admin_test@example.com';
    const adminPassword = 'password123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    console.log('Ensuring admin user exists...');
    const user = await prisma.user.upsert({
        where: { email: adminEmail },
        update: { isAdmin: true },
        create: {
            email: adminEmail,
            name: 'Admin Test',
            password: hashedPassword,
            isAdmin: true,
            emailVerified: new Date()
        }
    });
    console.log('User upserted. DB State:', { id: user.id, email: user.email, isAdmin: user.isAdmin });


    // 2. Login & Get Cookie
    const client = axios.create({
        baseURL: BASE_URL,
        validateStatus: () => true, // Don't throw on 4xx/5xx
        maxRedirects: 0 // Handle redirects manually if needed, but we expect 302
    });

    console.log('Logging in...');
    const loginRes = await client.post('/auth/login', {
        email: adminEmail,
        password: adminPassword
    });

    if (loginRes.status !== 302 && loginRes.status !== 200) {
        console.error('Login failed:', loginRes.status, loginRes.data);
        process.exit(1);
    }

    // Extract Cookie
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies) {
        console.error('No cookies received after login.');
        process.exit(1);
    }
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Login successful. Session Cookie obtained.');

    // Helper to request with auth
    const request = async (method: 'GET' | 'POST', url: string, data?: any) => {
        const res = await client.request({
            method,
            url,
            data,
            headers: { Cookie: cookieHeader }
        });
        const status = res.status;
        const statusColor = status >= 200 && status < 300 ? '\x1b[32m' : (status >= 300 && status < 400 ? '\x1b[33m' : '\x1b[31m');
        console.log(`${method} ${url} -> ${statusColor}${status}\x1b[0m`);
        return res;
    };

    // 3. Test Routes
    console.log('\n--- Testing Admin Routes ---');
    
    // Overview
    await request('GET', '/admin');
    
    // Users
    await request('GET', '/admin/users');
    await request('GET', '/admin/users?search=test');

    // Services
    const servicesRes = await request('GET', '/admin/services');
    
    // Services Edit (Dynamic ID)
    // We can try to grab an ID from the DB directly to be sure, since parsing HTML is hard
    const service = await prisma.service.findFirst();
    if (service) {
        await request('GET', `/admin/services/${service.id}/edit`);
        // Test Sync (POST)
        await request('POST', `/admin/services/sync`); 
    } else {
        console.log('Skipping Service Detail test (no services found in DB)');
    }

    // features
    await request('GET', '/admin/features');
    // Create Feature
    const featureRes = await request('POST', '/admin/features', {
        key: 'test_feature_' + Date.now(),
        name: 'Test Feature',
        description: 'Created by verification script',
        category: 'core'
    });
    
    // If created, try to Edit it
    if (featureRes.status === 302) {
        const feature = await prisma.feature.findFirst({ orderBy: { createdAt: 'desc' } });
        if (feature) {
             await request('GET', `/admin/features/${feature.id}/edit`);
             await request('POST', `/admin/features/${feature.id}/update`, {
                 key: feature.key,
                 name: 'Test Feature Updated',
                 description: 'Updated description',
                 category: 'core',
                 isActive: 'on'
             });
        }
    }

    // Plans
    await request('GET', '/admin/plans');
    const plan = await prisma.plan.findFirst();
    if (plan) {
         await request('GET', `/admin/plans/${plan.id}/edit`);
         // We won't update plans blindly to avoid breaking payment sync, but GET confirms view works
    }

    console.log('\n--- Verification Complete ---');
}

main().catch(e => console.error(e)).finally(async () => {
    await prisma.$disconnect();
});
