import type { NextConfig } from "next";

// Hardening for the admin and booking areas (and their APIs). The public
// marketing pages are left exactly as they were.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return ["/admin/:path*", "/admin", "/book/:path*", "/api/:path*"].map((source) => ({
      source,
      headers: securityHeaders,
    }));
  },
  // Redirects from the old Lodgify-hosted site's URLs, so any existing
  // search rankings/backlinks land on the new pages instead of a 404.
  async redirects() {
    return [
      {
        source: "/en/muckle-view",
        destination: "/properties/muckle-view",
        permanent: true,
      },
      {
        source: "/en/overview-murray-cottage1",
        destination: "/properties/murray-cottage",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
