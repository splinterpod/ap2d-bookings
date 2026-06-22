import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addDays,
  clockTime,
  dateKey,
  formatTz,
  localToUtc,
  parseClock,
  startOfWeekUtc,
} from "@/lib/time";
import {
  effectiveStandardLimit,
  getUserInstrumentLimitOverride,
  parseStandardHours,
  weeklyUsage,
} from "@/lib/booking";
import { CalendarClient, type SerBooking } from "@/components/calendar/calendar-client";
import { Alert } from "@/components/ui/alert";
import { APP_TIMEZONE } from "@/lib/env";

export const dynamic = "force-dynamic";

function calendarHref(slug: string, week?: string) {
  const params = new URLSearchParams({ instrument: slug });
  if (week) params.set("week", week);
  return `/calendar?${params.toString()}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; instrument?: string }>;
}) {
  const user = await requireUser();
  const { week, instrument: instrumentSlug } = await searchParams;

  const instruments = await prisma.instrument.findMany({ orderBy: { name: "asc" } });

  if (instruments.length === 0) {
    return (
      <Alert tone="warning">
        No instrument configured.{" "}
        <Link href="/" className="font-medium underline">
          Return home
        </Link>
      </Alert>
    );
  }

  const instrument = instrumentSlug
    ? instruments.find((i) => i.slug === instrumentSlug)
    : instruments[0];

  if (!instrument) {
    return (
      <Alert tone="warning">
        Instrument not found.{" "}
        <Link href="/" className="font-medium underline">
          Return home
        </Link>
      </Alert>
    );
  }

  const reference = week ? localToUtc(week, "12:00") : new Date();
  const weekStart = startOfWeekUtc(reference);
  const weekEnd = addDays(weekStart, 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const noon = localToUtc(dateKey(addDays(weekStart, i)), "12:00");
    return { key: dateKey(noon), label: formatTz(noon, "EEE"), dayNum: formatTz(noon, "d") };
  });

  const isAdmin = user.role === "ADMIN";
  const isTrained =
    isAdmin ||
    !!(await prisma.instrumentTraining.findUnique({
      where: { userId_instrumentId: { userId: user.id, instrumentId: instrument.id } },
    }));

  const bookings = await prisma.booking.findMany({
    where: {
      instrumentId: instrument.id,
      status: "CONFIRMED",
      startAt: { lt: weekEnd },
      endAt: { gt: weekStart },
    },
    include: { user: { select: { username: true } } },
    orderBy: { startAt: "asc" },
  });

  const serBookings: SerBooking[] = bookings.map((b) => ({
    id: b.id,
    mine: b.userId === user.id,
    status: b.status,
    ownerLabel: isAdmin ? b.user.username : b.userId === user.id ? "You" : undefined,
    startKey: dateKey(b.startAt),
    startMin: parseClock(clockTime(b.startAt)),
    endKey: dateKey(b.endAt),
    endMin: parseClock(clockTime(b.endAt)),
    startLabel: formatTz(b.startAt, "h:mm a"),
    endLabel: formatTz(b.endAt, "h:mm a"),
  }));

  const myWaitlist = await prisma.waitlistEntry.findMany({
    where: {
      userId: user.id,
      instrumentId: instrument.id,
      status: { in: ["WAITING", "NOTIFIED"] },
      startAt: { lt: weekEnd, gte: weekStart },
    },
  });

  const sh = parseStandardHours(instrument.standardHours);
  const limitOverride = await getUserInstrumentLimitOverride(user.id, instrument.id);
  const limit = effectiveStandardLimit(user, instrument, limitOverride);
  const usage = await weeklyUsage(user.id, instrument.id, reference, sh);

  const now = new Date();
  const nowKey = dateKey(now);
  const weekStartKey = dateKey(weekStart);
  const weekEndKey = dateKey(addDays(weekStart, 6));
  const isCurrentWeek = nowKey >= weekStartKey && nowKey <= weekEndKey;
  const prevWeek = dateKey(addDays(weekStart, -7));
  const nextWeek = dateKey(addDays(weekStart, 7));
  const slug = instrument.slug;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{instrument.name}</h1>
        <p className="text-sm text-slate-500">{instrument.location}</p>
      </div>

      {instruments.length > 1 && (
        <nav className="flex flex-wrap gap-2">
          {instruments.map((i) => {
            const active = i.id === instrument.id;
            return (
              <Link
                key={i.id}
                href={calendarHref(i.slug, week)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {i.name}
              </Link>
            );
          })}
        </nav>
      )}

      {instrument.maintenance && (
        <Alert tone="warning">This instrument is currently under maintenance and cannot be booked.</Alert>
      )}
      {!isTrained && (
        <Alert tone="info">
          You can view availability, but you are not yet trained on this instrument, so you cannot book.
          Contact a lab administrator.
        </Alert>
      )}

      <CalendarClient
        appTimezone={APP_TIMEZONE}
        nowKey={nowKey}
        nowMin={parseClock(clockTime(now))}
        weekNav={{
          prevHref: calendarHref(slug, prevWeek),
          nextHref: calendarHref(slug, nextWeek),
          todayHref: calendarHref(slug, nowKey),
          weekLabel: `Week of ${formatTz(weekStart, "MMMM d, yyyy")}`,
          isCurrentWeek,
        }}
        instrument={{
          id: instrument.id,
          name: instrument.name,
          slotMinutes: instrument.slotMinutes,
          maxSessionMinutes: instrument.maxSessionMinutes,
          advanceBookingDays: instrument.advanceBookingDays,
          minNoticeMinutes: instrument.minNoticeMinutes,
          maintenance: instrument.maintenance,
        }}
        days={days}
        bookings={serBookings}
        canBook={isTrained && !instrument.maintenance}
        isAdmin={isAdmin}
        limitMinutes={limit}
        usedStandardMinutes={usage.standardMinutes}
        myWaitlist={myWaitlist.map((w) => ({
          id: w.id,
          startKey: dateKey(w.startAt),
          startMin: parseClock(clockTime(w.startAt)),
        }))}
      />
    </div>
  );
}
