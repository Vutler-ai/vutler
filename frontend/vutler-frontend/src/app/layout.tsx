import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
