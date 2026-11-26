"use client";

import { etiquetaAula, etiquetaModulos, fechaLarga, type Asignacion, type Comision, type Consulta } from "@/lib/asignaciones";
import { Aviso } from "./Aviso";

function Linea({ a, confirmada, aviso }: { a: Asignacion; confirmada: boolean; aviso: boolean }) {
  const lugar = a.virtual ? "Virtual" : a.aula ? `Aula ${etiquetaAula(a.aula)}` : "Sin aula asignada todavía";
  return (
    <div className="mt-2">
      <p className="flex items-baseline gap-2 text-2xl font-semibold">
        <span className={confirmada ? "" : "text-muted"}>{lugar}</span>
        {aviso && <Aviso />}
      </p>
      <p className="font-mono text-xs text-muted">{etiquetaModulos(a)}</p>
    </div>
  );
}

export function PanelComision({
  comision,
  consulta,
  error,
  mia,
  aulaEnMapa,
  onGuardar,
  onCerrar,
}: {
  comision: Comision;
  consulta: Consulta | null;
  error: string | null;
  mia: boolean;
  /** false si la cartelera dice un aula que el mapa todavía no tiene ubicada. */
  aulaEnMapa: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  return (
    <section
      aria-live="polite"
      className="reg bg-panel absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-20 max-w-sm border border-line-strong p-4 backdrop-blur"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-widest text-muted uppercase">{comision.comision}</p>
          <p className="truncate text-sm">{comision.materia}</p>
        </div>
        <button
          type="button"
          onClick={onGuardar}
          aria-pressed={mia}
          title={mia ? "Quitar de mis comisiones" : "Guardar en mis comisiones"}
          className={`font-mono text-lg leading-none ${mia ? "text-accent" : "text-muted hover:text-ink"}`}
        >
          {mia ? "★" : "☆"}
        </button>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="font-mono text-lg leading-none text-muted hover:text-ink">
          ×
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-muted">No se pudo consultar: {error}</p>}
      {!error && !consulta && <p className="mt-2 font-mono text-xs text-muted">Consultando…</p>}

      {consulta && consulta.deHoy.length > 0 && (
        <>
          <p className="mt-3 font-mono text-[11px] tracking-widest text-accent uppercase">Hoy · cartelera</p>
          {consulta.deHoy.map((a) => (
            <Linea key={a.id} a={a} confirmada aviso={!aulaEnMapa && !!a.aula} />
          ))}
        </>
      )}

      {consulta && consulta.deHoy.length === 0 && consulta.anterior && (
        <>
          <p className="mt-3 font-mono text-[11px] tracking-widest text-muted uppercase">
            Hoy todavía no se cargó · el {fechaLarga(consulta.anterior.fecha)} fue en
          </p>
          <Linea a={consulta.anterior} confirmada={false} aviso />
          <p className="mt-1 text-xs text-muted">No confirmado: puede cambiar hoy.</p>
        </>
      )}

      {consulta && consulta.deHoy.length === 0 && !consulta.anterior && (
        <p className="mt-3 text-sm text-muted">
          {consulta.ultima
            ? `Hoy no hay cartelera cargada para esta comisión. La última fue el ${fechaLarga(consulta.ultima.fecha)}.`
            : "Todavía no hay carteleras cargadas para esta comisión."}
        </p>
      )}

      {consulta && !aulaEnMapa && (consulta.deHoy[0]?.aula || consulta.anterior?.aula) && (
        <p className="mt-2 text-xs text-muted">Esa aula todavía no está ubicada en el mapa.</p>
      )}
    </section>
  );
}
