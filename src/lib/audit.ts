import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type?: string; id?: string },
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditEvent
    .create({
      data: {
        actorId,
        action,
        targetType: target?.type,
        targetId: target?.id,
        metadata,
      },
    })
    .catch((err) => console.error("[audit] failed:", err));
}
