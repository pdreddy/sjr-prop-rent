import type { MetadataRoute } from "next";

// Web app manifest: makes the site installable ("Add to Home Screen" / "Install app") on Android,
// iOS, desktop Chrome/Edge and other Chromium browsers.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SJR Rent Tracker",
    short_name: "SJR Rent",
    description: "Monthly rent and electricity tracker for SJR Building",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f6f5",
    theme_color: "#166a4a",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Admin login", short_name: "Admin", url: "/admin", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Meter readings", short_name: "Readings", url: "/admin/electricity", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
