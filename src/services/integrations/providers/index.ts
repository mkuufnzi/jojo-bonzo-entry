import { IERPProvider } from './types';

export class ProviderRegistry {
    private static providers: Record<string, any> = {};

    static register(name: string, providerClass: any) {
        this.providers[name] = providerClass;
    }

    static getProviderClass(name: string): any {
        // Handle aliases (e.g., zoho-crm -> zoho)
        if (name.startsWith('zoho')) return this.providers['zoho'];
        return this.providers[name];
    }

    static createInstance(name: string): IERPProvider {
        const ProviderClass = this.getProviderClass(name);
        if (!ProviderClass) {
            throw new Error(`Provider ${name} not found in registry`);
        }
        return new ProviderClass();
    }
}

// Auto-register core providers
import { ZohoProvider } from './zoho.provider';
import { QBOProvider } from './qbo.provider';
import { XeroProvider } from './xero.provider';

ProviderRegistry.register('zoho', ZohoProvider);
ProviderRegistry.register('quickbooks', QBOProvider);
ProviderRegistry.register('xero', XeroProvider);
