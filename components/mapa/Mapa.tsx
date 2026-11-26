"use client";

import { useState } from "react";
import { PISOS, type PisoId } from "@/lib/pisos";
import { Escena } from "./Escena";

export function Mapa() {
  const [pisoActivo, setPisoActivo] = useState<PisoId | null>(null);

  return (
    <div className="bg-mm relative h-full w-full">
      <Escena pisoActivo={pisoActivo} />

      <header className="pointer-events-none absolute inset-x-0 top-0 p-4">
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">UTN FRBA · Sede Campus</p>
        <h1 className="text-lg font-semibold">Mapa</h1>
      </header>

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
              onClick={() => setPisoActivo(activo ? null : p.id)}
              className={`h-11 w-12 font-mono text-sm transition-colors ${
                activo ? "bg-accent text-paper" : "text-ink hover:bg-line"
              }`}
            >
              {p.id}
              {p.aVerificar && <span className="text-muted">*</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
