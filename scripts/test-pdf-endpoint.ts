// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

// Manually construct DATABASE_URL because dotenv doesn't expand variables
const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME, DB_SCHEMA } = process.env;
process.env.DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}`;

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const APP_URL = process.env.APP_URL || 'http://localhost:3002';

async function testPdfEndpoint() {
    console.log('🚀 Starting PDF Endpoint Test...');

    try {
        // 1. Find a User with API Key and App
        console.log('🔍 Finding test credentials...');
        const user: any = await prisma.user.findFirst({
            where: { 
                apiKeys: { some: {} },
                apps: { some: {} }
            },
            include: { 
                apiKeys: true,
                apps: true
            }
        });

        if (!user) {
            console.error('❌ No suitable user found (Need User with API Key and App).');
            return;
        }

        // Bracket notation to bypass TS checking on relations
        const apiKey = user['apiKeys'][0].key;
        const appId = user['apps'][0].id; 
        
        console.log(`✅ Found User: ${user.email}`);
        console.log(`🔑 API Key: ${apiKey.substring(0, 8)}...`);
        console.log(`📱 App ID: ${appId}`);

        // 2. Prepare Payload
        const htmlContent = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Test PDF</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; color: #333; }
                        h1 { color: #2563eb; }
                        .card { border: 1px solid #ccc; padding: 15px; border-radius: 8px; background: #f9fafb; }
                    </style>
                </head>
                <body>
                    <h1>Test PDF Generation</h1>
                    <p>This is a raw test from the script.</p>
                    <div class="card">
                        <h2>Styled Card</h2>
                        <p>If you can read this, basic HTML rendering works.</p>
                    </div>
                </body>
            </html>
        `;

        const payload = {
            html: htmlContent,
            appId: appId
            // options can be passed if needed
        };

        // 3. Make Request
        console.log(`📡 Sending POST request to ${APP_URL}/api/pdf/convert...`);
        
        const response = await axios.post(`${APP_URL}/api/pdf/convert`, payload, {
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer', // Expect PDF buffer
            validateStatus: () => true // Handle 4xx/5xx manually
        });

        // 4. Handle Response
        console.log(`📥 Response Status: ${response.status}`);
        
        if (response.status === 202) {
             const jobId = response.data.jobId || JSON.parse(response.data.toString()).jobId;
             console.log(`✅ Job Queued! Job ID: ${jobId}`);
             console.log(`⏳ logic: The implementation is async (Worker). Please check worker logs.`);
        } else if (response.status === 200) {
             const buffer = Buffer.from(response.data);
             console.log(`✅ Success! Received PDF Buffer: ${buffer.length} bytes`);
             
             if (buffer.length === 0) {
                 console.error('❌ PDF Buffer is EMPTY!');
             } else {
                 const outputPath = path.resolve(__dirname, '../test_output.pdf');
                 fs.writeFileSync(outputPath, buffer);
                 console.log(`💾 Saved PDF to: ${outputPath}`);
             }
        } else {
            console.error('❌ Request Failed:', response.data.toString());
        }

    } catch (error: any) {
        console.error('❌ Script Error:', error.message);
        if (error.response) {
            console.error('   Data:', error.response.data);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testPdfEndpoint();
