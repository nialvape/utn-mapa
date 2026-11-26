// Lee la foto de una cartelera de bedelía con un modelo de visión. Solo corre en el servidor (usa las claves).
//
// Orden de intento, del más barato al que cuesta algo:
//   1. OpenRouter, modelo gratuito con visión orientado a documentos.
//   2. OpenRouter, otro gratuito de otro proveedor (si el primero está saturado o devuelve basura).
//   3. Vercel AI Gateway, modelo chico pago (centavos de dólar cada mil fotos).
// Un intento se saltea si falta su clave. Los modelos se pueden cambiar sin tocar código con las variables
// LECTOR_MODELOS_OPENROUTER (lista separada por comas) y LECTOR_MODELO_GATEWAY.

const MODELOS_OPENROUTER = (process.env.LECTOR_MODELOS_OPENROUTER ?? "nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MODELO_GATEWAY = process.env.LECTOR_MODELO_GATEWAY ?? "google/gemini-2.5-flash-lite";

const TIEMPO_POR_INTENTO_MS = 40_000;

export interface FilaLeida {
  materia: string;
  comision: string;
  modulos: string;
  aula: string;
  /** Por qué conviene revisar la fila, o null si se leyó bien. */
  duda: string | null;
}

export interface Lectura {
  dia: string | null;
  turno: "M" | "T" | "N" | null;
  filas: FilaLeida[];
  /** Qué modelo terminó leyendo la foto. */
  modelo: string;
}

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dia", "turno", "filas"],
  properties: {
    dia: { type: ["string", "null"], description: "Día de la semana de la hoja, en minúscula (lunes…sábado)" },
    turno: { type: ["string", "null"], enum: ["M", "T", "N", null], description: "M mañana, T tarde, N noche" },
    filas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["materia", "comision", "modulos", "aula", "duda"],
        properties: {
          materia: { type: "string" },
          comision: { type: "string" },
          modulos: { type: "string", description: "Como 1:5, o vacío" },
          aula: { type: "string", description: "Número, Sub.13, V o vacío" },
          duda: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

function instrucciones(materiasConocidas: string[]): string {
  const lista = materiasConocidas.length
    ? `\n\nMaterias ya cargadas otras veces. Si una materia de la foto es claramente una de estas, usá exactamente ese nombre:\n${materiasConocidas.join("\n")}`
    : "";
  return `Es una foto de la cartelera de bedelía de la UTN FRBA (sede Campus): una tabla con las aulas asignadas a cada comisión para un día y un turno.

Pasá cada fila de la tabla a JSON, sin inventar nada:
- materia: el nombre de la materia tal como está escrito, con mayúsculas y acentos normales (no todo en mayúscula).
- comision: el código de la comisión, por ejemplo K1052 o Z2001, sin espacios.
- modulos: la banda horaria suele decir algo como "Martes 1:5 (N)"; acá va solo "1:5". Vacío si no figura.
- aula: el número tal cual (234, 59, 04), "Sub.13" si es del subsuelo, "V" si dice virtual, o vacío si la celda está vacía.
- duda: si alguna celda de esa fila está borrosa, tapada, cortada o no estás seguro de leerla bien, explicá en pocas palabras qué revisar (por ejemplo "aula borrosa: 234 o 284"). Si la fila se lee bien, null.

Además:
- dia: el día de la semana de la hoja (de la banda o del título), en minúscula. null si no se ve.
- turno: M, T o N según la banda o el título. null si no se ve.

Si la foto no es una cartelera o no se puede leer, devolvé filas vacía.
Respondé solo con el JSON, con esta forma: {"dia": ..., "turno": ..., "filas": [{"materia": ..., "comision": ..., "modulos": ..., "aula": ..., "duda": ...}]}${lista}`;
}

/** Saca el JSON de la respuesta aunque venga entre ``` o con texto alrededor. */
function extraerJson(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) throw new Error("la respuesta no trae JSON");
  return JSON.parse(texto.slice(inicio, fin + 1));
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function normalizar(crudo: unknown): Omit<Lectura, "modelo"> {
  if (!crudo || typeof crudo !== "object") throw new Error("JSON con forma inesperada");
  const o = crudo as Record<string, unknown>;
  if (!Array.isArray(o.filas)) throw new Error("falta la lista de filas");
  const turno = texto(o.turno).toUpperCase();
  const filas = o.filas
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      materia: texto(f.materia),
      comision: texto(f.comision).toUpperCase().replace(/\s+/g, ""),
      modulos: texto(f.modulos),
      aula: texto(f.aula),
      duda: texto(f.duda) || null,
    }))
    .filter((f) => f.materia || f.comision);
  return {
    dia: texto(o.dia).toLowerCase() || null,
    turno: turno === "M" || turno === "T" || turno === "N" ? turno : null,
    filas,
  };
}

interface Intento {
  nombre: string;
  url: string;
  clave: string;
  modelo: string;
  extra?: Record<string, unknown>;
}

function intentos(oidc: string | null): Intento[] {
  const lista: Intento[] = [];
  const claveOpenRouter = process.env.OPENROUTER_API_KEY;
  if (claveOpenRouter) {
    for (const modelo of MODELOS_OPENROUTER) {
      lista.push({ nombre: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", clave: claveOpenRouter, modelo });
    }
  }
  // En Vercel el gateway acepta el token OIDC del deploy sin clave aparte; en local hace falta AI_GATEWAY_API_KEY.
  const claveGateway = process.env.AI_GATEWAY_API_KEY ?? oidc ?? process.env.VERCEL_OIDC_TOKEN;
  if (claveGateway) {
    lista.push({ nombre: "gateway", url: "https://ai-gateway.vercel.sh/v1/chat/completions", clave: claveGateway, modelo: MODELO_GATEWAY });
  }
  return lista;
}

async function pedir(intento: Intento, imagen: string, materias: string[]): Promise<Lectura> {
  const r = await fetch(intento.url, {
    method: "POST",
    signal: AbortSignal.timeout(TIEMPO_POR_INTENTO_MS),
    headers: {
      Authorization: `Bearer ${intento.clave}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://utnmcp.com.ar/mapa",
      "X-Title": "Mapa Sede Campus",
    },
    body: JSON.stringify({
      model: intento.modelo,
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_schema", json_schema: { name: "cartelera", strict: true, schema: ESQUEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instrucciones(materias) },
            { type: "image_url", image_url: { url: imagen } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const datos = (await r.json()) as { choices?: { message?: { content?: string | null } }[]; error?: { message?: string } };
  if (datos.error) throw new Error(datos.error.message ?? "error del proveedor");
  const contenido = datos.choices?.[0]?.message?.content;
  if (!contenido) throw new Error("respuesta vacía");
  return { ...normalizar(extraerJson(contenido)), modelo: intento.modelo };
}

export class SinLector extends Error {}

/** Prueba cada modelo en orden hasta que uno devuelva una tabla con filas. */
export async function leerCartelera(imagen: string, materias: string[], oidc: string | null): Promise<Lectura> {
  const lista = intentos(oidc);
  if (!lista.length) throw new SinLector("No hay ningún modelo configurado (falta OPENROUTER_API_KEY o AI_GATEWAY_API_KEY).");
  const errores: string[] = [];
  let vacia: Lectura | null = null;
  for (const intento of lista) {
    try {
      const lectura = await pedir(intento, imagen, materias);
      if (lectura.filas.length) return lectura;
      vacia ??= lectura;
      errores.push(`${intento.modelo}: no encontró filas`);
    } catch (e) {
      errores.push(`${intento.modelo}: ${(e as Error).message}`);
    }
  }
  console.error("leerCartelera sin éxito", errores);
  if (vacia) return vacia;
  throw new Error("Ningún modelo pudo leer la foto.");
}
