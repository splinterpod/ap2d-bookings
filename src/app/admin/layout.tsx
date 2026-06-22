import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/instruments", label: "Instruments" },
  { href: "/admin/export", label: "Export" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Administration</h1>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}
