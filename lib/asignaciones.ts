import { supabase } from "./supabase";

export type Turno = "M" | "T" | "N";
export const TURNOS: Record<Turno, string> = { M: "Mañana", T: "Tarde", N: "Noche" };

/** Una fila de public.mapa_asignaciones. */
export interface Asignacion {
  id: number;
  fecha: string; // YYYY-MM-DD
  turno: Turno;
  materia: string;
  comision: string;
  modulo_desde: number | null;
  modulo_hasta: number | null;
  /** 05, 105, S13. Null = sin asignar (o virtual). */
  aula: string | null;
  virtual: boolean;
  actualizado: string;
}

export interface Comision {
  materia: string;
  comision: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** La fecha de hoy en Buenos Aires, YYYY-MM-DD. */
export function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

export function diaDeSemana(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${diaDeSemana(fecha)} ${d}/${m}`;
}

export function etiquetaAula(aula: string): string {
  return aula.startsWith("S") ? `Sub. ${aula.slice(1)}` : aula;
}

export function etiquetaModulos(a: Pick<Asignacion, "turno" | "modulo_desde" | "modulo_hasta">): string {
  const turno = TURNOS[a.turno].toLowerCase();
  if (a.modulo_desde === null) return `Turno ${turno}`;
  return `Módulos ${a.modulo_desde}–${a.modulo_hasta ?? a.modulo_desde} · ${turno}`;
}

/**
 * Normaliza la columna "Aula" de la cartelera: "234" → 234, "Sub.13" / "Sub. 09" → S13 / S09,
 * "V" → virtual, vacío → sin asignar. Devuelve null si no se entiende.
 */
export function leerAula(texto: string): { aula: string | null; virtual: boolean } | null {
  const t = texto.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return { aula: null, virtual: false };
  if (t === "V" || t === "VIRTUAL") return { aula: null, virtual: true };
  const sub = t.match(/^(?:SUB\.?|S)(\d{1,2})$/);
  if (sub) return { aula: "S" + sub[1].padStart(2, "0"), virtual: false };
  if (/^\d{1,3}$/.test(t)) return { aula: t.padStart(2, "0"), virtual: false };
  return null;
}

/** "1:5", "1-5", "0:3 (N)" → [1, 5]. */
export function leerModulos(texto: string): [number, number] | null {
  const m = texto.match(/(\d)\s*[:\-–]\s*(\d)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b >= a ? [a, b] : null;
}

/** Todas las materias y comisiones que aparecieron en alguna cartelera de los últimos meses. */
export async function cargarCatalogo(): Promise<Comision[]> {
  const desde = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase()
    .from("mapa_asignaciones")
    .select("materia, comision")
    .gte("fecha", desde)
    .limit(10000);
  if (error) throw error;
  const vistos = new Map<string, Comision>();
  for (const r of data ?? []) vistos.set(`${r.materia}|${r.comision}`, r);
  return [...vistos.values()].sort((a, b) => a.materia.localeCompare(b.materia, "es") || a.comision.localeCompare(b.comision));
}

export interface Consulta {
  /** Cargadas para hoy: lo que dice la cartelera de hoy. */
  deHoy: Asignacion[];
  /** Si hoy no hay nada: la última de este mismo día de la semana. Es una pista, no está confirmada. */
  anterior: Asignacion | null;
  /** La más reciente de cualquier día, para saber qué días cursa. */
  ultima: Asignacion | null;
}

export async function consultar(c: Comision): Promise<Consulta> {
  const { data, error } = await supabase()
    .from("mapa_asignaciones")
    .select("*")
    .eq("comision", c.comision)
    .eq("materia", c.materia)
    .order("fecha", { ascending: false })
    .limit(60);
  if (error) throw error;
  const filas = (data ?? []) as Asignacion[];
  const h = hoy();
  const dia = diaDeSemana(h);
  const deHoy = filas.filter((f) => f.fecha === h);
  const anterior = deHoy.length ? null : filas.find((f) => f.fecha < h && diaDeSemana(f.fecha) === dia) ?? null;
  return { deHoy, anterior, ultima: filas[0] ?? null };
}

/** "Mis comisiones": solo en este dispositivo. */
const CLAVE = "utn-mapa:mis-comisiones";

export function misComisiones(): Comision[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.materia === "string" && typeof x.comision === "string") : [];
  } catch {
    return [];
  }
}

export function guardarMisComisiones(lista: Comision[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {}
}
