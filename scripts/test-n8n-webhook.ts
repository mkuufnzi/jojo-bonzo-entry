// Diagnostic script using native fetch (Node 18+)
async function performWebhookTest() {
    const url = 'https://n8n.automation-for-smes.com/webhook/ce78d8c1-5242-48c7-a350-02f55b7c2db4';
    
    const user = process.env.N8N_USER || 'admin'; 
    const pass = process.env.N8N_PASSWORD;

    console.log(`Testing URL: ${url}`);
    console.log(`Using Auth: ${user ? 'Yes' : 'No'}`);

    const headers = { 'Content-Type': 'application/json' };
    if (user && pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    }

    try {
        console.log('Sending request...');
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ test: true, source: 'floovioo-diagnostic-script-final' })
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log('Response Body:', text.substring(0, 1000));
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

performWebhookTest();
