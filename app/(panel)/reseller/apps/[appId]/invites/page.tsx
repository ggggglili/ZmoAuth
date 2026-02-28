"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

const schema = z.object({
  maxUses: z.number().int().positive().max(100),
  expiresInDays: z.number().int().positive().max(365),
});

type FormData = z.infer<typeof schema>;

interface InviteItem {
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
}

export default function ResellerInvitesPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [items, setItems] = useState<InviteItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { maxUses: 10, expiresInDays: 7 },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/reseller/apps/${appId}/invites`);
      const data = (await res.json()) as { items?: InviteItem[] };
      if (!cancelled) {
        setItems(data.items ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  async function onSubmit(values: FormData) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/reseller/apps/${appId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { inviteLink?: string; message?: string };
    if (!res.ok) {
      setError(data.message ?? "创建失败");
      return;
    }
    setMessage(`创建成功：${data.inviteLink ?? ""}`);
    const listRes = await fetch(`/api/reseller/apps/${appId}/invites`);
    const listData = (await listRes.json()) as { items?: InviteItem[] };
    setItems(listData.items ?? []);
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="创建失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
      />
      <TopCenterAlert
        open={Boolean(message)}
        title="创建成功"
        description={message ?? undefined}
        variant="success"
        onClose={() => setMessage(null)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
        <CardHeader>
          <CardTitle>授权商邀请码</CardTitle>
          <CardDescription>被邀请用户注册后默认仍是普通用户。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>最大使用次数</Label>
              <Input type="number" {...form.register("maxUses", { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>有效天数</Label>
              <Input type="number" {...form.register("expiresInDays", { valueAsNumber: true })} />
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              创建邀请码
            </Button>
          </form>
        </CardContent>
      </Card>

        <Card>
        <CardHeader>
          <CardTitle>我的邀请码</CardTitle>
          <CardDescription>应用 {appId}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>邀请码</TableHead>
                  <TableHead>已使用</TableHead>
                  <TableHead>到期时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.code}>
                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                    <TableCell>
                      {item.usedCount}/{item.maxUses}
                    </TableCell>
                    <TableCell>{new Date(item.expiresAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        </Card>
      </div>
    </>
  );
}
