import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { getStore } from "@/lib/data";

/** Public pages plus verified, non-demo stations (first 1,000). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = ["", "/stations", "/about", "/report", "/contact", "/privacy", "/terms"].map(
    (p) => ({ url: `${base}${p}`, changeFrequency: p === "/stations" ? "daily" : "monthly" }),
  );
  let stations: MetadataRoute.Sitemap = [];
  try {
    // Only operator-confirmed stations are indexed; source-listed ones stay out of search engines.
    const { items } = await getStore().searchStations({ verified: "1" }, 1, 1000);
    stations = items
      .filter((s) => s.source !== "demo")
      .map((s) => ({ url: `${base}/stations/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" }));
  } catch (err) {
    console.error("[sitemap] could not load stations", err);
  }
  return [...pages, ...stations];
}
