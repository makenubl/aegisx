/** @type {import('next').NextConfig} */
const isVercel = !!process.env.VERCEL;
const isStaticExport = !!process.env.AWS_STATIC;

const nextConfig = {
  // standalone for Docker, export for S3/CloudFront, nothing for Vercel
  ...(isVercel ? {} : isStaticExport ? { output: "export", trailingSlash: true } : { output: "standalone" }),
  // rewrites not supported with static export
  ...(isStaticExport ? {} : {
    async rewrites() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      if (isVercel && !process.env.NEXT_PUBLIC_API_URL) return [];
      return [{ source: "/api/v1/:path*", destination: `${apiBase}/api/v1/:path*` }];
    },
  }),
};

export default nextConfig;
