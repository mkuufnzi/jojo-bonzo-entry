
import axios from 'axios';

async function testProfileSave() {
    const url = 'http://localhost:3000/onboarding/api/profile';
    const payload = {
        name: 'Test Business',
        sector: 'technology',
        niche: 'B2B',
        slogan: 'Test Slogan',
        about: 'Test About'
    };

    try {
        console.log('Testing with JSON payload:', payload);
        const res = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'sessionId=s%3A7E3-X_... (Replace with real session if needed)'
            }
        });
        console.log('Success:', res.data);
    } catch (e: any) {
        console.log('Status:', e.response?.status);
        console.log('Error Data:', e.response?.data);
    }
}

// Note: This needs a valid session cookie to pass requireAuth
console.log('Manual test required or run with valid sessionId');
