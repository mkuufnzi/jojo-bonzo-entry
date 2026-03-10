import { webhookService } from '../src/services/webhook.service';
import { ServiceSlugs } from '../src/types/service.types';

async function testWebhook() {
    try {
        console.log('Testing transactional-branding/apply_branding...');
        const url = await webhookService.getEndpoint(ServiceSlugs.TRANSACTIONAL_BRANDING, 'apply_branding');
        console.log('URL found:', url);
    } catch (e: any) {
        console.error('FAILED:', e.message);
    }

    try {
        console.log('Testing transactional-branding/default...');
        const url = await webhookService.getEndpoint(ServiceSlugs.TRANSACTIONAL_BRANDING, 'default');
        console.log('URL found:', url);
    } catch (e: any) {
        console.error('FAILED:', e.message);
    }
}

testWebhook();
