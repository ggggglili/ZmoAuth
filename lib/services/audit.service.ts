import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface AuditLogInput {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: unknown;
}

export async function writeAuditLog(input: AuditLogInput) {
  const details =
    typeof input.details === "undefined"
      ? undefined
      : input.details === null
        ? Prisma.JsonNull
        : (input.details as Prisma.InputJsonValue);

  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      details,
    },
  });
}
