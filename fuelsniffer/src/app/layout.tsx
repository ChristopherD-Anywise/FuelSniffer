import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { getInitialTheme, THEME_COOKIE } from "@/lib/theme/getInitialTheme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPublicUrl } from "@/lib/config/publicUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getPublicUrl(),
  title: "Fillip — find cheap fuel across Australia",
  description: "Fillip helps Australian drivers find the cheapest fuel near them and across their route. Real-time prices, trend tracking, and national coverage.",
};

// Inline pre-paint script: when the server-rendered theme is "system",
// we don't know the user's OS preference at SSR time. This script runs
// synchronously before first paint and flips data-theme to the resolved
// value, eliminating a flash of the wrong theme.
const FOUC_SCRIPT = `(function(){try{var t=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var v=t?decodeURIComponent(t[1]):'system';if(v==='system'){v=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',v);}catch(e){}})();`;

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:font-medium"
        >
          Skip to main content
        </a>
        <ThemeProvider initial={initial}>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
