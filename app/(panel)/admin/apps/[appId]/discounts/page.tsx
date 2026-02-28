"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface DiscountItem {
  userId: string;
  email: string;
  role: string;
  discountRate: number;
  updatedAt: string | null;
}

function getRoleLabel(role: string) {
  switch (role) {
    case "OWNER":
      return "所有者";
    case "RESELLER":
      return "授权商";
    case "MEMBER":
      return "普通用户";
    default:
      return "未知";
  }
}

export default function AdminAppDiscountsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [items, setItems] = useState<DiscountItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/apps/${appId}/reseller-discounts`);
    const data = (await res.json()) as { items?: DiscountItem[]; message?: string };
    if (!res.ok) {
      setError(data.message ?? "加载折扣失败");
      return;
    }

    const list = data.items ?? [];
    setItems(list);
    setDrafts(Object.fromEntries(list.map((item) => [item.userId, String(item.discountRate)])));
  }, [appId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function onSave(userId: string) {
    const raw = drafts[userId];
    const discountRate = Number(raw);
    if (!Number.isFinite(discountRate) || discountRate <= 0 || discountRate > 1) {
      setError("折扣比例必须大于 0 且小于等于 1");
      setMessage(null);
      return;
    }

    setSavingUserId(userId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/apps/${appId}/reseller-discounts/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountRate }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "保存折扣失败");
        return;
      }
      setMessage("折扣已更新");
      await loadItems();
    } finally {
      setSavingUserId(null);
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

      <Card>
      <CardHeader>
        <CardTitle>授权商折扣</CardTitle>
        <CardDescription>
          应用编号：<span className="font-mono text-xs">{appId}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">当前应用暂无授权商成员。</p>
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>折扣比例</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.userId}>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>{getRoleLabel(item.role)}</TableCell>
                    <TableCell className="w-[180px]">
                      <Input
                        value={drafts[item.userId] ?? ""}
                        onChange={(event) => {
                          setDrafts((prev) => ({
                            ...prev,
                            [item.userId]: event.target.value,
                          }));
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={savingUserId === item.userId}
                        onClick={() => {
                          void onSave(item.userId);
                        }}
                      >
                        {savingUserId === item.userId ? "保存中..." : "保存"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      </CardContent>
      </Card>
    </>
  );
}


