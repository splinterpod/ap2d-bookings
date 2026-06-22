import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInstrumentStatus } from "@/lib/instrument-status";
import { autoSignOutExpiredSessions, processSessionRemindersAndNoShows } from "@/lib/session-lifecycle";
import { LAB_SUBTITLE, PRODUCT_NAME } from "@/lib/branding";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  await autoSignOutExpiredSessions();
  await processSessionRemindersAndNoShows();

  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
  });

  const statuses = await Promise.all(
    instruments.map(async (instrument) => ({
      instrument,
      status: await getInstrumentStatus(instrument, isAdmin),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.username}</h1>
        <p className="text-sm text-slate-500">
          {PRODUCT_NAME} · {LAB_SUBTITLE}
        </p>
      </div>

      {statuses.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">No instruments configured yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {statuses.map(({ instrument, status }) => (
            <Card key={instrument.id}>
              <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-900">{instrument.name}</h2>
                    <Badge tone={status.tone}>Current status: {status.label}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{instrument.location}</p>
                  <p className="text-sm text-slate-600">{status.detail}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/calendar?instrument=${instrument.slug}`}
                    className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
                  >
                    Book a session
                  </Link>
                  <Link
                    href="/bookings"
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    My bookings
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Administration</h3>
              <p className="text-sm text-slate-500">Manage users, instrument rules, sessions, and exports.</p>
            </div>
            <Link
              href="/admin"
              className="shrink-0 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Admin panel
            </Link>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
