import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";

export const metadata: Metadata = {
  title: "SJR Rent Tracker",
  description: "Monthly rent payment tracker for SJR Building",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {children}
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
