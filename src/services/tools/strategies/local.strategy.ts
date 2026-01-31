import { Service } from '@prisma/client';
import { ToolStrategy, ToolContext } from '../tool.interface';
import { pdfService } from '../../pdf.service';
import { AppError } from '../../../lib/AppError';

type LocalHandler = (payload: any, context?: ToolContext) => Promise<any>;

export class LocalStrategy implements ToolStrategy {
    private handlers: Record<string, LocalHandler> = {};

    constructor() {
        this.registerHandlers();
    }

    private registerHandlers() {
        // Register existing local services here using their slugs
        this.handlers['html-to-pdf'] = async (payload, context) => {
            // Adapt payload to what PdfService expects
            // PdfService.generatePdf takes ConvertPdfRequest
            // We might need to validate payload here or trust the caller/schema
            return pdfService.generatePdf({
                source: {
                    type: payload.url ? 'url' : 'html',
                    content: payload.url || payload.html
                },
                options: {
                    format: payload.format || 'A4',
                    landscape: payload.landscape,
                    printBackground: true
                } as any
            });
        };
    }

    async execute(service: Service, payload: any, context?: ToolContext): Promise<any> {
        const handler = this.handlers[service.slug];
        if (!handler) {
            throw new AppError(`No local handler implemented for service: ${service.slug}`, 501);
        }
        return handler(payload, context);
    }
}
