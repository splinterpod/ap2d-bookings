"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import { PRODUCT_NAME } from "@/lib/branding";
import { UNLIMITED } from "@/lib/booking";
import { canAdminEditUserRole, canAssignAdminRole, isAccountOwner } from "@/lib/account-owner";
import { usernameSchema } from "@/lib/validation";

function num(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Admins may change member/guest roles; account owner may also change other admins (not self). */
async function assertRoleEditable(admin: { id: string; email: string }, targetUserId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!target) return false;
  return canAdminEditUserRole(admin, target);
}

/** Limits, training, and deactivation do not apply to admin accounts. */
async function assertNonAdminTarget(targetUserId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  });
  return !!target && target.role !== "ADMIN";
}

export async function approveUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  if (!(await assertRoleEditable(admin, userId))) return;

  const role = String(formData.get("role") || "MEMBER") as "MEMBER" | "ADMIN" | "GUEST";
  if (role === "ADMIN" && !canAssignAdminRole(admin)) return;

  const guestExpiresRaw = formData.get("guestExpiresAt");

  const guestExpiresAt =
    role === "GUEST" && guestExpiresRaw ? new Date(`${String(guestExpiresRaw)}T23:59:59`) : null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE", role, guestExpiresAt },
  });
  await audit(admin.id, "user.approve", { type: "user", id: userId }, { role });

  await sendEmail({
    to: user.email,
    subject: `Your ${PRODUCT_NAME} account is active`,
    heading: "Account approved",
    body: "<p>Your account has been approved. You can now sign in and view instrument calendars. An administrator will mark you as trained before you can book.</p>",
    cta: { label: "Sign in", href: `${APP_URL}/login` },
  });

  revalidatePath("/admin/users");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const status = String(formData.get("status")) as "ACTIVE" | "DEACTIVATED" | "PENDING";

  if (userId === admin.id && status !== "ACTIVE") return;
  if (status === "DEACTIVATED" && !(await assertNonAdminTarget(userId))) return;

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, email: true },
  });
  if (!before) return;

  await prisma.user.update({ where: { id: userId }, data: { status } });
  if (status === "DEACTIVATED") {
    await prisma.authSession.deleteMany({ where: { userId } });
  }
  await audit(admin.id, "user.set_status", { type: "user", id: userId }, { status });

  if (status === "ACTIVE" && before.status === "DEACTIVATED" && before.email) {
    await sendEmail({
      to: before.email,
      subject: `Your ${PRODUCT_NAME} account is active again`,
      heading: "Account reactivated",
      body: "<p>Your account has been reactivated. You can sign in and use the booking system again.</p>",
      cta: { label: "Sign in", href: `${APP_URL}/login` },
    });
  }

  revalidatePath("/admin/users");
}

/** Permanent delete — account owner only, not self. */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isAccountOwner(admin)) return;

  const userId = String(formData.get("userId"));
  if (!userId || userId === admin.id) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true },
  });
  if (!target) return;

  await prisma.user.delete({ where: { id: userId } });
  await audit(admin.id, "user.delete", { type: "user", id: userId }, {
    email: target.email,
    username: target.username,
  });
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  if (!(await assertRoleEditable(admin, userId))) return;

  const role = String(formData.get("role")) as "MEMBER" | "ADMIN" | "GUEST";
  if (role === "ADMIN" && !canAssignAdminRole(admin)) return;

  const guestExpiresRaw = formData.get("guestExpiresAt");
  const guestExpiresAt =
    role === "GUEST" && guestExpiresRaw ? new Date(`${String(guestExpiresRaw)}T23:59:59`) : null;

  await prisma.user.update({ where: { id: userId }, data: { role, guestExpiresAt } });
  await audit(admin.id, "user.set_role", { type: "user", id: userId }, { role });
  revalidatePath("/admin/users");
}

export async function setUserInstrumentLimitAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const instrumentId = String(formData.get("instrumentId"));
  if (!(await assertNonAdminTarget(userId))) return;

  const limitMode = String(formData.get("limitMode"));
  const approvalMode = String(formData.get("approvalMode"));
  const customHours = num(formData.get("limitHours"));

  let standardHoursWeeklyLimitMinutes: number | null = null;
  if (limitMode === "unlimited") standardHoursWeeklyLimitMinutes = UNLIMITED;
  else if (limitMode === "custom" && customHours !== null) {
    standardHoursWeeklyLimitMinutes = Math.round(customHours * 60);
  }

  let requiresBookingApproval: boolean | null = null;
  if (approvalMode === "require") requiresBookingApproval = true;
  else if (approvalMode === "auto") requiresBookingApproval = false;

  if (limitMode === "default" && approvalMode === "default") {
    await prisma.userInstrumentLimit.deleteMany({ where: { userId, instrumentId } });
  } else {
    await prisma.userInstrumentLimit.upsert({
      where: { userId_instrumentId: { userId, instrumentId } },
      update: { standardHoursWeeklyLimitMinutes, requiresBookingApproval },
      create: { userId, instrumentId, standardHoursWeeklyLimitMinutes, requiresBookingApproval },
    });
  }

  await audit(
    admin.id,
    "user.set_instrument_limits",
    { type: "user", id: userId },
    { instrumentId, limitMode, approvalMode },
  );
  revalidatePath("/admin/users");
  revalidatePath("/calendar");
}

export async function setTrainingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const instrumentId = String(formData.get("instrumentId"));
  const trained = String(formData.get("trained")) === "true";

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target || target.role === "ADMIN") return;

  if (trained) {
    await prisma.instrumentTraining.upsert({
      where: { userId_instrumentId: { userId, instrumentId } },
      update: { trainedByAdminId: admin.id },
      create: { userId, instrumentId, trainedByAdminId: admin.id },
    });
  } else {
    await prisma.instrumentTraining.deleteMany({ where: { userId, instrumentId } });
  }
  await audit(admin.id, "user.set_training", { type: "user", id: userId }, { instrumentId, trained });
  revalidatePath("/admin/users");
}

export async function createUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const usernameRaw = formData.get("username");
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "MEMBER") as "MEMBER" | "ADMIN" | "GUEST";
  if (role === "ADMIN" && !canAssignAdminRole(admin)) return;

  const guestExpiresRaw = formData.get("guestExpiresAt");

  const usernameParsed = usernameSchema.safeParse(usernameRaw);
  if (!email || !usernameParsed.success || password.length < 8) return;
  const username = usernameParsed.data;

  const guestExpiresAt =
    role === "GUEST" && guestExpiresRaw ? new Date(`${String(guestExpiresRaw)}T23:59:59`) : null;

  await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: await hashPassword(password),
      role,
      status: "ACTIVE",
      guestExpiresAt,
    },
  });
  await audit(admin.id, "user.create", { type: "user" }, { email, role });
  revalidatePath("/admin/users");
}
