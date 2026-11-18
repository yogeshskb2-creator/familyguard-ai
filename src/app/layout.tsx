import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FamilyGuard AI — Consent-based family safety", template: "%s · FamilyGuard AI" },
  description:
    "Share your live location with the family members you choose — only when you choose. SOS alerts, safe zones and an AI safety assistant.",
  applicationName: "FamilyGuard AI",
  appleWebApp: { capable: true, title: "FamilyGuard", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#080a18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
