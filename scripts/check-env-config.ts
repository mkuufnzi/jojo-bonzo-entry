import { config } from '../src/config/env';

console.log('--- Configuration Diagnostic ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('N8N_USER:', config.N8N_USER);
console.log('N8N_PASSWORD (present):', !!config.N8N_PASSWORD);
console.log('Auth Logic Condition:', !!(config.N8N_USER && config.N8N_PASSWORD));

if (config.N8N_USER && config.N8N_PASSWORD) {
    const auth = Buffer.from(`${config.N8N_USER}:${config.N8N_PASSWORD}`).toString('base64');
    console.log('Sample Auth Header Value: Basic ', auth.substring(0, 5) + '...');
}
