import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mismo proyecto que utn-mcp-web. En producción el mapa se sirve en utnmcp.com.ar/mapa, así que ve
// las cookies de sesión que deja el login de utnmcp.com.ar/cuenta: no hay login propio.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver .env.example).");
  cliente ??= createBrowserClient(url, key);
  return cliente;
}

/** Login de la web principal: el mapa no tiene uno propio. */
export const URL_CUENTA = "https://utnmcp.com.ar/cuenta";
