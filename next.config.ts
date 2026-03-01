import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  serverExternalPackages: [
    "just-bash",
    "@mariozechner/pi-coding-agent",
    "@mariozechner/pi-agent-core",
    "@mariozechner/pi-ai",
  ],
};

export default nextConfig;
