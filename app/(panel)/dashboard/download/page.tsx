"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TopCenterAlert } from "@/components/ui/top-center-alert";

interface DownloadableAppItem {
  id: string;
  name: string;
  description: string | null;
  downloadUrl: string | null;
}

interface ApiErrorBody {
  message?: string;
}

export default function DashboardDownloadPage() {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<DownloadableAppItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sortedApps = useMemo(
    () => [...apps].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [apps]
  );

  const loadData = useCallback(async () => {
    const res = await fetch("/api/apps");
    const data = (await res.json()) as { items?: DownloadableAppItem[] } & ApiErrorBody;
    if (!res.ok) {
      throw new Error(data.message ?? "加载应用列表失败");
    }
    setApps(data.items ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadData();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载应用列表失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  function onDownload(url: string) {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = url;
    }
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(error)}
        title="加载失败"
        description={error ?? undefined}
        variant="error"
        onClose={() => setError(null)}
      />

      {!loading && sortedApps.length === 0 ? (
        <Alert>
          <AlertTitle>暂无可下载应用</AlertTitle>
          <AlertDescription>当前没有可展示的应用下载信息。</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={`download-skeleton-${index}`} className="border-border/70 shadow-none">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && sortedApps.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedApps.map((app) => {
            const canDownload = Boolean(app.downloadUrl);
            return (
              <Card key={app.id} className="border-border/70 shadow-none flex h-full flex-col">
                <CardHeader className="flex-1">
                  <CardTitle className="text-base">{app.name}</CardTitle>
                  <CardDescription className="h-12 overflow-hidden leading-6">
                    {app.description?.trim() || "暂无应用简介"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full"
                    disabled={!canDownload}
                    onClick={() => {
                      if (!app.downloadUrl) return;
                      onDownload(app.downloadUrl);
                    }}
                  >
                    {canDownload ? "下载文件" : "暂无下载地址"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
