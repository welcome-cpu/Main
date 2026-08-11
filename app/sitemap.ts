import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { posts } from "@/lib/posts";
import { properties } from "@/lib/properties";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/properties`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/our-story`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/gallery`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.5 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  const propertyRoutes: MetadataRoute.Sitemap = properties.map((property) => ({
    url: `${SITE_URL}/properties/${property.slug}`,
    changeFrequency: "monthly",
    priority: property.comingSoon ? 0.4 : 0.8,
  }));

  return [...staticRoutes, ...postRoutes, ...propertyRoutes];
}
