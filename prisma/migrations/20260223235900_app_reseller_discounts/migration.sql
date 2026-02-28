-- CreateTable
CREATE TABLE "public"."AppResellerDiscount" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountRate" DECIMAL(5,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppResellerDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppResellerDiscount_appId_userId_key" ON "public"."AppResellerDiscount"("appId", "userId");

-- CreateIndex
CREATE INDEX "AppResellerDiscount_userId_idx" ON "public"."AppResellerDiscount"("userId");

-- AddForeignKey
ALTER TABLE "public"."AppResellerDiscount" ADD CONSTRAINT "AppResellerDiscount_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppResellerDiscount" ADD CONSTRAINT "AppResellerDiscount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
