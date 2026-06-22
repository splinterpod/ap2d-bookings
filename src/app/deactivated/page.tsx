import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { signOutAction } from "@/actions/auth";

export default async function DeactivatedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "ACTIVE") redirect("/");

  return (
    <AuthShell title="Account inactive">
      <p className="text-sm text-slate-600">
        This account is no longer active. If you believe this is a mistake, please contact a lab
        administrator.
      </p>
      <form action={signOutAction} className="mt-5">
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
