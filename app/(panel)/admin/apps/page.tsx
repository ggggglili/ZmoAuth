"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  downloadUrl: z.union([z.string().url().max(2000), z.literal("")]).optional(),
  weekPoints: z.number().int().nonnegative(),
  monthPoints: z.number().int().nonnegative(),
  yearPoints: z.number().int().nonnegative(),
  lifetimePoints: z.number().int().nonnegative(),
});

type FormData = z.infer<typeof schema>;
const versionSchema = z.object({
  version: z.string().min(1).max(50),
  downloadUrl: z.string().url().max(2000),
  releaseNote: z.string().max(2000).optional(),
});

const updatePolicySchema = z.object({
  offlineTtlSeconds: z.number().int().min(60).max(604800),
  forceUpdateMinVersion: z.string().max(50).optional(),
});

type VersionFormData = z.infer<typeof versionSchema>;
type UpdatePolicyFormData = z.infer<typeof updatePolicySchema>;

interface AppItem {
  id: string;
  name: string;
  description: string | null;
  downloadUrl: string | null;
  weekPoints: number;
  monthPoints: number;
  yearPoints: number;
  lifetimePoints: number;
  isDeleted: boolean;
  updatedAt: string;
  _count: {
    versions: number;
    members: number;
  };
}

interface AppDetail {
  id: string;
  name: string;
  description: string | null;
  downloadUrl: string | null;
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

interface MemberItem {
  userId: string;
  role: "OWNER" | "RESELLER" | "MEMBER";
  user: { id: string; email: string; role: string };
}

interface DiscountItem {
  userId: string;
  email: string;
  role: string;
  discountRate: number;
  updatedAt: string | null;
}

function getMemberRoleLabel(role: MemberItem["role"]) {
  switch (role) {
    case "OWNER":
      return "所有者";
    case "RESELLER":
      return "授权商";
    default:
      return "普通用户";
  }
}

function getDiscountRoleLabel(role: string) {
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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

const sheetContentClassName = "w-full overflow-y-auto border-border/70 sm:max-w-md";
const APP_PAGE_SIZE = 10;

export default function AdminAppsPage() {
  const [items, setItems] = useState<AppItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [appSearch, setAppSearch] = useState("");
  const [appPage, setAppPage] = useState(1);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [versionSheetOpen, setVersionSheetOpen] = useState(false);
  const [policySheetOpen, setPolicySheetOpen] = useState(false);
  const [sdkSheetOpen, setSdkSheetOpen] = useState(false);

  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkInfo, setSdkInfo] = useState<SdkInfo | null>(null);
  const [rotateResult, setRotateResult] = useState<RotateResult | null>(null);
  const [rotating, setRotating] = useState<RotateTarget | null>(null);
  const [downloadingSdk, setDownloadingSdk] = useState(false);

  const [membersSheetOpen, setMembersSheetOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);

  const [discountSheetOpen, setDiscountSheetOpen] = useState(false);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [activeApp, setActiveApp] = useState<AppItem | null>(null);
  const [appDeleteTargetId, setAppDeleteTargetId] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState(false);
  const [versionDeleteTarget, setVersionDeleteTarget] = useState<VersionItem | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const [versionEditOpen, setVersionEditOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<VersionItem | null>(null);
  const [versionEditDownloadUrl, setVersionEditDownloadUrl] = useState("");
  const [versionEditReleaseNote, setVersionEditReleaseNote] = useState("");
  const [savingVersionEdit, setSavingVersionEdit] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      downloadUrl: "",
      weekPoints: 10,
      monthPoints: 30,
      yearPoints: 300,
      lifetimePoints: 999,
    },
  });

  const editForm = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      downloadUrl: "",
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

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/apps");
      const data = (await res.json()) as { items?: AppItem[]; message?: string };
      if (!res.ok) {
        setError(data.message ?? "加载应用列表失败");
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("加载应用列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async (appId: string) => {
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/admin/apps/${appId}/versions`);
      const data = (await res.json()) as { items?: VersionItem[]; message?: string };
      if (!res.ok) {
        setError(data.message ?? "加载版本失败");
        setVersions([]);
        return;
      }
      setVersions(data.items ?? []);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (appId: string) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(`/api/admin/apps/${appId}/members`);
      const data = (await res.json()) as { items?: MemberItem[]; message?: string };
      if (!res.ok) {
        setMembersError(data.message ?? "加载成员失败");
        setMembers([]);
        return;
      }
      setMembers(data.items ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadDiscounts = useCallback(async (appId: string) => {
    setDiscountsLoading(true);
    setDiscountError(null);
    try {
      const res = await fetch(`/api/admin/apps/${appId}/reseller-discounts`);
      const data = (await res.json()) as { items?: DiscountItem[]; message?: string };
      if (!res.ok) {
        setDiscountError(data.message ?? "加载折扣失败");
        setDiscounts([]);
        return;
      }
      const list = data.items ?? [];
      setDiscounts(list);
      setDrafts(Object.fromEntries(list.map((item) => [item.userId, String(item.discountRate)])));
    } finally {
      setDiscountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (message) toast.success(message);
  }, [message]);

  useEffect(() => {
    if (discountError) toast.error(discountError);
  }, [discountError]);

  useEffect(() => {
    if (discountMessage) toast.success(discountMessage);
  }, [discountMessage]);

  const filteredItems = useMemo(() => {
    const keyword = appSearch.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) => {
      const haystack = [
        item.name,
        item.description ?? "",
        item.downloadUrl ?? "",
        String(item.weekPoints),
        String(item.monthPoints),
        String(item.yearPoints),
        String(item.lifetimePoints),
        String(item._count.versions),
        String(item._count.members),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [appSearch, items]);

  const appTotalPages = Math.max(1, Math.ceil(filteredItems.length / APP_PAGE_SIZE));
  const appCurrentPage = Math.min(appPage, appTotalPages);
  const pagedItems = useMemo(() => {
    const start = (appCurrentPage - 1) * APP_PAGE_SIZE;
    return filteredItems.slice(start, start + APP_PAGE_SIZE);
  }, [appCurrentPage, filteredItems]);

  function normalizeAppPayload(values: FormData) {
    return {
      ...values,
      description: values.description?.trim() ? values.description.trim() : null,
      downloadUrl: values.downloadUrl?.trim() ? values.downloadUrl.trim() : null,
    };
  }

  async function onSubmit(values: FormData) {
    setError(null);
    setMessage(null);

    const res = await fetch("/api/admin/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeAppPayload(values)),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "创建应用失败");
      return;
    }

    setMessage("应用已创建");
    setCreateSheetOpen(false);
    form.reset({
      name: "",
      description: "",
      downloadUrl: "",
      weekPoints: 10,
      monthPoints: 30,
      yearPoints: 300,
      lifetimePoints: 999,
    });
    await loadApps();
  }

  async function onDelete(appId: string) {
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${appId}`, { method: "DELETE" });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "删除失败");
      return;
    }

    setMessage("应用已删除");
    await loadApps();
  }

  async function onConfirmDeleteApp() {
    if (!appDeleteTargetId) return;

    setDeletingApp(true);
    try {
      await onDelete(appDeleteTargetId);
      setAppDeleteTargetId(null);
    } finally {
      setDeletingApp(false);
    }
  }

  async function openEditSheet(app: AppItem) {
    setError(null);
    setMessage(null);
    setActiveApp(app);
    setEditSheetOpen(true);

    const res = await fetch(`/api/admin/apps/${app.id}`);
    const data = (await res.json()) as { app?: AppDetail; message?: string };
    if (!res.ok || !data.app) {
      setError(data.message ?? "加载应用详情失败");
      return;
    }

    editForm.reset({
      name: data.app.name,
      description: data.app.description ?? "",
      downloadUrl: data.app.downloadUrl ?? "",
      weekPoints: data.app.weekPoints,
      monthPoints: data.app.monthPoints,
      yearPoints: data.app.yearPoints,
      lifetimePoints: data.app.lifetimePoints,
    });
  }

  async function onSaveApp(values: FormData) {
    if (!activeApp) return;
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${activeApp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeAppPayload(values)),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "保存应用失败");
      return;
    }

    setMessage("应用已更新");
    await loadApps();
  }

  async function openVersionSheet(app: AppItem) {
    setError(null);
    setMessage(null);
    setActiveApp(app);
    setVersions([]);
    setVersionSheetOpen(true);
    await loadVersions(app.id);
  }

  async function onCreateVersion(values: VersionFormData) {
    if (!activeApp) return;
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${activeApp.id}/versions`, {
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
    await loadVersions(activeApp.id);
    await loadApps();
  }

  function onUpdateVersion(item: VersionItem) {
    setEditingVersion(item);
    setVersionEditDownloadUrl(item.downloadUrl);
    setVersionEditReleaseNote(item.releaseNote ?? "");
    setVersionEditOpen(true);
  }

  async function onSubmitVersionEdit() {
    if (!activeApp || !editingVersion) return;

    const nextDownloadUrl = versionEditDownloadUrl.trim();
    if (!nextDownloadUrl) {
      setError("下载地址不能为空");
      return;
    }

    const releaseNote = versionEditReleaseNote.trim() ? versionEditReleaseNote.trim() : null;

    setError(null);
    setMessage(null);
    setSavingVersionEdit(true);
    try {
      const res = await fetch(`/api/admin/apps/${activeApp.id}/versions/${editingVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadUrl: nextDownloadUrl,
          releaseNote,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "更新版本失败");
        return;
      }

      setMessage("版本已更新");
      setVersionEditOpen(false);
      setEditingVersion(null);
      await loadVersions(activeApp.id);
    } finally {
      setSavingVersionEdit(false);
    }
  }

  async function onDeleteVersion(versionId: string) {
    if (!activeApp) return;

    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${activeApp.id}/versions/${versionId}`, { method: "DELETE" });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "删除版本失败");
      return;
    }

    setMessage("版本已删除");
    await loadVersions(activeApp.id);
    await loadApps();
  }

  async function onConfirmDeleteVersion() {
    if (!versionDeleteTarget) return;

    setDeletingVersion(true);
    try {
      await onDeleteVersion(versionDeleteTarget.id);
      setVersionDeleteTarget(null);
    } finally {
      setDeletingVersion(false);
    }
  }

  async function openPolicySheet(app: AppItem) {
    setError(null);
    setMessage(null);
    setActiveApp(app);
    setPolicySheetOpen(true);

    const res = await fetch(`/api/admin/apps/${app.id}/update-policy`);
    const data = (await res.json()) as { policy?: UpdatePolicyItem; message?: string };
    if (!res.ok) {
      setError(data.message ?? "加载更新策略失败");
      return;
    }

    policyForm.reset({
      offlineTtlSeconds: data.policy?.offlineTtlSeconds ?? 900,
      forceUpdateMinVersion: data.policy?.forceUpdateMinVersion ?? "",
    });
  }

  async function onSaveUpdatePolicy(values: UpdatePolicyFormData) {
    if (!activeApp) return;

    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/apps/${activeApp.id}/update-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offlineTtlSeconds: values.offlineTtlSeconds,
        forceUpdateMinVersion: values.forceUpdateMinVersion?.trim() ? values.forceUpdateMinVersion.trim() : null,
      }),
    });
    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "保存更新策略失败");
      return;
    }

    setMessage("更新策略已保存");
  }

  async function openSdkSheet(app: AppItem) {
    setError(null);
    setMessage(null);
    setActiveApp(app);
    setRotateResult(null);
    setSdkInfo(null);
    setSdkSheetOpen(true);
    setSdkLoading(true);

    try {
      const res = await fetch(`/api/admin/apps/${app.id}/sdk`);
      const data = (await res.json()) as { sdk?: SdkInfo; message?: string };
      if (!res.ok || !data.sdk) {
        setError(data.message ?? "加载 SDK 信息失败");
        return;
      }
      setSdkInfo(data.sdk);
    } finally {
      setSdkLoading(false);
    }
  }

  async function onRotateSecrets(target: RotateTarget) {
    if (!activeApp) return;

    setRotating(target);
    setError(null);
    setMessage(null);
    setRotateResult(null);

    try {
      const res = await fetch(`/api/admin/apps/${activeApp.id}/sdk/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });

      const data = (await res.json()) as { result?: RotateResult; message?: string };
      if (!res.ok || !data.result) {
        setError(data.message ?? "轮换密钥失败");
        return;
      }

      setRotateResult(data.result);
      setMessage("密钥已轮换");
      await openSdkSheet(activeApp);
    } finally {
      setRotating(null);
    }
  }

  function onDownloadSdk() {
    if (!activeApp) return;

    setDownloadingSdk(true);
    window.location.href = `/api/admin/apps/${activeApp.id}/sdk/download`;
    setTimeout(() => setDownloadingSdk(false), 1000);
  }

  async function onSaveDiscount(userId: string) {
    if (!activeApp) return;

    const raw = drafts[userId];
    const discountRate = Number(raw);
    if (!Number.isFinite(discountRate) || discountRate <= 0 || discountRate > 1) {
      setDiscountError("折扣比例必须大于 0 且小于等于 1");
      setDiscountMessage(null);
      return;
    }

    setSavingUserId(userId);
    setDiscountError(null);
    setDiscountMessage(null);
    try {
      const res = await fetch(`/api/admin/apps/${activeApp.id}/reseller-discounts/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountRate }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setDiscountError(data.message ?? "保存折扣失败");
        return;
      }
      setDiscountMessage("折扣已更新");
      await loadDiscounts(activeApp.id);
    } finally {
      setSavingUserId(null);
    }
  }

  async function openMembersSheet(app: AppItem) {
    setActiveApp(app);
    setMembersSheetOpen(true);
    setMembers([]);
    await loadMembers(app.id);
  }

  async function openDiscountSheet(app: AppItem) {
    setActiveApp(app);
    setDiscountSheetOpen(true);
    setDiscountMessage(null);
    setDiscountError(null);
    setDiscounts([]);
    await loadDiscounts(app.id);
  }

  return (
    <div className="space-y-4">
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
                value={appSearch}
                onChange={(event) => {
                  setAppSearch(event.target.value);
                  setAppPage(1);
                }}
                placeholder="搜索"
                className="pl-9"
              />
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
                <SheetTrigger asChild>
                  <Button>
                    <Plus className="size-4" />
                    新建应用
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className={sheetContentClassName}>
                  <SheetHeader>
                    <SheetTitle>创建应用</SheetTitle>
                    <SheetDescription>创建新应用并配置积分价格。</SheetDescription>
                  </SheetHeader>

                  <div className="px-4 pb-4">
                    <Card className="border-border/70 shadow-none">
                      <CardContent className="p-4">
                        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                          <FieldGroup>
                            <Field>
                              <FieldLabel htmlFor="create-app-name">名称</FieldLabel>
                              <Input id="create-app-name" {...form.register("name")} />
                              <FieldError errors={[form.formState.errors.name]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="create-app-description">简介（可选）</FieldLabel>
                              <Textarea id="create-app-description" rows={3} {...form.register("description")} />
                              <FieldError errors={[form.formState.errors.description]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="create-app-download-url">下载地址（可选）</FieldLabel>
                              <Input id="create-app-download-url" placeholder="https://" {...form.register("downloadUrl")} />
                              <FieldError errors={[form.formState.errors.downloadUrl]} />
                            </Field>
                          </FieldGroup>

                          <Separator />

                          <FieldGroup>
                            <Field>
                              <FieldLabel htmlFor="create-app-week-points">周卡积分</FieldLabel>
                              <Input
                                id="create-app-week-points"
                                type="number"
                                {...form.register("weekPoints", { valueAsNumber: true })}
                              />
                              <FieldError errors={[form.formState.errors.weekPoints]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="create-app-month-points">月卡积分</FieldLabel>
                              <Input
                                id="create-app-month-points"
                                type="number"
                                {...form.register("monthPoints", { valueAsNumber: true })}
                              />
                              <FieldError errors={[form.formState.errors.monthPoints]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="create-app-year-points">年卡积分</FieldLabel>
                              <Input
                                id="create-app-year-points"
                                type="number"
                                {...form.register("yearPoints", { valueAsNumber: true })}
                              />
                              <FieldError errors={[form.formState.errors.yearPoints]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="create-app-lifetime-points">永久积分</FieldLabel>
                              <Input
                                id="create-app-lifetime-points"
                                type="number"
                                {...form.register("lifetimePoints", { valueAsNumber: true })}
                              />
                              <FieldError errors={[form.formState.errors.lifetimePoints]} />
                            </Field>
                          </FieldGroup>

                          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? "创建中..." : "创建应用"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col overflow-hidden pt-0 pb-0">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px] whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>应用</TableHead>
                    <TableHead>积分配置</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead>统计</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: APP_PAGE_SIZE }).map((_, index) => (
                        <TableRow key={`app-loading-${index}`}>
                          <TableCell>
                            <Skeleton className="h-4 w-44" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-36" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Skeleton className="h-8 w-12" />
                              <Skeleton className="h-8 w-12" />
                              <Skeleton className="h-8 w-8" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                  {!loading && filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-4">
                        <Alert>
                          <AlertTitle>暂无应用</AlertTitle>
                          <AlertDescription>
                            {appSearch.trim() ? "没有匹配的应用数据，请调整搜索关键词。" : "当前没有应用数据，请先创建应用。"}
                          </AlertDescription>
                        </Alert>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loading
                    ? pagedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <p className="font-medium">{item.name}</p>
                              <p className="max-w-[360px] truncate text-xs text-muted-foreground">
                                {item.description ?? "暂无简介"}
                              </p>
                              <p className="max-w-[420px] truncate text-xs text-muted-foreground">
                                下载地址：{item.downloadUrl ?? "-"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <div className="grid max-w-[220px] grid-cols-2 gap-1.5">
                              <Badge variant="outline">周 {item.weekPoints}</Badge>
                              <Badge variant="outline">月 {item.monthPoints}</Badge>
                              <Badge variant="outline">年 {item.yearPoints}</Badge>
                              <Badge variant="outline">永久 {item.lifetimePoints}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-xs text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="align-middle">
                            <div className="flex max-w-[220px] flex-col gap-1.5">
                              <Badge variant="secondary">版本 {item._count.versions}</Badge>
                              <Badge variant="secondary">成员 {item._count.members}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void openEditSheet(item);
                                }}
                              >
                                编辑
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void openVersionSheet(item);
                                }}
                              >
                                版本
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" size="icon-sm" variant="outline" aria-label="更多操作">
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      void openPolicySheet(item);
                                    }}
                                  >
                                    策略
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      void openSdkSheet(item);
                                    }}
                                  >
                                    SDK
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      void openMembersSheet(item);
                                    }}
                                  >
                                    成员
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      void openDiscountSheet(item);
                                    }}
                                  >
                                    折扣
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      setAppDeleteTargetId(item.id);
                                    }}
                                  >
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>
          </div>
          {!loading && filteredItems.length > 0 ? (
            <div className="py-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    第 {appCurrentPage} / {appTotalPages} 页
                  </Badge>
                  <Badge variant="outline" className="h-7 px-2 text-xs md:h-8 md:px-3 md:text-sm">
                    每页 {APP_PAGE_SIZE} 条
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={appCurrentPage <= 1}
                    onClick={() => setAppPage(Math.max(1, appCurrentPage - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={appCurrentPage >= appTotalPages}
                    onClick={() => setAppPage(Math.min(appTotalPages, appCurrentPage + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>编辑应用</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "应用详情"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="p-4">
                <form className="space-y-4" onSubmit={editForm.handleSubmit(onSaveApp)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="edit-app-name">名称</FieldLabel>
                      <Input id="edit-app-name" {...editForm.register("name")} />
                      <FieldError errors={[editForm.formState.errors.name]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-app-description">简介（可选）</FieldLabel>
                      <Textarea id="edit-app-description" rows={3} {...editForm.register("description")} />
                      <FieldError errors={[editForm.formState.errors.description]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-app-download-url">下载地址（可选）</FieldLabel>
                      <Input id="edit-app-download-url" placeholder="https://" {...editForm.register("downloadUrl")} />
                      <FieldError errors={[editForm.formState.errors.downloadUrl]} />
                    </Field>
                  </FieldGroup>
                  <Separator />
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="edit-app-week-points">周卡积分</FieldLabel>
                      <Input id="edit-app-week-points" type="number" {...editForm.register("weekPoints", { valueAsNumber: true })} />
                      <FieldError errors={[editForm.formState.errors.weekPoints]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-app-month-points">月卡积分</FieldLabel>
                      <Input id="edit-app-month-points" type="number" {...editForm.register("monthPoints", { valueAsNumber: true })} />
                      <FieldError errors={[editForm.formState.errors.monthPoints]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-app-year-points">年卡积分</FieldLabel>
                      <Input id="edit-app-year-points" type="number" {...editForm.register("yearPoints", { valueAsNumber: true })} />
                      <FieldError errors={[editForm.formState.errors.yearPoints]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-app-lifetime-points">永久积分</FieldLabel>
                      <Input
                        id="edit-app-lifetime-points"
                        type="number"
                        {...editForm.register("lifetimePoints", { valueAsNumber: true })}
                      />
                      <FieldError errors={[editForm.formState.errors.lifetimePoints]} />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" className="w-full" disabled={editForm.formState.isSubmitting}>
                    {editForm.formState.isSubmitting ? "保存中..." : "保存应用"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={versionSheetOpen} onOpenChange={setVersionSheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>版本管理</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "新增版本"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="space-y-4 p-4">
                <form className="space-y-4" onSubmit={versionForm.handleSubmit(onCreateVersion)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="create-version-name">版本号</FieldLabel>
                      <Input id="create-version-name" placeholder="例如 1.0.0" {...versionForm.register("version")} />
                      <FieldError errors={[versionForm.formState.errors.version]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-version-download-url">下载地址</FieldLabel>
                      <Input
                        id="create-version-download-url"
                        placeholder="https://"
                        {...versionForm.register("downloadUrl")}
                      />
                      <FieldError errors={[versionForm.formState.errors.downloadUrl]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-version-release-note">更新说明（可选）</FieldLabel>
                      <Textarea id="create-version-release-note" rows={3} {...versionForm.register("releaseNote")} />
                      <FieldError errors={[versionForm.formState.errors.releaseNote]} />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" className="w-full" disabled={versionForm.formState.isSubmitting}>
                    {versionForm.formState.isSubmitting ? "创建中..." : "创建版本"}
                  </Button>
                </form>

                <Separator />

                {versionsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={`versions-loading-${index}`} className="h-9 w-full" />
                    ))}
                  </div>
                ) : versions.length === 0 ? (
                  <Alert>
                    <AlertTitle>暂无版本</AlertTitle>
                    <AlertDescription>当前应用暂无版本，请先创建版本。</AlertDescription>
                  </Alert>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <Table className="min-w-[720px] whitespace-nowrap">
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
                            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                              {item.downloadUrl}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button type="button" size="xs" variant="outline" onClick={() => onUpdateVersion(item)}>
                                  编辑
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="destructive"
                                  onClick={() => setVersionDeleteTarget(item)}
                                >
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={policySheetOpen} onOpenChange={setPolicySheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>更新策略配置</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "更新策略"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="p-4">
                <form className="space-y-4" onSubmit={policyForm.handleSubmit(onSaveUpdatePolicy)}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="policy-offline-ttl">离线容错 TTL（秒）</FieldLabel>
                      <Input
                        id="policy-offline-ttl"
                        type="number"
                        {...policyForm.register("offlineTtlSeconds", { valueAsNumber: true })}
                      />
                      <FieldError errors={[policyForm.formState.errors.offlineTtlSeconds]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="policy-force-version">强制更新最低版本（可选）</FieldLabel>
                      <Input id="policy-force-version" placeholder="例如 2.0.0" {...policyForm.register("forceUpdateMinVersion")} />
                      <FieldError errors={[policyForm.formState.errors.forceUpdateMinVersion]} />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" className="w-full" disabled={policyForm.formState.isSubmitting}>
                    {policyForm.formState.isSubmitting ? "保存中..." : "保存更新策略"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sdkSheetOpen} onOpenChange={setSdkSheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>SDK 与密钥管理</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "SDK 信息"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="space-y-4 p-4">
                {sdkLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
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

                    <div className="space-y-3">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">旧 SDK 密钥（过渡窗口）</p>
                        <p className="font-mono text-xs break-all">{sdkInfo?.previousSdkSecretPreview ?? "无"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          过期时间：{formatDateTime(sdkInfo?.previousSdkSecretExpiresAt ?? null)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">旧更新签名密钥（过渡窗口）</p>
                        <p className="font-mono text-xs break-all">
                          {sdkInfo?.previousUpdateSignSecretPreview ?? "无"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          过期时间：{formatDateTime(sdkInfo?.previousUpdateSignSecretExpiresAt ?? null)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
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
                      <Button type="button" onClick={() => void onRotateSecrets("BOTH")} disabled={Boolean(rotating)}>
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
                            <p className="font-mono text-xs break-all">更新签名密钥: {rotateResult.updateSignSecret}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            轮换时间：{new Date(rotateResult.rotatedAt).toLocaleString()}
                          </p>
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={membersSheetOpen} onOpenChange={setMembersSheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>成员管理</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "成员列表"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="space-y-3 p-4">
                {membersLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={`members-loading-${index}`} className="h-9 w-full" />
                    ))}
                  </div>
                ) : null}

                {membersError ? (
                  <Alert>
                    <AlertTitle>加载失败</AlertTitle>
                    <AlertDescription>{membersError}</AlertDescription>
                  </Alert>
                ) : null}

                {!membersLoading && !membersError ? (
                  members.length === 0 ? (
                    <Alert>
                      <AlertTitle>暂无成员</AlertTitle>
                      <AlertDescription>当前应用暂无成员。</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>邮箱</TableHead>
                            <TableHead>角色</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {members.map((member) => (
                            <TableRow key={`${member.userId}:${member.role}`}>
                              <TableCell className="max-w-[260px] break-all text-xs">{member.user.email}</TableCell>
                              <TableCell>{getMemberRoleLabel(member.role)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                ) : null}
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={discountSheetOpen} onOpenChange={setDiscountSheetOpen}>
        <SheetContent side="right" className={sheetContentClassName}>
          <SheetHeader>
            <SheetTitle>成员折扣</SheetTitle>
            <SheetDescription>{activeApp ? `应用：${activeApp.name}` : "折扣列表"}</SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            <div className="space-y-4">
              {discountsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={`discount-loading-${index}`} className="h-24 w-full" />
                  ))}
                </div>
              ) : null}

              {discountError ? (
                <Alert>
                  <AlertTitle>加载失败</AlertTitle>
                  <AlertDescription>{discountError}</AlertDescription>
                </Alert>
              ) : null}

              {!discountsLoading && !discountError ? (
                discounts.length === 0 ? (
                  <Alert>
                    <AlertTitle>暂无可配置授权商</AlertTitle>
                    <AlertDescription>当前应用暂无授权商可配置折扣。</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {discounts.map((item) => (
                      <Card className="border-border/70 shadow-none" key={item.userId}>
                        <CardContent className="space-y-3 p-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{item.email}</p>
                            <p className="text-xs text-muted-foreground">{getDiscountRoleLabel(item.role)}</p>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              value={drafts[item.userId] ?? ""}
                              onChange={(event) => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.userId]: event.target.value,
                                }));
                              }}
                              placeholder="输入 0-1 之间的小数，例如 0.85"
                            />
                            <Button
                              size="sm"
                              disabled={savingUserId === item.userId}
                              onClick={() => {
                                void onSaveDiscount(item.userId);
                              }}
                            >
                              {savingUserId === item.userId ? "保存中..." : "保存"}
                            </Button>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            更新时间：{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={versionEditOpen}
        onOpenChange={(open) => {
          setVersionEditOpen(open);
          if (!open) {
            setEditingVersion(null);
            setVersionEditDownloadUrl("");
            setVersionEditReleaseNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑版本</DialogTitle>
            <DialogDescription>
              {editingVersion ? `版本：${editingVersion.version}` : "修改版本下载地址和更新说明。"}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-version-download-url">下载地址</FieldLabel>
              <Input
                id="edit-version-download-url"
                value={versionEditDownloadUrl}
                onChange={(event) => setVersionEditDownloadUrl(event.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-version-release-note">更新说明（可选）</FieldLabel>
              <Textarea
                id="edit-version-release-note"
                rows={3}
                value={versionEditReleaseNote}
                onChange={(event) => setVersionEditReleaseNote(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVersionEditOpen(false);
              }}
              disabled={savingVersionEdit}
            >
              取消
            </Button>
            <Button onClick={() => void onSubmitVersionEdit()} disabled={savingVersionEdit}>
              {savingVersionEdit ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(appDeleteTargetId)} onOpenChange={(open) => !open && setAppDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除应用？</AlertDialogTitle>
            <AlertDialogDescription>该操作为软删除，应用数据不会立即物理移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingApp}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirmDeleteApp()} disabled={deletingApp}>
              {deletingApp ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(versionDeleteTarget)}
        onOpenChange={(open) => !open && setVersionDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除版本？</AlertDialogTitle>
            <AlertDialogDescription>
              {versionDeleteTarget ? `将删除版本 ${versionDeleteTarget.version}。` : "此操作不可撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingVersion}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirmDeleteVersion()} disabled={deletingVersion}>
              {deletingVersion ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
