import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { signOutAction } from "@/actions/auth";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "ACTIVE") redirect("/");
  if (user.status === "DEACTIVATED") redirect("/deactivated");

  return (
    <AuthShell title="Awaiting approval">
      <p className="text-sm text-slate-600">
        Thanks for registering, <strong>{user.username}</strong>. A lab administrator will review and
        activate your account. You will receive an email at <strong>{user.email}</strong> once approved.
      </p>
      <form action={signOutAction} className="mt-5">
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
