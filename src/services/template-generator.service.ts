import prisma from '../lib/prisma';
import { aiService } from './ai.service';
import { logger } from '../lib/logger';

export class TemplateGeneratorService {

    /**
     * Generates a template using the Real n8n AI Service.
     * Uses the 'generate' action with a specialized system prompt.
     */
    async generateTemplate(userId: string, userPrompt: string, type: string) {
        
        logger.info({ userId, type }, '🎨 Initiating AI Template Design');

        // 1. Construct the System Prompt
        // We instruct the AI to act as a Frontend Expert and output ONLY valid HTML/EJS.
        const systemPrompt = `
           ACT AS: Expert Frontend Developer & UI Designer.
           TASK: Create a single-file HTML/CSS template for a business document.
           DOCUMENT TYPE: ${type.toUpperCase()}
           STYLE: ${userPrompt}
           
           REQUIREMENTS:
           1. Use valid HTML5 and inline CSS (or <style> block). 
           2. Make it look PREMIUM, like a Canva design.
           3. YOU MUST USE THESE PLACEHOLDERS for dynamic data:
              - {{businessName}}
              - {{logoUrl}} (Use <img> tag, handle empty if needed)
              - {{addressHtml}}
              - {{contactHtml}}
              - {{customerName}}
              - {{customerAddress}}
              - {{docNumber}}
              - {{date}}
              - {{dueDate}}
              - {{items_table}} (This is critical - place this where the list of items should go)
              - {{subtotal}}
              - {{tax}}
              - {{total}}
              - {{currency}}
              - {{primaryColor}} (Use this for main accents)
              - {{secondaryColor}}
            
            4. Do NOT output Markdown. Do NOT output \`\`\`html blocks. Output RAW HTML only.
            5. Ensure the layout is responsive but optimized for PDF generation (A4 width).
        `;

        // 2. Call the AI Service
        // We use the 'generate' action which corresponds to the main generation webhook.
        // We pass the prompt constructed above.
        const result = await aiService.generateHtmlDocument(
            systemPrompt, 
            userId, 
            type, 
            {
                action: 'generate', // Use the 'generate' endpoint
                tone: 'professional',
                appId: 'template-generator'
            }
        );

        if (!result.html) {
            throw new Error('AI returned no HTML content');
        }

        // 3. Save to UserTemplate
        const user = await (prisma as any).user.findUnique({ where: { id: userId } });
        if (!user?.businessId) throw new Error('User has no business');

        const saved = await (prisma as any).userTemplate.create({
            data: {
                businessId: user.businessId,
                name: `${userPrompt.substring(0, 20)}... (${type})`,
                documentType: type,
                htmlContent: result.html, // The AI's generated HTML
                source: 'ai_generated',
                status: 'active'
            }
        });

        return saved;
    }

    // Mock removed - we are using Real AI now.
    private _getMockedAiOutput(vibe: string, type: string) { return ''; }
}




export const templateGenerator = new TemplateGeneratorService();
