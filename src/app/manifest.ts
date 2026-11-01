import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t.brand.name} — EV charging stations in India`,
    short_name: t.brand.name,
    description: t.brand.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f7",
    theme_color: "#039855",
    lang: "en-IN",
    categories: ["travel", "navigation", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
