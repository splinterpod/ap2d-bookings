import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { getImpersonationView } from "@/lib/impersonation";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/branding";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const impersonation = await getImpersonationView();

  return (
    <html lang="en">
      <body>
        {impersonation && <ImpersonationBanner username={impersonation.username} />}
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
