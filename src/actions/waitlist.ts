"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import { formatTz, localToUtc, addMinutes, formatBookingRange } from "@/lib/time";

const HOLD_MINUTES = 30;

export async function joinWaitlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") return;

  const instrumentId = String(formData.get("instrumentId"));
  const date = String(formData.get("date"));
  const startTime = String(formData.get("startTime"));
  const durationMinutes = Number(formData.get("durationMinutes"));
  if (!instrumentId || !date || !startTime || !durationMinutes) return;

  const instrument = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    select: { bookingAdminMode: true },
  });
  if (!instrument || instrument.bookingAdminMode) return;

  // Only trained users may join (mirrors booking permission).
  const isTrained =
    user.role === "ADMIN" ||
    !!(await prisma.instrumentTraining.findUnique({
      where: { userId_instrumentId: { userId: user.id, instrumentId } },
    }));
  if (!isTrained) return;

  const startAt = localToUtc(date, startTime);
  const endAt = addMinutes(startAt, durationMinutes);

  const existing = await prisma.waitlistEntry.findFirst({
    where: { instrumentId, userId: user.id, startAt, endAt, status: { in: ["WAITING", "NOTIFIED"] } },
  });
  if (existing) return;

  await prisma.waitlistEntry.create({
    data: { instrumentId, userId: user.id, startAt, endAt },
  });
  await audit(user.id, "waitlist.join", { type: "instrument", id: instrumentId });
  revalidatePath("/calendar");
}

export async function leaveWaitlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("waitlistId"));
  const entry = await prisma.waitlistEntry.findUnique({ where: { id } });
  if (!entry) return;
  if (entry.userId !== user.id && user.role !== "ADMIN") return;
  await prisma.waitlistEntry.update({ where: { id }, data: { status: "EXPIRED" } });
  revalidatePath("/calendar");
  revalidatePath("/bookings");
}

/** Notify the earliest waiting user that a matching slot opened up. */
export async function notifyNextOnWaitlist(instrumentId: string, startAt: Date, endAt: Date): Promise<void> {
  const next = await prisma.waitlistEntry.findFirst({
    where: { instrumentId, startAt, endAt, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    include: { user: true, instrument: true },
  });
  if (!next) return;

  await prisma.waitlistEntry.update({
    where: { id: next.id },
    data: { status: "NOTIFIED", notifiedAt: new Date(), holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000) },
  });

  await sendEmail({
    to: next.user.email,
    subject: `A ${next.instrument.name} slot you wanted just opened`,
    heading: "Slot available",
    body: `<p>A slot you joined the waitlist for is now open:</p><p><strong>${next.instrument.name}</strong><br/>${formatBookingRange(startAt, endAt, "EEE MMM d, h:mm a")}</p><p>It is first-come, first-served — book it before someone else does.</p>`,
    cta: { label: "Book now", href: `${APP_URL}/calendar?instrument=${next.instrument.slug}` },
  });
}
