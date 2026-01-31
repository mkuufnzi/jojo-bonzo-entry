import { z } from 'zod';

export const PdfOptionsSchema = z.object({
  format: z.enum(['Letter', 'Legal', 'Tabloid', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']).optional().default('A4'),
  landscape: z.boolean().optional().default(false),
  printBackground: z.boolean().optional().default(true),
  scale: z.number().min(0.1).max(2.0).optional().default(1.0),
  margin: z.object({
    top: z.string().optional().default('1cm'),
    right: z.string().optional().default('1cm'),
    bottom: z.string().optional().default('1cm'),
    left: z.string().optional().default('1cm'),
  }).optional().default({
    top: '1cm',
    right: '1cm',
    bottom: '1cm',
    left: '1cm'
  }),
  displayHeaderFooter: z.boolean().optional().default(false),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  waitForNetworkIdle: z.boolean().optional().default(true),
  timeout: z.number().min(1000).max(60000).optional().default(30000),
  fullPage: z.boolean().optional().default(false),
  removeSelectors: z.string().optional(),
});

export const AuthSchema = z.object({
  username: z.string(),
  password: z.string(),
}).optional();

export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
}).array().optional();

export const ConvertPdfSchema = z.object({
  source: z.object({
    type: z.enum(['url', 'html']),
    content: z.string().min(1),
  }),
  options: PdfOptionsSchema.optional(),
  auth: AuthSchema,
  cookies: CookieSchema,
});

export type ConvertPdfRequest = z.infer<typeof ConvertPdfSchema>;
