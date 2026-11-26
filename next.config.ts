import type { NextConfig } from "next";

// Se sirve en utnmcp.com.ar/mapa: utn-mcp-web reescribe /mapa/* hacia este proyecto.
const nextConfig: NextConfig = {
  basePath: "/mapa",
};

export default nextConfig;
