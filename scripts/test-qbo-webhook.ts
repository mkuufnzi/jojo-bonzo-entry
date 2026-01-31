import crypto from 'crypto';
import axios from 'axios';
import { config } from 'dotenv';
import path from 'path';

// Load Environment
config({ path: path.resolve(__dirname, '../environments/.env') });

const APP_URL = process.env.APP_URL || 'http://localhost:3002';
const QBO_VERIFIER_TOKEN = process.env.QBO_WEBHOOK_VERIFIER_TOKEN || 'test-token';

console.log('--- QuickBooks Webhook Test Script ---');
console.log(`Target: ${APP_URL}/api/v1/webhooks/quickbooks/notification`);
console.log(`Verifier Token: ${QBO_VERIFIER_TOKEN}`);

async function sendTestWebhook() {
    const payload = {
        eventNotifications: [
            {
                realmId: '4620816365261453250', // Replace with a real RealmID from your DB if needed
                dataChangeEvent: {
                    entities: [
                        {
                            name: 'Invoice',
                            id: '130',
                            operation: 'Create', // or Update
                            lastUpdated: new Date().toISOString()
                        }
                    ]
                }
            }
        ]
    };

    const payloadString = JSON.stringify(payload);
    
    // Generate Signature
    const hmac = crypto.createHmac('sha256', QBO_VERIFIER_TOKEN);
    hmac.update(payloadString);
    const signature = hmac.digest('base64');

    try {
        console.log('Sending webhook...');
        const response = await axios.post(
            `${APP_URL}/api/v1/webhooks/quickbooks/notification`, 
            payload,
            {
                headers: {
                    'intuit-signature': signature,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Success: ${response.status} - ${response.data}`);
    } catch (error: any) {
        console.error(`❌ Failed: ${error.response?.status || 'Unknown'} - ${JSON.stringify(error.response?.data || error.message)}`);
    }
}

sendTestWebhook();
