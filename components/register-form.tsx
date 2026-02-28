"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw } from "lucide-react";
import { signIn } from "next-auth/react";
import { type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TopCenterAlert } from "@/components/ui/top-center-alert";
import { cn } from "@/lib/utils";

const schema = z.object({
  inviteCode: z.string().min(4, "请输入邀请码"),
  email: z.string().email("请输入有效的邮箱地址"),
  verificationCode: z.string().regex(/^\d{6}$/, "请输入 6 位邮箱验证码"),
  password: z.string().min(8, "密码至少 8 位"),
});

type FormData = z.infer<typeof schema>;

const DEFAULT_RETRY_AFTER_SECONDS = 60;

interface EmailSendChallenge {
  challengeId: string;
  prompt: string;
  expiresInSeconds: number;
}

export function RegisterForm({ className, ...props }: React.ComponentProps<"form">) {
  const router = useRouter();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [challenge, setChallenge] = useState<EmailSendChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challengeIssuedAt, setChallengeIssuedAt] = useState<number | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      inviteCode: "",
      email: "",
      verificationCode: "",
      password: "",
    },
  });

  function notifyError(message: string) {
    setSuccessMessage(null);
    setErrorMessage(message);
  }

  function notifySuccess(message: string) {
    setErrorMessage(null);
    setSuccessMessage(message);
  }

  function onInvalidSubmit(errors: FieldErrors<FormData>) {
    const firstErrorMessage = Object.values(errors).find((item) => item?.message)?.message;
    notifyError(typeof firstErrorMessage === "string" ? firstErrorMessage : "请检查输入内容后重试");
  }

  useEffect(() => {
    const invite =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("invite") ?? ""
        : "";

    if (invite) {
      form.setValue("inviteCode", invite, { shouldValidate: true });
    }
  }, [form]);

  useEffect(() => {
    if (countdownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCountdownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdownSeconds]);

  async function loadChallenge() {
    setLoadingChallenge(true);
    setChallengeAnswer("");

    try {
      const res = await fetch("/api/auth/email-verification/challenge", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        challenge?: EmailSendChallenge;
        message?: string;
      };

      if (!res.ok || !data.challenge) {
        setChallenge(null);
        notifyError(data.message ?? "加载验证题失败，请稍后重试");
        return;
      }

      setChallenge(data.challenge);
      setChallengeIssuedAt(Date.now());
    } catch {
      setChallenge(null);
      notifyError("加载验证题失败，请稍后重试");
    } finally {
      setLoadingChallenge(false);
    }
  }

  async function onOpenVerifyDialog() {
    const rawEmail = form.getValues("email").trim().toLowerCase();
    if (!z.string().email().safeParse(rawEmail).success) {
      notifyError("请先输入有效的邮箱地址");
      return;
    }

    setVerifyDialogOpen(true);
    await loadChallenge();
  }

  async function onConfirmSendCode() {
    const rawEmail = form.getValues("email").trim().toLowerCase();
    if (!z.string().email().safeParse(rawEmail).success) {
      notifyError("请先输入有效的邮箱地址");
      return;
    }
    if (!challenge || challengeIssuedAt === null) {
      notifyError("验证题未准备好，请刷新后重试");
      return;
    }
    if (!challengeAnswer.trim()) {
      notifyError("请输入验证题答案");
      return;
    }

    setSendingCode(true);
    try {
      const solvedAt = Math.max(Date.now(), challengeIssuedAt + 1200);
      const res = await fetch("/api/auth/email-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: rawEmail,
          challenge: {
            challengeId: challenge.challengeId,
            answer: challengeAnswer.trim(),
            solvedAt,
          },
        }),
      });

      const data = (await res.json()) as { message?: string; retryAfterSeconds?: number };
      if (!res.ok) {
        notifyError(data.message ?? "验证码发送失败，请重试");
        await loadChallenge();
        return;
      }

      form.setValue("email", rawEmail, { shouldValidate: true });
      setCountdownSeconds(data.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS);
      setVerifyDialogOpen(false);
      setChallenge(null);
      setChallengeAnswer("");
      setChallengeIssuedAt(null);

      const successText =
        data.message && data.message !== "Verification code sent."
          ? data.message
          : "验证码已发送，请查收邮箱。";
      notifySuccess(successText);
    } catch {
      notifyError("验证码发送失败，请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(values: FormData) {
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = values.email.trim().toLowerCase();

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        email: normalizedEmail,
      }),
    });

    const data = (await res.json()) as { message?: string };
    if (!res.ok) {
      notifyError(data.message ?? "注册失败");
      return;
    }

    notifySuccess("注册成功，正在自动登录...");

    const loginResult = await signIn("credentials", {
      email: normalizedEmail,
      password: values.password,
      redirect: false,
    });
    if (!loginResult || loginResult.error) {
      notifyError("注册成功，但自动登录失败，请手动登录。");
      router.push("/login");
      router.refresh();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <TopCenterAlert
        open={Boolean(errorMessage)}
        title="操作失败"
        description={errorMessage ?? undefined}
        variant="error"
        onClose={() => setErrorMessage(null)}
      />
      <TopCenterAlert
        open={Boolean(successMessage)}
        title="操作成功"
        description={successMessage ?? undefined}
        variant="success"
        onClose={() => setSuccessMessage(null)}
      />

      <form className={cn("flex flex-col gap-6", className)} onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} {...props}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">创建账号</h1>
            <p className="text-muted-foreground text-sm text-balance">请填写邀请码、邮箱验证码和密码完成注册</p>
          </div>

          <Field>
            <FieldLabel htmlFor="inviteCode">邀请码</FieldLabel>
            <Input id="inviteCode" placeholder="请输入邀请码" autoComplete="off" {...form.register("inviteCode")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="email">邮箱</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="email" type="email" placeholder="请输入邮箱" autoComplete="email" {...form.register("email")} />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={sendingCode || countdownSeconds > 0}
                onClick={() => void onOpenVerifyDialog()}
              >
                {sendingCode ? "发送中..." : countdownSeconds > 0 ? `${countdownSeconds}s` : "发送验证码"}
              </Button>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="verificationCode">邮箱验证码</FieldLabel>
            <Input
              id="verificationCode"
              placeholder="请输入 6 位验证码"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              {...form.register("verificationCode")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              autoComplete="new-password"
              {...form.register("password")}
            />
          </Field>

          <Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "提交中..." : "注册并登录"}
            </Button>
          </Field>

          <Field>
            <FieldDescription className="text-center">
              已有账号？{" "}
              <Link href="/login" className="underline underline-offset-4">
                去登录
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>

      <Dialog
        open={verifyDialogOpen}
        onOpenChange={(open) => {
          setVerifyDialogOpen(open);
          if (!open) {
            setChallenge(null);
            setChallengeAnswer("");
            setChallengeIssuedAt(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>安全验证</DialogTitle>
            <DialogDescription>请完成验证后发送邮箱验证码。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-border/70 p-3">
              <p className="text-sm">{loadingChallenge ? "加载验证题中..." : challenge?.prompt ?? "暂无验证题"}</p>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="challenge-answer">验证答案</FieldLabel>
              <Input
                id="challenge-answer"
                value={challengeAnswer}
                onChange={(event) => setChallengeAnswer(event.target.value)}
                placeholder="请输入答案"
                inputMode="numeric"
                autoComplete="off"
                disabled={loadingChallenge || sendingCode || !challenge}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onConfirmSendCode();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void loadChallenge()} disabled={loadingChallenge || sendingCode}>
              <RefreshCw className="mr-1 size-4" />
              换一题
            </Button>
            <Button type="button" variant="outline" onClick={() => setVerifyDialogOpen(false)} disabled={sendingCode}>
              取消
            </Button>
            <Button type="button" onClick={() => void onConfirmSendCode()} disabled={loadingChallenge || sendingCode || !challenge}>
              {sendingCode ? "发送中..." : "验证并发送"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
