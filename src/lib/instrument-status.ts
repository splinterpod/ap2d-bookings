import "server-only";
import { prisma } from "./db";
import { describeLaserSession } from "./laser-session";
import { formatTz } from "./time";

export type StatusTone = "green" | "amber" | "red" | "blue";

export type InstrumentStatus = {
  tone: StatusTone;
  label: string;
  detail: string;
};

function laserDetail(
  readings: Array<{ wavelengthNm: number; calibrated: boolean; photonCount: number | null; phase: "SIGN_IN" | "SIGN_OUT" }>,
  skipped: boolean,
): string {
  const summary = describeLaserSession(readings, skipped);
  return summary === "—" ? "" : ` ${summary}.`;
}

export async function getInstrumentStatus(
  instrument: { id: string; maintenance: boolean; instrumentType: string },
  isAdmin: boolean,
  now = new Date(),
): Promise<InstrumentStatus> {
  if (instrument.maintenance) {
    return {
      tone: "red",
      label: "Under maintenance",
      detail: "Booking is disabled until maintenance ends.",
    };
  }

  const openSession = await prisma.instrumentSession.findFirst({
    where: { signedOutAt: null, booking: { instrumentId: instrument.id } },
    orderBy: { signedInAt: "desc" },
    include: { user: { select: { username: true } }, readings: true },
  });

  if (openSession) {
    const laser =
      instrument.instrumentType === "raman"
        ? laserDetail(openSession.readings, openSession.signInSkipped)
        : "";
    const who = isAdmin ? ` by ${openSession.user.username}` : "";
    return {
      tone: "amber",
      label: "Signed in",
      detail: `Signed in${who} since ${formatTz(openSession.signedInAt, "h:mm a")}.${laser}`,
    };
  }

  const current = await prisma.booking.findFirst({
    where: {
      instrumentId: instrument.id,
      status: "CONFIRMED",
      startAt: { lte: now },
      endAt: { gt: now },
    },
    include: { user: { select: { username: true } } },
  });

  if (current) {
    const who = isAdmin ? ` (${current.user.username})` : "";
    return {
      tone: "blue",
      label: "Reserved",
      detail: `Reserved until ${formatTz(current.endAt, "h:mm a")}${who} — not signed in yet.`,
    };
  }

  const next = await prisma.booking.findFirst({
    where: { instrumentId: instrument.id, status: "CONFIRMED", startAt: { gt: now } },
    orderBy: { startAt: "asc" },
  });

  return {
    tone: "green",
    label: "Available",
    detail: next
      ? `Available — next booking ${formatTz(next.startAt, "EEE MMM d, h:mm a")}.`
      : "Available — no upcoming bookings.",
  };
}
