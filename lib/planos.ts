import { PISOS, type PisoId } from "./pisos";

/** Prefijo del sitio (next.config.ts → basePath). Los fetch a /public no lo agregan solos. */
export const BASE_PATH = "/mapa";

export type Edificio = "violeta" | "rosa" | "noreste";

/** Punto en metros de escena: [x este, z sur]. */
export type Punto = [number, number];

export interface Aula {
  id: string;
  edificio: Edificio;
  aVerificar: boolean;
  centro: Punto;
  poligono: Punto[];
  area: number;
}

export type TipoPoi =
  | "sanitarios"
  | "bedelia"
  | "buffet"
  | "biblioteca"
  | "estacionamiento"
  | "ingreso"
  | "hall"
  | "laboratorio"
  | "salud"
  | "otro";

export interface Poi {
  nombre: string;
  tipo: TipoPoi;
  centro: Punto;
}

/** Lo que genera scripts/extraer_planos.py para cada piso. */
export interface Plano {
  piso: PisoId;
  escala: number;
  aVerificar: boolean;
  /** Segmentos planos [x1, z1, x2, z2, ...] en metros. */
  lineas: number[];
  aulas: Aula[];
  pois: Poi[];
}

export async function cargarPlanos(): Promise<Record<PisoId, Plano>> {
  const planos = await Promise.all(
    PISOS.map(async (p) => {
      const r = await fetch(`${BASE_PATH}/data/piso-${p.id}.json`);
      if (!r.ok) throw new Error(`No se pudo cargar el plano del piso ${p.id} (${r.status})`);
      return (await r.json()) as Plano;
    }),
  );
  return Object.fromEntries(planos.map((p) => [p.piso, p])) as Record<PisoId, Plano>;
}

/** Busca un aula por número tal como lo escribe la gente: "105", "5", "sub 13", "S13". */
export function buscarAula(planos: Record<PisoId, Plano>, consulta: string): { piso: PisoId; aula: Aula } | null {
  const q = consulta.trim().toUpperCase().replace(/\s+/g, "").replace(/^SUB\.?/, "S");
  if (!q) return null;
  const normal = /^S\d+$/.test(q) ? "S" + q.slice(1).padStart(2, "0") : /^\d{1,2}$/.test(q) ? q.padStart(2, "0") : q;
  for (const p of PISOS) {
    const aula = planos[p.id]?.aulas.find((a) => a.id === normal);
    if (aula) return { piso: p.id, aula };
  }
  return null;
}
