"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface TxItem {
  id: string;
  type: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  createdAt: string;
}

const TX_PAGE_SIZE = 10;

function getTransactionTypeLabel(type: string) {
  switch (type) {
    case "RECHARGE":
      return "充值";
    case "PURCHASE":
      return "购买";
    case "REFUND":
      return "退款";
    case "ADJUST":
      return "调整";
    case "TRANSFER_OUT":
      return "转出";
    case "TRANSFER_IN":
      return "转入";
    default:
      return type;
  }
}

function getReferenceTypeLabel(referenceType: string, referenceId: string) {
  if (referenceType === "order") return "订单";
  if (referenceType === "invite") return "邀请关系";
  if (referenceType === "license_rebind") return "更换绑定";

  if (referenceType === "manual") {
    if (referenceId.startsWith("admin_recharge:")) return "管理员充值";
    if (referenceId.startsWith("admin_deduct:")) return "管理员扣减";
    if (referenceId.startsWith("panel_recharge:")) return "面板充值";
    return "人工操作";
  }

  return referenceType;
}

function getAmountClassName(amount: number) {
  if (amount > 0) return "text-emerald-600";
  if (amount < 0) return "text-destructive";
  return "text-muted-foreground";
}

function formatAmount(amount: number) {
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export default function DashboardWalletPage() {
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [transactions]
  );
  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedTransactions;
    return sortedTransactions.filter((item) => {
      const haystack = [
        getTransactionTypeLabel(item.type),
        item.type,
        getReferenceTypeLabel(item.referenceType, item.referenceId),
        item.referenceType,
        item.referenceId,
        formatAmount(item.amount),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [search, sortedTransactions]);
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / TX_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * TX_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TX_PAGE_SIZE);
  }, [currentPage, filteredTransactions]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/wallet");
      const data = (await res.json()) as { transactions?: TxItem[]; message?: string };

      if (cancelled) return;
      if (!res.ok) {
        setError(data.message ?? "加载流水数据失败");
        setLoading(false);
        return;
      }

      setTransactions(data.transactions ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="操作失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
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
                placeholder="搜索类型、关联对象、流水 ID"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden pt-0 pb-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {!loading && !error && filteredTransactions.length === 0 ? (
              <Alert>
                <AlertTitle>暂无数据</AlertTitle>
                <AlertDescription>{search.trim() ? "没有匹配的流水记录。" : "当前没有可展示的流水记录。"}</AlertDescription>
              </Alert>
            ) : null}

            {loading || filteredTransactions.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[920px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型</TableHead>
                      <TableHead>变动积分</TableHead>
                      <TableHead>关联对象</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 6 }).map((_, index) => (
                          <TableRow key={`wallet-loading-${index}`}>
                            <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          </TableRow>
                        ))
                      : null}
                    {!loading
                      ? pagedTransactions.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline">{getTransactionTypeLabel(item.type)}</Badge>
                            </TableCell>

                            <TableCell className={getAmountClassName(item.amount)}>{formatAmount(item.amount)}</TableCell>

                            <TableCell className="text-xs">
                              <div className="space-y-1">
                                <div>{getReferenceTypeLabel(item.referenceType, item.referenceId)}</div>
                                <p className="font-mono text-muted-foreground">{item.referenceId}</p>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs">{formatDateTime(item.createdAt)}</TableCell>
                          </TableRow>
                        ))
                      : null}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
          {!loading && filteredTransactions.length > 0 ? (
            <div className="py-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    第 {currentPage} / {totalPages} 页
                  </Badge>
                  <Badge variant="outline" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    每页 {TX_PAGE_SIZE} 条
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
