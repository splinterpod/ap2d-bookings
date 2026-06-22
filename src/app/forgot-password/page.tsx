import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "@/components/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a link to reset it.">
      <ForgotForm />
    </AuthShell>
  );
}
