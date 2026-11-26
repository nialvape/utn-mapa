-- Admins del mapa: pueden ver, agregar y quitar contribuidores desde /mapa/admin.
-- Los mails viven en auth.users, que la API no expone; por eso todo pasa por funciones
-- security definer que primero verifican que quien llama sea admin.

alter table public.mapa_contribuidores add column es_admin boolean not null default false;

-- Nadie puede cambiar su propia fila (no hay policy de update): un contribuidor no se hace admin solo.

create function public.mapa_es_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select c.es_admin from public.mapa_contribuidores c where c.user_id = (select auth.uid())), false)
$$;

create function public.mapa_listar_contribuidores()
  returns table (user_id uuid, email text, nota text, es_admin boolean, creado timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.mapa_es_admin() then
    raise exception 'Solo para admins del mapa' using errcode = '42501';
  end if;
  return query
    select c.user_id, u.email::text, c.nota, c.es_admin, c.creado
    from public.mapa_contribuidores c
    join auth.users u on u.id = c.user_id
    order by c.es_admin desc, c.creado;
end $$;

create function public.mapa_agregar_contribuidor(p_email text, p_nota text default null) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.mapa_es_admin() then
    raise exception 'Solo para admins del mapa' using errcode = '42501';
  end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No hay ninguna cuenta con ese mail: tiene que entrar primero a utnmcp.com.ar/cuenta' using errcode = 'P0002';
  end if;
  insert into public.mapa_contribuidores (user_id, nota)
  values (v_id, nullif(trim(p_nota), ''))
  on conflict (user_id) do update set nota = coalesce(excluded.nota, public.mapa_contribuidores.nota);
  return v_id;
end $$;

create function public.mapa_quitar_contribuidor(p_user_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.mapa_es_admin() then
    raise exception 'Solo para admins del mapa' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'No podés quitarte a vos mismo' using errcode = '42501';
  end if;
  -- A otro admin solo se lo saca por SQL: evita quedarse sin admins por un click.
  delete from public.mapa_contribuidores c where c.user_id = p_user_id and not c.es_admin;
end $$;

-- Solo usuarios logueados pueden llamarlas (y adentro se exige ser admin).
revoke execute on function public.mapa_es_admin() from public, anon;
revoke execute on function public.mapa_listar_contribuidores() from public, anon;
revoke execute on function public.mapa_agregar_contribuidor(text, text) from public, anon;
revoke execute on function public.mapa_quitar_contribuidor(uuid) from public, anon;
grant execute on function public.mapa_es_admin() to authenticated;
grant execute on function public.mapa_listar_contribuidores() to authenticated;
grant execute on function public.mapa_agregar_contribuidor(text, text) to authenticated;
grant execute on function public.mapa_quitar_contribuidor(uuid) to authenticated;
