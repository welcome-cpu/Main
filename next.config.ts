import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
