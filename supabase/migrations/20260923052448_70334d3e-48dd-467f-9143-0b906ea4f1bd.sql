
create or replace function private.mi_perfil_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id from public.perfil p
  where p.user_id = auth.uid() and p.activo and not p.anulado
  limit 1
$$;

create or replace function private.puede_comercial()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.tiene_rol(array['admin','gerente_ventas','asesor']::app_rol[])
$$;

create or replace function private.vendedor_permitido(_vendedor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when private.tiene_rol(array['admin','gerente_ventas']::app_rol[]) then true
    when private.rol_actual() = 'asesor' then _vendedor_id = private.mi_perfil_id()
    else false
  end
$$;

drop policy if exists reserva_insert on public.reserva;
drop policy if exists reserva_update on public.reserva;
create policy reserva_insert on public.reserva for insert to authenticated
  with check (private.puede_comercial());
create policy reserva_update on public.reserva for update to authenticated
  using (private.puede_comercial()) with check (private.puede_comercial());

drop policy if exists venta_insert on public.venta;
drop policy if exists venta_update on public.venta;
create policy venta_insert on public.venta for insert to authenticated
  with check (private.puede_comercial() and private.vendedor_permitido(vendedor_id));
create policy venta_update on public.venta for update to authenticated
  using (private.puede_comercial())
  with check (private.puede_comercial() and private.vendedor_permitido(vendedor_id));

drop policy if exists venta_titular_insert on public.venta_titular;
drop policy if exists venta_titular_update on public.venta_titular;
create policy venta_titular_insert on public.venta_titular for insert to authenticated
  with check (private.puede_comercial());
create policy venta_titular_update on public.venta_titular for update to authenticated
  using (private.puede_comercial()) with check (private.puede_comercial());
