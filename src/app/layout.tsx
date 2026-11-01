import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/layout/demo-banner";
import { MobileNav } from "@/components/layout/nav-links";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteUrl } from "@/lib/config";
import { defaultLocale, t } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${t.brand.name} — ${t.brand.tagline}`,
    template: `%s · ${t.brand.name}`,
  },
  description:
    "Find EV charging stations across India by city, connector type and charging speed. Listings are submitted by operators and reviewed before publishing.",
  applicationName: t.brand.name,
  appleWebApp: { capable: true, title: t.brand.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#039855",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={defaultLocale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <DemoBanner />
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">
          {children}
        </main>
        <SiteFooter />
        <div className="h-16 md:hidden" aria-hidden />
        <MobileNav />
      </body>
    </html>
  );
}
