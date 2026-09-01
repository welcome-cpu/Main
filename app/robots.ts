import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Vercel sets VERCEL_ENV to "production" only on the assigned production
  // domain — every preview deployment (branch previews, the vercel.app
  // alias, PRs) gets "preview" or "development". Keep those fully out of
  // search results so preview URLs never compete with the real domain.
  if (process.env.VERCEL_ENV !== "production") {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
