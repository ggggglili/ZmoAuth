"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface BindingItem {
  id: string;
  targetType: "DOMAIN" | "IP_PORT" | string;
  bindTarget: string;
  boundAt: string;
}

interface LicenseItem {
  id: string;
  appId: string;
  appName: string;
  licenseKey: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  activeBinding: BindingItem | null;
}

interface PendingRebind {
  licenseId: string;
  oldTarget: string;
  newTarget: string;
}

const LICENSE_PAGE_SIZE = 10;

function getLicenseStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "有效";
    case "EXPIRED":
      return "已过期";
    case "REVOKED":
      return "已停用";
    case "BIND_MISMATCH":
      return "绑定不匹配";
    default:
      return status;
  }
}

function getLicenseStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "REVOKED") return "destructive";
  if (status === "EXPIRED" || status === "BIND_MISMATCH") return "secondary";
  return "default";
}

function getBindingTypeLabel(type: string) {
  switch (type) {
    case "DOMAIN":
      return "域名";
    case "IP_PORT":
      return "IP:端口";
    default:
      return type;
  }
}

function isValidDomain(value: string) {
  return /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value);
}

function normalizeBindTarget(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const ipMatch = value.match(/^([0-9.]+)(?::([0-9]{1,5}))?$/);
  if (ipMatch) {
    const ip = ipMatch[1];
    const parts = ip.split(".");
    const ipValid =
      parts.length === 4 &&
      parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
    if (!ipValid) return null;

    if (!ipMatch[2]) return ip;
    const port = Number(ipMatch[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return `${ip}:${port}`;
  }

  if (isValidDomain(value)) return value;
  return null;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export default function DashboardLicensesPage() {
  const [items, setItems] = useState<LicenseItem[]>([]);
  const [bindDrafts, setBindDrafts] = useState<Record<string, string>>({});
  const [licenseRebindCostPoints, setLicenseRebindCostPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRebind, setPendingRebind] = useState<PendingRebind | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedItems;
    return sortedItems.filter((item) => {
      const haystack = [
        item.appName,
        item.licenseKey,
        getLicenseStatusLabel(item.status),
        item.activeBinding?.bindTarget ?? "",
        item.activeBinding?.targetType ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [search, sortedItems]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / LICENSE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * LICENSE_PAGE_SIZE;
    return filteredItems.slice(start, start + LICENSE_PAGE_SIZE);
  }, [currentPage, filteredItems]);

  async function loadLicenses() {
    const res = await fetch("/api/licenses");
    const data = (await res.json()) as {
      items?: LicenseItem[];
      licenseRebindCostPoints?: number;
      message?: string;
    };

    if (!res.ok) {
      setError(data.message ?? "加载授权列表失败");
      return;
    }

    const list = data.items ?? [];
    setItems(list);
    const rebindCostPoints =
      typeof data.licenseRebindCostPoints === "number" && Number.isInteger(data.licenseRebindCostPoints)
        ? data.licenseRebindCostPoints
        : 0;
    setLicenseRebindCostPoints(rebindCostPoints);
    setBindDrafts(Object.fromEntries(list.map((item) => [item.id, item.activeBinding?.bindTarget ?? ""])));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      await loadLicenses();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitBind(item: LicenseItem, normalizedTarget: string) {
    setSubmitting(item.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/licenses/${item.id}/bind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindTarget: normalizedTarget }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "绑定授权失败");
        return;
      }

      setMessage(data.message ?? (item.activeBinding ? "更换绑定成功" : "绑定成功"));
      await loadLicenses();
    } finally {
      setSubmitting(null);
    }
  }

  function onSubmitClick(item: LicenseItem) {
    const input = bindDrafts[item.id] ?? "";
    const normalized = normalizeBindTarget(input);
    if (!normalized) {
      setError("绑定目标格式不正确，请输入域名或 IPv4[:端口]。");
      return;
    }

    if (item.activeBinding) {
      if (item.activeBinding.bindTarget === normalized) {
        setError("新绑定与当前绑定一致，无需更换。");
        return;
      }

      setPendingRebind({
        licenseId: item.id,
        oldTarget: item.activeBinding.bindTarget,
        newTarget: normalized,
      });
      return;
    }

    void submitBind(item, normalized);
  }

  async function onConfirmRebind() {
    if (!pendingRebind) return;
    const item = items.find((value) => value.id === pendingRebind.licenseId);
    if (!item) {
      setPendingRebind(null);
      setError("授权记录不存在，请刷新后重试。");
      return;
    }

    await submitBind(item, pendingRebind.newTarget);
    setPendingRebind(null);
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="操作失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
      />
      <TopCenterAlert
        open={Boolean(message)}
        title="操作成功"
        description={message ?? undefined}
        variant="success"
        onClose={() => setMessage(null)}
      />

      <Card className="relative flex h-[calc(100svh-9rem)] flex-col overflow-hidden border-border/70 shadow-none">
        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : null}
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索应用、授权密钥、状态、绑定目标"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden pt-0 pb-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {!loading && filteredItems.length === 0 ? (
              <Alert>
                <AlertTitle>暂无授权</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  {search.trim() ? (
                    <span>没有匹配的授权记录。</span>
                  ) : (
                    <>
                      <span>你还没有授权，请先购买对应应用授权。</span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/dashboard/purchase">去购买授权</Link>
                      </Button>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            ) : null}

            {loading || filteredItems.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[1240px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>应用</TableHead>
                      <TableHead>授权密钥</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>过期时间</TableHead>
                      <TableHead>当前绑定</TableHead>
                      <TableHead>绑定操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 7 }).map((_, index) => (
                          <TableRow key={`dashboard-license-loading-${index}`}>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-72" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                            <TableCell><Skeleton className="h-10 w-full rounded-md" /></TableCell>
                          </TableRow>
                        ))
                      : null}
                    {!loading
                      ? pagedItems.map((item) => {
                          const isRebind = Boolean(item.activeBinding);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{item.appName}</TableCell>

                              <TableCell className="font-mono text-xs">{item.licenseKey}</TableCell>

                              <TableCell>
                                <Badge variant={getLicenseStatusBadgeVariant(item.status)}>
                                  {getLicenseStatusLabel(item.status)}
                                </Badge>
                              </TableCell>

                              <TableCell className="text-xs">{item.expiresAt ? formatDateTime(item.expiresAt) : "永久"}</TableCell>

                              <TableCell className="text-xs">
                                {item.activeBinding ? (
                                  <div className="space-y-1">
                                    <div>{item.activeBinding.bindTarget}</div>
                                    <p className="text-muted-foreground">
                                      {getBindingTypeLabel(item.activeBinding.targetType)} / {formatDateTime(item.activeBinding.boundAt)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">未绑</span>
                                )}
                              </TableCell>

                              <TableCell className="min-w-[360px]">
                                <div className="flex gap-2">
                                  <Input
                                    value={bindDrafts[item.id] ?? ""}
                                    onChange={(event) =>
                                      setBindDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="请输入域名或 IP:端口"
                                  />
                                  <Button size="sm" onClick={() => onSubmitClick(item)} disabled={submitting === item.id}>
                                    {submitting === item.id ? "提交中..." : isRebind ? "更换绑定" : "提交绑定"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : null}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
          {!loading && filteredItems.length > 0 ? (
            <div className="py-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    第 {currentPage} / {totalPages} 页
                  </Badge>
                  <Badge variant="outline" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    每页 {LICENSE_PAGE_SIZE} 条
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(pendingRebind)} onOpenChange={(open) => (!open ? setPendingRebind(null) : null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>确认更换绑定</DialogTitle>
            <DialogDescription>请确认是否将当前绑定更换为新的绑定目标。</DialogDescription>
          </DialogHeader>

          {pendingRebind ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">旧绑定：</span>
                <span className="font-medium">{pendingRebind.oldTarget}</span>
              </p>
              <p>
                <span className="text-muted-foreground">新绑定：</span>
                <span className="font-medium">{pendingRebind.newTarget}</span>
              </p>
              <p>
                <span className="text-muted-foreground">预估扣分：</span>
                <span className="font-medium">{licenseRebindCostPoints} 积分</span>
              </p>
              <p className="text-muted-foreground">确认要将旧绑定更换为新绑定吗？</p>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRebind(null)} disabled={Boolean(submitting)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void onConfirmRebind()}
              disabled={!pendingRebind || submitting === pendingRebind.licenseId}
            >
              {pendingRebind && submitting === pendingRebind.licenseId ? "提交中..." : "确认更换"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
