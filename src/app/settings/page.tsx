import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateNotificationPrefsAction } from "@/actions/settings";
import { ChangePasswordForm, ChangeUsernameForm } from "@/components/auth-forms";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const current = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: current.id } });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="text-sm text-slate-600">
            Email: <strong className="text-slate-800">{user.email}</strong>
          </div>
          <ChangeUsernameForm currentUsername={user.username} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateNotificationPrefsAction} className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="notifyConfirmations" defaultChecked={user.notifyConfirmations} />
              Booking approval updates
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="notifyReminders" defaultChecked={user.notifyReminders} />
              Session reminders (1h before, late sign-in, auto sign-out)
            </label>
            <Button size="sm">Save preferences</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
