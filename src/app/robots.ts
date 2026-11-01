import type { MetadataRoute } from "next";
import { isDemoMode, siteUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  // Demo deployments show fictional stations — keep them out of search engines.
  if (isDemoMode()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/operator", "/login", "/account", "/auth"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
