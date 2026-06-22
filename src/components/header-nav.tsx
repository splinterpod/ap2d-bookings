"use client";

import Link from "next/link";
import { useState } from "react";
import { signOutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";

type Props = {
  username: string;
  role: "MEMBER" | "ADMIN" | "GUEST";
  isAdmin: boolean;
  active: boolean;
  signedIn: boolean;
};

function NavLink({ href, children, onNavigate }: { href: string; children: React.ReactNode; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100"
    >
      {children}
    </Link>
  );
}

export function HeaderNav({ username, role, isAdmin, active, signedIn }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  if (!signedIn) {
    return (
      <div className="flex shrink-0 items-center gap-1 text-sm">
        <Link href="/login" className="rounded-lg px-2.5 py-2 font-medium text-slate-700 hover:bg-slate-100 sm:px-3">
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-emerald-600 px-2.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:px-3"
        >
          Register
        </Link>
      </div>
    );
  }

  const accountLinks = active ? (
    <>
      <NavLink href="/" onNavigate={closeMenu}>
        Home
      </NavLink>
      <NavLink href="/bookings" onNavigate={closeMenu}>
        My bookings
      </NavLink>
      <NavLink href="/settings" onNavigate={closeMenu}>
        Settings
      </NavLink>
      {isAdmin && (
        <NavLink href="/admin" onNavigate={closeMenu}>
          Admin
        </NavLink>
      )}
    </>
  ) : null;

  return (
    <>
      {/* Desktop */}
      <nav className="hidden items-center gap-0.5 text-sm md:flex">
        {accountLinks}
        <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-2">
          <span className="hidden items-center gap-2 lg:flex">
            <span className="max-w-[8rem] truncate text-slate-500">{username}</span>
            {isAdmin && <Badge tone="blue">Admin</Badge>}
            {role === "GUEST" && <Badge tone="amber">Guest</Badge>}
          </span>
          <form action={signOutAction}>
            <button className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* Mobile menu button */}
      <div className="flex shrink-0 items-center md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <nav
            id="mobile-nav"
            className="absolute left-0 right-0 top-full z-50 border-b border-slate-200 bg-white px-4 py-3 shadow-md md:hidden"
          >
            <div className="mx-auto flex max-w-5xl flex-col gap-1 text-sm">
              <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                <span className="truncate font-medium text-slate-800">{username}</span>
                {isAdmin && <Badge tone="blue">Admin</Badge>}
                {role === "GUEST" && <Badge tone="amber">Guest</Badge>}
              </div>
              {accountLinks}
              <form action={signOutAction} className="pt-1">
                <button
                  type="submit"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
