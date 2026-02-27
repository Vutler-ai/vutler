import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Inter font is downloaded at build time and self-hosted (not from Google CDN)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vutler - AI Agent Platform",
  description: "Unified dashboard for managing AI agents across multiple platforms",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script defer src="https://cloud.umami.is/script.js" data-website-id="223241c1-605f-4afe-8dc7-3a8a59c06d68" strategy="afterInteractive" />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
