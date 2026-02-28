-- CreateEnum
CREATE TYPE "public"."PlanType" AS ENUM ('WEEK', 'MONTH', 'YEAR', 'LIFETIME');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."BindingTargetType" AS ENUM ('DOMAIN', 'IP_PORT');

-- AlterTable
ALTER TABLE "public"."App"
ADD COLUMN "sdkKey" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
ADD COLUMN "sdkSecret" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text || random()::text),
ADD COLUMN "updateSignSecret" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text || random()::text);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "planType" "public"."PlanType" NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "discountRate" DECIMAL(5,4) NOT NULL,
    "finalPoints" INTEGER NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."License" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "status" "public"."LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LicenseBinding" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "targetType" "public"."BindingTargetType" NOT NULL,
    "bindTarget" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_sdkKey_key" ON "public"."App"("sdkKey");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "public"."Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_appId_createdAt_idx" ON "public"."Order"("appId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "License_orderId_key" ON "public"."License"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "public"."License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_userId_createdAt_idx" ON "public"."License"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "License_appId_createdAt_idx" ON "public"."License"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenseBinding_licenseId_isActive_idx" ON "public"."LicenseBinding"("licenseId", "isActive");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "public"."AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."License" ADD CONSTRAINT "License_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."License" ADD CONSTRAINT "License_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LicenseBinding" ADD CONSTRAINT "LicenseBinding_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "public"."License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
