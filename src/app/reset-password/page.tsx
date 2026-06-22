import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "@/components/auth-forms";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title="Reset password">
        <p className="text-sm text-slate-600">
          This link is missing its token.{" "}
          <Link href="/forgot-password" className="text-brand-700 hover:underline">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password" subtitle="Only your password will be changed — role, access, and other settings stay the same.">
      <ResetForm token={token} />
    </AuthShell>
  );
}
