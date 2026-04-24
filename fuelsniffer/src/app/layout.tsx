import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { getInitialTheme, THEME_COOKIE } from "@/lib/theme/getInitialTheme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPublicUrl } from "@/lib/config/publicUrl";
import PwaRegistrar from "@/components/PwaRegistrar";

// Self-hosted Inter (next/font/google self-hosts at build time — no Google Fonts hop)
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  metadataBase: getPublicUrl(),
  title: "Fillip — find cheap fuel across Australia",
  description: "Fillip helps Australian drivers find the cheapest fuel near them and across their route. Real-time prices, trend tracking, and national coverage.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fillip",
  },
};

// Inline pre-paint script: when the server-rendered theme is "system",
// we don't know the user's OS preference at SSR time. This script runs
// synchronously before first paint and flips data-theme to the resolved
// value, eliminating a flash of the wrong theme.
const FOUC_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),v=c?c[1]:'system';document.documentElement.dataset.theme=v==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initial = await getInitialTheme();
  const ssrAttribute = initial === 'system' ? 'light' : initial;

  return (
    <html
      lang="en-AU"
      data-theme={ssrAttribute}
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {/* FOUC prevention — must run before any stylesheet paint */}
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* Dual theme-color for OS chrome to match our themes */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />

        {/* Apple touch icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />

        {/* color-scheme hint so native controls + scrollbars match */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)' }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:font-medium"
        >
          Skip to main content
        </a>
        <ThemeProvider initial={initial}>
          {children}
          <ThemeToggle />
          <PwaRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
