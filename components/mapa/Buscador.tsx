"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { PISOS, type PisoId } from "@/lib/pisos";
import { buscarAula, type Aula, type Plano } from "@/lib/planos";
import { etiquetaAula, type Comision } from "@/lib/asignaciones";

export type Sugerencia =
  | { tipo: "aula"; piso: PisoId; aula: Aula }
  | { tipo: "comision"; comision: Comision; mia: boolean };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function sugerencias(q: string, planos: Record<PisoId, Plano>, catalogo: Comision[], mias: Comision[]): Sugerencia[] {
  const esMia = (c: Comision) => mias.some((m) => m.materia === c.materia && m.comision === c.comision);
  const t = sinTildes(q.trim());
  if (!t) return mias.map((c) => ({ tipo: "comision", comision: c, mia: true }));

  const out: Sugerencia[] = [];
  const aula = buscarAula(planos, q);
  if (aula) out.push({ tipo: "aula", ...aula });

  const palabras = t.split(/\s+/);
  const coinciden = catalogo.filter((c) => {
    const texto = sinTildes(`${c.materia} ${c.comision}`);
    return palabras.every((p) => texto.includes(p));
  });
  // Primero las mías y las que coinciden por código de comisión.
  coinciden.sort((a, b) => Number(esMia(b)) - Number(esMia(a)) || Number(sinTildes(b.comision).startsWith(t)) - Number(sinTildes(a.comision).startsWith(t)));
  for (const c of coinciden.slice(0, 8)) out.push({ tipo: "comision", comision: c, mia: esMia(c) });
  return out;
}

export function Buscador({
  planos,
  catalogo,
  mias,
  onElegir,
}: {
  planos: Record<PisoId, Plano>;
  catalogo: Comision[];
  mias: Comision[];
  onElegir: (s: Sugerencia) => void;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const lista = useMemo(() => sugerencias(q, planos, catalogo, mias), [q, planos, catalogo, mias]);
  const idLista = useId();

  function elegir(s: Sugerencia) {
    setAbierto(false);
    setQ(s.tipo === "aula" ? s.aula.id : `${s.comision.materia} · ${s.comision.comision}`);
    (document.activeElement as HTMLElement | null)?.blur();
    onElegir(s);
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActiva((i) => Math.min(i + 1, lista.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (lista[activa]) elegir(lista[activa]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const mostrar = abierto && lista.length > 0;

  return (
    <div className="pointer-events-auto relative max-w-sm">
      <div className="reg bg-panel flex border border-line-strong backdrop-blur">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActiva(0);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={tecla}
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-label="Buscar materia, comisión o aula"
          enterKeyHint="search"
          placeholder="Materia, comisión o aula…"
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted"
        />
        {q && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setQ("");
              setActiva(0);
            }}
            className="px-3 font-mono text-sm text-muted hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
      {mostrar && (
        <ul id={idLista} role="listbox" className="bg-panel mt-1 max-h-[50vh] overflow-y-auto border border-line-strong backdrop-blur">
          {!q.trim() && <li className="px-3 pt-2 font-mono text-[11px] tracking-widest text-muted uppercase">Mis comisiones</li>}
          {lista.map((s, i) => (
            <li
              key={s.tipo === "aula" ? `a-${s.aula.id}` : `c-${s.comision.materia}-${s.comision.comision}`}
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(s)}
              onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-baseline gap-3 px-3 py-2 ${i === activa ? "bg-line" : ""}`}
            >
              {s.tipo === "aula" ? (
                <>
                  <span className="font-mono text-sm text-accent">Aula {etiquetaAula(s.aula.id)}</span>
                  <span className="text-xs text-muted">{PISOS.find((p) => p.id === s.piso)!.nombre}</span>
                </>
              ) : (
                <>
                  <span className="font-mono text-sm text-accent">{s.comision.comision}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{s.comision.materia}</span>
                  {s.mia && <span className="text-xs text-muted" aria-label="Guardada">★</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
