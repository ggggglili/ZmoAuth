"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TopCenterAlert } from "@/components/ui/top-center-alert";
import { cn } from "@/lib/utils";

const schema = z.object({
  account: z
    .string()
    .trim()
    .min(1, "请输入账号")
    .max(100, "账号长度不能超过 100")
    .refine((value) => !value.includes("@") || z.email().safeParse(value).success, "邮箱格式不正确"),
  password: z.string().min(1, "请输入密码"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm({ className, ...props }: React.ComponentProps<"form">) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  function notifyError(message: string) {
    setSubmitError(message);
  }

  function onInvalidSubmit(errors: FieldErrors<FormData>) {
    const firstErrorMessage = Object.values(errors).find((item) => item?.message)?.message;
    notifyError(typeof firstErrorMessage === "string" ? firstErrorMessage : "请检查输入内容后重试");
  }

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      account: "",
      password: "",
    },
  });

  async function onSubmit(values: FormData) {
    setSubmitError(null);

    const callbackUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") ?? "/dashboard"
        : "/dashboard";
    const safeCallbackUrl = callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";

    const result = await signIn("credentials", {
      email: values.account.trim().toLowerCase(),
      password: values.password,
      redirect: false,
      callbackUrl: safeCallbackUrl,
    });

    if (!result || result.error) {
      notifyError("登录失败，请检查账号和密码");
      return;
    }

    let target = safeCallbackUrl;
    if (result.url && typeof window !== "undefined") {
      try {
        const parsed = new URL(result.url, window.location.origin);
        if (parsed.origin === window.location.origin) {
          target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        target = safeCallbackUrl;
      }
    }

    router.push(target);
    router.refresh();
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(submitError)}
        title="登录失败"
        description={submitError ?? undefined}
        variant="error"
        onClose={() => setSubmitError(null)}
      />

      <form className={cn("flex flex-col gap-6", className)} onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} {...props}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">登录到您的账号</h1>
            <p className="text-muted-foreground text-sm text-balance">请输入账号和密码继续操作</p>
          </div>

          <Field>
            <FieldLabel htmlFor="account">账号</FieldLabel>
            <Input
              id="account"
              type="text"
              placeholder="请输入邮箱或 QQ 号"
              autoComplete="username"
              {...form.register("account")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              autoComplete="current-password"
              {...form.register("password")}
            />
          </Field>

          <Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "登录中..." : "登录"}
            </Button>
          </Field>

          <Field>
            <FieldDescription className="text-center">
              还没有账号？{" "}
              <Link href="/register" className="underline underline-offset-4">
                立即创建
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </>
  );
}
