"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface SessionUser {
  id: string;
  email: string;
  role: string;
  superiorEmail?: string | null;
}

interface AppItem {
  appId: string;
  appName: string;
  role: string;
}

interface InviteItem {
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  issuerType?: string;
  isRevoked?: boolean;
}

interface InviteRedeemRecord {
  code: string;
  userEmail: string;
  redeemedAt: string;
}

const UNLIMITED_MAX_USES = 2147483647;
const UNLIMITED_EXPIRES_YEAR = 3000;
const PROFILE_PAGE_SIZE = 10;

function getPlatformRoleLabel(userRole: string, apps: AppItem[]) {
  if (userRole === "SUPER_ADMIN") return "超级管理员";
  if (apps.some((app) => app.role === "RESELLER")) return "授权商";
  return "普通用户";
}

function getIssuerLabel(issuerType?: string) {
  if (issuerType === "SUPER_ADMIN") return "管理员";
  if (issuerType === "RESELLER") return "授权商";
  return "未知";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function formatInviteUses(item: InviteItem) {
  if (item.maxUses >= UNLIMITED_MAX_USES) {
    return `${item.usedCount}/不限`;
  }
  return `${item.usedCount}/${item.maxUses}`;
}

function formatInviteExpires(expiresAt: string) {
  const date = new Date(expiresAt);
  if (!Number.isNaN(date.getTime()) && date.getFullYear() >= UNLIMITED_EXPIRES_YEAR) {
    return "不限";
  }
  return formatDateTime(expiresAt);
}

export default function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [redeemRecords, setRedeemRecords] = useState<InviteRedeemRecord[]>([]);
  const [superiorEmail, setSuperiorEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"codes" | "redeems">("codes");
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitePage, setInvitePage] = useState(1);
  const [redeemSearch, setRedeemSearch] = useState("");
  const [redeemPage, setRedeemPage] = useState(1);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManageInvites = Boolean(isSuperAdmin || apps.some((app) => app.role === "RESELLER"));
  const platformRoleLabel = useMemo(() => (user ? getPlatformRoleLabel(user.role, apps) : "-"), [user, apps]);
  const filteredInvites = useMemo(() => {
    const keyword = inviteSearch.trim().toLowerCase();
    if (!keyword) return invites;
    return invites.filter((item) => {
      const haystack = [item.code, getIssuerLabel(item.issuerType), formatInviteUses(item), formatInviteExpires(item.expiresAt)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [inviteSearch, invites]);
  const inviteTotalPages = Math.max(1, Math.ceil(filteredInvites.length / PROFILE_PAGE_SIZE));
  const inviteCurrentPage = Math.min(invitePage, inviteTotalPages);
  const pagedInvites = useMemo(() => {
    const start = (inviteCurrentPage - 1) * PROFILE_PAGE_SIZE;
    return filteredInvites.slice(start, start + PROFILE_PAGE_SIZE);
  }, [filteredInvites, inviteCurrentPage]);
  const filteredRedeemRecords = useMemo(() => {
    const keyword = redeemSearch.trim().toLowerCase();
    if (!keyword) return redeemRecords;
    return redeemRecords.filter((item) => {
      const haystack = [item.userEmail, item.code, formatDateTime(item.redeemedAt)].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [redeemRecords, redeemSearch]);
  const redeemTotalPages = Math.max(1, Math.ceil(filteredRedeemRecords.length / PROFILE_PAGE_SIZE));
  const redeemCurrentPage = Math.min(redeemPage, redeemTotalPages);
  const pagedRedeemRecords = useMemo(() => {
    const start = (redeemCurrentPage - 1) * PROFILE_PAGE_SIZE;
    return filteredRedeemRecords.slice(start, start + PROFILE_PAGE_SIZE);
  }, [filteredRedeemRecords, redeemCurrentPage]);

  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/panel/invites");
    const data = (await res.json()) as {
      items?: InviteItem[];
      records?: InviteRedeemRecord[];
      message?: string;
    };

    if (!res.ok) {
      setError(data.message ?? "加载邀请码失败");
      setInvites([]);
      setRedeemRecords([]);
      return;
    }

    setInvites(data.items ?? []);
    setRedeemRecords(data.records ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      const meRes = await fetch("/api/auth/me");
      const meData = (await meRes.json()) as { user?: SessionUser };
      if (cancelled) return;

      const currentUser = meData.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const superiorRes = await fetch("/api/panel/profile/superior");
      const superiorData = (await superiorRes.json()) as { superiorEmail?: string | null };
      if (!cancelled) {
        setSuperiorEmail(superiorRes.ok ? (superiorData.superiorEmail ?? null) : null);
      }

      const appRes = await fetch("/api/panel/apps");
      const appData = (await appRes.json()) as { items?: AppItem[]; message?: string };
      if (cancelled) return;

      if (!appRes.ok) {
        setError(appData.message ?? "加载应用失败");
        setLoading(false);
        return;
      }

      setApps(appData.items ?? []);
      await loadInvites();

      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadInvites]);

  async function onCreateInvite() {
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/panel/invites", {
        method: "POST",
      });
      const data = (await res.json()) as { message?: string; inviteLink?: string };

      if (!res.ok) {
        setError(data.message ?? "创建邀请码失败");
        return;
      }

      setMessage(`创建成功：${data.inviteLink ?? ""}`);
      await loadInvites();
    } finally {
      setCreating(false);
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

      <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : null}
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>个人信息</CardTitle>
          </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : user ? (
              <div className="grid gap-3 rounded-md border p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">账号：</span>
                  <span>{user.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">UUID：</span>
                  <span className="font-mono text-xs">{user.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">平台角色：</span>
                  <span>{platformRoleLabel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">上级账号：</span>
                  <span>{superiorEmail ?? "-"}</span>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertTitle>未登录</AlertTitle>
                <AlertDescription>未获取到登录信息。</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle>邀请码管理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-10 w-32" />
                </div>
              ) : !canManageInvites ? (
                <Alert>
                  <AlertTitle>提示</AlertTitle>
                  <AlertDescription>当前账号无邀请码管理权限。</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid gap-2 rounded-md border p-3 text-sm">
                    <p>
                      <span className="text-muted-foreground">有效天数：</span>
                      <span>不限</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">最大使用次数：</span>
                      <span>不限</span>
                    </p>
                  </div>

                  <Button disabled={creating} onClick={() => void onCreateInvite()}>
                    {creating ? "创建中..." : "创建邀请码"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "codes" | "redeems")} className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="codes" className="flex-1">
                    邀请码
                  </TabsTrigger>
                  <TabsTrigger value="redeems" className="flex-1">
                    使用记录
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="codes" className="mt-3">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <Input
                      value={inviteSearch}
                      onChange={(event) => {
                        setInviteSearch(event.target.value);
                        setInvitePage(1);
                      }}
                      placeholder="搜索邀请码、签发方、使用次数"
                      className="md:max-w-sm"
                    />
                    {!loading && filteredInvites.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        第 {inviteCurrentPage} / {inviteTotalPages} 页
                      </p>
                    ) : null}
                  </div>
                  {loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={`profile-code-loading-${index}`} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : filteredInvites.length === 0 ? (
                    <Alert>
                      <AlertTitle>暂无数据</AlertTitle>
                      <AlertDescription>{inviteSearch.trim() ? "没有匹配的邀请码记录。" : "暂无邀请码记录。"}</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="max-h-[320px] overflow-auto rounded-md border">
                        <Table className="min-w-[760px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead>邀请码</TableHead>
                              <TableHead>使用次数</TableHead>
                              <TableHead>到期时间</TableHead>
                              <TableHead>签发方</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedInvites.map((item) => (
                              <TableRow key={item.code}>
                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                <TableCell>{formatInviteUses(item)}</TableCell>
                                <TableCell className="text-xs">{formatInviteExpires(item.expiresAt)}</TableCell>
                                <TableCell>{getIssuerLabel(item.issuerType)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
                        <p>
                          显示 {(inviteCurrentPage - 1) * PROFILE_PAGE_SIZE + 1}-
                          {Math.min(inviteCurrentPage * PROFILE_PAGE_SIZE, filteredInvites.length)} / {filteredInvites.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={inviteCurrentPage <= 1}
                            onClick={() => setInvitePage(Math.max(1, inviteCurrentPage - 1))}
                          >
                            上一页
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={inviteCurrentPage >= inviteTotalPages}
                            onClick={() => setInvitePage(Math.min(inviteTotalPages, inviteCurrentPage + 1))}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="redeems" className="mt-3">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <Input
                      value={redeemSearch}
                      onChange={(event) => {
                        setRedeemSearch(event.target.value);
                        setRedeemPage(1);
                      }}
                      placeholder="搜索注册账号、邀请码、时间"
                      className="md:max-w-sm"
                    />
                    {!loading && filteredRedeemRecords.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        第 {redeemCurrentPage} / {redeemTotalPages} 页
                      </p>
                    ) : null}
                  </div>
                  {loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={`profile-redeem-loading-${index}`} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : filteredRedeemRecords.length === 0 ? (
                    <Alert>
                      <AlertTitle>暂无数据</AlertTitle>
                      <AlertDescription>
                        {redeemSearch.trim() ? "没有匹配的使用记录。" : "暂无用户通过邀请码注册的记录。"}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="max-h-[320px] overflow-auto rounded-md border">
                        <Table className="min-w-[760px] whitespace-nowrap [&_th]:px-2 [&_td]:px-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead>注册账号</TableHead>
                              <TableHead>邀请码</TableHead>
                              <TableHead>时间</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedRedeemRecords.map((item) => (
                              <TableRow key={`${item.code}:${item.userEmail}:${item.redeemedAt}`}>
                                <TableCell>{item.userEmail}</TableCell>
                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(item.redeemedAt)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
                        <p>
                          显示 {(redeemCurrentPage - 1) * PROFILE_PAGE_SIZE + 1}-
                          {Math.min(redeemCurrentPage * PROFILE_PAGE_SIZE, filteredRedeemRecords.length)} /{" "}
                          {filteredRedeemRecords.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={redeemCurrentPage <= 1}
                            onClick={() => setRedeemPage(Math.max(1, redeemCurrentPage - 1))}
                          >
                            上一页
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={redeemCurrentPage >= redeemTotalPages}
                            onClick={() => setRedeemPage(Math.min(redeemTotalPages, redeemCurrentPage + 1))}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
