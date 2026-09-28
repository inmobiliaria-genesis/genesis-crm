
-- Parte 7: validaciones admin y DNI
CREATE OR REPLACE FUNCTION public.simular_desistimiento(_venta_id uuid, _fecha date, _monto_descontar numeric DEFAULT NULL::numeric)
 RETURNS TABLE(total_abonado numeric, monto_descontar numeric, porcentaje_devolucion numeric, base_calculo numeric, monto_devolver numeric, monto_retiene_empresa numeric)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $f$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede calcular la devolución.'; END IF;
  RETURN QUERY SELECT * FROM private.calc_devolucion(_venta_id, coalesce(_fecha, (now() AT TIME ZONE 'America/Lima')::date), _monto_descontar);
END $f$;

CREATE OR REPLACE FUNCTION public.revertir_desistimiento(_id uuid, _motivo text)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $f$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede revertir un desistimiento.'; END IF;
  PERFORM private.revertir_desistimiento_impl(_id, _motivo);
END $f$;

ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_documento_unico;
CREATE UNIQUE INDEX cliente_documento_unico ON public.cliente (tipo_documento, numero_documento) WHERE NOT anulado;

-- Parte 1: origen del lead en cliente y venta
ALTER TABLE public.cliente ADD COLUMN origen_lead text, ADD COLUMN referido_por_id uuid REFERENCES public.cliente(id);
ALTER TABLE public.cliente ADD CONSTRAINT cliente_origen_lead_chk CHECK (origen_lead IS NULL OR origen_lead IN ('facebook','instagram','tiktok','google','referido','oficina','otro'));
ALTER TABLE public.venta ADD COLUMN origen_lead text, ADD COLUMN referido_por_id uuid REFERENCES public.cliente(id);
ALTER TABLE public.venta ADD CONSTRAINT venta_origen_lead_chk CHECK (origen_lead IS NULL OR origen_lead IN ('facebook','instagram','tiktok','google','referido','oficina','otro'));

CREATE OR REPLACE FUNCTION private.referido_valido(_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select exists (select 1 from public.cliente c where c.id = _id and not c.anulado and c.estado_aprobacion = 'aprobado') $f$;

CREATE OR REPLACE FUNCTION public.fn_origen_lead_valida() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'public'
AS $f$
BEGIN
  IF coalesce(NEW.origen_lead,'') <> 'referido' THEN NEW.referido_por_id := NULL; END IF;
  IF NEW.referido_por_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.referido_por_id IS DISTINCT FROM OLD.referido_por_id)
     AND NOT private.referido_valido(NEW.referido_por_id) THEN
    RAISE EXCEPTION 'No se encontró un cliente aprobado con este DNI';
  END IF;
  IF TG_TABLE_NAME = 'cliente' AND NEW.referido_por_id = NEW.id THEN
    RAISE EXCEPTION 'Un cliente no puede referirse a sí mismo.'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER b_cliente_origen_lead BEFORE INSERT OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION public.fn_origen_lead_valida();

CREATE OR REPLACE FUNCTION public.buscar_referido(_dni text)
 RETURNS TABLE(cliente_id uuid, nombre text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  select c.id, trim(c.nombres || ' ' || c.apellidos) from public.cliente c
  where private.usuario_activo() and c.numero_documento = trim(_dni) and not c.anulado and c.estado_aprobacion = 'aprobado'
  limit 1
$f$;
REVOKE EXECUTE ON FUNCTION public.buscar_referido(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.buscar_referido(text) TO authenticated;

-- Parte 2: tabla lead
CREATE TABLE public.lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  telefono text NOT NULL,
  origen_lead text CHECK (origen_lead IS NULL OR origen_lead IN ('facebook','instagram','tiktok','google','referido','oficina','otro')),
  referido_por_id uuid REFERENCES public.cliente(id),
  vendedor_id uuid NOT NULL REFERENCES public.vendedor(id),
  promotor_id uuid REFERENCES public.vendedor(id),
  fecha_contacto date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  etapa text NOT NULL DEFAULT 'nuevo' CHECK (etapa IN ('nuevo','visita_agendada','visito','separo','no_interesado')),
  proxima_fecha date,
  proxima_accion text,
  notas text,
  motivo_no_interesado text,
  cliente_id uuid REFERENCES public.cliente(id),
  reserva_id uuid REFERENCES public.reserva(id),
  venta_id uuid REFERENCES public.venta(id),
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.lead TO authenticated;
GRANT ALL ON public.lead TO service_role;
ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;
CREATE INDEX lead_telefono_idx ON public.lead (telefono);
CREATE INDEX lead_vendedor_idx ON public.lead (vendedor_id);

CREATE TABLE public.lead_etapa_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.lead(id),
  etapa_anterior text,
  etapa_nueva text NOT NULL,
  usuario_id uuid,
  fecha_hora timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_etapa_historial TO authenticated;
GRANT ALL ON public.lead_etapa_historial TO service_role;
ALTER TABLE public.lead_etapa_historial ENABLE ROW LEVEL SECURITY;
CREATE INDEX lead_hist_lead_idx ON public.lead_etapa_historial (lead_id);

CREATE OR REPLACE FUNCTION private.puede_ver_lead(_creado_por uuid, _vendedor uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  select private.usuario_activo() and (private.es_gestion() or _creado_por = auth.uid()
    or (_vendedor is not null and _vendedor = private.mi_vendedor_id()))
$f$;

CREATE POLICY lead_select ON public.lead FOR SELECT TO authenticated USING (private.puede_ver_lead(creado_por, vendedor_id));
CREATE POLICY lead_insert ON public.lead FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY lead_update ON public.lead FOR UPDATE TO authenticated
  USING (private.puede_ver_lead(creado_por, vendedor_id)) WITH CHECK (private.puede_ver_lead(creado_por, vendedor_id));
CREATE POLICY lead_hist_select ON public.lead_etapa_historial FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead l WHERE l.id = lead_id AND private.puede_ver_lead(l.creado_por, l.vendedor_id)));

CREATE OR REPLACE FUNCTION public.fn_valida_lead() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_sync boolean := coalesce(current_setting('app.lead_sync', true),'') = '1';
BEGIN
  NEW.nombre := btrim(coalesce(NEW.nombre,'')); NEW.telefono := btrim(coalesce(NEW.telefono,''));
  IF NEW.nombre = '' THEN RAISE EXCEPTION 'El nombre es obligatorio.'; END IF;
  IF NEW.telefono = '' THEN RAISE EXCEPTION 'El teléfono es obligatorio.'; END IF;
  NEW.proxima_accion := nullif(btrim(coalesce(NEW.proxima_accion,'')),'');
  IF NEW.etapa <> 'no_interesado' THEN NEW.motivo_no_interesado := NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_sync THEN NEW.cliente_id := NULL; NEW.reserva_id := NULL; NEW.venta_id := NULL; END IF;
    IF private.es_asesor() THEN
      NEW.vendedor_id := private.mi_vendedor_id();
      IF NEW.vendedor_id IS NULL THEN RAISE EXCEPTION 'Tu cuenta no está vinculada a un vendedor.'; END IF;
    END IF;
  ELSE
    IF NOT v_sync THEN NEW.cliente_id := OLD.cliente_id; NEW.reserva_id := OLD.reserva_id; NEW.venta_id := OLD.venta_id; END IF;
    IF private.es_asesor() THEN NEW.vendedor_id := OLD.vendedor_id; END IF;
    IF NEW.anulado IS DISTINCT FROM OLD.anulado AND NOT private.es_admin() THEN
      RAISE EXCEPTION 'Solo un administrador puede eliminar leads.'; END IF;
    IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Un lead eliminado no puede reactivarse.'; END IF;
  END IF;

  IF NEW.vendedor_id IS NULL THEN RAISE EXCEPTION 'Elige el vendedor asignado.'; END IF;
  IF TG_OP = 'INSERT' OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor v WHERE v.id = NEW.vendedor_id AND v.tipo = 'encargado' AND v.estado = 'activo' AND NOT v.anulado) THEN
      RAISE EXCEPTION 'El vendedor asignado debe ser un encargado activo.'; END IF;
  END IF;
  IF NEW.promotor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor v WHERE v.id = NEW.promotor_id AND v.tipo = 'promotor' AND NOT v.anulado) THEN
      RAISE EXCEPTION 'El promotor no es válido.'; END IF;
  END IF;
  RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_lead_historial() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    INSERT INTO public.lead_etapa_historial (lead_id, etapa_anterior, etapa_nueva, usuario_id)
    VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.etapa END, NEW.etapa, auth.uid());
  END IF;
  RETURN NULL;
END $f$;

CREATE TRIGGER a_lead_valida BEFORE INSERT OR UPDATE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_valida_lead();
CREATE TRIGGER b_lead_origen BEFORE INSERT OR UPDATE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_origen_lead_valida();
CREATE TRIGGER lead_auditoria BEFORE INSERT OR UPDATE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER lead_bitacora AFTER INSERT OR UPDATE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER lead_historial AFTER INSERT OR UPDATE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_lead_historial();
CREATE TRIGGER lead_no_borrar BEFORE DELETE ON public.lead FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

-- Aviso de teléfono duplicado (sin exponer datos del lead ajeno salvo su nombre)
CREATE OR REPLACE FUNCTION public.lead_por_telefono(_telefono text, _excluir uuid DEFAULT NULL)
 RETURNS TABLE(nombre text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  select l.nombre from public.lead l
  where private.usuario_activo() and not l.anulado
    and (_excluir is null or l.id <> _excluir)
    and length(regexp_replace(_telefono, '\D', '', 'g')) >= 6
    and right(regexp_replace(l.telefono, '\D', '', 'g'), 9) = right(regexp_replace(_telefono, '\D', '', 'g'), 9)
  limit 1
$f$;
REVOKE EXECUTE ON FUNCTION public.lead_por_telefono(text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_por_telefono(text, uuid) TO authenticated;

-- Parte 5: conversión
ALTER TABLE public.reserva ADD COLUMN lead_id uuid REFERENCES public.lead(id);

CREATE OR REPLACE FUNCTION public.fn_reserva_lead_valida() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE l record;
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.lead_id := OLD.lead_id; RETURN NEW; END IF;
  IF NEW.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead WHERE id = NEW.lead_id AND NOT anulado;
    IF NOT FOUND OR NOT private.puede_ver_lead(l.creado_por, l.vendedor_id) THEN RAISE EXCEPTION 'Lead no encontrado.'; END IF;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER b_reserva_lead BEFORE INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.fn_reserva_lead_valida();

CREATE OR REPLACE FUNCTION public.fn_reserva_lead_sync() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.lead_sync','1',true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.lead SET reserva_id = NEW.id, cliente_id = NEW.cliente_id, etapa = 'separo' WHERE id = NEW.lead_id;
  ELSIF NEW.estado_aprobacion = 'rechazado' AND OLD.estado_aprobacion <> 'rechazado' THEN
    UPDATE public.lead SET etapa = 'visito' WHERE id = NEW.lead_id AND reserva_id = NEW.id AND venta_id IS NULL;
  END IF;
  PERFORM set_config('app.lead_sync','',true);
  RETURN NULL;
END $f$;
CREATE TRIGGER reserva_lead_sync AFTER INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.fn_reserva_lead_sync();

CREATE OR REPLACE FUNCTION public.fn_venta_lead_hereda() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE l record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reserva_origen_id IS NOT NULL THEN
    SELECT le.* INTO l FROM public.reserva r JOIN public.lead le ON le.id = r.lead_id WHERE r.id = NEW.reserva_origen_id AND NOT le.anulado;
    IF FOUND THEN
      NEW.origen_lead := l.origen_lead;
      NEW.referido_por_id := l.referido_por_id;
      IF l.promotor_id IS NOT NULL AND NEW.promotor_id IS NULL AND NEW.origen = 'promotor' THEN NEW.promotor_id := l.promotor_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER b_venta_lead BEFORE INSERT ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_lead_hereda();
CREATE TRIGGER c_venta_origen_lead BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_origen_lead_valida();

CREATE OR REPLACE FUNCTION public.fn_venta_lead_sync() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF NEW.reserva_origen_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.lead_sync','1',true);
  UPDATE public.lead le SET venta_id = NEW.id, cliente_id = r.cliente_id, etapa = 'separo'
    FROM public.reserva r WHERE r.id = NEW.reserva_origen_id AND le.id = r.lead_id AND le.venta_id IS NULL;
  PERFORM set_config('app.lead_sync','',true);
  RETURN NULL;
END $f$;
CREATE TRIGGER venta_lead_sync AFTER INSERT ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_lead_sync();

REVOKE EXECUTE ON FUNCTION public.fn_valida_lead(), public.fn_lead_historial(), public.fn_reserva_lead_valida(), public.fn_reserva_lead_sync(), public.fn_venta_lead_hereda(), public.fn_venta_lead_sync() FROM anon, authenticated, public;
