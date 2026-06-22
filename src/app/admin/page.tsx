import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatTz } from "@/lib/time";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [pendingUsers, pendingBookings, openSessions, totalUsers, unsignedOut] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.booking.count({ where: { status: "PENDING" } }),
    prisma.instrumentSession.count({ where: { signedOutAt: null } }),
    prisma.user.count(),
    prisma.instrumentSession.count({ where: { unsignedOut: true } }),
  ]);

  const recent = await prisma.booking.findMany({
    include: { instrument: true, user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const stats = [
    { label: "Pending registrations", value: pendingUsers, href: "/admin/users" },
    { label: "Bookings awaiting approval", value: pendingBookings, href: "/admin/bookings" },
    { label: "Sessions in progress", value: openSessions, href: "/admin/sessions" },
    { label: "Total users", value: totalUsers, href: "/admin/users" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-brand-300">
              <CardBody>
                <div className="text-3xl font-bold text-slate-900">{s.value}</div>
                <div className="text-sm text-slate-500">{s.label}</div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      {unsignedOut > 0 && (
        <Card>
          <CardBody className="flex items-center justify-between">
            <span className="text-sm text-slate-700">
              {unsignedOut} session(s) flagged as unsigned-out (handoff anomalies).
            </span>
            <Link href="/admin/sessions" className="text-sm font-medium text-brand-700 hover:underline">
              Review →
            </Link>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent bookings</h2>
          <div className="divide-y divide-slate-100">
            {recent.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{b.user.username}</span>{" "}
                  <span className="text-slate-500">· {b.instrument.name}</span>
                  <div className="text-slate-500">
                    {formatTz(b.startAt, "MMM d, h:mm a")} – {formatTz(b.endAt, "h:mm a")}
                  </div>
                </div>
                <Badge
                  tone={
                    b.status === "CONFIRMED"
                      ? "green"
                      : b.status === "PENDING"
                        ? "amber"
                        : "slate"
                  }
                >
                  {b.status.toLowerCase()}
                </Badge>
              </div>
            ))}
            {recent.length === 0 && <p className="py-2 text-sm text-slate-500">No bookings yet.</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
