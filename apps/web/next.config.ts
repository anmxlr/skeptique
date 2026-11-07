import type { NextConfig } from "next";

/*
 * Optional same-origin API proxy for a single-host public deploy (ticket 29). When SKQ_API_PROXY is set
 * (e.g. http://127.0.0.1:4400), /skq-api/* is forwarded to the API, so the browser only talks to one
 * public origin. Unset in development and tests: the app calls NEXT_PUBLIC_API_URL directly.
 */
const apiProxy = process.env.SKQ_API_PROXY?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return apiProxy ? [{ source: "/skq-api/:path*", destination: `${apiProxy}/:path*` }] : [];
  },
};

export default nextConfig;
