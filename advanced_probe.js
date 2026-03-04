const axios = require('axios');

async function testUrl() {
    const url = 'https://n8n.automation-for-smes.com/webhook/ce76d8c1-5242-49c7-a350-02f55b7c2db4';
    
    async function tryRequest(name, headers, payload = {test:1}) {
        try {
            console.log(`[${name}] Sending...`);
            const response = await axios.post(url, payload, { headers });
            console.log(`[${name}] SUCCESS`, response.status);
        } catch (e) {
            console.error(`[${name}] ERROR`, e.response?.status, JSON.stringify(e.response?.data), e.message);
        }
    }

    await tryRequest('No Headers', {});
    await tryRequest('X-Webhook-Secret', { 'X-Webhook-Secret': 'dev-webhook-secret-change-in-production' });
    await tryRequest('Bearer Auth', { 'Authorization': 'Bearer dev-webhook-secret-change-in-production' });
    await tryRequest('Basic Auth', { 'Authorization': 'Basic ' + Buffer.from('floovioo:dev-webhook-secret-change-in-production').toString('base64') });

    // Test the big payload
    const fs = require('fs');
    if (fs.existsSync('test_payload.json')) {
        const bigPayload = JSON.parse(fs.readFileSync('test_payload.json', 'utf8'));
        await tryRequest('Big Payload + X-Webhook-Secret', { 'X-Webhook-Secret': 'dev-webhook-secret-change-in-production' }, bigPayload);
        await tryRequest('Big Payload + No Headers', {}, bigPayload);
    }
}

testUrl().then(()=>console.log('done'));
