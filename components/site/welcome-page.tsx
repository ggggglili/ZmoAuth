"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GalleryVerticalEnd, Infinity as InfinityIcon, LogIn } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DomainStatus = "AUTHORIZED" | "EXPIRED" | "UNAUTHORIZED";
type LicenseType = "WEEK" | "MONTH" | "YEAR" | "LIFETIME";

type QueryResult = {
  status: DomainStatus;
  domain: string;
  expiresAt: string | null;
  remainingDays: number | null;
  isPermanent: boolean;
  appName: string | null;
  licenseType: LicenseType | null;
};

type WelcomePageProps = {
  systemName: string;
};

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
}

function isValidDomain(value: string) {
  return /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value);
}

function formatExpireDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
}

function formatLicenseType(value: LicenseType | null) {
  if (!value) return "-";
  if (value === "WEEK") return "周卡";
  if (value === "MONTH") return "月卡";
  if (value === "YEAR") return "年卡";
  return "永久";
}

export function WelcomePage({ systemName }: WelcomePageProps) {
  const [domain, setDomain] = useState("");
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const statusBadge = useMemo(() => {
    if (!result) return null;
    if (result.status === "AUTHORIZED") {
      return (
        <Badge variant="outline" className="border-border/60 bg-muted text-muted-foreground">
          已授权
        </Badge>
      );
    }
    if (result.status === "EXPIRED") {
      return (
        <Badge variant="outline" className="border-border/60 bg-muted text-muted-foreground">
          已过期
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-border/60 bg-muted text-muted-foreground">
        未授权
      </Badge>
    );
  }, [result]);

  async function handleQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalized = normalizeDomain(domain);
    if (!normalized) {
      setResult(null);
      setError("请输入域名");
      return;
    }

    if (!isValidDomain(normalized)) {
      setResult(null);
      setError("域名格式不正确");
      return;
    }

    setQuerying(true);
    try {
      const response = await fetch(`/api/public/domain-authorization?domain=${encodeURIComponent(normalized)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as (Partial<QueryResult> & { message?: string }) | null;

      if (!response.ok) {
        setResult(null);
        setError(body?.message ?? "查询失败，请稍后重试");
        return;
      }

      setResult({
        status: body?.status === "AUTHORIZED" || body?.status === "EXPIRED" ? body.status : "UNAUTHORIZED",
        domain: typeof body?.domain === "string" ? body.domain : normalized,
        expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : null,
        remainingDays: typeof body?.remainingDays === "number" ? body.remainingDays : null,
        isPermanent: Boolean(body?.isPermanent),
        appName: typeof body?.appName === "string" ? body.appName : null,
        licenseType:
          body?.licenseType === "WEEK" ||
          body?.licenseType === "MONTH" ||
          body?.licenseType === "YEAR" ||
          body?.licenseType === "LIFETIME"
            ? body.licenseType
            : null,
      });
    } catch {
      setResult(null);
      setError("查询失败，请检查网络后重试");
    } finally {
      setQuerying(false);
    }
  }

  const queryPanel = (
    <div className="w-full max-w-2xl">
      <h1 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">域名查询</h1>

      <form onSubmit={handleQuery} className="mt-8 w-full">
        <div className="flex w-full items-center gap-2">
          <Input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="请输入域名"
            autoComplete="off"
            className="h-10 border-border/60 text-sm md:h-12 md:text-base"
          />
          <Button type="submit" disabled={querying} className="h-10 min-w-24 px-6 md:h-12">
            {querying ? "查询中..." : "查询"}
          </Button>
        </div>
      </form>

      <div className="mt-4 w-full">
        {error ? (
          <Alert className="border-border/60 bg-muted/60 text-muted-foreground">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 rounded-md border border-border/60 bg-gray-200 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium">{result.domain}</span>
            {statusBadge}
            <span>
              {result.status === "AUTHORIZED"
                ? result.isPermanent
                  ? "有效期：永久"
                  : `剩余：${result.remainingDays ?? 0} 天`
                : result.status === "EXPIRED"
                  ? `已过期（${formatExpireDate(result.expiresAt)})`
                  : "未授权"}
            </span>
            <span>应用：{result.appName ?? "-"}</span>
            <span>授权类型：{formatLicenseType(result.licenseType)}</span>
            {result.isPermanent ? <InfinityIcon className="size-4" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <main className="bg-muted min-h-svh">
      <section className="mx-auto flex min-h-svh w-full max-w-md flex-col p-6 md:p-10 lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </span>
            <span>{systemName}</span>
          </Link>
          <Button asChild variant="ghost">
            <Link href="/login" aria-label="登录" title="登录">
              <LogIn className="size-4" />
              <span>登录</span>
            </Link>
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center">{queryPanel}</div>
      </section>

      <section className="relative hidden min-h-svh lg:block">
        <div className="relative z-20 flex w-full items-start justify-between p-6 md:p-10">
          <div className="flex justify-center gap-2 md:justify-start">
            <Link href="/" className="flex items-center gap-2 font-medium">
              <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-4" />
              </span>
              <span>{systemName}</span>
            </Link>
          </div>

          <Button asChild variant="ghost">
            <Link href="/login" aria-label="登录" title="登录">
              <LogIn className="size-4" />
              <span>登录</span>
            </Link>
          </Button>
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-6 md:px-10">
          {queryPanel}
        </div>
      </section>
    </main>
  );
}
