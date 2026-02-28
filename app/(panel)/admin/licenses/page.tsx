"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface BindingItem {
  id: string;
  targetType: "DOMAIN" | "IP_PORT";
  bindTarget: string;
  boundAt: string;
}

interface LicenseItem {
  id: string;
  appId: string;
  appName: string;
  userId: string;
  userEmail: string;
  licenseKey: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  effectiveStatus: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string | null;
  createdAt: string;
  activeBinding: BindingItem | null;
}

const LICENSE_PAGE_SIZE = 10;

function getStatusLabel(status: LicenseItem["effectiveStatus"]) {
  if (status === "ACTIVE") return "有效";
  if (status === "EXPIRED") return "已过期";
  if (status === "REVOKED") return "已停用";
  return status;
}

function getRawStatusLabel(status: LicenseItem["status"]) {
  if (status === "ACTIVE") return "有效";
  if (status === "EXPIRED") return "已过期";
  if (status === "REVOKED") return "已停用";
  return status;
}

function getStatusBadgeVariant(status: LicenseItem["effectiveStatus"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "REVOKED") return "destructive";
  if (status === "EXPIRED") return "secondary";
  return "default";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export default function AdminLicensesPage() {
  const [items, setItems] = useState<LicenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sorted;

    return sorted.filter((item) => {
      const haystack = [
        item.userEmail,
        item.userId,
        item.appName,
        item.licenseKey,
        item.activeBinding?.bindTarget ?? "",
        getStatusLabel(item.effectiveStatus),
        getRawStatusLabel(item.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [search, sorted]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LICENSE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * LICENSE_PAGE_SIZE;
    return filtered.slice(start, start + LICENSE_PAGE_SIZE);
  }, [currentPage, filtered]);

  const loadLicenses = useCallback(async () => {
    const res = await fetch("/api/admin/licenses?limit=500");
    const body = (await res.json()) as { items?: LicenseItem[]; message?: string };

    if (!res.ok) {
      setError(body.message ?? "加载授权列表失败");
      return;
    }

    setItems(body.items ?? []);
  }, []);

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
  }, [loadLicenses]);

  async function onToggle(item: LicenseItem) {
    const target = item.status === "REVOKED" ? "ACTIVE" : "REVOKED";
    setSubmittingId(item.id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/licenses/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });

      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? "修改授权状态失败");
        return;
      }

      setMessage(target === "REVOKED" ? "授权已停用" : "授权已启用");
      await loadLicenses();
    } finally {
      setSubmittingId(null);
    }
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
              placeholder="搜索授权记录"
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden pt-0 pb-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {!loading && filtered.length === 0 ? (
              <Alert>
                <AlertTitle>暂无数据</AlertTitle>
                <AlertDescription>
                  {search.trim() ? "没有匹配的授权记录。" : "当前没有可展示的授权记录。"}
                </AlertDescription>
              </Alert>
            ) : null}

            {loading || filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[1180px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>应用</TableHead>
                      <TableHead>授权密钥</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>绑定目标</TableHead>
                      <TableHead>到期时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {loading
                      ? Array.from({ length: 7 }).map((_, index) => (
                          <TableRow key={`admin-license-loading-${index}`}>
                            <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-72" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-20 rounded-md" /></TableCell>
                          </TableRow>
                        ))
                      : null}
                    {!loading
                      ? pagedItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs">
                              <div>{item.userEmail}</div>
                              <div className="font-mono text-muted-foreground">{item.userId}</div>
                            </TableCell>

                            <TableCell>{item.appName}</TableCell>

                            <TableCell className="font-mono text-xs">{item.licenseKey}</TableCell>

                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant={getStatusBadgeVariant(item.effectiveStatus)}>
                                  {getStatusLabel(item.effectiveStatus)}
                                </Badge>
                                <p className="text-xs text-muted-foreground">原始状态：{getRawStatusLabel(item.status)}</p>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs">
                              {item.activeBinding ? (
                                <div className="space-y-1">
                                  <div>{item.activeBinding.bindTarget}</div>
                                  <p className="text-muted-foreground">绑定时间：{formatDateTime(item.activeBinding.boundAt)}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">未绑定</span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs">{item.expiresAt ? formatDateTime(item.expiresAt) : "永久"}</TableCell>

                            <TableCell>
                              <Button
                                size="sm"
                                variant={item.status === "REVOKED" ? "default" : "outline"}
                                disabled={submittingId === item.id}
                                onClick={() => void onToggle(item)}
                              >
                                {submittingId === item.id ? "处理中..." : item.status === "REVOKED" ? "启用授权" : "停用授权"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
          {!loading && filtered.length > 0 ? (
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
    </>
  );
}
