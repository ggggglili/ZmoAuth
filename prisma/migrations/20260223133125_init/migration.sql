-- CreateEnum
CREATE TYPE "public"."PlatformRole" AS ENUM ('SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "public"."AppMemberRole" AS ENUM ('OWNER', 'RESELLER', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."InviteIssuerType" AS ENUM ('SUPER_ADMIN', 'RESELLER');

-- CreateEnum
CREATE TYPE "public"."PointTransactionType" AS ENUM ('RECHARGE', 'PURCHASE', 'REFUND', 'ADJUST', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."PlatformRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuerType" "public"."InviteIssuerType" NOT NULL,
    "issuerUserId" TEXT NOT NULL,
    "appId" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 10,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."App" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weekPoints" INTEGER NOT NULL,
    "monthPoints" INTEGER NOT NULL,
    "yearPoints" INTEGER NOT NULL,
    "lifetimePoints" INTEGER NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppVersion" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "releaseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppMember" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."AppMemberRole" NOT NULL,
    "parentResellerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PointTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."PointTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "operatorId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppUpdatePolicy" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "offlineTtlSeconds" INTEGER NOT NULL DEFAULT 900,
    "forceUpdateMinVersion" TEXT,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUpdatePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "public"."Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "public"."Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_expiresAt_idx" ON "public"."Invite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersion_appId_version_key" ON "public"."AppVersion"("appId", "version");

-- CreateIndex
CREATE INDEX "AppMember_appId_parentResellerUserId_idx" ON "public"."AppMember"("appId", "parentResellerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AppMember_appId_userId_key" ON "public"."AppMember"("appId", "userId");

-- CreateIndex
CREATE INDEX "PointTransaction_userId_createdAt_idx" ON "public"."PointTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUpdatePolicy_appId_key" ON "public"."AppUpdatePolicy"("appId");

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invite" ADD CONSTRAINT "Invite_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppVersion" ADD CONSTRAINT "AppVersion_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppMember" ADD CONSTRAINT "AppMember_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppMember" ADD CONSTRAINT "AppMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppUpdatePolicy" ADD CONSTRAINT "AppUpdatePolicy_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
