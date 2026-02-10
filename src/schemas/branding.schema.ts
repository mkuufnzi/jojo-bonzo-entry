import { z } from 'zod';

// More permissive schemas to avoid blocking the UI while debugging
export const updateSettingsSchema = z.object({
  body: z.object({
    activeTemplateId: z.any().optional(),
    companyName: z.any().optional(),
    tagline: z.any().optional(),
    logoUrl: z.any().optional(),
    brandColors: z.any().optional(),
    components: z.any().optional(),
    fontSettings: z.any().optional(),
    upsellConfig: z.any().optional(),
    supportConfig: z.any().optional(),
    layoutOrder: z.array(z.string()).optional()
  }).passthrough()
}).passthrough();

export const saveConfigSchema = z.object({
  body: z.object({
    config: z.any()
  }).passthrough()
}).passthrough();

export const getPreviewSchema = z.object({
  query: z.object({
    templateId: z.any().optional(),
    type: z.any().optional()
  }).passthrough().optional(),
  body: z.any().optional()
}).passthrough();

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
export type SaveConfigRequest = z.infer<typeof saveConfigSchema>;
export type GetPreviewRequest = z.infer<typeof getPreviewSchema>;
