import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/branding";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
