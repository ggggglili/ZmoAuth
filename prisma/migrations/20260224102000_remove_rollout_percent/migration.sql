-- Drop deprecated rollout field from update policy.
ALTER TABLE "public"."AppUpdatePolicy"
DROP COLUMN IF EXISTS "rolloutPercent";
