import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isAccountOwner } from "@/lib/account-owner";
import { formatTz } from "@/lib/time";
import { describeLaserSession, laserPhotonSummary } from "@/lib/laser-session";
import { DeleteSessionButton } from "@/components/admin/delete-session-button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const admin = await requireAdmin();
  const owner = isAccountOwner(admin);

  const sessions = await prisma.instrumentSession.findMany({
    include: {
      user: { select: { username: true } },
      booking: { include: { instrument: { select: { name: true } } } },
      readings: true,
    },
    orderBy: { signedInAt: "desc" },
    take: 100,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session log</CardTitle>
      </CardHeader>
      <CardBody className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-2 pr-3">User</th>
              <th className="py-2 pr-3">Signed in</th>
              <th className="py-2 pr-3">Signed out</th>
              <th className="py-2 pr-3">Laser</th>
              <th className="py-2 pr-3">Photon counts</th>
              <th className="py-2 pr-3">Flags</th>
              {owner && <th className="py-2 pr-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-3 font-medium text-slate-800">{s.user.username}</td>
                <td className="py-2 pr-3 text-slate-600">{formatTz(s.signedInAt, "MMM d, h:mm a")}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {s.signedOutAt ? formatTz(s.signedOutAt, "MMM d, h:mm a") : <Badge tone="blue">open</Badge>}
                </td>
                <td className="py-2 pr-3 text-slate-600">
                  {describeLaserSession(s.readings, s.signInSkipped)}
                </td>
                <td className="py-2 pr-3 text-slate-600">{laserPhotonSummary(s.readings)}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {s.signInSkipped && <Badge tone="slate">in-skip</Badge>}
                    {s.signOutSkipped && <Badge tone="slate">out-skip</Badge>}
                    {s.unsignedOut && <Badge tone="amber">unsigned-out</Badge>}
                  </div>
                </td>
                {owner && (
                  <td className="py-2 pr-3">
                    <DeleteSessionButton
                      sessionId={s.id}
                      label={`${s.user.username} · ${formatTz(s.signedInAt, "MMM d, h:mm a")}`}
                    />
                  </td>
                )}
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-slate-500">
                  No sessions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
