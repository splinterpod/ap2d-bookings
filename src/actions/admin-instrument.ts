"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import { formatHours, violatesUserBookingGap } from "@/lib/booking";
import { validateBookingExtension } from "@/lib/booking-extension";
import { formatTz, formatBookingEnd } from "@/lib/time";

function intOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function updateInstrumentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("instrumentId"));

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const location = String(formData.get("location") || "").trim();
  const descriptionRaw = String(formData.get("description") || "").trim();

  if (!name || !slug || !location) return;

  const existingSlug = await prisma.instrument.findFirst({
    where: { slug, NOT: { id } },
    select: { id: true },
  });
  if (existingSlug) return;

  const days = String(formData.get("standardDays") || "1,2,3,4,5")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n >= 1 && n <= 7);

  const stdLimitHours = intOrNull(formData.get("standardLimitHours"));
  const afterUnlimited = formData.get("afterHoursUnlimited") === "on";
  const afterLimitHours = intOrNull(formData.get("afterHoursLimitHours"));

  await prisma.instrument.update({
    where: { id },
    data: {
      name,
      slug,
      location,
      description: descriptionRaw || null,
      slotMinutes: intOrNull(formData.get("slotMinutes")) ?? 15,
      maxSessionMinutes: (intOrNull(formData.get("maxSessionHours")) ?? 4) * 60,
      advanceBookingDays: intOrNull(formData.get("advanceBookingDays")) ?? 14,
      minNoticeMinutes: intOrNull(formData.get("minNoticeMinutes")) ?? 0,
      minGapBetweenUserBookingsMinutes: (intOrNull(formData.get("minGapBetweenUserBookingsHours")) ?? 4) * 60,
      lateSignInReminderMinutes: intOrNull(formData.get("lateSignInReminderMinutes")) ?? 15,
      noShowCancelMinutes: intOrNull(formData.get("noShowCancelMinutes")) ?? 30,
      standardHours: {
        days: days.length ? days : [1, 2, 3, 4, 5],
        start: String(formData.get("standardStart") || "09:00"),
        end: String(formData.get("standardEnd") || "17:00"),
      },
      standardHoursWeeklyLimitMinutes: stdLimitHours === null ? null : stdLimitHours * 60,
      afterHoursWeeklyLimitMinutes: afterUnlimited ? null : afterLimitHours === null ? null : afterLimitHours * 60,
      autoConfirmIfTrained: formData.get("autoConfirmIfTrained") === "on",
      defaultRequiresApproval: formData.get("autoConfirmIfTrained") !== "on",
    },
  });
  await audit(admin.id, "instrument.update", { type: "instrument", id });
  revalidatePath("/admin/instruments");
  revalidatePath("/calendar");
}

export async function toggleMaintenanceAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("instrumentId"));
  const maintenance = String(formData.get("maintenance")) === "true";
  await prisma.instrument.update({ where: { id }, data: { maintenance } });
  await audit(admin.id, "instrument.maintenance", { type: "instrument", id }, { maintenance });
  revalidatePath("/admin/instruments");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function toggleBookingAdminModeAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("instrumentId"));
  const bookingAdminMode = String(formData.get("bookingAdminMode")) === "true";
  await prisma.instrument.update({ where: { id }, data: { bookingAdminMode } });
  await audit(admin.id, "instrument.booking_admin_mode", { type: "instrument", id }, { bookingAdminMode });
  revalidatePath("/admin/instruments");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function approveBookingAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const admin = await requireAdmin();
  const id = String(formData.get("bookingId"));
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { instrument: true, user: true },
  });
  if (!booking || booking.status !== "PENDING") return { error: "Booking not found or already processed." };

  const overlap = await prisma.booking.findFirst({
    where: {
      instrumentId: booking.instrumentId,
      status: "CONFIRMED",
      id: { not: id },
      startAt: { lt: booking.endAt },
      endAt: { gt: booking.startAt },
    },
  });
  if (overlap) {
    return { error: "Cannot approve — this slot overlaps an existing confirmed booking." };
  }

  if (booking.instrument.minGapBetweenUserBookingsMinutes > 0) {
    const userBookings = await prisma.booking.findMany({
      where: {
        userId: booking.userId,
        instrumentId: booking.instrumentId,
        status: { in: ["CONFIRMED", "PENDING"] },
        id: { not: id },
      },
      select: { startAt: true, endAt: true },
    });
    if (
      violatesUserBookingGap(
        booking.startAt,
        booking.endAt,
        userBookings,
        booking.instrument.minGapBetweenUserBookingsMinutes,
      )
    ) {
      return {
        error: `Cannot approve — this user's bookings must be at least ${formatHours(booking.instrument.minGapBetweenUserBookingsMinutes)} apart on this instrument.`,
      };
    }
  }

  await prisma.booking.update({ where: { id }, data: { status: "CONFIRMED" } });
  await audit(admin.id, "booking.approve", { type: "booking", id });

  if (booking.user.notifyConfirmations) {
    await sendEmail({
      to: booking.user.email,
      subject: "Booking approved",
      heading: "Booking approved",
      body: `<p>Your booking for <strong>${booking.instrument.name}</strong> on ${formatTz(booking.startAt, "EEE MMM d, h:mm a")} is confirmed.</p>`,
      cta: { label: "View my bookings", href: `${APP_URL}/bookings` },
    });
  }
  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");
  revalidatePath("/bookings");
  return undefined;
}

export async function rejectBookingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("bookingId"));
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { instrument: true, user: true },
  });
  if (!booking || booking.status !== "PENDING") return;

  await prisma.booking.update({ where: { id }, data: { status: "REJECTED" } });
  await audit(admin.id, "booking.reject", { type: "booking", id });

  if (booking.user.notifyConfirmations) {
    await sendEmail({
      to: booking.user.email,
      subject: "Booking not approved",
      heading: "Booking not approved",
      body: `<p>Your booking request for <strong>${booking.instrument.name}</strong> on ${formatTz(booking.startAt, "EEE MMM d, h:mm a")} was not approved. Please contact a lab administrator with questions.</p>`,
    });
  }
  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");
  revalidatePath("/bookings");
}

export async function approveExtensionRequestAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const admin = await requireAdmin();
  const id = String(formData.get("bookingId"));
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { instrument: true, user: true },
  });
  if (!booking || booking.status !== "CONFIRMED" || !booking.requestedEndAt) {
    return { error: "Extension request not found or already processed." };
  }

  const newEndAt = booking.requestedEndAt;
  const validation = await validateBookingExtension(
    booking,
    booking.instrument,
    booking.userId,
    newEndAt,
  );
  if (!validation.ok) return { error: validation.error };

  await prisma.booking.update({
    where: { id },
    data: { endAt: newEndAt, scheduledEndAt: newEndAt, requestedEndAt: null },
  });
  await audit(admin.id, "booking.extend_approve", { type: "booking", id }, {
    newEndAt: newEndAt.toISOString(),
  });

  if (booking.user.notifyConfirmations) {
    await sendEmail({
      to: booking.user.email,
      subject: "Extension approved",
      heading: "Booking extension approved",
      body: `<p>Your booking for <strong>${booking.instrument.name}</strong> is now extended until ${formatBookingEnd(booking.startAt, newEndAt)}.</p>`,
      cta: { label: "View my bookings", href: `${APP_URL}/bookings` },
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");
  revalidatePath("/bookings");
  return undefined;
}

export async function rejectExtensionRequestAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("bookingId"));
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { instrument: true, user: true },
  });
  if (!booking || booking.status !== "CONFIRMED" || !booking.requestedEndAt) return;

  await prisma.booking.update({ where: { id }, data: { requestedEndAt: null } });
  await audit(admin.id, "booking.extend_reject", { type: "booking", id });

  if (booking.user.notifyConfirmations) {
    await sendEmail({
      to: booking.user.email,
      subject: "Extension not approved",
      heading: "Extension request not approved",
      body: `<p>Your extension request for <strong>${booking.instrument.name}</strong> (until ${formatBookingEnd(booking.startAt, booking.requestedEndAt)}) was not approved. Your booking remains until ${formatBookingEnd(booking.startAt, booking.endAt)}.</p>`,
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");
  revalidatePath("/bookings");
}
