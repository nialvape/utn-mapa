"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PISOS, SEPARACION_PISOS, type PisoId } from "@/lib/pisos";
import { cargarPlanos, type Aula, type Plano } from "@/lib/planos";
import {
  cargarCatalogo,
  consultar,
  etiquetaAula,
  guardarMisComisiones,
  misComisiones,
  type Comision,
  type Consulta,
} from "@/lib/asignaciones";
import { Escena, type Foco } from "./Escena";
import { Buscador, type Sugerencia } from "./Buscador";
import { PanelComision } from "./PanelComision";

const NOMBRE_EDIFICIO = { violeta: "Edificio central", rosa: "Edificio este", noreste: "Edificio noreste" } as const;

function centroDe(aulas: Aula[]): [number, number] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const a of aulas) {
    for (const [x, z] of a.poligono) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}

function useAngosto() {
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const actualizar = () => setAngosto(mq.matches);
    actualizar();
    mq.addEventListener("change", actualizar);
    return () => mq.removeEventListener("change", actualizar);
  }, []);
  return angosto;
}

function ubicarAula(planos: Record<PisoId, Plano>, id: string): { piso: PisoId; aula: Aula } | null {
  for (const p of PISOS) {
    const aula = planos[p.id].aulas.find((a) => a.id === id);
    if (aula) return { piso: p.id, aula };
  }
  return null;
}

const mismaComision = (a: Comision, b: Comision) => a.materia === b.materia && a.comision === b.comision;

export function Mapa() {
  const [planos, setPlanos] = useState<Record<PisoId, Plano> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<Comision[]>([]);
  const [mias, setMias] = useState<Comision[]>([]);
  const [pisoActivo, setPisoActivo] = useState<PisoId | null>(null);
  const [seleccion, setSeleccion] = useState<{ piso: PisoId; aula: Aula } | null>(null);
  const [comision, setComision] = useState<Comision | null>(null);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const angosto = useAngosto();

  useEffect(() => {
    cargarPlanos().then(setPlanos, (e: Error) => setError(e.message));
    cargarCatalogo().then(setCatalogo, () => setCatalogo([]));
    setMias(misComisiones());
  }, []);

  // Al elegir una comisión: consulta la cartelera y lleva el mapa al aula.
  useEffect(() => {
    if (!comision || !planos) return;
    let vigente = true;
    setConsulta(null);
    setErrorConsulta(null);
    consultar(comision).then(
      (c) => {
        if (!vigente) return;
        setConsulta(c);
        const aula = c.deHoy.find((a) => a.aula)?.aula ?? c.anterior?.aula;
        const ubicada = aula ? ubicarAula(planos, aula) : null;
        if (ubicada) {
          setPisoActivo(ubicada.piso);
          setSeleccion(ubicada);
        } else {
          setSeleccion(null);
        }
      },
      (e: Error) => vigente && setErrorConsulta(e.message),
    );
    return () => {
      vigente = false;
    };
  }, [comision, planos]);

  const foco = useMemo<Foco>(() => {
    const zoom = angosto ? 1.6 : 1;
    if (!planos) return { x: 0, y: 0, z: 0, distancia: 300 };
    if (seleccion) {
      const nivel = PISOS.find((p) => p.id === seleccion.piso)!.nivel;
      const [x, z] = seleccion.aula.centro;
      return { x, y: nivel * SEPARACION_PISOS, z, distancia: 45 * zoom };
    }
    if (pisoActivo) {
      const nivel = PISOS.find((p) => p.id === pisoActivo)!.nivel;
      const [x, z] = centroDe(planos[pisoActivo].aulas);
      return { x, y: nivel * SEPARACION_PISOS, z, distancia: 150 * zoom };
    }
    const [x, z] = centroDe(PISOS.flatMap((p) => planos[p.id].aulas));
    return { x, y: SEPARACION_PISOS * 0.5, z, distancia: 260 * zoom };
  }, [planos, pisoActivo, seleccion, angosto]);

  function elegir(s: Sugerencia) {
    if (s.tipo === "aula") {
      setComision(null);
      setPisoActivo(s.piso);
      setSeleccion({ piso: s.piso, aula: s.aula });
    } else {
      setComision(s.comision);
    }
  }

  function alternarMia(c: Comision) {
    const nueva = mias.some((m) => mismaComision(m, c)) ? mias.filter((m) => !mismaComision(m, c)) : [...mias, c];
    setMias(nueva);
    guardarMisComisiones(nueva);
  }

  const pisoSel = seleccion ? PISOS.find((p) => p.id === seleccion.piso)! : null;

  return (
    <div className="bg-mm relative h-full w-full">
      {planos ? (
        <Escena
          planos={planos}
          pisoActivo={pisoActivo}
          seleccion={seleccion?.aula.id ?? null}
          foco={foco}
          onElegirAula={(piso, id) => {
            const aula = planos[piso].aulas.find((a) => a.id === id)!;
            setComision(null);
            setPisoActivo(piso);
            setSeleccion({ piso, aula });
          }}
          onFondo={() => {
            setSeleccion(null);
            setComision(null);
          }}
        />
      ) : (
        <div className="grid h-full place-items-center font-mono text-sm text-muted">{error ?? "Cargando planos…"}</div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-muted uppercase">UTN FRBA · Sede Campus</p>
            <h1 className="text-lg font-semibold">Mapa</h1>
          </div>
          <Link href="/cargar" className="pointer-events-auto font-mono text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
            Cargar cartelera
          </Link>
        </div>
        {planos && <Buscador planos={planos} catalogo={catalogo} mias={mias} onElegir={elegir} />}
      </header>

      {comision ? (
        <PanelComision
          comision={comision}
          consulta={consulta}
          error={errorConsulta}
          mia={mias.some((m) => mismaComision(m, comision))}
          aulaEnMapa={!!seleccion}
          onGuardar={() => alternarMia(comision)}
          onCerrar={() => {
            setComision(null);
            setSeleccion(null);
          }}
        />
      ) : (
        seleccion &&
        pisoSel && (
          <section
            aria-live="polite"
            className="reg bg-panel absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-20 max-w-sm border border-line-strong p-4 backdrop-blur"
          >
            <p className="font-mono text-[11px] tracking-widest text-muted uppercase">
              {pisoSel.nombre} · {NOMBRE_EDIFICIO[seleccion.aula.edificio]}
            </p>
            <p className="mt-1 text-2xl font-semibold">Aula {etiquetaAula(seleccion.aula.id)}</p>
            {(seleccion.aula.aVerificar || pisoSel.aVerificar) && (
              <p className="mt-2 text-xs text-muted">
                ⚠ Número o ubicación a verificar: {pisoSel.aVerificar ? "este piso todavía no tiene plano." : "el plano no lo dice."}
              </p>
            )}
          </section>
        )
      )}

      <nav
        aria-label="Pisos"
        className="reg bg-panel absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col border border-line-strong backdrop-blur"
      >
        {[...PISOS].reverse().map((p) => {
          const activo = p.id === pisoActivo;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={activo}
              title={p.aVerificar ? `${p.nombre} (a verificar)` : p.nombre}
              onClick={() => {
                setSeleccion(null);
                setComision(null);
                setPisoActivo(activo ? null : p.id);
              }}
              className={`h-11 w-12 font-mono text-sm transition-colors ${activo ? "bg-accent text-paper" : "text-ink hover:bg-line"}`}
            >
              {p.id}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
