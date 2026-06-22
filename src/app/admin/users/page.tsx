import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isAccountOwner } from "@/lib/account-owner";
import { formatTz } from "@/lib/time";
import {
  buildUserInstrumentLimits,
  formatInstrumentApprovalDefault,
  formatInstrumentStandardDefault,
} from "@/lib/booking";
import {
  approveUserAction,
  createUserAction,
  setUserRoleAction,
} from "@/actions/admin";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { UserManagementBoxes } from "@/components/admin/user-management-boxes";
import type { SerInstrumentWithDefaults } from "@/components/admin/instrument-limits-dialog";
import type { SerInstrument, SerTraining } from "@/components/admin/training-history-dialog";
import { RoleFormFields } from "@/components/admin/role-form-fields";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const owner = isAccountOwner(admin);

  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      standardHoursWeeklyLimitMinutes: true,
      defaultRequiresApproval: true,
      autoConfirmIfTrained: true,
    },
  });

  const serInstruments: SerInstrument[] = instruments.map(({ id, name, slug }) => ({ id, name, slug }));

  const instrumentsWithDefaults: SerInstrumentWithDefaults[] = instruments.map((i) => ({
    id: i.id,
    name: i.name,
    standardDefaultLabel: formatInstrumentStandardDefault(i.standardHoursWeeklyLimitMinutes),
    approvalDefaultLabel: formatInstrumentApprovalDefault(i),
  }));

  const users = await prisma.user.findMany({
    include: {
      trainings: {
        include: { trainedByAdmin: { select: { username: true } } },
      },
      instrumentLimits: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const pending = users.filter((u) => u.status === "PENDING");
  const others = users.filter((u) => u.status !== "PENDING");

  function mapTrainings(u: (typeof users)[number]): SerTraining[] {
    return u.trainings.map((t) => ({
      instrumentId: t.instrumentId,
      trainedAtLabel: formatTz(t.trainedAt, "MMM d, yyyy"),
      trainedByUsername: t.trainedByAdmin?.username ?? null,
    }));
  }

  function mapLimits(u: (typeof users)[number]) {
    return buildUserInstrumentLimits(
      instruments.map((i) => i.id),
      u.instrumentLimits,
    );
  }

  const renderUser = (u: (typeof users)[number]) => {
    const isSelf = u.id === admin.id;
    const isAdminUser = u.role === "ADMIN";
    const canEditRole = !isSelf && (!isAdminUser || owner);
    const canEditTraining = !isAdminUser;

    const canDelete = owner && !isSelf;

    return (
      <Card key={u.id}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="min-w-0 flex-1">
            {u.username}{" "}
            <span className="font-normal text-slate-400">· {u.email}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {canDelete && <DeleteUserButton userId={u.id} username={u.username} />}
            <Badge tone={u.role === "ADMIN" ? "blue" : u.role === "GUEST" ? "amber" : "neutral"}>
              {u.role.toLowerCase()}
            </Badge>
            <Badge tone={u.status === "ACTIVE" ? "green" : u.status === "PENDING" ? "amber" : "slate"}>
              {u.status.toLowerCase()}
            </Badge>
            {u.guestExpiresAt && (
              <Badge tone="slate">expires {formatTz(u.guestExpiresAt, "MMM d, yyyy")}</Badge>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {u.status === "PENDING" ? (
            <>
              <form action={approveUserAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={u.id} />
                {canEditRole ? (
                  <RoleFormFields defaultRole="MEMBER" expiryInputClassName="w-44" allowAdmin={owner} />
                ) : (
                  <p className="text-sm text-slate-500">
                    {isSelf ? "You cannot change your own role." : "You cannot change an admin's role."}
                  </p>
                )}
                <Button size="sm" disabled={!canEditRole}>
                  Approve
                </Button>
              </form>
              <UserManagementBoxes
                userId={u.id}
                username={u.username}
                status={u.status}
                isAdminUser={isAdminUser}
                canEditTraining={canEditTraining}
                instruments={serInstruments}
                instrumentsWithDefaults={instrumentsWithDefaults}
                trainings={mapTrainings(u)}
                instrumentLimits={mapLimits(u)}
              />
            </>
          ) : (
            <>
              {canEditRole ? (
                <form action={setUserRoleAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <RoleFormFields
                    defaultRole={u.role}
                    guestExpiryDefault={u.guestExpiresAt ? formatTz(u.guestExpiresAt, "yyyy-MM-dd") : ""}
                    allowAdmin={owner}
                  />
                  <Button size="sm" variant="secondary">
                    Save
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-slate-500">
                  {isSelf ? "You cannot change your own role." : "You cannot change an admin's role."}
                </p>
              )}

              <UserManagementBoxes
                userId={u.id}
                username={u.username}
                status={u.status}
                isAdminUser={isAdminUser}
                canEditTraining={canEditTraining}
                instruments={serInstruments}
                instrumentsWithDefaults={instrumentsWithDefaults}
                trainings={mapTrainings(u)}
                instrumentLimits={mapLimits(u)}
              />
            </>
          )}
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create user</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={createUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div>
              <Label>Username</Label>
              <Input name="username" required />
            </div>
            <div>
              <Label>Temp password</Label>
              <Input name="password" type="text" minLength={8} required />
            </div>
            <RoleFormFields defaultRole="MEMBER" expiryInputClassName="w-full" allowAdmin={owner} />
            <div className="flex items-end">
              <Button className="w-full">Create</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            Pending approval ({pending.length})
          </h2>
          {pending.map(renderUser)}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">All users</h2>
        {others.map(renderUser)}
      </section>
    </div>
  );
}
