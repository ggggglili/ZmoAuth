ALTER TABLE "public"."App"
ADD COLUMN "previousSdkSecret" TEXT,
ADD COLUMN "previousSdkSecretExpiresAt" TIMESTAMP(3),
ADD COLUMN "previousUpdateSignSecret" TEXT,
ADD COLUMN "previousUpdateSignSecretExpiresAt" TIMESTAMP(3);
