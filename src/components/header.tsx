import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/actions/auth";
import { Badge } from "./ui/badge";

export async function Header() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const active = user?.status === "ACTIVE";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-sm font-black text-white">
            K
          </span>
          <span className="hidden sm:inline">Kherani Lab Bookings</span>
          <span className="sm:hidden">Kherani Lab</span>
        </div>

        <nav className="flex items-center gap-1 text-sm">
          {user && active && (
            <>
              <Link href="/" className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                Home
              </Link>
              <Link href="/bookings" className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                My bookings
              </Link>
              <Link href="/settings" className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                Settings
              </Link>
              {isAdmin && (
                <Link href="/admin" className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                  Admin
                </Link>
              )}
            </>
          )}

          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <span className="hidden items-center gap-2 sm:flex">
                <span className="text-slate-500">{user.username}</span>
                {isAdmin && <Badge tone="blue">Admin</Badge>}
                {user.role === "GUEST" && <Badge tone="amber">Guest</Badge>}
              </span>
              <form action={signOutAction}>
                <button className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-700 px-3 py-2 font-semibold text-white hover:bg-brand-800"
              >
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
