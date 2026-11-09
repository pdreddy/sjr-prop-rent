import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SJR Resident Portal",
    short_name: "SJR Home",
    description: "Your building’s monthly rent status, all in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    background_color: "#f8f9f5",
    theme_color: "#224c3e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
