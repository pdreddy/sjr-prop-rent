import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  applicationName: "SJR Rent Tracker",
  title: "SJR Rent Tracker",
  description: "Monthly rent payment tracker for SJR Building",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS Safari: launch from the home screen without browser chrome.
  appleWebApp: { capable: true, title: "SJR Rent", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Notched phones: lets env(safe-area-inset-*) work. Pinch-zoom stays enabled for accessibility
  // (inputs are 16px, so iOS no longer auto-zooms on focus).
  viewportFit: "cover",
  themeColor: "#166a4a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        {children}
        <FirebaseAnalytics />
        <PwaRegister />
      </body>
    </html>
  );
}
