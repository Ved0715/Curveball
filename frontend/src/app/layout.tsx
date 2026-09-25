import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { BRAND, TAGLINE } from "@/lib/brand";
import { themeScript } from "@/lib/theme-script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });

export const metadata: Metadata = {
  title: { default: `${BRAND}: learn daily, interview ready`, template: `%s · ${BRAND}` },
  description: `${TAGLINE} A daily learning habit for engineers, plus AI mock interviews that tell you honestly what to fix.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121016" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full`}
    >
      <body className="min-h-full">
        {/* Sets light/dark before first paint so the page never flashes the wrong theme. */}
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <a
          href="#main"
          className="sr-only z-[60] rounded-xl bg-ink px-4 py-2 text-bg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
