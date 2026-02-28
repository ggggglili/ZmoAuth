"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

const appSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  weekPoints: z.number().int().nonnegative(),
  monthPoints: z.number().int().nonnegative(),
  yearPoints: z.number().int().nonnegative(),
  lifetimePoints: z.number().int().nonnegative(),
});

const versionSchema = z.object({
  version: z.string().min(1).max(50),
  downloadUrl: z.string().url().max(2000),
  releaseNote: z.string().max(2000).optional(),
});

const updatePolicySchema = z.object({
  offlineTtlSeconds: z.number().int().min(60).max(604800),
  forceUpdateMinVersion: z.string().max(50).optional(),
});

type AppFormData = z.infer<typeof appSchema>;
type VersionFormData = z.infer<typeof versionSchema>;
type UpdatePolicyFormData = z.infer<typeof updatePolicySchema>;

interface AppDetail {
  id: string;
  name: string;
  description: string | null;
  weekPoints: number;
  monthPoints: number;
  yearPoints: number;
  lifetimePoints: number;
}

interface VersionItem {
  id: string;
  version: string;
  downloadUrl: string;
  releaseNote: string | null;
  createdAt: string;
}

interface UpdatePolicyItem {
  appId: string;
  offlineTtlSeconds: number;
  forceUpdateMinVersion: string | null;
}

interface SdkInfo {
  appId: string;
  appName: string;
  sdkKey: string;
  sdkSecretPreview: string;
  updateSignSecretPreview: string;
  previousSdkSecretPreview: string | null;
  previousSdkSecretExpiresAt: string | null;
  previousUpdateSignSecretPreview: string | null;
  previousUpdateSignSecretExpiresAt: string | null;
}

type RotateTarget = "SDK_SECRET" | "UPDATE_SIGN_SECRET" | "BOTH";

interface RotateResult {
  appId: string;
  sdkKey: string;
  sdkSecret: string | null;
  updateSignSecret: string | null;
  sdkSecretPreview: string;
  updateSignSecretPreview: string;
  previousSdkSecretPreview: string | null;
  previousSdkSecretExpiresAt: string | null;
  previousUpdateSignSecretPreview: string | null;
  previousUpdateSignSecretExpiresAt: string | null;
  rotatedAt: string;
}

export default function AdminAppEditPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [sdkInfo, setSdkInfo] = useState<SdkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rotateResult, setRotateResult] = useState<RotateResult | null>(null);
  const [rotating, setRotating] = useState<RotateTarget | null>(null);
  const [downloadingSdk, setDownloadingSdk] = useState(false);

  const appForm = useForm<AppFormData>({
    resolver: zodResolver(appSchema),
    defaultValues: {
      name: "",
      description: "",
      weekPoints: 0,
      monthPoints: 0,
      yearPoints: 0,
      lifetimePoints: 0,
    },
  });

  const versionForm = useForm<VersionFormData>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      version: "",
      downloadUrl: "",
      releaseNote: "",
    },
  });

  const policyForm = useForm<UpdatePolicyFormData>({
    resolver: zodResolver(updatePolicySchema),
    defaultValues: {
      offlineTtlSeconds: 900,
      forceUpdateMinVersion: "",
    },
  });

  const loadAll = useCallback(async () => {
    const [appRes, versionRes, policyRes, sdkRes] = await Promise.all([
      fetch(`/api/admin/apps/${appId}`),
      fetch(`/api/admin/apps/${appId}/versions`),
      fetch(`/api/admin/apps/${appId}/update-policy`),
      fetch(`/api/admin/apps/${appId}/sdk`),
    ]);

    const appData = (await appRes.json()) as { app?: AppDetail; message?: string };
    const versionData = (await versionRes.json()) as { items?: VersionItem[]; message?: string };
    const policyData = (await policyRes.json()) as { policy?: UpdatePolicyItem; message?: string };
    const sdkData = (await sdkRes.json()) as { sdk?: SdkInfo; message?: string };

    if (!appRes.ok) throw new Error(appData.message ?? "加载应用失败");
    if (!versionRes.ok) throw new Error(versionData.message ?? "加载版本失败");
    if (!policyRes.ok) throw new Error(policyData.message ?? "加载更新策略失败");
    if (!sdkRes.ok) throw new Error(sdkData.message ?? "加载 SDK 信息失败");

    const appValue = appData.app ?? null;
    setApp(appValue);
    setVersions(versionData.items ?? []);
    setSdkInfo(sdkData.sdk ?? null);

    if (appValue) {
      appForm.reset({
        name: appValue.name,
        description: appValue.description ?? "",
        weekPoints: appValue.weekPoints,
        monthPoints: appValue.monthPoints,
        yearPoints: appValue.yearPoints,
        lifetimePoints: appValue.lifetimePoints,
      });
    }

    const policy = policyData.policy;
    policyForm.reset({
      offlineTtlSeconds: policy?.offlineTtlSeconds ?? 900,
      forceUpdateMinVersion: policy?.forceUpdateMinVersion ?? "",
    });
  }, [appForm, appId, policyForm]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setError(null);
      try {
        await loadAll();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载失败");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  async function onSaveApp(values: AppFormData) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "保存应用失败");
      return;
    }

    setMessage("应用已保存");
    await loadAll();
  }

  async function onCreateVersion(values: VersionFormData) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "创建版本失败");
      return;
    }

    setMessage("版本已创建");
    versionForm.reset({ version: "", downloadUrl: "", releaseNote: "" });
    await loadAll();
  }

  async function onUpdateVersion(item: VersionItem) {
    const downloadUrl = window.prompt("请输入新的下载地址：", item.downloadUrl);
    if (!downloadUrl) return;

    const releaseNote = window.prompt("请输入新的更新说明（可选）：", item.releaseNote ?? "") ?? "";

    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}/versions/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadUrl, releaseNote }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "更新版本失败");
      return;
    }

    setMessage("版本已更新");
    await loadAll();
  }

  async function onDeleteVersion(versionId: string) {
    if (!window.confirm("确认删除该版本吗？")) return;

    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}/versions/${versionId}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "删除版本失败");
      return;
    }

    setMessage("版本已删除");
    await loadAll();
  }

  async function onSaveUpdatePolicy(values: UpdatePolicyFormData) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}/update-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offlineTtlSeconds: values.offlineTtlSeconds,
        forceUpdateMinVersion: values.forceUpdateMinVersion?.trim()
          ? values.forceUpdateMinVersion.trim()
          : null,
      }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "保存更新策略失败");
      return;
    }

    setMessage("更新策略已保存");
    await loadAll();
  }

  async function onRotateSecrets(target: RotateTarget) {
    setError(null);
    setMessage(null);
    setRotateResult(null);
    setRotating(target);

    try {
      const res = await fetch(`/api/admin/apps/${appId}/sdk/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = (await res.json()) as { message?: string; result?: RotateResult };
      if (!res.ok || !data.result) {
        setError(data.message ?? "轮换密钥失败");
        return;
      }

      setRotateResult(data.result);
      setMessage("密钥轮换成功，新密钥已生成。");
      await loadAll();
    } finally {
      setRotating(null);
    }
  }

  function onDownloadSdk() {
    setError(null);
    setMessage(null);
    setDownloadingSdk(true);
    window.location.href = `/api/admin/apps/${appId}/sdk/download`;
    setTimeout(() => setDownloadingSdk(false), 1000);
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

      <div className="grid gap-4 lg:grid-cols-2">
      <Card id="app-edit">
        <CardHeader>
          <CardTitle>编辑应用</CardTitle>
          <CardDescription>{app ? `${app.name}（${app.id}）` : <Skeleton className="h-4 w-52" />}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={appForm.handleSubmit(onSaveApp)}>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input {...appForm.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label>简介</Label>
              <Input {...appForm.register("description")} />
            </div>
            <div className="space-y-1.5">
              <Label>周卡积分</Label>
              <Input type="number" {...appForm.register("weekPoints", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>月卡积分</Label>
              <Input type="number" {...appForm.register("monthPoints", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>年卡积分</Label>
              <Input type="number" {...appForm.register("yearPoints", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>永久积分</Label>
              <Input type="number" {...appForm.register("lifetimePoints", { valueAsNumber: true })} />
            </div>
            <Button type="submit" disabled={appForm.formState.isSubmitting}>
              {appForm.formState.isSubmitting ? "保存中..." : "保存应用"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card id="version-create">
        <CardHeader>
          <CardTitle>新增版本</CardTitle>
          <CardDescription>创建并管理下载版本。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={versionForm.handleSubmit(onCreateVersion)}>
            <div className="space-y-1.5">
              <Label>版本号</Label>
              <Input placeholder="例如 1.0.0" {...versionForm.register("version")} />
            </div>
            <div className="space-y-1.5">
              <Label>下载地址</Label>
              <Input placeholder="https://" {...versionForm.register("downloadUrl")} />
            </div>
            <div className="space-y-1.5">
              <Label>更新说明</Label>
              <Input {...versionForm.register("releaseNote")} />
            </div>
            <Button type="submit" disabled={versionForm.formState.isSubmitting}>
              {versionForm.formState.isSubmitting ? "创建中..." : "创建版本"}
            </Button>
          </form>

          <div className="mt-4 max-h-[360px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本号</TableHead>
                  <TableHead>下载地址</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.version}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs">{item.downloadUrl}</TableCell>
                    <TableCell className="text-xs">{new Date(item.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs underline underline-offset-4"
                          onClick={() => {
                            void onUpdateVersion(item);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-destructive text-xs underline underline-offset-4"
                          onClick={() => {
                            void onDeleteVersion(item.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="update-policy" className="lg:col-span-2">
        <CardHeader>
          <CardTitle>更新策略配置</CardTitle>
          <CardDescription>配置离线容错 TTL 与强制更新最低版本策略。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={policyForm.handleSubmit(onSaveUpdatePolicy)}>
            <div className="space-y-1.5">
              <Label>离线容错 TTL（秒）</Label>
              <Input type="number" {...policyForm.register("offlineTtlSeconds", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>强制更新最低版本（可选）</Label>
              <Input placeholder="例如 2.0.0" {...policyForm.register("forceUpdateMinVersion")} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={policyForm.formState.isSubmitting}>
                {policyForm.formState.isSubmitting ? "保存中..." : "保存更新策略"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="sdk-manager" className="lg:col-span-2">
        <CardHeader>
          <CardTitle>SDK 与密钥管理</CardTitle>
          <CardDescription>下载应用 SDK 文件，并轮换 SDK 密钥与更新签名密钥。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">SDK Key</p>
              <p className="font-mono text-xs break-all">{sdkInfo?.sdkKey ?? "-"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">SDK Secret（预览）</p>
              <p className="font-mono text-xs break-all">{sdkInfo?.sdkSecretPreview ?? "-"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">更新签名密钥（预览）</p>
              <p className="font-mono text-xs break-all">{sdkInfo?.updateSignSecretPreview ?? "-"}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">旧 SDK 密钥（过渡窗口）</p>
              <p className="font-mono text-xs break-all">{sdkInfo?.previousSdkSecretPreview ?? "无"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                过期时间：
                {sdkInfo?.previousSdkSecretExpiresAt
                  ? new Date(sdkInfo.previousSdkSecretExpiresAt).toLocaleString()
                  : "无"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">旧更新签名密钥（过渡窗口）</p>
              <p className="font-mono text-xs break-all">{sdkInfo?.previousUpdateSignSecretPreview ?? "无"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                过期时间：
                {sdkInfo?.previousUpdateSignSecretExpiresAt
                  ? new Date(sdkInfo.previousUpdateSignSecretExpiresAt).toLocaleString()
                  : "无"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onDownloadSdk} disabled={downloadingSdk}>
              {downloadingSdk ? "下载中..." : "下载 PHP SDK"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRotateSecrets("SDK_SECRET")}
              disabled={Boolean(rotating)}
            >
              {rotating === "SDK_SECRET" ? "轮换中..." : "轮换 SDK 密钥"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRotateSecrets("UPDATE_SIGN_SECRET")}
              disabled={Boolean(rotating)}
            >
              {rotating === "UPDATE_SIGN_SECRET" ? "轮换中..." : "轮换更新签名密钥"}
            </Button>
            <Button
              type="button"
              onClick={() => void onRotateSecrets("BOTH")}
              disabled={Boolean(rotating)}
            >
              {rotating === "BOTH" ? "轮换中..." : "同时轮换两种密钥"}
            </Button>
          </div>

          {rotateResult ? (
            <Alert className="border-primary/30 bg-primary/10">
              <AlertTitle>新密钥（仅本次显示）</AlertTitle>
              <AlertDescription className="space-y-2">
                {rotateResult.sdkSecret ? (
                  <p className="font-mono text-xs break-all">SDK Secret: {rotateResult.sdkSecret}</p>
                ) : null}
                {rotateResult.updateSignSecret ? (
                  <p className="font-mono text-xs break-all">
                    更新签名密钥: {rotateResult.updateSignSecret}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  轮换时间：{new Date(rotateResult.rotatedAt).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  旧密钥过渡窗口截止：
                  {rotateResult.previousSdkSecretExpiresAt
                    ? new Date(rotateResult.previousSdkSecretExpiresAt).toLocaleString()
                    : rotateResult.previousUpdateSignSecretExpiresAt
                      ? new Date(rotateResult.previousUpdateSignSecretExpiresAt).toLocaleString()
                      : "无"}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      </div>
    </>
  );
}
