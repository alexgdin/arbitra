import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  // Adrese LAN de pe care deschizi aplicația în dev (doar hostname, fără port). Se schimbă cu rețeaua.
  allowedDevOrigins: ["172.16.15.187"],
};

export default withVarlock(nextConfig);
