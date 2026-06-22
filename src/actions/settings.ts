"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { changeUsernameSchema } from "@/lib/validation";

export type SettingsFormState = { error?: string; success?: string } | undefined;

export async function updateUsernameAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") {
    return { error: "Your account is not active." };
  }

  const parsed = changeUsernameSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid username." };
  }

  const { username } = parsed.data;
  if (username === user.username) {
    return { success: "Username unchanged." };
  }

  const taken = await prisma.user.findFirst({
    where: { username, NOT: { id: user.id } },
    select: { id: true },
  });
  if (taken) {
    return { error: "This username is already taken." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { username } });
  await audit(user.id, "user.username_change", { type: "user", id: user.id }, { username });

  revalidatePath("/settings");
  revalidatePath("/", "layout");

  return { success: "Username updated." };
}

export async function updateNotificationPrefsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      notifyConfirmations: formData.get("notifyConfirmations") === "on",
      notifyReminders: formData.get("notifyReminders") === "on",
    },
  });
  revalidatePath("/settings");
}