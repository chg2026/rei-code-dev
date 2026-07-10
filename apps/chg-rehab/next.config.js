/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
  // The instrumentation hook eagerly compiles a few server-only modules
  // (e.g. lib/replitmail.ts, lib/objectStorage.ts) whose dependency tree uses
  // `node:` URI imports. Tell webpack to leave these scheme-prefixed imports
  // alone on the server bundle so it can require() them at runtime.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = config.externals || [];
      const externals = Array.isArray(existing) ? existing : [existing];
      externals.push(({ request }, callback) => {
        if (request && request.startsWith("node:")) {
          return callback(null, "commonjs " + request);
        }
        // The Twilio SDK (and its jsonwebtoken dependency) uses bare
        // `require('crypto')`/`require('stream')`. Keep it as a runtime require
        // so webpack never tries to bundle it into the instrumentation/edge
        // trace (it is only ever executed in the Node runtime).
        if (request === "twilio" || request.startsWith("twilio/")) {
          return callback(null, "commonjs " + request);
        }
        return callback();
      });
      config.externals = externals;
    }
    return config;
  },
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
