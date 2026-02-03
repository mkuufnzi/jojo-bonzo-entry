import prisma from '../lib/prisma';
import { SmartInvoice, LineItem } from '../models/smart-documents/smart-invoice.model';
import { SmartDocumentTheme, SmartDocumentConfig } from '../models/smart-documents/smart-document.abstract';

export class SmartDocumentService {
    
    /**
     * Creates and persists a new Smart Invoice.
     * @param userId The ID of the user creating the document.
     * @param data The invoice data (items, etc).
     * @param theme The visual theme to freeze.
     * @param config The feature toggles to freeze.
     */
    static async createInvoice(
        userId: string,
        data: { 
            items: LineItem[], 
            // Add other data mappings as needed
            documentNumber?: string 
        },
        theme: SmartDocumentTheme,
        config: SmartDocumentConfig,
        metadata: Record<string, any> = {}
    ): Promise<SmartInvoice> {
        
        // 1. Instantiate the Domain Model to validate and calculate
        // We use a temporary ID or placeholder since we haven't saved yet
        const tempId = 'pending';
        const invoice = new SmartInvoice(
            tempId,
            theme,
            config,
            data.items || [],
            [], // Recommendations (could be passed in or calculated here)
            [], // Tutorials
            [], // Nurture messages
            metadata
        );

        // 2. Persist to Database
        const doc = await prisma.smartDocument.create({
            data: {
                userId,
                type: 'INVOICE',
                documentNumber: data.documentNumber || `INV-${Date.now()}`,
                status: 'GENERATED',
                data: invoice.toJSON().data, // Store the calculated data structure
                theme: theme as any, // Cast to JSON
                config: config as any, // Cast to JSON
                metadata: metadata as any
            }
        });

        // 3. Update the Domain Model with the real ID
        invoice.id = doc.id;
        
        return invoice;
    }

    /**
     * Retrieves a Smart Document by ID and re-hydrates it into a Domain Model.
     */
    static async getById(id: string): Promise<SmartInvoice | null> {
        const doc = await prisma.smartDocument.findUnique({
            where: { id }
        });

        if (!doc) return null;

        if (doc.type === 'INVOICE') {
            const data = doc.data as any; // Typed as Json in Prisma
            const theme = doc.theme as unknown as SmartDocumentTheme;
            const config = doc.config as unknown as SmartDocumentConfig;
            const metadata = doc.metadata as Record<string, any> || {};

            return new SmartInvoice(
                doc.id,
                theme,
                config,
                data.items || [],
                data.recommendations || [],
                data.tutorials || [],
                data.nurtureMessages || [],
                metadata
            );
        }

        // Support other types later
        return null;
    }
}

export const smartDocumentService = new SmartDocumentService();
