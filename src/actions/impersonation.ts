"use server";

import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAccountOwner } from "@/lib/account-owner";
import { audit } from "@/lib/audit";
import {
  clearImpersonatorToken,
  createImpersonationSession,
  getImpersonatorRawToken,
  getRawSessionToken,
  restoreSessionRawToken,
  setImpersonatorRawToken,
} from "@/lib/session";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function startImpersonationAction(formData: FormData): Promise<void> {
  const owner = await requireUser();
  if (!isAccountOwner(owner)) return;

  if (await getImpersonatorRawToken()) return;

  const targetUserId = String(formData.get("userId") || "");
  if (!targetUserId || targetUserId === owner.id) return;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true },
  });
  if (!target) return;

  const ownerRaw = await getRawSessionToken();
  if (!ownerRaw) return;

  const ownerSession = await prisma.authSession.findUnique({
    where: { token: hashToken(ownerRaw) },
  });
  if (!ownerSession || ownerSession.userId !== owner.id) return;
  if (ownerSession.expiresAt.getTime() < Date.now()) return;

  await setImpersonatorRawToken(ownerRaw, ownerSession.expiresAt);
  await createImpersonationSession(target.id);

  await audit(owner.id, "user.impersonate_start", { type: "user", id: target.id }, {
    username: target.username,
  });

  redirect("/");
}

export async function endImpersonationAction(): Promise<void> {
  const impersonatorRaw = await getImpersonatorRawToken();
  if (!impersonatorRaw) {
    redirect("/");
    return;
  }

  const impersonated = await requireUser();

  const ownerSession = await prisma.authSession.findUnique({
    where: { token: hashToken(impersonatorRaw) },
    select: { userId: true, expiresAt: true },
  });

  const currentRaw = await getRawSessionToken();
  if (currentRaw) {
    await prisma.authSession.deleteMany({ where: { token: hashToken(currentRaw) } });
  }

  if (ownerSession && ownerSession.expiresAt.getTime() > Date.now()) {
    await restoreSessionRawToken(impersonatorRaw, ownerSession.expiresAt);
    await audit(
      ownerSession.userId,
      "user.impersonate_end",
      { type: "user", id: impersonated.id },
      { username: impersonated.username },
    );
  }

  await clearImpersonatorToken();
  redirect("/admin/users");
}
