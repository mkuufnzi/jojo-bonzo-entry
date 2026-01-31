import { z } from 'zod';

export const createAppSchema = z.object({
    name: z.string().min(1, 'App name is required'),
    services: z.union([
        z.string(),
        z.array(z.string())
    ]).optional()
});

export const regenerateKeySchema = z.object({
    appId: z.string().min(1, 'App ID is required')
});

export const toggleServiceSchema = z.object({
    appId: z.string().min(1, 'App ID is required'),
    serviceId: z.string().optional(),
    serviceSlug: z.string().optional(),
    enabled: z.union([z.boolean(), z.string().transform(val => val === 'true')])
}).refine(data => data.serviceId || data.serviceSlug, {
    message: "Either serviceId or serviceSlug must be provided",
    path: ["serviceId"]
});

export const toggleActiveSchema = z.object({
    appId: z.string().min(1, 'App ID is required'),
    isActive: z.union([z.boolean(), z.string().transform(val => val === 'true')])
});

export const deleteAppSchema = z.object({
    appId: z.string().min(1, 'App ID is required')
});
