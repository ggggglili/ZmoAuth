"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type TopCenterAlertVariant = "error" | "success" | "info";

interface TopCenterAlertProps {
  open: boolean;
  title: string;
  description?: string;
  variant?: TopCenterAlertVariant;
  autoCloseMs?: number;
  onClose?: () => void;
}

const variantClasses: Record<TopCenterAlertVariant, string> = {
  error: "border-destructive bg-destructive text-destructive-foreground",
  success: "border-primary bg-primary text-primary-foreground",
  info: "border-accent bg-accent text-accent-foreground",
};

export function TopCenterAlert({
  open,
  title,
  description,
  variant = "info",
  autoCloseMs = 2500,
  onClose,
}: TopCenterAlertProps) {
  useEffect(() => {
    if (!open || !autoCloseMs || !onClose) return;
    const timer = window.setTimeout(() => onClose(), autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, onClose, open]);

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4">
      <Alert className={cn("pointer-events-auto w-full max-w-xl shadow-lg", variantClasses[variant])}>
        <AlertTitle>{title}</AlertTitle>
        {description ? <AlertDescription className="text-current/90">{description}</AlertDescription> : null}
      </Alert>
    </div>
  );
}
