import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui/alert";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { reset } = await searchParams;

  return (
    <AuthShell title="Sign in" subtitle="Sign in to book and manage instrument sessions.">
      {reset && (
        <div className="mb-4">
          <Alert tone="success">Password updated. You can sign in now.</Alert>
        </div>
      )}
      <LoginForm />
    </AuthShell>
  );
}
