import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { leerCartelera, SinLector } from "@/lib/lectorCartelera";

// Varios intentos de hasta 40 s cada uno si los gratuitos están lentos.
export const maxDuration = 120;

const MAX_IMAGEN = 3_500_000; // caracteres del data URL (~2.6 MB); el cliente la achica antes.

export async function POST(request: Request) {
  // Solo contribuidores: cada lectura gasta cupo de los modelos.
  const almacen = await cookies();
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
    cookies: { getAll: () => almacen.getAll(), setAll: () => {} },
  });
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Entrá con tu cuenta UTN para leer fotos." }, { status: 401 });
  const { data: contribuidor } = await db.from("mapa_contribuidores").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!contribuidor) return Response.json({ error: "Solo los contribuidores pueden leer fotos." }, { status: 403 });

  let cuerpo: { imagen?: unknown; materias?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const imagen = cuerpo.imagen;
  if (typeof imagen !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(imagen)) {
    return Response.json({ error: "Mandá la foto como imagen JPEG, PNG o WebP." }, { status: 400 });
  }
  if (imagen.length > MAX_IMAGEN) return Response.json({ error: "La foto es demasiado grande." }, { status: 413 });
  const materias = Array.isArray(cuerpo.materias)
    ? cuerpo.materias.filter((m): m is string => typeof m === "string" && m.length < 120).slice(0, 300)
    : [];

  try {
    const lectura = await leerCartelera(imagen, materias, request.headers.get("x-vercel-oidc-token"));
    return Response.json(lectura);
  } catch (e) {
    const status = e instanceof SinLector ? 503 : 502;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
