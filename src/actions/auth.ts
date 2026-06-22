"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation";

export type FormState = { error?: string; success?: string } | undefined;

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, username, password } = parsed.data;

  if (!rateLimit(`register:${email}`, 5, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Please try again later." };
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return {
      error:
        existing.email === email
          ? "An account with this email already exists."
          : "This username is taken.",
    };
  }

  const user = await prisma.user.create({
    data: { email, username, passwordHash: await hashPassword(password), status: "PENDING" },
  });
  await audit(user.id, "user.register", { type: "user", id: user.id });

  // Notify admins that someone is awaiting approval.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: "New account awaiting approval",
      heading: "New registration",
      body: `<p><strong>${username}</strong> (${email}) registered and is awaiting approval.</p>`,
      cta: { label: "Review in admin", href: `${APP_URL}/admin/users` },
    });
  }

  redirect("/pending?new=1");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { identifier, password } = parsed.data;

  if (!rateLimit(`login:${identifier.toLowerCase()}`, 10, 15 * 60 * 1000)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier }] },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email/username or password." };
  }
  if (user.status === "DEACTIVATED") {
    return { error: "This account has been deactivated. Contact a lab administrator." };
  }

  await createSession(user.id);
  await audit(user.id, "user.login", { type: "user", id: user.id });
  redirect(user.status === "PENDING" ? "/pending" : "/");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email } = parsed.data;

  if (!rateLimit(`forgot:${email}`, 5, 60 * 60 * 1000)) {
    return { success: "If that email exists, a reset link is on its way." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      heading: "Password reset",
      body: "<p>We received a request to reset your password. This link expires in 1 hour. If you did not request this, you can ignore this email.</p>",
      cta: { label: "Reset password", href: `${APP_URL}/reset-password?token=${raw}` },
    });
  }

  return { success: "If that email exists, a reset link is on its way." };
}

/** Updates only passwordHash — never role, status, email, limits, or other profile fields. */
async function setPasswordOnly(userId: string, plain: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(plain) },
  });
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { token, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Sign out other devices; does not alter account profile fields.
    await tx.authSession.deleteMany({ where: { userId: record.userId } });
  });
  await audit(record.userId, "user.password_reset", { type: "user", id: record.userId });

  redirect("/login?reset=1");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { currentPassword, newPassword } = parsed.data;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, passwordHash: true },
  });
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  await setPasswordOnly(user.id, newPassword);
  await audit(user.id, "user.password_change", { type: "user", id: user.id });
  revalidatePath("/settings");

  return { success: "Password updated." };
}
