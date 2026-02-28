"use client"

import { Activity, CreditCard, KeyRound, TrendingUp, Wallet } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

type DashboardMembership = {
  appId: string
  appName: string
  role: string
}

type DashboardOverviewClientProps = {
  walletBalance: number
  effectiveStatusCount: {
    ACTIVE: number
    EXPIRED: number
    REVOKED: number
  }
  expiringSoon: number
  uniqueApps: number
  memberships: DashboardMembership[]
}

const healthChartConfig = {
  count: {
    label: "Count",
    color: "var(--chart-2)",
  },
  label: {
    color: "var(--background)",
  },
} satisfies ChartConfig

function getMembershipRoleLabel(role: string) {
  switch (role) {
    case "RESELLER":
      return "授权商"
    case "OWNER":
      return "应用所有者"
    default:
      return role
  }
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

export function DashboardOverviewClient({
  walletBalance,
  effectiveStatusCount,
  expiringSoon,
  uniqueApps,
  memberships,
}: DashboardOverviewClientProps) {
  const totalLicenses =
    effectiveStatusCount.ACTIVE +
    effectiveStatusCount.EXPIRED +
    effectiveStatusCount.REVOKED

  const activePercent = toPercent(effectiveStatusCount.ACTIVE, totalLicenses)
  const expiredPercent = toPercent(effectiveStatusCount.EXPIRED, totalLicenses)
  const revokedPercent = toPercent(effectiveStatusCount.REVOKED, totalLicenses)

  const healthChartData = [
    { status: "有效授权", count: effectiveStatusCount.ACTIVE },
    { status: "已过期", count: effectiveStatusCount.EXPIRED },
    { status: "已停用", count: effectiveStatusCount.REVOKED },
  ]

  const advancedMemberships = memberships.filter(
    (membership) => membership.role === "OWNER" || membership.role === "RESELLER"
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">积分余额</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{walletBalance}</div>
            <p className="text-xs text-muted-foreground">当前可用积分</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">有效授权数</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{effectiveStatusCount.ACTIVE}</div>
            <p className="text-xs text-muted-foreground">7 天内到期 {expiringSoon}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已购应用数</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueApps}</div>
            <p className="text-xs text-muted-foreground">
              过期 {effectiveStatusCount.EXPIRED} / 停用 {effectiveStatusCount.REVOKED}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总授权数量</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLicenses}</div>
            <p className="text-xs text-muted-foreground">当前用户授权总数</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="border-border/70 shadow-none lg:col-span-7">
          <CardHeader>
            <CardTitle>授权健康度</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              id="dashboard-health-chart"
              config={healthChartConfig}
              className="h-[220px] min-h-[220px] w-full min-w-0"
            >
              <BarChart accessibilityLayer data={healthChartData} layout="vertical" margin={{ right: 16 }}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="status" type="category" tickLine={false} tickMargin={10} axisLine={false} hide />
                <XAxis dataKey="count" type="number" hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                  <LabelList
                    dataKey="status"
                    position="insideLeft"
                    offset={8}
                    className="fill-(--color-label)"
                    fontSize={12}
                  />
                  <LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={12} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
            <div className="flex items-center gap-2 font-medium leading-none">
              活跃授权占比 {activePercent}% <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground leading-none">
              过期占比 {expiredPercent}%，停用占比 {revokedPercent}%
            </div>
          </CardFooter>
        </Card>

        <Card className="border-border/70 shadow-none lg:col-span-5">
          <CardHeader>
            <CardTitle>高级成员关系</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {advancedMemberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无高级成员关系</p>
            ) : null}
            {advancedMemberships.slice(0, 5).map((membership) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                key={`${membership.appId}:${membership.role}`}
              >
                <p className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-none">
                  {membership.appName}
                </p>
                <span className="border-border/70 bg-muted text-muted-foreground whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium">
                  {getMembershipRoleLabel(membership.role)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="hidden border-border/70 shadow-none lg:block">
        <CardContent className="p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-14 rounded-md bg-muted/80 animate-[pulse_2.4s_ease-in-out_infinite]" />
            <Skeleton className="h-14 rounded-md bg-muted/80 [animation-delay:180ms] animate-[pulse_2.4s_ease-in-out_infinite]" />
            <Skeleton className="h-14 rounded-md bg-muted/80 [animation-delay:360ms] animate-[pulse_2.4s_ease-in-out_infinite]" />
            <Skeleton className="h-14 rounded-md bg-muted/80 [animation-delay:540ms] animate-[pulse_2.4s_ease-in-out_infinite]" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
