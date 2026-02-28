"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SiteAnnouncementModalData {
  content: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SiteAnnouncementModalProps {
  announcement: SiteAnnouncementModalData;
  userId: string;
}

const ANNOUNCEMENT_READ_EVENT = "site-announcement-read-change";

function toLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toReadKey(userId: string, announcementVersion: string) {
  return `site_announcement_read:${userId}:${toLocalDateKey()}:${announcementVersion}`;
}

export function SiteAnnouncementModal({ announcement, userId }: SiteAnnouncementModalProps) {
  const shouldShowAnnouncement = announcement.enabled && announcement.content.trim().length > 0;
  const announcementVersion = announcement.updatedAt ?? "no-update-time";

  const readKey = useMemo(() => {
    return toReadKey(userId, announcementVersion);
  }, [userId, announcementVersion]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener(ANNOUNCEMENT_READ_EVENT, onStoreChange);
    window.addEventListener("storage", onStoreChange);
    return () => {
      window.removeEventListener(ANNOUNCEMENT_READ_EVENT, onStoreChange);
      window.removeEventListener("storage", onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    return window.localStorage.getItem(readKey) === "1";
  }, [readKey]);

  const hasReadToday = useSyncExternalStore(subscribe, getSnapshot, () => true);
  const open = shouldShowAnnouncement && !hasReadToday;

  function onReadToday() {
    window.localStorage.setItem(readKey, "1");
    window.dispatchEvent(new Event(ANNOUNCEMENT_READ_EVENT));
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={() => undefined}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/50"
          onPointerDown={(event) => {
            event.preventDefault();
          }}
        />
        <DialogPrimitive.Content
          className={cn(
            "bg-background fixed top-1/2 left-1/2 z-50 w-[min(90vw,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 shadow-xl outline-hidden"
          )}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="text-lg font-semibold">站点公告</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
            请阅读以下内容
          </DialogPrimitive.Description>

          <div className="bg-muted/50 mt-4 max-h-[50vh] overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap">
            {announcement.content}
          </div>

          {announcement.updatedAt ? (
            <p className="text-muted-foreground mt-3 text-xs">
              最近更新：{new Date(announcement.updatedAt).toLocaleString()}
              {announcement.updatedBy ? ` · ${announcement.updatedBy}` : ""}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={onReadToday}>
              已读今日不再显示
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
