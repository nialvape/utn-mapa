"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase, URL_CUENTA } from "@/lib/supabase";

interface Contribuidor {
  user_id: string;
  email: string;
  nota: string | null;
  es_admin: boolean;
  creado: string;
}

type Estado = { tipo: "cargando" } | { tipo: "sin-sesion" } | { tipo: "sin-permiso"; email: string } | { tipo: "listo"; yo: string };

export function AdminContribuidores() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [lista, setLista] = useState<Contribuidor[]>([]);
  const [email, setEmail] = useState("");
  const [nota, setNota] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    const { data, error } = await supabase().rpc("mapa_listar_contribuidores");
    if (error) throw error;
    setLista((data ?? []) as Contribuidor[]);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      if (!user) return setEstado({ tipo: "sin-sesion" });
      const { data: esAdmin } = await supabase().rpc("mapa_es_admin");
      if (!esAdmin) return setEstado({ tipo: "sin-permiso", email: user.email ?? "" });
      await recargar();
      setEstado({ tipo: "listo", yo: user.id });
    })().catch(() => setEstado({ tipo: "sin-sesion" }));
  }, [recargar]);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setOcupado(true);
    setMensaje(null);
    const { error } = await supabase().rpc("mapa_agregar_contribuidor", { p_email: email.trim(), p_nota: nota.trim() || null });
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
    } else {
      setMensaje({ tipo: "ok", texto: `${email.trim().toLowerCase()} ya puede cargar carteleras.` });
      setEmail("");
      setNota("");
      await recargar().catch(() => {});
    }
    setOcupado(false);
  }

  async function quitar(c: Contribuidor) {
    if (!confirm(`¿Quitar a ${c.email}? Deja de poder cargar carteleras; lo que ya cargó queda.`)) return;
    setOcupado(true);
    setMensaje(null);
    const { error } = await supabase().rpc("mapa_quitar_contribuidor", { p_user_id: c.user_id });
    if (error) setMensaje({ tipo: "error", texto: error.message });
    else setMensaje({ tipo: "ok", texto: `${c.email} ya no es contribuidor.` });
    await recargar().catch(() => {});
    setOcupado(false);
  }

  return (
    <main className="bg-mm h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        <header>
          <div className="flex gap-4 font-mono text-xs text-muted">
            <Link href="/" className="hover:text-ink">
              ← Mapa
            </Link>
            <Link href="/cargar" className="hover:text-ink">
              Cargar cartelera
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Contribuidores</h1>
          <p className="mt-1 text-sm text-muted">Quiénes pueden cargar y corregir carteleras. Lo que cargan se publica directo.</p>
        </header>

        {estado.tipo === "cargando" && <p className="font-mono text-sm text-muted">Revisando tu sesión…</p>}

        {estado.tipo === "sin-sesion" && (
          <div className="reg bg-panel border border-line-strong p-4 text-sm">
            Entrá con tu cuenta UTN en{" "}
            <a href={URL_CUENTA} className="text-accent underline underline-offset-4">
              utnmcp.com.ar/cuenta
            </a>{" "}
            y volvé a esta página.
          </div>
        )}

        {estado.tipo === "sin-permiso" && (
          <div className="reg bg-panel border border-line-strong p-4 text-sm">
            Estás como <span className="font-mono">{estado.email}</span>. Esta página es solo para admins del mapa.
          </div>
        )}

        {estado.tipo === "listo" && (
          <>
            <form onSubmit={agregar} className="reg bg-panel flex flex-col gap-3 border border-line-strong p-4">
              <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Agregar</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alguien@frba.utn.edu.ar"
                aria-label="Mail de la cuenta UTN"
                required
                className="border-b border-line-strong bg-transparent py-1 font-mono text-base outline-none placeholder:text-muted"
              />
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota (opcional): delegado de K1052…"
                aria-label="Nota"
                className="border-b border-line-strong bg-transparent py-1 text-base outline-none placeholder:text-muted"
              />
              <p className="text-xs text-muted">Tiene que haber entrado al menos una vez a utnmcp.com.ar/cuenta con ese mail.</p>
              <button
                type="submit"
                disabled={ocupado}
                className="self-start bg-accent px-4 py-2 font-mono text-sm text-paper disabled:opacity-60"
              >
                Agregar
              </button>
            </form>

            {mensaje && (
              <p role="status" className={`text-sm ${mensaje.tipo === "ok" ? "text-accent" : "text-ink"}`}>
                {mensaje.texto}
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {lista.map((c) => (
                <li key={c.user_id} className="reg bg-panel flex items-center gap-3 border border-line-strong px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{c.email}</p>
                    <p className="truncate text-xs text-muted">
                      {c.es_admin ? "Admin" : "Contribuidor"}
                      {c.nota ? ` · ${c.nota}` : ""}
                    </p>
                  </div>
                  {!c.es_admin && (
                    <button
                      type="button"
                      onClick={() => quitar(c)}
                      disabled={ocupado}
                      className="font-mono text-xs text-muted hover:text-ink disabled:opacity-60"
                    >
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
