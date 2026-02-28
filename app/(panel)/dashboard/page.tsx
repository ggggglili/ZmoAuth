import { redirect } from "next/navigation"
import { DashboardOverviewClient } from "@/components/dashboard/dashboard-overview-client"
import { getAuthSession } from "@/lib/auth/server"
import { prisma } from "@/lib/db/prisma"
import { getUserAppMemberships } from "@/lib/services/app.service"

export default async function DashboardPage() {
  const session = await getAuthSession()
  if (!session?.user) redirect("/login")

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [wallet, memberships, licenses] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId: session.user.id },
      select: { pointBalance: true },
    }),
    getUserAppMemberships({
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    }),
    prisma.license.findMany({
      where: { userId: session.user.id },
      select: {
        appId: true,
        status: true,
        expiresAt: true,
      },
    }),
  ])

  const effectiveStatusCount = {
    ACTIVE: 0,
    EXPIRED: 0,
    REVOKED: 0,
  }

  let expiringSoon = 0
  for (const license of licenses) {
    const effectiveStatus =
      license.status === "REVOKED"
        ? "REVOKED"
        : license.expiresAt && license.expiresAt.getTime() <= now.getTime()
          ? "EXPIRED"
          : "ACTIVE"

    effectiveStatusCount[effectiveStatus] += 1

    if (
      effectiveStatus === "ACTIVE" &&
      license.expiresAt &&
      license.expiresAt.getTime() > now.getTime() &&
      license.expiresAt.getTime() <= in7Days.getTime()
    ) {
      expiringSoon += 1
    }
  }

  const uniqueApps = new Set(licenses.map((item) => item.appId)).size

  return (
    <DashboardOverviewClient
      walletBalance={wallet?.pointBalance ?? 0}
      effectiveStatusCount={effectiveStatusCount}
      expiringSoon={expiringSoon}
      uniqueApps={uniqueApps}
      memberships={memberships}
    />
  )
}
