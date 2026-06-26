import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isAccountOwner } from "@/lib/account-owner";
import { formatTz } from "@/lib/time";
import { rejectBookingAction } from "@/actions/admin-instrument";
import { ApproveBookingButton } from "@/components/admin/approve-booking-button";
import { DeleteBookingButton } from "@/components/admin/delete-booking-button";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const admin = await requireAdmin();
  const owner = isAccountOwner(admin);
  const now = new Date();

  const pending = await prisma.booking.findMany({
    where: { status: "PENDING" },
    include: { instrument: true, user: { select: { username: true, email: true } } },
    orderBy: { startAt: "asc" },
  });

  const recent = await prisma.booking.findMany({
    include: { instrument: true, user: { select: { username: true } }, session: true },
    orderBy: { startAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting approval ({pending.length})</CardTitle>
          </CardHeader>
          <CardBody className="divide-y divide-slate-100">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{b.user.username}</span> · {b.instrument.name}
                  <div className="text-slate-500">
                    {formatTz(b.startAt, "EEE MMM d, h:mm a")} – {formatTz(b.endAt, "h:mm a")}
                  </div>
                  {b.notes && <div className="text-slate-400">Notes: {b.notes}</div>}
                </div>
                <div className="flex gap-2">
                  <ApproveBookingButton bookingId={b.id} />
                  <form action={rejectBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button size="sm" variant="danger">
                      Reject
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All bookings</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Session</th>
                <th className="py-2 pr-3"></th>
                {owner && <th className="py-2 pr-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{b.user.username}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {formatTz(b.startAt, "MMM d, h:mm a")} – {formatTz(b.endAt, "h:mm a")}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      tone={
                        b.status === "CONFIRMED"
                          ? "green"
                          : b.status === "PENDING"
                            ? "amber"
                            : b.status === "REJECTED"
                              ? "red"
                              : "slate"
                      }
                    >
                      {b.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">
                    {b.noShow && <Badge tone="red">no-show</Badge>}
                    {b.session?.unsignedOut && <Badge tone="amber">unsigned-out</Badge>}
                    {b.session?.signedOutAt && <span>done</span>}
                    {b.session && !b.session.signedOutAt && <Badge tone="blue">in use</Badge>}
                  </td>
                  <td className="py-2 pr-3">
                    {(b.status === "CONFIRMED" || b.status === "PENDING") &&
                      b.endAt > now &&
                      !b.session?.signedOutAt && (
                      <CancelBookingButton
                        bookingId={b.id}
                        variant="ghost"
                        buttonLabel="Cancel"
                        label={`${b.user.username} · ${b.instrument.name} · ${formatTz(b.startAt, "MMM d, h:mm a")} – ${formatTz(b.endAt, "h:mm a")}`}
                      />
                    )}
                  </td>
                  {owner && (
                    <td className="py-2 pr-3">
                      <DeleteBookingButton
                        bookingId={b.id}
                        label={`${b.user.username} · ${formatTz(b.startAt, "MMM d, h:mm a")}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
