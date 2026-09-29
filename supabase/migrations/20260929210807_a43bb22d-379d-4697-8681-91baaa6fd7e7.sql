CREATE OR REPLACE FUNCTION private.incentivos_calificados(_enc uuid, _mes date)
 RETURNS TABLE(venta_id uuid, monto numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT v.id, v.fecha_venta, row_number() OVER (ORDER BY v.fecha_venta, v.creado_en, v.id) AS rn
    FROM public.venta v
    WHERE v.encargado_id = _enc AND NOT v.anulado AND NOT v.desistida AND NOT v.es_historica AND NOT v.importada
      AND v.fecha_venta >= date_trunc('month', _mes)::date
      AND v.fecha_venta < (date_trunc('month', _mes) + interval '1 month')::date
      AND EXISTS (SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                  WHERE cu.venta_id = v.id AND cu.numero = 0 AND NOT cu.anulado AND ce.saldo <= 0.005))
  SELECT e.id, private.config_vigente('monto_incentivo', e.fecha_venta) FROM e
  WHERE e.rn >= coalesce(private.config_vigente('lote_minimo_incentivo', e.fecha_venta), 6)
$function$;

CREATE OR REPLACE FUNCTION private.retencion_cumplida(_venta uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id JOIN public.venta v ON v.id = cu.venta_id
    WHERE cu.venta_id = _venta AND NOT cu.anulado AND ce.saldo > 0.005
      AND cu.numero BETWEEN 1 AND coalesce(private.config_vigente('cuotas_retencion_incentivo', v.fecha_venta), 3)::int)
$function$;

CREATE OR REPLACE FUNCTION private.recalc_por_venta(_venta uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT encargado_id, fecha_venta INTO v FROM public.venta WHERE id = _venta;
  IF FOUND AND v.encargado_id IS NOT NULL AND v.fecha_venta IS NOT NULL THEN
    PERFORM private.recalc_incentivos(v.encargado_id, v.fecha_venta);
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.recalcular_mes(_mes date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ini date := date_trunc('month', _mes)::date; e uuid; n int := 0;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede recalcular.'; END IF;
  FOR e IN
    SELECT encargado_id FROM public.venta WHERE encargado_id IS NOT NULL
      AND fecha_venta >= v_ini AND fecha_venta < (v_ini + interval '1 month')::date
    UNION
    SELECT encargado_id FROM public.comision WHERE tipo = 'incentivo' AND mes = v_ini
  LOOP
    PERFORM private.recalc_incentivos(e, v_ini); n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_venta_comisiones()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_monto numeric; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.anulado AND NOT OLD.anulado THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = NEW.motivo_anulacion
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado IN ('pendiente','pendiente_cobro_vendedor');
      UPDATE public.comision SET estado = 'perdida', motivo_estado = NEW.motivo_anulacion
       WHERE venta_id = NEW.id AND tipo = 'incentivo' AND estado IN ('retenido','por_pagar');
      UPDATE public.comision SET alerta_venta_anulada = true
       WHERE venta_id = NEW.id AND estado IN ('pagada','cobrada_vendedor') AND NOT alerta_venta_anulada;
    END IF;
    IF NEW.desistida AND NOT OLD.desistida THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = 'desistimiento'
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado IN ('pendiente','pendiente_cobro_vendedor');
      UPDATE public.comision SET estado = 'perdida', motivo_estado = 'desistimiento'
       WHERE venta_id = NEW.id AND tipo = 'incentivo' AND estado = 'retenido';
    END IF;
    IF NEW.es_historica AND NOT OLD.es_historica THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = NEW.motivo_cambio_historica
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado NOT IN ('anulada','pagada','cobrada_vendedor');
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NOT NEW.importada AND NOT NEW.anulado AND NOT NEW.es_historica AND NEW.encargado_id IS NOT NULL THEN
    v_monto := private.config_vigente('monto_comision', coalesce(NEW.fecha_firma, NEW.fecha_venta));
    IF v_monto IS NULL THEN RAISE EXCEPTION 'Falta configurar monto_comision vigente.'; END IF;
    INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, modalidad, fecha_generada)
    VALUES (NEW.id, NEW.encargado_id, 'comision', v_monto, 'pendiente_cobro_vendedor', 'cobro_directo', v_hoy);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.encargado_id IS NOT NULL AND OLD.fecha_venta IS NOT NULL
     AND (OLD.encargado_id IS DISTINCT FROM NEW.encargado_id
          OR date_trunc('month', OLD.fecha_venta) <> date_trunc('month', NEW.fecha_venta)) THEN
    PERFORM private.recalc_incentivos(OLD.encargado_id, OLD.fecha_venta);
  END IF;
  IF NEW.encargado_id IS NOT NULL AND NEW.fecha_venta IS NOT NULL THEN
    PERFORM private.recalc_incentivos(NEW.encargado_id, NEW.fecha_venta);
  END IF;
  RETURN NULL;
END $function$;

DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.eliminar_venta(uuid,text)'::regprocedure) INTO src;
  src := replace(src, 'IF v.fecha_firma IS NOT NULL THEN PERFORM public.recalcular_mes(v.fecha_firma); END IF;',
                      'IF v.fecha_venta IS NOT NULL THEN PERFORM public.recalcular_mes(v.fecha_venta); END IF;');
  EXECUTE src;
END $$;