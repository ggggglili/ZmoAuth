import type { SessionUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db/prisma"
import { AppError } from "@/lib/errors"

const SITE_ANNOUNCEMENT_ACTION = "SITE_ANNOUNCEMENT_SET"

export interface SiteAnnouncement {
  content: string
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
}

function normalizeAuditActorId(actorId?: string | null) {
  if (!actorId) return null
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actorId
    )
  return isUuid ? actorId : null
}

function normalizeAnnouncementDetails(details: unknown) {
  if (!details || typeof details !== "object") {
    return { content: "", enabled: false }
  }

  const raw = details as Record<string, unknown>
  const content = typeof raw.content === "string" ? raw.content.trim() : ""
  const enabled = Boolean(raw.enabled)

  return { content, enabled }
}

export async function getSiteAnnouncement(): Promise<SiteAnnouncement> {
  const latest = await prisma.auditLog.findFirst({
    where: {
      action: SITE_ANNOUNCEMENT_ACTION,
      resourceType: "site_announcement",
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      details: true,
      actor: {
        select: {
          email: true,
        },
      },
    },
  })

  if (!latest) {
    return {
      content: "",
      enabled: false,
      updatedAt: null,
      updatedBy: null,
    }
  }

  const normalized = normalizeAnnouncementDetails(latest.details)
  return {
    content: normalized.content,
    enabled: normalized.enabled,
    updatedAt: latest.createdAt.toISOString(),
    updatedBy: latest.actor?.email ?? null,
  }
}

export async function setSiteAnnouncement(
  actor: SessionUser,
  input: { content: string; enabled: boolean }
): Promise<SiteAnnouncement> {
  if (actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "无权限操作站点公告", 403)
  }

  const content = input.content.trim()
  if (input.enabled && !content) {
    throw new AppError("VALIDATION_ERROR", "公告内容不能为空", 400)
  }

  const record = await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actor.id),
      action: SITE_ANNOUNCEMENT_ACTION,
      resourceType: "site_announcement",
      resourceId: null,
      details: {
        content,
        enabled: input.enabled,
      },
    },
    select: {
      createdAt: true,
      actor: {
        select: {
          email: true,
        },
      },
      details: true,
    },
  })

  const normalized = normalizeAnnouncementDetails(record.details)
  return {
    content: normalized.content,
    enabled: normalized.enabled,
    updatedAt: record.createdAt.toISOString(),
    updatedBy: record.actor?.email ?? null,
  }
}
