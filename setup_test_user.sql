-- 1. Get User ID and Plan ID
DO $$
DECLARE
    v_user_id TEXT;
    v_plan_id TEXT;
BEGIN
    SELECT id INTO v_user_id FROM "User" WHERE email = 'bwj.afs.tools.test@gmail.com';
    SELECT id INTO v_plan_id FROM "Plan" WHERE name = 'Pro';

    -- 2. Upsert Subscription
    INSERT INTO "Subscription" ("id", "userId", "planId", "status", "startDate", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), v_user_id, v_plan_id, 'active', NOW(), NOW(), NOW())
    ON CONFLICT ("userId") 
    DO UPDATE SET "planId" = v_plan_id, "status" = 'active';

    -- 3. Make Admin
    UPDATE "User" SET "isAdmin" = true, "role" = 'ROOT' WHERE id = v_user_id;
END $$;
