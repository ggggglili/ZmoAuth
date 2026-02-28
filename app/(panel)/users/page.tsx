"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface PanelUserItem {
  userId: string;
  email: string;
  platformRole: string;
  isEnvAdmin: boolean;
  appRole: string | null;
  pointBalance: number;
  appId: string | null;
  appName: string | null;
}

interface UsersResponse {
  scope: "admin" | "reseller";
  items: PanelUserItem[];
  message?: string;
}

interface AppOption {
  appId: string;
  appName: string;
  role: string;
}

type RoleAction = "upgrade_reseller" | "downgrade_member";

interface UserRow {
  userId: string;
  email: string;
  platformRole: string;
  isEnvAdmin: boolean;
  pointBalance: number;
  appRoles: Array<{
    appId: string;
    appName: string;
    appRole: string | null;
  }>;
}

const USER_PAGE_SIZE = 10;

function getPrimaryRoleLabel(row: UserRow) {
  if (row.isEnvAdmin || row.platformRole === "SUPER_ADMIN") {
    return "超级管理员";
  }

  const roles = row.appRoles.map((item) => item.appRole);
  if (roles.includes("RESELLER")) return "授权商";
  if (roles.includes("OWNER")) return "所有者";
  if (roles.includes("MEMBER")) return "普通成员";
  return "未加入应用";
}

export default function UsersPage() {
  const [scope, setScope] = useState<UsersResponse["scope"]>("reseller");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [operationOpen, setOperationOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserRow | null>(null);

  const [pointAction, setPointAction] = useState<"recharge" | "deduct">("recharge");
  const [points, setPoints] = useState("100");
  const [upgradeAppId, setUpgradeAppId] = useState("");
  const [upgradeApps, setUpgradeApps] = useState<AppOption[]>([]);
  const [roleAction, setRoleAction] = useState<RoleAction>("upgrade_reseller");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const isAdminScope = scope === "admin";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/panel/users");
    const data = (await res.json()) as UsersResponse;

    if (!res.ok) {
      setRows([]);
      if (res.status === 403) {
        setError("当前账号无用户管理权限");
      } else {
        setError(data.message ?? "加载用户列表失败");
      }
      setLoading(false);
      return;
    }

    setScope(data.scope);

    const grouped = new Map<string, UserRow>();
    for (const item of data.items ?? []) {
      const existing = grouped.get(item.userId);
      if (!existing) {
        grouped.set(item.userId, {
          userId: item.userId,
          email: item.email,
          platformRole: item.platformRole,
          isEnvAdmin: item.isEnvAdmin,
          pointBalance: item.pointBalance,
          appRoles:
            item.appId && item.appName
              ? [
                  {
                    appId: item.appId,
                    appName: item.appName,
                    appRole: item.appRole,
                  },
                ]
              : [],
        });
      } else if (item.appId && item.appName) {
        const duplicate = existing.appRoles.some((role) => role.appId === item.appId);
        if (!duplicate) {
          existing.appRoles.push({
            appId: item.appId,
            appName: item.appName,
            appRole: item.appRole,
          });
        }
      }
    }

    for (const row of grouped.values()) {
      row.appRoles.sort((a, b) => a.appName.localeCompare(b.appName, "zh-CN"));
    }

    const nextRows = Array.from(grouped.values()).sort((a, b) => a.email.localeCompare(b.email, "zh-CN"));
    setRows(nextRows);
    setLoading(false);
  }, []);

  const loadUpgradeApps = useCallback(async () => {
    const res = await fetch("/api/panel/apps");
    const data = (await res.json()) as { items?: AppOption[] };
    if (!res.ok) {
      setUpgradeApps([]);
      return;
    }
    setUpgradeApps(data.items ?? []);
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadUpgradeApps();
  }, [loadUsers, loadUpgradeApps]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.email,
        row.userId,
        getPrimaryRoleLabel(row),
        String(row.pointBalance),
        row.appRoles.map((item) => `${item.appName} ${item.appRole ?? ""}`).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / USER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * USER_PAGE_SIZE;
    return filteredRows.slice(start, start + USER_PAGE_SIZE);
  }, [currentPage, filteredRows]);

  const roleManageApps = useMemo(() => {
    if (!currentUser) return [];

    const appRoleMap = new Map(currentUser.appRoles.map((item) => [item.appId, item.appRole]));
    return upgradeApps.filter((app) => {
      const currentRole = appRoleMap.get(app.appId) ?? null;
      if (roleAction === "upgrade_reseller") {
        return currentRole !== "RESELLER" && currentRole !== "OWNER";
      }
      return currentRole === "RESELLER";
    });
  }, [currentUser, roleAction, upgradeApps]);

  useEffect(() => {
    if (!roleManageApps.some((item) => item.appId === upgradeAppId)) {
      setUpgradeAppId(roleManageApps[0]?.appId ?? "");
    }
  }, [roleManageApps, upgradeAppId]);

  function openOperation(user: UserRow) {
    setCurrentUser(user);
    setPointAction("recharge");
    setPoints("100");
    setRoleAction("upgrade_reseller");
    setUpgradeAppId("");
    setOperationOpen(true);
  }

  async function onSubmitPoints() {
    if (!currentUser) return;

    const amount = Number(points);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("积分必须大于 0");
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/panel/users/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: currentUser.userId,
          points: amount,
          action: pointAction,
        }),
      });
      const data = (await res.json()) as { code?: string; message?: string };
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_POINTS") {
          setError("当前账号积分不足，无法给下级用户充值。请先给当前账号充值积分。");
        } else {
          setError(data.message ?? "积分操作失败");
        }
        return;
      }

      setMessage(pointAction === "deduct" ? "扣除积分成功" : "充值积分成功");
      await loadUsers();
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitRoleChange() {
    if (!currentUser) return;
    if (!upgradeAppId) {
      setError("当前没有可执行角色变更的应用");
      setMessage(null);
      return;
    }

    const targetRole = roleAction === "upgrade_reseller" ? "RESELLER" : "MEMBER";

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/apps/${upgradeAppId}/members/${currentUser.userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole, parentResellerUserId: null }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "角色变更失败");
        return;
      }

      setMessage(roleAction === "upgrade_reseller" ? "已升级为该应用的授权商" : "已降级为该应用的普通成员");
      await loadUsers();
    } finally {
      setSubmitting(false);
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
        autoCloseMs={2500}
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
                placeholder="搜索邮箱、用户ID、角色、应用、积分"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden pt-0 pb-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {!loading && filteredRows.length === 0 ? (
              <Alert>
                <AlertTitle>暂无数据</AlertTitle>
                <AlertDescription>{search.trim() ? "没有匹配的用户。" : "暂无可管理用户。"}</AlertDescription>
              </Alert>
            ) : null}

            {loading || filteredRows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[900px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>主角色</TableHead>
                      <TableHead>积分余额</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 7 }).map((_, index) => (
                          <TableRow key={`users-loading-${index}`}>
                            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-16 rounded-md" /></TableCell>
                          </TableRow>
                        ))
                      : null}
                    {!loading
                      ? pagedRows.map((row) => (
                          <TableRow key={row.userId}>
                            <TableCell className="text-xs">
                              <div>{row.email}</div>
                              <div className="font-mono text-muted-foreground">{row.userId}</div>
                            </TableCell>
                            <TableCell>{getPrimaryRoleLabel(row)}</TableCell>
                            <TableCell>{row.pointBalance}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => openOperation(row)}>
                                管理
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
          {!loading && filteredRows.length > 0 ? (
            <div className="py-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    第 {currentPage} / {totalPages} 页
                  </Badge>
                  <Badge variant="outline" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    每页 {USER_PAGE_SIZE} 条
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

      <Dialog open={operationOpen} onOpenChange={setOperationOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>用户操作</DialogTitle>
            <DialogDescription>{currentUser ? `当前用户：${currentUser.email}` : "请选择用户"}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>操作类型</Label>
                <Select
                  value={pointAction}
                  onValueChange={(value) => setPointAction(value as "recharge" | "deduct")}
                  disabled={submitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择操作类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recharge">充值积分</SelectItem>
                    {isAdminScope ? <SelectItem value="deduct">扣除积分</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>积分数量</Label>
                <Input type="number" min={1} value={points} onChange={(event) => setPoints(event.target.value)} />
              </div>
            </div>

            {isAdminScope ? (
              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">角色变更</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>变更动作</Label>
                    <Select
                      value={roleAction}
                      onValueChange={(value) => setRoleAction(value as RoleAction)}
                      disabled={submitting}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upgrade_reseller">升级为授权商</SelectItem>
                        <SelectItem value="downgrade_member">降级为普通成员</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Select value={upgradeAppId} onValueChange={setUpgradeAppId} disabled={submitting || roleManageApps.length === 0}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="应用列表" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleManageApps.map((app) => (
                          <SelectItem key={app.appId} value={app.appId}>
                            {app.appName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {roleManageApps.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {roleAction === "upgrade_reseller" ? "没有可升级的应用" : "没有可降级的应用"}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOperationOpen(false)} disabled={submitting}>
              关闭
            </Button>
            {isAdminScope ? (
              <Button type="button" variant="outline" onClick={() => void onSubmitPoints()} disabled={submitting}>
                {submitting ? "处理中..." : "执行积分操作"}
              </Button>
            ) : null}
            {isAdminScope ? (
              <Button
                type="button"
                onClick={() => void onSubmitRoleChange()}
                disabled={submitting || roleManageApps.length === 0}
              >
                {submitting ? "处理中..." : roleAction === "upgrade_reseller" ? "升级为授权商" : "降级为普通成员"}
              </Button>
            ) : (
              <Button type="button" onClick={() => void onSubmitPoints()} disabled={submitting}>
                {submitting ? "处理中..." : "确定执行"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
