-- Mapa de la sede Campus: asignaciones de aula que publica bedelía en la cartelera.
-- Vive en el mismo proyecto que utn-mcp-web (mismas cuentas); todo lo del mapa lleva el prefijo mapa_.

-- Quién puede cargar carteleras. Lo administra el admin a mano (dashboard o SQL).
create table public.mapa_contribuidores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nota text,
  creado timestamptz not null default now()
);

alter table public.mapa_contribuidores enable row level security;

-- Cada uno puede ver solo su propia fila, para saber si es contribuidor. Nadie escribe por la API.
create policy "mapa_contribuidores: ver la propia"
  on public.mapa_contribuidores for select to authenticated
  using (user_id = (select auth.uid()));

-- Una fila de la cartelera para una fecha: materia + comisión en un turno, con su aula.
create table public.mapa_asignaciones (
  id bigint generated always as identity primary key,
  fecha date not null,
  turno text not null check (turno in ('M', 'T', 'N')),
  materia text not null check (char_length(materia) between 2 and 120),
  comision text not null check (comision ~ '^[A-Z0-9]{2,10}$'),
  modulo_desde smallint check (modulo_desde between 0 and 9),
  modulo_hasta smallint check (modulo_hasta between 0 and 9 and modulo_hasta >= modulo_desde),
  -- Número de aula como lo usa el mapa: 05, 105, 234, S13. Null = sin asignar todavía.
  aula text check (aula ~ '^(S[0-9]{2}|[0-9]{2,3})$'),
  virtual boolean not null default false,
  cargado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  constraint mapa_asignaciones_virtual_sin_aula check (not (virtual and aula is not null)),
  -- Volver a cargar la misma cartelera actualiza la fila en vez de duplicarla.
  constraint mapa_asignaciones_unica unique (fecha, turno, materia, comision)
);

create index mapa_asignaciones_comision on public.mapa_asignaciones (comision, fecha desc);
create index mapa_asignaciones_fecha on public.mapa_asignaciones (fecha, turno);
create index mapa_asignaciones_cargado_por on public.mapa_asignaciones (cargado_por);

alter table public.mapa_asignaciones enable row level security;

-- Las asignaciones son públicas: las publica la facultad en una cartelera.
create policy "mapa_asignaciones: lectura pública"
  on public.mapa_asignaciones for select to anon, authenticated
  using (true);

create policy "mapa_asignaciones: contribuidores insertan"
  on public.mapa_asignaciones for insert to authenticated
  with check (
    cargado_por = (select auth.uid())
    and exists (select 1 from public.mapa_contribuidores c where c.user_id = (select auth.uid()))
  );

-- Recargar una cartelera pisa la fila y queda a nombre de quien la cargó último.
create policy "mapa_asignaciones: contribuidores editan"
  on public.mapa_asignaciones for update to authenticated
  using (exists (select 1 from public.mapa_contribuidores c where c.user_id = (select auth.uid())))
  with check (
    cargado_por = (select auth.uid())
    and exists (select 1 from public.mapa_contribuidores c where c.user_id = (select auth.uid()))
  );

create policy "mapa_asignaciones: contribuidores borran"
  on public.mapa_asignaciones for delete to authenticated
  using (exists (select 1 from public.mapa_contribuidores c where c.user_id = (select auth.uid())));

create function public.mapa_tocar_actualizado() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end $$;

create trigger mapa_asignaciones_actualizado
  before update on public.mapa_asignaciones
  for each row execute function public.mapa_tocar_actualizado();
