import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addMinutes, formatTz } from "@/lib/time";
import { cancelBookingAction } from "@/actions/booking";
import { SessionForm, type ExistingReading } from "@/components/session-form";
import { finalLaserReadings } from "@/lib/laser-session";
import { autoSignOutExpiredSessions, processSessionRemindersAndNoShows } from "@/lib/session-lifecycle";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "CONFIRMED":
      return <Badge tone="green">Confirmed</Badge>;
    case "PENDING":
      return <Badge tone="amber">Awaiting approval</Badge>;
    case "CANCELLED":
      return <Badge tone="slate">Cancelled</Badge>;
    case "REJECTED":
      return <Badge tone="red">Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default async function BookingsPage() {
  const user = await requireUser();
  const now = new Date();
  await autoSignOutExpiredSessions(now);
  await processSessionRemindersAndNoShows(now);

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: { instrument: true, session: { include: { readings: true } } },
    orderBy: { startAt: "desc" },
  });

  const upcoming = bookings
    .filter((b) => b.endAt >= now && b.status !== "CANCELLED" && b.status !== "REJECTED")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const past = bookings.filter(
    (b) => b.endAt < now || b.status === "CANCELLED" || b.status === "REJECTED",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">My bookings</h1>
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          Book a session →
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current &amp; upcoming</h2>
        {upcoming.length === 0 && <Alert tone="info">You have no upcoming bookings.</Alert>}
        {upcoming.map((b) => {
          const signInOpen = addMinutes(b.startAt, -15);
          const needsSignIn = b.status === "CONFIRMED" && now >= signInOpen && now <= b.endAt && !b.session;
          const canSignOut = b.session && !b.session.signedOutAt;
          const canRelease = now < addMinutes(b.endAt, -30) && now > b.startAt;
          const sessionReadings: ExistingReading[] = b.session
            ? finalLaserReadings(b.session.readings).map((r) => ({
                wavelengthNm: r.wavelengthNm,
                calibrated: r.calibrated,
                photonCount: r.photonCount,
              }))
            : [];

          return (
            <Card key={b.id}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>{b.instrument.name}</CardTitle>
                {statusBadge(b.status)}
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="text-sm text-slate-700">
                  <div className="font-medium">{formatTz(b.startAt, "EEEE, MMMM d, yyyy")}</div>
                  <div>
                    {formatTz(b.startAt, "h:mm a")} – {formatTz(b.endAt, "h:mm a")}
                  </div>
                  {b.notes && <p className="mt-1 text-slate-500">Notes: {b.notes}</p>}
                </div>

                {b.session?.signedOutAt && (
                  <Alert tone="success">
                    Session complete · signed out {formatTz(b.session.signedOutAt, "MMM d, h:mm a")}.
                  </Alert>
                )}

                {needsSignIn && (
                  <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                    <p className="mb-3 text-sm font-semibold text-brand-900">Start your session</p>
                    <SessionForm bookingId={b.id} mode="in" initialSessionNotes={b.notes} />
                  </div>
                )}

                {canSignOut && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-3 text-sm font-semibold text-amber-900">
                      You are signed in. Review and sign out when done.
                    </p>
                    <SessionForm
                      bookingId={b.id}
                      mode="out"
                      canRelease={!!canRelease}
                      initialReadings={sessionReadings}
                      initialSessionNotes={b.session?.notes}
                    />
                  </div>
                )}

                {!b.session && !needsSignIn && b.status === "CONFIRMED" && now < signInOpen && (
                  <p className="text-xs text-slate-400">
                    Session sign-in opens 15 minutes before your start time.
                  </p>
                )}

                {b.endAt > now && !b.session?.signedOutAt && !canSignOut && (
                  <form action={cancelBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button variant="danger" size="sm">
                      Cancel booking
                    </Button>
                  </form>
                )}
              </CardBody>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Past &amp; cancelled</h2>
        {past.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
        {past.slice(0, 30).map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <div>
              <div className="font-medium text-slate-800">{b.instrument.name}</div>
              <div className="text-slate-500">
                {formatTz(b.startAt, "MMM d, yyyy · h:mm a")} – {formatTz(b.endAt, "h:mm a")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {b.noShow && <Badge tone="red">No-show</Badge>}
              {b.session?.unsignedOut && <Badge tone="amber">Unsigned-out</Badge>}
              {statusBadge(b.status)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
