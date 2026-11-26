import type { NextConfig } from "next";

// Se sirve en utnmcp.com.ar/mapa: utn-mcp-web reescribe /mapa/* hacia este proyecto.
const nextConfig: NextConfig = {
  basePath: "/mapa",
  // Para probar desde el celular en la misma red: http://<IP de la compu>:3000/mapa
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
