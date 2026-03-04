const axios = require('axios');
const fs = require('fs');

async function test() {
    const payload = JSON.parse(fs.readFileSync('test_payload.json', 'utf8'));
    const url = 'https://n8n.automation-for-smes.com/webhook/ce76d8c1-5242-49c7-a350-02f55b7c2db4';
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'X-Webhook-Secret': 'dev-webhook-secret-change-in-production',
                'User-Agent': 'Floovioo-Engine/1.0'
            }
        });
        console.log('SUCCESS! Status:', response.status);
    } catch (err) {
        console.error('ERROR:', err.response?.status);
        console.error('RESPONSE DATA:', err.response?.data);
        console.error('MESSAGE:', err.message);
    }
}

test();
