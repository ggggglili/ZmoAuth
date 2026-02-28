"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

const schema = z.object({
  userId: z.uuid("请输入有效的用户编号"),
  points: z.number().int().positive("积分必须大于 0"),
});

type FormData = z.infer<typeof schema>;

export default function AdminWalletPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { userId: "", points: 100 },
  });

  async function onSubmit(values: FormData) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/wallet/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { balance?: number; message?: string };
    if (!res.ok) {
      setError(data.message ?? "充值失败");
      return;
    }
    setMessage(`充值成功，当前余额：${data.balance ?? 0}`);
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

      <Card>
        <CardHeader>
          <CardTitle>管理员充值</CardTitle>
          <CardDescription>为任意用户增加积分。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="max-w-xl space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>用户编号</Label>
              <Input placeholder="输入目标用户编号" {...form.register("userId")} />
              {form.formState.errors.userId ? (
                <p className="text-xs text-destructive">{form.formState.errors.userId.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>积分数量</Label>
              <Input type="number" {...form.register("points", { valueAsNumber: true })} />
              {form.formState.errors.points ? (
                <p className="text-xs text-destructive">{form.formState.errors.points.message}</p>
              ) : null}
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "提交中..." : "执行充值"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

