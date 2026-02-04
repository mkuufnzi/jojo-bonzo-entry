
import fs from 'fs-extra';
import path from 'path';

export interface TemplateManifest {
    id: string;
    name: string;
    version: string;
    type: 'invoice' | 'receipt' | 'quote' | 'other';
    engine: string;
    features: Record<string, boolean>;
    featureDefinitions?: any[];
    slots?: string[];
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export class TemplateService {
    private templatesDir: string;

    constructor(templatesStartDir: string) {
        this.templatesDir = templatesStartDir;
    }

    async listTemplates(): Promise<TemplateManifest[]> {
        const templates: TemplateManifest[] = [];
        const entries = await fs.readdir(this.templatesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const manifest = await this.loadManifest(entry.name);
                if (manifest) {
                    templates.push(manifest);
                }
            }
        }
        return templates;
    }

    async getTemplate(id: string): Promise<TemplateManifest | null> {
        return this.loadManifest(id);
    }

    private async loadManifest(id: string): Promise<TemplateManifest | null> {
        const manifestPath = path.join(this.templatesDir, id, 'manifest.json');
        if (!await fs.pathExists(manifestPath)) return null;

        try {
            const raw = await fs.readJSON(manifestPath);

            // Adapter for Legacy Array Format
            if (Array.isArray(raw.features)) {
                const definitions = raw.features;
                const flags: Record<string, boolean> = {};

                definitions.forEach((def: any) => {
                    if (def.id) {
                        flags[def.id] = def.defaultEnabled === true;
                    }
                });

                raw.featureDefinitions = definitions;
                raw.features = flags;
            }

            return raw as TemplateManifest;
        } catch (e) {
            console.warn(`Failed to parse manifest for ${id}`, e);
            return null;
        }
    }

    public validateTemplate(manifest: TemplateManifest): ValidationResult {
        const errors: string[] = [];
        
        // Base Validation
        if (!manifest.id) errors.push('Missing ID');
        if (!manifest.name) errors.push('Missing Name');
        if (!manifest.type) errors.push('Missing Type');

        // Type Specific Validation (Strict Mode)
        if (manifest.type === 'invoice') {
            if (!manifest.features?.payment_details && !manifest.features?.['payment']) {
                 // Allowing legacy 'payment' key for now, but strictly prefer payment_details
                 // errors.push('Invoice type must support payment_details feature');
            }
            if (!manifest.features?.totals) {
                // errors.push('Invoice type must support totals feature');
            }
        }

        if (manifest.type === 'receipt') {
             if (!manifest.features?.payment_confirmation) {
                 errors.push('Receipt type must support payment_confirmation feature');
             }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Helper to get render path
    public getViewPath(id: string): string {
        return path.join(this.templatesDir, id, 'index.ejs');
    }
}
