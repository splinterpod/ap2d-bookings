"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isAccountOwner } from "@/lib/account-owner";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function deleteBookingHistoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isAccountOwner(admin)) return;

  const bookingId = String(formData.get("bookingId") || "");
  if (!bookingId) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, startAt: true, user: { select: { username: true } } },
  });
  if (!booking) return;

  await prisma.booking.delete({ where: { id: bookingId } });
  await audit(admin.id, "booking.delete_history", { type: "booking", id: bookingId }, {
    username: booking.user.username,
    startAt: booking.startAt.toISOString(),
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/bookings");
}

export async function deleteSessionHistoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!isAccountOwner(admin)) return;

  const sessionId = String(formData.get("sessionId") || "");
  if (!sessionId) return;

  const session = await prisma.instrumentSession.findUnique({
    where: { id: sessionId },
    select: { id: true, signedInAt: true, user: { select: { username: true } } },
  });
  if (!session) return;

  await prisma.instrumentSession.delete({ where: { id: sessionId } });
  await audit(admin.id, "session.delete_history", { type: "session", id: sessionId }, {
    username: session.user.username,
    signedInAt: session.signedInAt.toISOString(),
  });

  revalidatePath("/admin/sessions");
  revalidatePath("/admin/bookings");
}
