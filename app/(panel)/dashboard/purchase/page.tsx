"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

type PlanType = "WEEK" | "MONTH" | "YEAR" | "LIFETIME";

interface PurchasableAppItem {
  id: string;
  name: string;
  description: string | null;
  basePoints: {
    week: number;
    month: number;
    year: number;
    lifetime: number;
  };
  discountRate: number;
  finalPoints: {
    week: number;
    month: number;
    year: number;
    lifetime: number;
  };
  userRoleInApp: "OWNER" | "RESELLER" | "MEMBER" | "NONE";
}

interface WalletData {
  userId: string;
  pointBalance: number;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

const PLAN_OPTIONS: Array<{
  planType: PlanType;
  label: string;
  key: keyof PurchasableAppItem["basePoints"];
}> = [
  { planType: "WEEK", label: "周卡", key: "week" },
  { planType: "MONTH", label: "月卡", key: "month" },
  { planType: "YEAR", label: "年卡", key: "year" },
  { planType: "LIFETIME", label: "永久卡", key: "lifetime" },
];

const POINT_FORMATTER = new Intl.NumberFormat("zh-CN");

function formatPoints(value: number) {
  return POINT_FORMATTER.format(value);
}

function getRoleLabel(role: PurchasableAppItem["userRoleInApp"]) {
  switch (role) {
    case "OWNER":
      return "所有者";
    case "RESELLER":
      return "授权商";
    case "MEMBER":
      return "普通用户";
    default:
      return "普通用户";
  }
}

function getPurchaseErrorMessage(body: ApiErrorBody | null | undefined) {
  switch (body?.code) {
    case "INSUFFICIENT_POINTS":
      return "积分不足，请先前往钱包确认余额或联系上级充值。";
    case "CONFLICT":
      return "订单状态异常，请刷新页面后重试。";
    case "FORBIDDEN":
      return "你没有权限执行该操作。";
    case "NOT_FOUND":
      return "目标应用或订单不存在。";
    case "VALIDATION_ERROR":
      return "请求参数不合法，请检查后重试。";
    default:
      return body?.message ?? "购买失败，请稍后重试。";
  }
}

export default function DashboardPurchasePage() {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [apps, setApps] = useState<PurchasableAppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedPlanType, setSelectedPlanType] = useState<PlanType>("MONTH");
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [successLicenseKey, setSuccessLicenseKey] = useState<string | null>(null);

  const sortedApps = useMemo(
    () => [...apps].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [apps]
  );

  const selectedApp = useMemo(
    () => sortedApps.find((item) => item.id === selectedAppId) ?? null,
    [selectedAppId, sortedApps]
  );

  const selectedPlan = useMemo(
    () => PLAN_OPTIONS.find((item) => item.planType === selectedPlanType) ?? PLAN_OPTIONS[0],
    [selectedPlanType]
  );

  const selectedBasePoints = selectedApp ? selectedApp.basePoints[selectedPlan.key] : 0;
  const selectedFinalPoints = selectedApp ? selectedApp.finalPoints[selectedPlan.key] : 0;
  const selectedSavings = Math.max(selectedBasePoints - selectedFinalPoints, 0);
  const selectedProcessingKey = selectedApp ? `${selectedApp.id}:${selectedPlanType}` : null;
  const isProcessingSelected = Boolean(selectedProcessingKey && processingKey === selectedProcessingKey);

  const walletBalance = wallet?.pointBalance ?? 0;
  const remainAfterPurchase = walletBalance - selectedFinalPoints;
  const shortfallPoints = Math.max(selectedFinalPoints - walletBalance, 0);
  const isInsufficientBalance = Boolean(selectedApp) && shortfallPoints > 0;

  const loadData = useCallback(async () => {
    const [appsRes, walletRes] = await Promise.all([fetch("/api/apps"), fetch("/api/wallet")]);

    const appsBody = (await appsRes.json()) as { items?: PurchasableAppItem[] } & ApiErrorBody;
    if (!appsRes.ok) {
      throw new Error(appsBody.message ?? "加载可购买应用失败");
    }

    const walletBody = (await walletRes.json()) as { wallet?: WalletData | null } & ApiErrorBody;
    if (!walletRes.ok) {
      throw new Error(walletBody.message ?? "加载钱包数据失败");
    }

    const nextApps = appsBody.items ?? [];
    setApps(nextApps);
    setWallet(walletBody.wallet ?? null);
    setSelectedAppId((prev) => {
      if (nextApps.length === 0) return null;
      if (prev && nextApps.some((item) => item.id === prev)) return prev;
      return nextApps[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadData();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载数据失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function onBuy(app: PurchasableAppItem, planType: PlanType) {
    const planOption = PLAN_OPTIONS.find((item) => item.planType === planType);
    const planKey = planOption?.key ?? "month";
    const requiredPoints = app.finalPoints[planKey];
    if ((wallet?.pointBalance ?? 0) < requiredPoints) {
      setError("积分余额不足，请先充值后再购买。");
      return;
    }

    const key = `${app.id}:${planType}`;
    setProcessingKey(key);
    setError(null);
    setSuccessNotice(null);
    setSuccessText(null);
    setSuccessLicenseKey(null);

    try {
      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: app.id, planType }),
      });
      const createBody = (await createRes.json()) as {
        order?: { id: string; finalPoints: number };
      } & ApiErrorBody;
      if (!createRes.ok || !createBody.order?.id) {
        setError(getPurchaseErrorMessage(createBody));
        return;
      }

      const payRes = await fetch(`/api/orders/${createBody.order.id}/pay`, { method: "POST" });
      const payBody = (await payRes.json()) as {
        license?: { licenseKey: string };
      } & ApiErrorBody;
      if (!payRes.ok) {
        setError(getPurchaseErrorMessage(payBody));
        return;
      }

      const planLabel = PLAN_OPTIONS.find((item) => item.planType === planType)?.label ?? "";
      const licenseKey = payBody.license?.licenseKey ?? null;
      setSuccessText(`购买成功：${app.name} ${planLabel}`);
      setSuccessNotice(`购买成功：${app.name} ${planLabel}`);
      setSuccessLicenseKey(licenseKey);

      await loadData();
    } catch {
      setError("购买过程中发生异常，请稍后重试。");
    } finally {
      setProcessingKey(null);
    }
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="购买失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
      />
      <TopCenterAlert
        open={Boolean(successNotice)}
        title="购买成功"
        description={successNotice ?? undefined}
        variant="success"
        onClose={() => setSuccessNotice(null)}
      />

      <div className="relative space-y-4">
      {loading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      ) : null}
      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
          <Card className="h-full border-border/70 shadow-none">
            <CardHeader className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-52" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`purchase-app-tab-loading-${index}`} className="h-8 w-20" />
                ))}
              </div>
              <Skeleton className="h-4 w-2/3" />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`purchase-plan-loading-${index}`} className="h-28 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full border-border/70 shadow-none">
            <CardHeader>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={`purchase-checkout-loading-${index}`} className="h-4 w-full" />
              ))}
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && sortedApps.length === 0 ? (
        <Card className="border-border/70 shadow-none">
          <CardContent className="py-8 text-sm text-muted-foreground">当前没有可购买的应用。</CardContent>
        </Card>
      ) : null}

      {!loading && sortedApps.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
          <Card className="h-full border-border/70 shadow-none">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle>请选择应用和套餐</CardTitle>
                <span className="border-border/70 bg-muted text-muted-foreground whitespace-nowrap rounded-md border px-2 py-1 text-xs">
                  身份：{selectedApp ? getRoleLabel(selectedApp.userRoleInApp) : "-"}
                </span>
              </div>
              <CardDescription>先选择应用，再选择对应套餐。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs
                className="w-full"
                value={selectedAppId ?? ""}
                onValueChange={(value) => {
                  setSelectedAppId(value);
                }}
              >
                <TabsList className="h-auto w-full flex-wrap justify-start rounded-lg p-1">
                  {sortedApps.map((app) => (
                    <TabsTrigger key={app.id} value={app.id} className="px-3 py-1.5">
                      {app.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {sortedApps.map((app) => (
                  <TabsContent key={app.id} value={app.id} className="space-y-3">
                    <p className="text-sm text-muted-foreground">{app.description || "暂无应用简介"}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
                      {PLAN_OPTIONS.map((plan) => {
                        const basePoints = app.basePoints[plan.key];
                        const finalPoints = app.finalPoints[plan.key];
                        const isSelectedPlan = selectedAppId === app.id && selectedPlanType === plan.planType;

                        return (
                          <button
                            type="button"
                            key={plan.planType}
                            className={`rounded-md border border-border/70 bg-background p-3 text-left transition-colors ${
                              isSelectedPlan ? "border-primary/60 bg-primary/5" : "hover:border-border/70 hover:bg-accent/50"
                            }`}
                            onClick={() => {
                              setSelectedAppId(app.id);
                              setSelectedPlanType(plan.planType);
                            }}
                          >
                            <p className="text-sm font-medium">{plan.label}</p>
                            <div className="mt-1 flex items-end gap-1">
                              <span className="text-lg font-semibold">{formatPoints(finalPoints)}</span>
                              <span className="text-xs text-muted-foreground">积分</span>
                            </div>
                            {finalPoints !== basePoints ? (
                              <p className="mt-1 text-xs text-muted-foreground line-through">原价 {formatPoints(basePoints)} 积分</p>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">无优惠</p>
                            )}
                            <p className={`mt-2 text-xs ${isSelectedPlan ? "text-primary" : "text-muted-foreground"}`}>
                              {isSelectedPlan ? "已选择" : "点击选择"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card className="h-full border-border/70 shadow-none">
            <CardHeader>
              <CardTitle>收银台</CardTitle>
              <CardDescription>确认信息后会立即完成下单和扣款。</CardDescription>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-4">
              {selectedApp ? (
                <div className="space-y-3 rounded-md p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">应用</span>
                    <span className="font-medium">{selectedApp.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">套餐</span>
                    <span className="font-medium">{selectedPlan.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">原价</span>
                    <span>{formatPoints(selectedBasePoints)} 积分</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">优惠</span>
                    <span>{formatPoints(selectedSavings)} 积分</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">实付</span>
                    <span className="text-xl font-semibold">{formatPoints(selectedFinalPoints)} 积分</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>购买后余额</span>
                    {isInsufficientBalance ? (
                      <span className="text-destructive">余额不足，还差 {formatPoints(shortfallPoints)} 积分</span>
                    ) : (
                      <span>{formatPoints(Math.max(remainAfterPurchase, 0))} 积分</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">请先选择应用和套餐。</p>
              )}

              <div className="mt-auto space-y-3">
                <Button
                  className="w-full"
                  disabled={!selectedApp || Boolean(processingKey) || isInsufficientBalance}
                  onClick={() => {
                    if (!selectedApp) return;
                    void onBuy(selectedApp, selectedPlanType);
                  }}
                >
                  {isProcessingSelected ? "购买中..." : "立即购买"}
                </Button>

                <Button asChild className="w-full border-border/70" variant="outline">
                  <Link href="/dashboard/wallet">去钱包查看余额</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="min-h-[144px]">
        {successText ? (
          <Alert className="min-h-[144px] border-primary/30 bg-primary/10">
            <AlertTitle>购买成功</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{successText}</p>
              {successLicenseKey ? (
                <p>
                  <span className="text-muted-foreground">授权密钥：</span>
                  <span className="ml-1 font-mono text-xs">{successLicenseKey}</span>
                </p>
              ) : null}
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href="/dashboard/licenses">去绑定授权</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="min-h-[144px] border-border/70 bg-muted/30">
            <AlertTitle>购买结果提示</AlertTitle>
            <AlertDescription className="space-y-1 text-muted-foreground">
              <p>购买完成后，这里会显示购买成功信息与授权密钥。</p>
              <p className="text-xs">请选择应用和套餐后点击“立即购买”。</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
      </div>
    </>
  );
}
