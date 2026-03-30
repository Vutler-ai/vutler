import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3b82f6",
};

export const metadata: Metadata = {
  title: "Vutler - AI Agent Platform",
  description: "Unified dashboard for managing AI agents across multiple platforms",
  icons: {
    icon: "/landing/vutler-logo-full-white.png",
    shortcut: "/landing/vutler-logo-full-white.png",
    apple: "/icons/icon-192.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vutler",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
        {/* Umami Analytics - Privacy-focused, no cookies */}
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="223241c1-605f-4afe-8dc7-3a8a59c06d68"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
