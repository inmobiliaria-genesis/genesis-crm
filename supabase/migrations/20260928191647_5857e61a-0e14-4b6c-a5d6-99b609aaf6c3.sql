-- ===== Columnas =====
ALTER TABLE public.cliente
  ADD COLUMN estado_aprobacion text NOT NULL DEFAULT 'aprobado' CHECK (estado_aprobacion IN ('pendiente','aprobado','rechazado')),
  ADD COLUMN aprobado_por uuid, ADD COLUMN aprobado_en timestamptz, ADD COLUMN motivo_rechazo text;
ALTER TABLE public.reserva
  ADD COLUMN estado_aprobacion text NOT NULL DEFAULT 'aprobado' CHECK (estado_aprobacion IN ('pendiente','aprobado','rechazado')),
  ADD COLUMN aprobado_por uuid, ADD COLUMN aprobado_en timestamptz, ADD COLUMN motivo_rechazo text;
ALTER TABLE public.venta ADD COLUMN motivo_cambio_encargado text;

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION private.es_asesor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ select private.rol_actual() = 'asesor' $$;

CREATE OR REPLACE FUNCTION private.mi_vendedor_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ select v.id from public.vendedor v where v.usuario_id = auth.uid() and not v.anulado limit 1 $$;

CREATE OR REPLACE FUNCTION private.lote_libre_completo(_lote uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  select exists (select 1 from public.lote l join public.manzana m on m.id = l.manzana_id
    where l.id = _lote and not l.anulado and m.tipo = 'residencial' and l.area_m2 is not null and l.precio_lista is not null
      and not exists (select 1 from public.venta v where v.lote_id = l.id and not v.anulado and not v.desistida)
      and not exists (select 1 from public.reserva r where r.lote_id = l.id and not r.anulado
                      and r.estado_aprobacion = 'aprobado' and r.convertida_a_venta_id is null and r.fecha_limite >= current_date))
$$;

CREATE OR REPLACE FUNCTION private.cliente_usable(_cliente uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  select exists (select 1 from public.cliente c where c.id = _cliente and not c.anulado
    and (c.estado_aprobacion = 'aprobado' or (c.estado_aprobacion = 'pendiente' and c.creado_por = auth.uid())))
$$;

CREATE OR REPLACE FUNCTION private.venta_es_mia(_venta uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ select exists (select 1 from public.venta v join public.vendedor vd on vd.id = v.encargado_id
  where v.id = _venta and vd.usuario_id = auth.uid() and not vd.anulado) $$;

-- ===== lote_estado: se calcula con permisos propios (asesor no ve otros datos, solo el estado) =====
CREATE OR REPLACE VIEW public.lote_estado WITH (security_invoker = false) AS
 SELECT l.id AS lote_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM venta v WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) THEN 'vendido'
      WHEN EXISTS (SELECT 1 FROM reserva r WHERE r.lote_id = l.id AND NOT r.anulado AND r.estado_aprobacion = 'aprobado'
                   AND r.convertida_a_venta_id IS NULL AND r.fecha_limite >= CURRENT_DATE) THEN 'apartado'
      ELSE 'disponible'
    END AS estado,
    CASE WHEN private.es_asesor() THEN NULL ELSE
    (SELECT sum(GREATEST(ce.saldo, 0)) FROM venta v JOIN cuota c ON c.venta_id = v.id AND NOT c.anulado
       JOIN cuota_estado ce ON ce.cuota_id = c.id
      WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) END AS saldo_pendiente,
    CASE WHEN private.es_asesor() THEN false ELSE
    EXISTS (SELECT 1 FROM venta v JOIN desistimiento d ON d.venta_id = v.id
      WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida AND NOT d.anulado AND d.estado = 'en_proceso') END AS en_desistimiento
   FROM lote l
  WHERE NOT l.anulado AND private.usuario_activo();
GRANT SELECT ON public.lote_estado TO authenticated;

-- ===== Aprobación: estado inicial y bloqueo de cambios directos =====
CREATE OR REPLACE FUNCTION public.fn_aprobacion_estado() RETURNS trigger LANGUAGE plpgsql SET search_path=public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF private.es_asesor() THEN NEW.estado_aprobacion := 'pendiente';
    ELSIF coalesce(current_setting('app.aprobando', true),'') <> '1' THEN NEW.estado_aprobacion := 'aprobado';
    END IF;
    NEW.aprobado_por := NULL; NEW.aprobado_en := NULL; NEW.motivo_rechazo := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.estado_aprobacion, NEW.aprobado_por, NEW.aprobado_en, NEW.motivo_rechazo)
     IS DISTINCT FROM (OLD.estado_aprobacion, OLD.aprobado_por, OLD.aprobado_en, OLD.motivo_rechazo)
     AND coalesce(current_setting('app.aprobando', true),'') <> '1' THEN
    RAISE EXCEPTION 'El estado de aprobación solo se cambia desde Aprobaciones.';
  END IF;
  IF private.es_asesor() AND OLD.estado_aprobacion <> 'pendiente' THEN
    RAISE EXCEPTION 'Este registro ya fue revisado y no se puede editar.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_cliente_aprobacion BEFORE INSERT OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION public.fn_aprobacion_estado();
CREATE TRIGGER a_reserva_aprobacion BEFORE INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.fn_aprobacion_estado();

-- ===== Validación de apartado (con permisos propios para ver todo el lote) =====
CREATE OR REPLACE FUNCTION public.fn_valida_reserva() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NEW.vigencia_dias IS NULL THEN
    NEW.vigencia_dias := coalesce(private.config_vigente('vigencia_apartado_dias')::int, 15);
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = NEW.lote_id AND NOT v.anulado AND NOT v.desistida) THEN
      RAISE EXCEPTION 'El lote ya tiene una venta activa.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = NEW.lote_id AND NOT r.anulado AND r.estado_aprobacion = 'aprobado'
        AND r.convertida_a_venta_id IS NULL AND r.fecha_limite >= CURRENT_DATE) THEN
      RAISE EXCEPTION 'El lote ya tiene un apartado vigente.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ===== Vínculo asesor ↔ vendedor =====
CREATE OR REPLACE FUNCTION public.fn_perfil_asesor_vinculado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NEW.rol = 'asesor' AND NEW.activo AND NOT NEW.anulado
     AND (TG_OP = 'INSERT' OR OLD.rol IS DISTINCT FROM NEW.rol OR OLD.activo IS DISTINCT FROM NEW.activo)
     AND NOT EXISTS (SELECT 1 FROM public.vendedor v WHERE v.usuario_id = NEW.user_id AND v.tipo = 'encargado' AND v.estado = 'activo' AND NOT v.anulado) THEN
    RAISE EXCEPTION 'Un asesor debe estar vinculado a un vendedor encargado activo.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER perfil_asesor_vinculado BEFORE INSERT OR UPDATE ON public.perfil FOR EACH ROW EXECUTE FUNCTION public.fn_perfil_asesor_vinculado();

CREATE OR REPLACE FUNCTION public.asignar_rol_usuario(_perfil_id uuid, _rol app_rol, _vendedor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar roles.'; END IF;
  SELECT user_id INTO v_user FROM public.perfil WHERE id = _perfil_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado.'; END IF;
  IF _vendedor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = _vendedor_id AND tipo = 'encargado' AND estado = 'activo' AND NOT anulado) THEN
      RAISE EXCEPTION 'El vendedor debe ser un encargado activo.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.vendedor WHERE id = _vendedor_id AND usuario_id IS NOT NULL AND usuario_id <> v_user) THEN
      RAISE EXCEPTION 'Ese vendedor ya está vinculado a otro usuario.';
    END IF;
    UPDATE public.vendedor SET usuario_id = NULL WHERE usuario_id = v_user AND id <> _vendedor_id;
    UPDATE public.vendedor SET usuario_id = v_user WHERE id = _vendedor_id AND usuario_id IS DISTINCT FROM v_user;
  ELSIF _rol = 'asesor' THEN
    RAISE EXCEPTION 'Un asesor debe estar vinculado a un vendedor encargado activo.';
  END IF;
  UPDATE public.perfil SET rol = _rol WHERE id = _perfil_id AND rol IS DISTINCT FROM _rol;
END $$;

-- ===== Encargado de venta que nace de apartado de asesor =====
CREATE OR REPLACE FUNCTION public.fn_venta_encargado_asesor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_enc uuid;
BEGIN
  SELECT vd.id INTO v_enc
  FROM public.reserva r
  JOIN public.perfil p ON p.user_id = r.creado_por AND p.rol = 'asesor'
  JOIN public.vendedor vd ON vd.usuario_id = r.creado_por AND vd.tipo = 'encargado' AND NOT vd.anulado
  WHERE r.lote_id = NEW.lote_id AND NOT r.anulado AND r.estado_aprobacion = 'aprobado'
    AND (r.convertida_a_venta_id = NEW.id OR (r.convertida_a_venta_id IS NULL AND r.fecha_limite >= CURRENT_DATE))
  ORDER BY r.creado_en DESC LIMIT 1;
  IF v_enc IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.encargado_id IS NULL THEN NEW.encargado_id := v_enc; RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.encargado_id IS DISTINCT FROM v_enc)
     OR (TG_OP = 'UPDATE' AND NEW.encargado_id IS DISTINCT FROM OLD.encargado_id AND NEW.encargado_id IS DISTINCT FROM v_enc) THEN
    IF NOT private.es_admin() THEN
      RAISE EXCEPTION 'Esta venta viene de un apartado de asesor: solo el administrador puede cambiar el encargado.';
    END IF;
    IF nullif(trim(coalesce(NEW.motivo_cambio_encargado,'')),'') IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.motivo_cambio_encargado IS NOT DISTINCT FROM OLD.motivo_cambio_encargado) THEN
      RAISE EXCEPTION 'Indica el motivo del cambio de encargado.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_venta_encargado_asesor BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_encargado_asesor();

-- ===== Funciones de aprobación (solo admin) =====
CREATE OR REPLACE FUNCTION public.aprobar_cliente(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede aprobar.'; END IF;
  PERFORM set_config('app.aprobando','1',true);
  UPDATE public.cliente SET estado_aprobacion='aprobado', aprobado_por=auth.uid(), aprobado_en=now(), motivo_rechazo=NULL
   WHERE id=_id AND estado_aprobacion='pendiente';
  IF NOT FOUND THEN RAISE EXCEPTION 'El cliente no está pendiente.'; END IF;
  PERFORM set_config('app.aprobando','',true);
END $$;

CREATE OR REPLACE FUNCTION public.rechazar_cliente(_id uuid, _motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede rechazar.'; END IF;
  IF nullif(trim(coalesce(_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio.'; END IF;
  PERFORM set_config('app.aprobando','1',true);
  UPDATE public.cliente SET estado_aprobacion='rechazado', aprobado_por=auth.uid(), aprobado_en=now(), motivo_rechazo=trim(_motivo)
   WHERE id=_id AND estado_aprobacion='pendiente';
  IF NOT FOUND THEN RAISE EXCEPTION 'El cliente no está pendiente.'; END IF;
  -- sus apartados pendientes se rechazan también
  UPDATE public.reserva SET estado_aprobacion='rechazado', aprobado_por=auth.uid(), aprobado_en=now(), motivo_rechazo='Cliente rechazado: '||trim(_motivo)
   WHERE cliente_id=_id AND estado_aprobacion='pendiente' AND NOT anulado;
  PERFORM set_config('app.aprobando','',true);
END $$;

CREATE OR REPLACE FUNCTION public.aprobar_reserva(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE r record; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede aprobar.'; END IF;
  SELECT * INTO r FROM public.reserva WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR r.anulado OR r.estado_aprobacion <> 'pendiente' THEN RAISE EXCEPTION 'El apartado no está pendiente.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(r.lote_id::text));
  IF NOT private.lote_libre_completo(r.lote_id) THEN RAISE EXCEPTION 'El lote ya no está disponible'; END IF;
  PERFORM set_config('app.aprobando','1',true);
  UPDATE public.cliente SET estado_aprobacion='aprobado', aprobado_por=auth.uid(), aprobado_en=now()
   WHERE id=r.cliente_id AND estado_aprobacion='pendiente';
  IF EXISTS (SELECT 1 FROM public.cliente WHERE id=r.cliente_id AND estado_aprobacion='rechazado') THEN
    RAISE EXCEPTION 'El cliente de este apartado fue rechazado.';
  END IF;
  UPDATE public.reserva SET estado_aprobacion='aprobado', aprobado_por=auth.uid(), aprobado_en=now(), fecha=v_hoy
   WHERE id=_id;
  UPDATE public.reserva SET estado_aprobacion='rechazado', aprobado_por=auth.uid(), aprobado_en=now(),
         motivo_rechazo='El lote fue apartado por otra solicitud'
   WHERE lote_id=r.lote_id AND id<>_id AND estado_aprobacion='pendiente' AND NOT anulado;
  PERFORM set_config('app.aprobando','',true);
END $$;

CREATE OR REPLACE FUNCTION public.rechazar_reserva(_id uuid, _motivo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede rechazar.'; END IF;
  IF nullif(trim(coalesce(_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio.'; END IF;
  PERFORM set_config('app.aprobando','1',true);
  UPDATE public.reserva SET estado_aprobacion='rechazado', aprobado_por=auth.uid(), aprobado_en=now(), motivo_rechazo=trim(_motivo)
   WHERE id=_id AND estado_aprobacion='pendiente' AND NOT anulado;
  IF NOT FOUND THEN RAISE EXCEPTION 'El apartado no está pendiente.'; END IF;
  PERFORM set_config('app.aprobando','',true);
END $$;

-- ===== Consultas seguras para el asesor =====
CREATE OR REPLACE FUNCTION public.buscar_cliente_documento(_tipo text, _numero text)
RETURNS TABLE(cliente_id uuid, estado_aprobacion text, es_mio boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  select c.id, c.estado_aprobacion, c.creado_por = auth.uid() from public.cliente c
  where private.usuario_activo() and c.tipo_documento = _tipo and c.numero_documento = trim(_numero) and not c.anulado limit 1
$$;

CREATE OR REPLACE FUNCTION public.hay_solicitud_pendiente(_lote_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ select private.usuario_activo() and exists (select 1 from public.reserva where lote_id=_lote_id and estado_aprobacion='pendiente' and not anulado) $$;

CREATE OR REPLACE FUNCTION public.mis_ventas()
RETURNS TABLE(venta_id uuid, lote text, titular text, fecha_venta date, precio_acordado numeric, estado text, cuotas_pagadas int, cuotas_total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  select v.id, 'Mz ' || m.letra || ' · Lote ' || l.numero,
    (select c.apellidos || ' ' || c.nombres from public.venta_titular t join public.cliente c on c.id = t.cliente_id
      where t.venta_id = v.id and t.es_principal and not t.anulado limit 1),
    v.fecha_venta, v.precio_acordado,
    case when v.anulado then 'anulada' when v.desistida then 'desistida'
         when exists (select 1 from public.desistimiento d where d.venta_id=v.id and not d.anulado and d.estado='en_proceso') then 'en_desistimiento'
         when not exists (select 1 from public.cuota_estado ce join public.cuota cu on cu.id=ce.cuota_id where cu.venta_id=v.id and ce.saldo > 0.005) then 'cancelada'
         else 'pagando' end,
    (select count(*)::int from public.cuota cu join public.cuota_estado ce on ce.cuota_id = cu.id where cu.venta_id = v.id and cu.numero > 0 and ce.saldo <= 0.005),
    (select count(*)::int from public.cuota cu where cu.venta_id = v.id and cu.numero > 0 and not cu.anulado)
  from public.venta v join public.lote l on l.id = v.lote_id join public.manzana m on m.id = l.manzana_id
  join public.vendedor vd on vd.id = v.encargado_id
  where vd.usuario_id = auth.uid() and not vd.anulado and private.es_asesor()
  order by v.fecha_venta desc
$$;

REVOKE EXECUTE ON FUNCTION public.aprobar_cliente(uuid), public.rechazar_cliente(uuid,text), public.aprobar_reserva(uuid),
  public.rechazar_reserva(uuid,text), public.asignar_rol_usuario(uuid,app_rol,uuid), public.buscar_cliente_documento(text,text),
  public.hay_solicitud_pendiente(uuid), public.mis_ventas() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.aprobar_cliente(uuid), public.rechazar_cliente(uuid,text), public.aprobar_reserva(uuid),
  public.rechazar_reserva(uuid,text), public.asignar_rol_usuario(uuid,app_rol,uuid), public.buscar_cliente_documento(text,text),
  public.hay_solicitud_pendiente(uuid), public.mis_ventas() TO authenticated;
GRANT EXECUTE ON FUNCTION private.es_asesor(), private.mi_vendedor_id(), private.lote_libre_completo(uuid),
  private.cliente_usable(uuid), private.venta_es_mia(uuid) TO authenticated;

-- ===== Políticas RLS =====
-- cliente
DROP POLICY cliente_select ON public.cliente;
DROP POLICY cliente_insert ON public.cliente;
DROP POLICY cliente_update ON public.cliente;
CREATE POLICY cliente_select ON public.cliente FOR SELECT TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR creado_por = auth.uid()));
CREATE POLICY cliente_insert ON public.cliente FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY cliente_update ON public.cliente FOR UPDATE TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR (creado_por = auth.uid() AND estado_aprobacion = 'pendiente')))
  WITH CHECK (private.usuario_activo() AND (NOT private.es_asesor() OR creado_por = auth.uid()));

-- reserva
DROP POLICY reserva_select ON public.reserva;
DROP POLICY reserva_insert ON public.reserva;
DROP POLICY reserva_update ON public.reserva;
CREATE POLICY reserva_select ON public.reserva FOR SELECT TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR creado_por = auth.uid()));
CREATE POLICY reserva_insert ON public.reserva FOR INSERT TO authenticated
  WITH CHECK (private.es_gestion() OR (private.es_asesor() AND private.lote_libre_completo(lote_id) AND private.cliente_usable(cliente_id)));
CREATE POLICY reserva_update ON public.reserva FOR UPDATE TO authenticated
  USING (private.es_gestion() OR (private.es_asesor() AND creado_por = auth.uid() AND estado_aprobacion = 'pendiente'))
  WITH CHECK (private.es_gestion() OR (private.es_asesor() AND creado_por = auth.uid() AND private.cliente_usable(cliente_id)));

-- venta y titulares: el asesor solo lee sus ventas; ya no crea ni edita
DROP POLICY venta_select ON public.venta;
DROP POLICY venta_insert ON public.venta;
DROP POLICY venta_update ON public.venta;
CREATE POLICY venta_select ON public.venta FOR SELECT TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR private.venta_es_mia(id)));
CREATE POLICY venta_insert ON public.venta FOR INSERT TO authenticated WITH CHECK (private.es_gestion());
CREATE POLICY venta_update ON public.venta FOR UPDATE TO authenticated USING (private.es_gestion()) WITH CHECK (private.es_gestion());
DROP POLICY venta_titular_select ON public.venta_titular;
DROP POLICY venta_titular_insert ON public.venta_titular;
DROP POLICY venta_titular_update ON public.venta_titular;
CREATE POLICY venta_titular_select ON public.venta_titular FOR SELECT TO authenticated USING (private.usuario_activo() AND NOT private.es_asesor());
CREATE POLICY venta_titular_insert ON public.venta_titular FOR INSERT TO authenticated WITH CHECK (private.es_gestion());
CREATE POLICY venta_titular_update ON public.venta_titular FOR UPDATE TO authenticated USING (private.es_gestion()) WITH CHECK (private.es_gestion());

-- cuotas y pagos: el asesor no los lee (ve el resumen en mis_ventas)
DROP POLICY cuota_select ON public.cuota;
CREATE POLICY cuota_select ON public.cuota FOR SELECT TO authenticated USING (private.usuario_activo() AND NOT private.es_asesor());
DROP POLICY pago_select ON public.pago;
CREATE POLICY pago_select ON public.pago FOR SELECT TO authenticated USING (private.usuario_activo() AND NOT private.es_asesor());
DROP POLICY pago_aplicacion_select ON public.pago_aplicacion;
CREATE POLICY pago_aplicacion_select ON public.pago_aplicacion FOR SELECT TO authenticated USING (private.usuario_activo() AND NOT private.es_asesor());

-- lote: el asesor solo ve lotes libres con datos completos
DROP POLICY lote_select ON public.lote;
CREATE POLICY lote_select ON public.lote FOR SELECT TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR private.lote_libre_completo(id)));

-- vendedor: el asesor solo ve su propio registro
DROP POLICY vendedor_select ON public.vendedor;
CREATE POLICY vendedor_select ON public.vendedor FOR SELECT TO authenticated
  USING (private.usuario_activo() AND (NOT private.es_asesor() OR usuario_id = auth.uid()));

-- desistimientos: el asesor ya no los ve
CREATE OR REPLACE FUNCTION private.puede_ver_desistimiento(_venta_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT private.tiene_rol(array['admin','gerente_ventas','socio','cobranza']::app_rol[]) $$;
