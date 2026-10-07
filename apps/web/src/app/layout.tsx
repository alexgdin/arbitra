import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import CookieConsent from "@/components/cookie-consent";
import Footer from "@/components/footer";
import Header from "@/components/header";
import Providers from "@/components/providers";
import { BRAND } from "@/lib/brand";
import MaintenanceScreen from "@/components/mainenancte-screen";
import { IntroLoader } from "@/components/motion/intro-loader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} - ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <Providers>
          <IntroLoader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
