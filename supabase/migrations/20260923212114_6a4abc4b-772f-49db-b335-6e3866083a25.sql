ALTER TABLE public.venta ADD COLUMN es_historica boolean NOT NULL DEFAULT true,
  ADD COLUMN motivo_cambio_historica text;

CREATE TABLE public.comision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid REFERENCES public.venta(id),
  encargado_id uuid NOT NULL REFERENCES public.vendedor(id),
  tipo text NOT NULL CHECK (tipo IN ('comision','incentivo','manual')),
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','retenido','por_pagar','pagada','perdida','anulada')),
  mes date,
  fecha_generada date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  fecha_pago date,
  forma_pago text,
  observacion text,
  motivo_estado text,
  alerta_venta_anulada boolean NOT NULL DEFAULT false,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo = 'manual' OR venta_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE ON public.comision TO authenticated;
GRANT ALL ON public.comision TO service_role;
ALTER TABLE public.comision ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX comision_una_vigente_por_venta ON public.comision(venta_id) WHERE tipo = 'comision' AND estado <> 'anulada';
CREATE UNIQUE INDEX incentivo_uno_vigente_por_venta ON public.comision(venta_id) WHERE tipo = 'incentivo' AND estado <> 'anulada';
CREATE INDEX comision_encargado_idx ON public.comision(encargado_id, mes);

CREATE POLICY comision_select ON public.comision FOR SELECT TO authenticated USING (
  private.tiene_rol(array['admin','gerente_ventas']::app_rol[])
  OR (private.tiene_rol(array['asesor']::app_rol[]) AND EXISTS (
      SELECT 1 FROM public.vendedor v WHERE v.id = comision.encargado_id AND v.usuario_id = auth.uid() AND NOT v.anulado))
);
CREATE POLICY comision_insert ON public.comision FOR INSERT TO authenticated WITH CHECK (private.es_admin() AND tipo = 'manual');
CREATE POLICY comision_update ON public.comision FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE OR REPLACE FUNCTION public.fn_comision_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'manual' THEN NEW.estado := 'pendiente'; NEW.mes := NULL; END IF;
    RETURN NEW;
  END IF;
  NEW.venta_id := OLD.venta_id; NEW.tipo := OLD.tipo; NEW.encargado_id := OLD.encargado_id; NEW.mes := OLD.mes;
  IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Una comisión anulada no puede reactivarse.'; END IF;
  IF NEW.anulado AND NOT OLD.anulado THEN NEW.estado := 'anulada'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado = 'anulada' THEN RAISE EXCEPTION 'Una comisión anulada no puede cambiar de estado.'; END IF;
    IF OLD.estado = 'pagada' AND NEW.estado <> 'anulada' THEN RAISE EXCEPTION 'Una comisión pagada no puede cambiar de estado.'; END IF;
    IF OLD.estado = 'perdida' AND NEW.estado <> 'anulada' THEN RAISE EXCEPTION 'Un incentivo perdido no puede cambiar de estado.'; END IF;
    IF NEW.estado = 'pagada' THEN
      IF OLD.estado NOT IN ('pendiente','por_pagar') THEN RAISE EXCEPTION 'Solo se puede pagar una comisión pendiente o por pagar.'; END IF;
      IF NEW.fecha_pago IS NULL THEN RAISE EXCEPTION 'Indica la fecha de pago.'; END IF;
      IF NEW.fecha_pago > v_hoy THEN RAISE EXCEPTION 'La fecha de pago no puede ser futura.'; END IF;
    END IF;
    IF NEW.estado = 'perdida' THEN
      IF NEW.tipo <> 'incentivo' THEN RAISE EXCEPTION 'Solo un incentivo puede marcarse como perdido.'; END IF;
      IF coalesce(btrim(NEW.motivo_estado),'') = '' THEN RAISE EXCEPTION 'Indica el motivo.'; END IF;
    END IF;
    IF NEW.estado = 'anulada' THEN NEW.anulado := true; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER comision_aa_valida BEFORE INSERT OR UPDATE ON public.comision FOR EACH ROW EXECUTE FUNCTION public.fn_comision_valida();
CREATE TRIGGER comision_auditoria BEFORE INSERT OR UPDATE ON public.comision FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER comision_bitacora AFTER INSERT OR UPDATE ON public.comision FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER comision_no_borrar BEFORE DELETE ON public.comision FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

-- Incentivos
CREATE OR REPLACE FUNCTION private.incentivos_calificados(_enc uuid, _mes date)
RETURNS TABLE(venta_id uuid, monto numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT v.id, v.fecha_firma, row_number() OVER (ORDER BY v.fecha_firma, v.creado_en, v.id) AS rn
    FROM public.venta v
    WHERE v.encargado_id = _enc AND NOT v.anulado AND NOT v.es_historica
      AND v.fecha_firma >= date_trunc('month', _mes)::date
      AND v.fecha_firma < (date_trunc('month', _mes) + interval '1 month')::date
      AND EXISTS (SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                  WHERE cu.venta_id = v.id AND cu.numero = 0 AND NOT cu.anulado AND ce.saldo <= 0.005)
  )
  SELECT e.id, private.config_vigente('monto_incentivo', e.fecha_firma) FROM e
  WHERE e.rn >= coalesce(private.config_vigente('lote_minimo_incentivo', e.fecha_firma), 6)
$$;

CREATE OR REPLACE FUNCTION private.retencion_cumplida(_venta uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id JOIN public.venta v ON v.id = cu.venta_id
    WHERE cu.venta_id = _venta AND NOT cu.anulado AND ce.saldo > 0.005
      AND cu.numero BETWEEN 1 AND coalesce(private.config_vigente('cuotas_retencion_incentivo', v.fecha_firma), 3)::int)
$$;

CREATE OR REPLACE FUNCTION private.recalc_incentivos(_enc uuid, _mes date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date := date_trunc('month', _mes)::date;
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  r record;
BEGIN
  IF _enc IS NULL OR _mes IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.id, v.anulado AS v_anulado, v.motivo_anulacion AS v_motivo
    FROM public.comision c JOIN public.venta v ON v.id = c.venta_id
    WHERE c.tipo = 'incentivo' AND c.encargado_id = _enc AND c.mes = v_ini AND c.estado IN ('retenido','por_pagar')
      AND c.venta_id NOT IN (SELECT q.venta_id FROM private.incentivos_calificados(_enc, v_ini) q)
  LOOP
    IF r.v_anulado THEN
      UPDATE public.comision SET estado = 'perdida', motivo_estado = coalesce(r.v_motivo, 'venta anulada') WHERE id = r.id;
    ELSE
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = 'recalculo' WHERE id = r.id;
    END IF;
  END LOOP;

  INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, mes, fecha_generada)
  SELECT q.venta_id, _enc, 'incentivo', q.monto, 'retenido', v_ini, v_hoy
  FROM private.incentivos_calificados(_enc, v_ini) q
  WHERE NOT EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = q.venta_id AND c.tipo = 'incentivo' AND c.estado <> 'anulada');

  UPDATE public.comision c
     SET estado = CASE WHEN private.retencion_cumplida(c.venta_id) THEN 'por_pagar' ELSE 'retenido' END
   WHERE c.tipo = 'incentivo' AND c.encargado_id = _enc AND c.mes = v_ini AND c.estado IN ('retenido','por_pagar')
     AND c.estado <> CASE WHEN private.retencion_cumplida(c.venta_id) THEN 'por_pagar' ELSE 'retenido' END;
END $$;

CREATE OR REPLACE FUNCTION private.recalc_por_venta(_venta uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT encargado_id, fecha_firma INTO v FROM public.venta WHERE id = _venta;
  IF FOUND AND v.encargado_id IS NOT NULL AND v.fecha_firma IS NOT NULL THEN
    PERFORM private.recalc_incentivos(v.encargado_id, v.fecha_firma);
  END IF;
END $$;

-- Venta: control de es_historica
CREATE OR REPLACE FUNCTION public.fn_venta_historica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.es_historica := true; NEW.motivo_cambio_historica := NULL; RETURN NEW;
  END IF;
  IF NEW.es_historica IS DISTINCT FROM OLD.es_historica THEN
    IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar si una venta es histórica.'; END IF;
    IF coalesce(btrim(NEW.motivo_cambio_historica),'') = '' THEN RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
    IF NEW.es_historica AND EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = NEW.id AND c.tipo = 'comision' AND c.estado = 'pagada') THEN
      RAISE EXCEPTION 'No se puede volver a marcar como histórica: la comisión de esta venta ya fue pagada.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER venta_historica BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_historica();

CREATE OR REPLACE FUNCTION public.fn_venta_comisiones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_monto numeric; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.anulado AND NOT OLD.anulado THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = NEW.motivo_anulacion
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado = 'pendiente';
      UPDATE public.comision SET estado = 'perdida', motivo_estado = NEW.motivo_anulacion
       WHERE venta_id = NEW.id AND tipo = 'incentivo' AND estado IN ('retenido','por_pagar');
      UPDATE public.comision SET alerta_venta_anulada = true
       WHERE venta_id = NEW.id AND estado = 'pagada' AND NOT alerta_venta_anulada;
    END IF;
    IF NEW.es_historica AND NOT OLD.es_historica THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = NEW.motivo_cambio_historica
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado NOT IN ('anulada','pagada');
    END IF;
  END IF;

  IF NOT NEW.anulado AND NOT NEW.es_historica AND NEW.encargado_id IS NOT NULL AND NEW.fecha_firma IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = NEW.id AND c.tipo = 'comision' AND c.estado <> 'anulada') THEN
    v_monto := private.config_vigente('monto_comision', NEW.fecha_firma);
    IF v_monto IS NULL THEN RAISE EXCEPTION 'Falta configurar monto_comision vigente a la fecha de firma.'; END IF;
    INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, fecha_generada)
    VALUES (NEW.id, NEW.encargado_id, 'comision', v_monto, 'pendiente', v_hoy);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.encargado_id IS NOT NULL AND OLD.fecha_firma IS NOT NULL
     AND (OLD.encargado_id IS DISTINCT FROM NEW.encargado_id
          OR NEW.fecha_firma IS NULL
          OR date_trunc('month', OLD.fecha_firma) <> date_trunc('month', NEW.fecha_firma)) THEN
    PERFORM private.recalc_incentivos(OLD.encargado_id, OLD.fecha_firma);
  END IF;
  IF NEW.encargado_id IS NOT NULL AND NEW.fecha_firma IS NOT NULL THEN
    PERFORM private.recalc_incentivos(NEW.encargado_id, NEW.fecha_firma);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER venta_comisiones AFTER INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_comisiones();

CREATE OR REPLACE FUNCTION public.fn_pago_incentivos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venta uuid;
BEGIN
  IF TG_TABLE_NAME = 'pago' THEN v_venta := NEW.venta_id;
  ELSE SELECT venta_id INTO v_venta FROM public.cuota WHERE id = NEW.cuota_id; END IF;
  PERFORM private.recalc_por_venta(v_venta);
  RETURN NULL;
END $$;
CREATE TRIGGER pago_aplicacion_incentivos AFTER INSERT OR UPDATE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_pago_incentivos();
CREATE TRIGGER pago_incentivos AFTER UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_pago_incentivos();

-- RPCs
CREATE OR REPLACE FUNCTION public.cambiar_historica(_venta_id uuid, _es_historica boolean, _motivo text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_actual boolean;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar si una venta es histórica.'; END IF;
  IF coalesce(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
  SELECT es_historica INTO v_actual FROM public.venta WHERE id = _venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_actual = _es_historica THEN RAISE EXCEPTION 'La venta ya tiene ese valor.'; END IF;
  UPDATE public.venta SET es_historica = _es_historica, motivo_cambio_historica = btrim(_motivo) WHERE id = _venta_id;
END $$;

CREATE OR REPLACE FUNCTION public.recalcular_mes(_mes date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date := date_trunc('month', _mes)::date; e uuid; n int := 0;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede recalcular.'; END IF;
  FOR e IN
    SELECT encargado_id FROM public.venta WHERE encargado_id IS NOT NULL
      AND fecha_firma >= v_ini AND fecha_firma < (v_ini + interval '1 month')::date
    UNION
    SELECT encargado_id FROM public.comision WHERE tipo = 'incentivo' AND mes = v_ini
  LOOP
    PERFORM private.recalc_incentivos(e, v_ini); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE VIEW public.comision_resumen WITH (security_invoker = true) AS
SELECT encargado_id,
  coalesce(sum(monto) FILTER (WHERE estado = 'pendiente'),0) AS pendiente,
  coalesce(sum(monto) FILTER (WHERE estado = 'retenido'),0) AS retenido,
  coalesce(sum(monto) FILTER (WHERE estado = 'por_pagar'),0) AS por_pagar,
  coalesce(sum(monto) FILTER (WHERE estado = 'pagada'),0) AS pagado
FROM public.comision GROUP BY encargado_id;
GRANT SELECT ON public.comision_resumen TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_venta_comisiones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_pago_incentivos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalcular_mes(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_mes(date) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.recalc_incentivos(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.recalc_por_venta(uuid) FROM PUBLIC, anon, authenticated;