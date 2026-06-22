import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <AuthShell
      title="Create account"
      subtitle="New accounts are reviewed by a lab administrator before access is granted."
    >
      <RegisterForm />
    </AuthShell>
  );
}
