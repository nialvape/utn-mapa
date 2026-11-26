"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, URL_CUENTA } from "@/lib/supabase";
import {
  cargarCatalogo,
  diaDeSemana,
  etiquetaAula,
  hoy,
  leerAula,
  leerModulos,
  TURNOS,
  type Asignacion,
  type Comision,
  type Turno,
} from "@/lib/asignaciones";

interface Fila {
  /** id de la base si la fila ya estaba cargada. */
  id?: number;
  materia: string;
  comision: string;
  modulos: string;
  aula: string;
}

const filaVacia = (): Fila => ({ materia: "", comision: "", modulos: "", aula: "" });

type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin-sesion" }
  | { tipo: "sin-permiso"; user: User }
  | { tipo: "listo"; user: User };

function aFila(a: Asignacion): Fila {
  return {
    id: a.id,
    materia: a.materia,
    comision: a.comision,
    modulos: a.modulo_desde === null ? "" : `${a.modulo_desde}:${a.modulo_hasta ?? a.modulo_desde}`,
    aula: a.virtual ? "V" : a.aula ? etiquetaAula(a.aula) : "",
  };
}

/** Valida una fila y la pasa al formato de la tabla. Devuelve el error si no se puede. */
function validar(f: Fila): { ok: true; datos: Omit<Asignacion, "id" | "fecha" | "turno" | "actualizado"> } | { ok: false; error: string } {
  const materia = f.materia.trim().replace(/\s+/g, " ");
  const comision = f.comision.trim().toUpperCase().replace(/\s+/g, "");
  if (materia.length < 2) return { ok: false, error: "falta la materia" };
  if (!/^[A-Z0-9]{2,10}$/.test(comision)) return { ok: false, error: `comisión "${f.comision}" no válida` };
  let desde: number | null = null;
  let hasta: number | null = null;
  if (f.modulos.trim()) {
    const m = leerModulos(f.modulos);
    if (!m) return { ok: false, error: `módulos "${f.modulos}": escribilos como 1:5` };
    [desde, hasta] = m;
  }
  const aula = leerAula(f.aula);
  if (!aula) return { ok: false, error: `aula "${f.aula}" no válida (ej. 234, Sub.13, V o vacío)` };
  return { ok: true, datos: { materia, comision, modulo_desde: desde, modulo_hasta: hasta, ...aula } };
}

export function CargarCartelera() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [fecha, setFecha] = useState(hoy);
  const [turno, setTurno] = useState<Turno>("N");
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [borradas, setBorradas] = useState<number[]>([]);
  const [catalogo, setCatalogo] = useState<Comision[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      if (!user) return setEstado({ tipo: "sin-sesion" });
      const { data } = await supabase().from("mapa_contribuidores").select("user_id, es_admin").eq("user_id", user.id).maybeSingle();
      setEsAdmin(!!data?.es_admin);
      setEstado(data ? { tipo: "listo", user } : { tipo: "sin-permiso", user });
    })().catch(() => setEstado({ tipo: "sin-sesion" }));
    cargarCatalogo().then(setCatalogo, () => {});
  }, []);

  // Al cambiar fecha o turno trae lo que ya esté cargado, para corregirlo en vez de duplicarlo.
  useEffect(() => {
    if (estado.tipo !== "listo") return;
    let vigente = true;
    supabase()
      .from("mapa_asignaciones")
      .select("*")
      .eq("fecha", fecha)
      .eq("turno", turno)
      .order("materia")
      .then(({ data }) => {
        if (!vigente) return;
        const existentes = ((data ?? []) as Asignacion[]).map(aFila);
        setFilas(existentes.length ? existentes : [filaVacia()]);
        setBorradas([]);
        setMensaje(null);
      });
    return () => {
      vigente = false;
    };
  }, [estado.tipo, fecha, turno]);

  const materias = useMemo(() => [...new Set(catalogo.map((c) => c.materia))], [catalogo]);

  function cambiar(i: number, campo: keyof Fila, valor: string) {
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  function quitar(i: number) {
    const f = filas[i];
    if (f.id) setBorradas((b) => [...b, f.id!]);
    setFilas((fs) => (fs.length === 1 ? [filaVacia()] : fs.filter((_, j) => j !== i)));
  }

  async function guardar() {
    if (estado.tipo !== "listo") return;
    setMensaje(null);
    const usadas = filas.filter((f) => f.materia.trim() || f.comision.trim() || f.aula.trim());
    const datos = [];
    for (const [i, f] of usadas.entries()) {
      const v = validar(f);
      if (!v.ok) return setMensaje({ tipo: "error", texto: `Fila ${i + 1}: ${v.error}.` });
      datos.push({ ...v.datos, fecha, turno, cargado_por: estado.user.id });
    }
    const claves = new Set<string>();
    for (const d of datos) {
      const k = `${d.materia}|${d.comision}`;
      if (claves.has(k)) return setMensaje({ tipo: "error", texto: `${d.materia} ${d.comision} está dos veces.` });
      claves.add(k);
    }

    setGuardando(true);
    try {
      const db = supabase().from("mapa_asignaciones");
      if (borradas.length) {
        const { error } = await db.delete().in("id", borradas);
        if (error) throw error;
      }
      if (datos.length) {
        const { error } = await supabase()
          .from("mapa_asignaciones")
          .upsert(datos, { onConflict: "fecha,turno,materia,comision" });
        if (error) throw error;
      }
      const { data } = await supabase().from("mapa_asignaciones").select("*").eq("fecha", fecha).eq("turno", turno).order("materia");
      const existentes = ((data ?? []) as Asignacion[]).map(aFila);
      setFilas(existentes.length ? existentes : [filaVacia()]);
      setBorradas([]);
      setMensaje({ tipo: "ok", texto: `Guardado: ${datos.length} filas del ${diaDeSemana(fecha)} ${TURNOS[turno].toLowerCase()}.` });
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo guardar: ${(e as Error).message}` });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="bg-mm h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <header>
          <div className="flex gap-4 font-mono text-xs text-muted">
            <Link href="/" className="hover:text-ink">
              ← Mapa
            </Link>
            {esAdmin && (
              <Link href="/admin" className="hover:text-ink">
                Contribuidores
              </Link>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Cargar cartelera</h1>
          <p className="mt-1 text-sm text-muted">
            Pasá la hoja de bedelía de un día y turno. Si ya estaba cargada, aparece abajo para corregirla.
          </p>
        </header>

        {estado.tipo === "cargando" && <p className="font-mono text-sm text-muted">Revisando tu sesión…</p>}

        {estado.tipo === "sin-sesion" && (
          <div className="reg bg-panel border border-line-strong p-4 text-sm">
            Para cargar carteleras entrá con tu cuenta UTN en{" "}
            <a href={URL_CUENTA} className="text-accent underline underline-offset-4">
              utnmcp.com.ar/cuenta
            </a>{" "}
            y volvé a esta página.
          </div>
        )}

        {estado.tipo === "sin-permiso" && (
          <div className="reg bg-panel border border-line-strong p-4 text-sm">
            Estás como <span className="font-mono">{estado.user.email}</span>, pero todavía no sos contribuidor. Pedíselo al admin
            del mapa.
          </div>
        )}

        {estado.tipo === "listo" && (
          <>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Fecha
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => e.target.value && setFecha(e.target.value)}
                  className="reg bg-panel border border-line-strong px-3 py-2 font-mono text-base text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Turno
                <select
                  value={turno}
                  onChange={(e) => setTurno(e.target.value as Turno)}
                  className="reg bg-panel border border-line-strong px-3 py-2 text-base text-ink"
                >
                  {(Object.keys(TURNOS) as Turno[]).map((t) => (
                    <option key={t} value={t}>
                      {TURNOS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="self-end pb-2 font-mono text-xs text-muted capitalize">{diaDeSemana(fecha)}</p>
            </div>

            <datalist id="materias">
              {materias.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            <ol className="flex flex-col gap-3">
              {filas.map((f, i) => (
                <li key={f.id ?? `n${i}`} className="reg bg-panel grid grid-cols-6 gap-2 border border-line-strong p-3 sm:grid-cols-12">
                  <input
                    value={f.materia}
                    onChange={(e) => cambiar(i, "materia", e.target.value)}
                    list="materias"
                    placeholder="Materia"
                    aria-label={`Materia, fila ${i + 1}`}
                    className="col-span-6 border-b border-line-strong bg-transparent py-1 text-base outline-none placeholder:text-muted sm:col-span-5"
                  />
                  <input
                    value={f.comision}
                    onChange={(e) => cambiar(i, "comision", e.target.value.toUpperCase())}
                    placeholder="K1052"
                    aria-label={`Comisión, fila ${i + 1}`}
                    autoCapitalize="characters"
                    className="col-span-2 border-b border-line-strong bg-transparent py-1 font-mono text-base outline-none placeholder:text-muted sm:col-span-2"
                  />
                  <input
                    value={f.modulos}
                    onChange={(e) => cambiar(i, "modulos", e.target.value)}
                    placeholder="1:5"
                    aria-label={`Módulos, fila ${i + 1}`}
                    inputMode="numeric"
                    className="col-span-1 border-b border-line-strong bg-transparent py-1 font-mono text-base outline-none placeholder:text-muted sm:col-span-2"
                  />
                  <input
                    value={f.aula}
                    onChange={(e) => cambiar(i, "aula", e.target.value)}
                    placeholder="Aula"
                    aria-label={`Aula, fila ${i + 1}`}
                    className="col-span-2 border-b border-line-strong bg-transparent py-1 font-mono text-base outline-none placeholder:text-muted sm:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    aria-label={`Quitar fila ${i + 1}`}
                    className="col-span-1 font-mono text-muted hover:text-ink"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>

            <p className="text-xs text-muted">
              Aula: el número tal cual (234, 59), <span className="font-mono">Sub.13</span> para el subsuelo,{" "}
              <span className="font-mono">V</span> si es virtual, o vacío si todavía no tiene. Módulos: como en la cartelera,{" "}
              <span className="font-mono">1:5</span>.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setFilas((fs) => [...fs, filaVacia()])}
                className="reg border border-line-strong px-4 py-2 font-mono text-sm hover:bg-line"
              >
                + Fila
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="bg-accent px-4 py-2 font-mono text-sm text-paper disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              {mensaje && (
                <p role="status" className={`text-sm ${mensaje.tipo === "ok" ? "text-accent" : "text-ink"}`}>
                  {mensaje.texto}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
