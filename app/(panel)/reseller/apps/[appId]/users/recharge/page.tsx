"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

const schema = z.object({
  targetUserId: z.uuid("请选择有效用户"),
  points: z.number().int().positive("积分必须大于 0"),
});

type FormData = z.infer<typeof schema>;

interface Child {
  userId: string;
  user: { id: string; email: string };
}

export default function ResellerRechargePage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [children, setChildren] = useState<Child[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { targetUserId: "", points: 100 },
  });
  const targetUserId = useWatch({ control: form.control, name: "targetUserId" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/reseller/apps/${appId}/children`);
      const data = (await res.json()) as { items?: Child[] };
      if (cancelled) return;
      const list = data.items ?? [];
      setChildren(list);
      if (list.length > 0) {
        form.setValue("targetUserId", list[0].userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, form]);

  async function onSubmit(values: FormData) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/reseller/apps/${appId}/wallet/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { code?: string; transferOutId?: string; transferInId?: string; message?: string };
    if (!res.ok) {
      if (data.code === "INSUFFICIENT_POINTS") {
        setError("当前账号积分不足，无法给下级用户充值。请先给当前账号充值积分。");
      } else {
        setError(data.message ?? "充值失败");
      }
      return;
    }

    setMessage(`充值成功，转出流水：${data.transferOutId}，转入流水：${data.transferInId}`);
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="充值失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
      />
      <TopCenterAlert
        open={Boolean(message)}
        title="充值成功"
        description={message ?? undefined}
        variant="success"
        autoCloseMs={2500}
        onClose={() => setMessage(null)}
      />

      <Card>
        <CardHeader>
          <CardTitle>给下级用户充值</CardTitle>
          <CardDescription>充值会扣减你当前账号的积分余额。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="max-w-xl space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>目标用户</Label>
              <Select
                value={targetUserId}
                onValueChange={(value) => form.setValue("targetUserId", value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择下级用户" />
                </SelectTrigger>
                <SelectContent>
                  {children.map((child) => (
                    <SelectItem key={child.userId} value={child.userId}>
                      {child.user.email} ({child.userId.slice(0, 8)}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.targetUserId ? (
                <p className="text-xs text-destructive">{form.formState.errors.targetUserId.message}</p>
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
