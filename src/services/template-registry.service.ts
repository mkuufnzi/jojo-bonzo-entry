import fs from 'fs';
import path from 'path';

export interface TemplateFeature {
    id: string;
    name: string;
    type: 'toggle' | 'input' | 'select' | 'group';
    defaultEnabled?: boolean;
    required?: boolean;
    description?: string;
    badge?: string;
    defaultValue?: string;
    options?: { label: string; value: string }[];
}

export interface SmartTemplateManifest {
    id: string;
    name: string;
    type: 'INVOICE' | 'RECEIPT' | 'QUOTE' | 'CREDIT_MEMO'; // Added Credit Memo
    description: string;
    version: string;
    thumbnailUrl?: string;
    features: TemplateFeature[];
    layoutOrder?: string[];
    viewPath?: string; // Internal: calculated path to index.ejs relative to views
}

class TemplateRegistryService {
    private templates: Map<string, SmartTemplateManifest> = new Map();
    private templatesDir: string;

    constructor() {
        // Resolve templates directory. 
        // In Prod: dist/views/templates
        // In Dev: src/views/templates
        // We'll try to detect based on __dirname, defaulting to standard pattern
        this.templatesDir = path.join(__dirname, '../views/templates');
        
        // Fallback for direct src reference if needed (e.g. ts-node)
        if (!fs.existsSync(this.templatesDir)) {
             this.templatesDir = path.join(process.cwd(), 'src/views/templates');
        }

        console.log(`[TemplateRegistry] Scanning for templates in: ${this.templatesDir}`);
        this.scanTemplates();
    }

    private scanTemplates() {
        if (!fs.existsSync(this.templatesDir)) return;

        // Recursive function to find manifest.json
        const walk = (dir: string) => {
            const list = fs.readdirSync(dir);
            list.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat && stat.isDirectory()) {
                    walk(filePath);
                } else if (file === 'manifest.json') {
                    this.loadManifest(filePath);
                }
            });
        };

        walk(this.templatesDir);
    }

    private loadManifest(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const manifest: SmartTemplateManifest = JSON.parse(content);
            
            // Calculate relative view path for Controller
            // e.g. "templates/invoice/classic/index"
            const dir = path.dirname(filePath);
            const relativeDir = path.relative(path.join(this.templatesDir, '../../views'), dir); // rel to views root
            // Normalized for Express (forward slashes)
            manifest.viewPath = relativeDir.split(path.sep).join('/') + '/index';

            this.register(manifest);
        } catch (err) {
            console.error(`[TemplateRegistry] Failed to load manifest at ${filePath}:`, err);
        }
    }

    register(manifest: SmartTemplateManifest) {
        if (this.templates.has(manifest.id)) {
            console.warn(`[TemplateRegistry] Template ${manifest.id} is already registered. Overwriting.`);
        }
        this.templates.set(manifest.id, manifest);
        console.log(`[TemplateRegistry] Registered: ${manifest.name} (${manifest.id})`);
    }

    getAll(): SmartTemplateManifest[] {
        return Array.from(this.templates.values());
    }

    getById(id: string): SmartTemplateManifest | undefined {
        return this.templates.get(id);
    }

    getFeaturesFor(templateId: string): TemplateFeature[] {
        const t = this.getById(templateId);
        return t ? t.features : [];
    }
}

export const templateRegistry = new TemplateRegistryService();
