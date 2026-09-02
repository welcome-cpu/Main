import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { posts } from "@/lib/posts";
import { properties } from "@/lib/properties";

export default function sitemap(): MetadataRoute.Sitemap {
  // Reflects when this build was generated, which only happens when
  // content actually changes — an honest proxy for "last modified" since
  // individual pages don't carry their own update timestamps.
  const buildDate = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: buildDate, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/properties`, lastModified: buildDate, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/our-story`, lastModified: buildDate, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: buildDate, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/gallery`, lastModified: buildDate, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/blog`, lastModified: buildDate, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/faqs`, lastModified: buildDate, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/gift-vouchers`, lastModified: buildDate, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: buildDate, changeFrequency: "yearly", priority: 0.5 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  // Coming-soon properties are noindexed until launch, so they're left out
  // here too — a sitemap entry would tell crawlers to index a page the
  // robots meta tag says not to.
  const propertyRoutes: MetadataRoute.Sitemap = properties
    .filter((property) => !property.comingSoon)
    .map((property) => ({
      url: `${SITE_URL}/properties/${property.slug}`,
      lastModified: buildDate,
      changeFrequency: "monthly",
      priority: 0.8,
    }));

  return [...staticRoutes, ...postRoutes, ...propertyRoutes];
}
