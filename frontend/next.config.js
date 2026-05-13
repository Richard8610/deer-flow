/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

function getInternalServiceURL(envKey, fallbackURL) {
  const configured = process.env[envKey]?.trim();
  return configured && configured.length > 0
    ? configured.replace(/\/+$/, "")
    : fallbackURL;
}
import nextra from "nextra";

const withNextra = nextra({});

/** @type {import("next").NextConfig} */
const config = {
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
  },
  devIndicators: false,
  async rewrites() {
    const rewrites = [];
    const langgraphURL = getInternalServiceURL(
      "DEER_FLOW_INTERNAL_LANGGRAPH_BASE_URL",
      "http://127.0.0.1:8001/api",
    );
    const gatewayURL = getInternalServiceURL(
      "DEER_FLOW_INTERNAL_GATEWAY_BASE_URL",
      "http://127.0.0.1:8001",
    );

    if (!process.env.NEXT_PUBLIC_LANGGRAPH_BASE_URL) {
      rewrites.push({
        source: "/api/langgraph",
        destination: langgraphURL,
      });
      rewrites.push({
        source: "/api/langgraph/:path*",
        destination: `${langgraphURL}/:path*`,
      });
    }

    if (!process.env.NEXT_PUBLIC_BACKEND_BASE_URL) {
      for (const route of ["agents", "skills", "mcp", "memory", "models", "tools", "tool-groups"]) {
        rewrites.push({
          source: `/api/${route}`,
          destination: `${gatewayURL}/api/${route}`,
        });
        rewrites.push({
          source: `/api/${route}/:path*`,
          destination: `${gatewayURL}/api/${route}/:path*`,
        });
      }

      // Auth endpoints — required for browser-side login/setup/register calls
      rewrites.push({
        source: "/api/v1/auth/:path*",
        destination: `${gatewayURL}/api/v1/auth/:path*`,
      });

      // Threads, runs, feedback, suggestions, uploads, channels
      rewrites.push({
        source: "/api/threads/:path*",
        destination: `${gatewayURL}/api/threads/:path*`,
      });
      rewrites.push({
        source: "/api/runs/:path*",
        destination: `${gatewayURL}/api/runs/:path*`,
      });
    }

    return rewrites;
  },
};

export default withNextra(config);
