CREATE OR REPLACE FUNCTION private.es_gestion() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select private.tiene_rol(array['admin','gerente_ventas','socio']::app_rol[]) $$;
REVOKE EXECUTE ON FUNCTION private.es_gestion() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.es_gestion() TO authenticated;

CREATE OR REPLACE FUNCTION private.puede_comercial() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select private.es_gestion() or private.tiene_rol(array['asesor']::app_rol[]) $$;
CREATE OR REPLACE FUNCTION private.puede_cobrar() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select private.es_gestion() or private.tiene_rol(array['cobranza']::app_rol[]) $$;
CREATE OR REPLACE FUNCTION private.encargado_permitido(_encargado_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN private.es_gestion() THEN true
    WHEN private.tiene_rol(array['asesor']::app_rol[]) THEN EXISTS (
      SELECT 1 FROM public.vendedor v WHERE v.id = _encargado_id AND v.usuario_id = auth.uid() AND NOT v.anulado)
    ELSE false END $$;

CREATE OR REPLACE FUNCTION public.fn_anular_solo_gerencia() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.anulado AND NOT OLD.anulado AND NOT private.es_gestion() THEN
    RAISE EXCEPTION 'Solo administración, gerencia de ventas o socio puede anular este registro.';
  END IF;
  RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.fn_anular_solo_cobranza() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.anulado AND NOT OLD.anulado AND NOT private.puede_cobrar() THEN
    RAISE EXCEPTION 'Solo administración, gerencia de ventas, socio o cobranza puede anular un pago.';
  END IF;
  RETURN NEW; END $$;

-- Políticas de edición gerencia -> gestión
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY array['cuota','etapa','lote','manzana'] LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (private.es_gestion())', t||'_insert', t);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.es_gestion()) WITH CHECK (private.es_gestion())', t||'_update', t);
  END LOOP; END $$;

-- Lectura total para socio
ALTER POLICY comision_select ON public.comision USING (
  private.tiene_rol(array['admin','gerente_ventas','socio']::app_rol[])
  OR (private.tiene_rol(array['asesor']::app_rol[]) AND EXISTS (
    SELECT 1 FROM public.vendedor v WHERE v.id = comision.encargado_id AND v.usuario_id = auth.uid() AND NOT v.anulado)));
ALTER POLICY config_select ON public.config USING (private.tiene_rol(array['admin','socio']::app_rol[]));

-- Configuración: unidad y activo
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS unidad text;
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.config ADD CONSTRAINT config_unidad_chk CHECK (unidad IS NULL OR unidad IN ('soles','porcentaje','lotes','cuotas','si_no'));
UPDATE public.config SET unidad = CASE clave
  WHEN 'monto_comision' THEN 'soles' WHEN 'monto_incentivo' THEN 'soles' WHEN 'inicial_minima' THEN 'soles'
  WHEN 'comision_base' THEN 'soles' WHEN 'incentivo_por_lote' THEN 'soles'
  WHEN 'lote_minimo_incentivo' THEN 'lotes' WHEN 'umbral_incentivo' THEN 'lotes'
  WHEN 'cuotas_retencion_incentivo' THEN 'cuotas' WHEN 'max_cuotas' THEN 'cuotas'
  WHEN 'porcentaje_devolucion' THEN 'porcentaje' ELSE unidad END;
UPDATE public.config SET activo = false WHERE clave IN ('comision_base','umbral_incentivo','incentivo_por_lote');