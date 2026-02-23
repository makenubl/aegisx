/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output for Docker; Vercel handles its own packaging
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    // On Vercel without a backend URL configured, skip the rewrite
    if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
