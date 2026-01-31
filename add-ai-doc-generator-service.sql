-- Add AI Document Generator Service
INSERT INTO "Service" (id, name, slug, description, "pricePerRequest", "executionType", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(), 
  'AI Document Generator', 
  'ai-doc-generator', 
  'Generate professional documents from text prompts using AI', 
  0.0, 
  'webhook_async', 
  true, 
  NOW(), 
  NOW()
) ON CONFLICT (name) DO NOTHING;

-- Update Plan Features to include the new service
-- Pro Plan
UPDATE "Plan" 
SET features = '["html-to-pdf", "docx-to-pdf", "AI Content Generation", "ai-doc-generator"]'
WHERE name = 'Pro';

-- Enterprise Plan
UPDATE "Plan" 
SET features = '["html-to-pdf", "docx-to-pdf", "AI Content Generation", "Advanced Analytics", "ai-doc-generator"]'
WHERE name = 'Enterprise';

-- Verify
SELECT id, name, slug FROM "Service" WHERE slug = 'ai-doc-generator';
SELECT name, features FROM "Plan";
