import { getCurrentUser } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { HeaderNav } from "@/components/header-nav";

export async function Header() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const active = user?.status === "ACTIVE";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:h-16">
        <BrandLogo linked showSubtitle className="min-w-0 max-w-[min(100%,12rem)] sm:max-w-none" />

        <HeaderNav
          username={user?.username ?? ""}
          role={user?.role ?? "MEMBER"}
          isAdmin={!!isAdmin}
          active={!!active}
          signedIn={!!user}
        />
      </div>
    </header>
  );
}
