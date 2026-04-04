import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CookieConsentProvider } from "@/components/legal/cookie-consent";
import PWAInstallPrompt from "@/components/pwa-install-prompt";

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
        <CookieConsentProvider>
          {children}
          <ServiceWorkerRegister />
          <PWAInstallPrompt />
        </CookieConsentProvider>
      </body>
    </html>
  );
}
