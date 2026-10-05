import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

// În producție API-ul (apps/server) e un proiect separat. Când API_ORIGIN e setat, site-ul îi trimite
// /trpc și /api/auth prin rewrites, ca browserul să vorbească doar cu domeniul site-ului: cookie-urile
// de autentificare rămân first-party (merg și în Safari). Local, fără API_ORIGIN, clientul cheamă direct
// NEXT_PUBLIC_SERVER_URL.
const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  // Adrese LAN de pe care deschizi aplicația în dev (doar hostname, fără port). Se schimbă cu rețeaua.
  allowedDevOrigins: ["172.16.15.187"],
  async rewrites() {
    if (!apiOrigin) {
      return [];
    }
    return [
      { source: "/trpc/:path*", destination: `${apiOrigin}/trpc/:path*` },
      { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
    ];
  },
};

export default withVarlock(nextConfig);
