"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PISOS, SEPARACION_PISOS, type PisoId } from "@/lib/pisos";
import { buscarAula, cargarPlanos, type Aula, type Plano } from "@/lib/planos";
import { Escena, type Foco } from "./Escena";

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

export function Mapa() {
  const [planos, setPlanos] = useState<Record<PisoId, Plano> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pisoActivo, setPisoActivo] = useState<PisoId | null>(null);
  const [seleccion, setSeleccion] = useState<{ piso: PisoId; aula: Aula } | null>(null);
  const [consulta, setConsulta] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const angosto = useAngosto();

  useEffect(() => {
    cargarPlanos().then(setPlanos, (e: Error) => setError(e.message));
  }, []);

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

  function buscar(e: FormEvent) {
    e.preventDefault();
    if (!planos) return;
    const r = buscarAula(planos, consulta);
    if (!r) {
      setAviso(consulta.trim() ? `No encontré el aula "${consulta.trim()}"` : null);
      return;
    }
    setAviso(null);
    setPisoActivo(r.piso);
    setSeleccion(r);
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
            setPisoActivo(piso);
            setSeleccion({ piso, aula });
          }}
          onFondo={() => setSeleccion(null)}
        />
      ) : (
        <div className="grid h-full place-items-center font-mono text-sm text-muted">
          {error ?? "Cargando planos…"}
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted uppercase">UTN FRBA · Sede Campus</p>
          <h1 className="text-lg font-semibold">Mapa</h1>
        </div>
        <form onSubmit={buscar} className="reg bg-panel pointer-events-auto flex max-w-sm border border-line-strong backdrop-blur">
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            inputMode="text"
            enterKeyHint="search"
            placeholder="Buscar aula: 105, 34, Sub 13…"
            aria-label="Buscar aula"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted"
          />
          <button type="submit" className="px-4 font-mono text-sm text-accent hover:bg-line">
            Ir
          </button>
        </form>
        {aviso && <p className="font-mono text-xs text-muted">{aviso}</p>}
      </header>

      {seleccion && pisoSel && (
        <section
          aria-live="polite"
          className="reg bg-panel absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-20 max-w-sm border border-line-strong p-4 backdrop-blur"
        >
          <p className="font-mono text-[11px] tracking-widest text-muted uppercase">
            {pisoSel.nombre} · {NOMBRE_EDIFICIO[seleccion.aula.edificio]}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            Aula {seleccion.aula.id.startsWith("S") ? `Sub. ${seleccion.aula.id.slice(1)}` : seleccion.aula.id}
          </p>
          {(seleccion.aula.aVerificar || pisoSel.aVerificar) && (
            <p className="mt-2 text-xs text-muted">
              * Número o ubicación a verificar: {pisoSel.aVerificar ? "este piso todavía no tiene plano." : "el plano no lo dice."}
            </p>
          )}
        </section>
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
                setPisoActivo(activo ? null : p.id);
              }}
              className={`h-11 w-12 font-mono text-sm transition-colors ${
                activo ? "bg-accent text-paper" : "text-ink hover:bg-line"
              }`}
            >
              {p.id}
              {p.aVerificar && <span className={activo ? "text-paper/70" : "text-muted"}>*</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
