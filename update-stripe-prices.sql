-- Update Pro plan with Stripe Price ID
UPDATE "Plan" 
SET "stripePriceId" = 'price_1SjRbVCx25d8iv4n38sNUeqA'
WHERE name = 'Pro' OR id = '28374638-16f4-49eb-8f02-556ab439a334';

-- Update Enterprise plan with Stripe Price ID  
-- Replace 'price_XXXXX' with the actual Enterprise price ID from your Stripe dashboard
UPDATE "Plan"
SET "stripePriceId" = 'price_XXXXX'  
WHERE name = 'Enterprise' OR id = 'a391f654-6447-49c1-a7fd-a82f94af6929';

-- Verify the updates
SELECT id, name, price, "stripePriceId" FROM "Plan";
