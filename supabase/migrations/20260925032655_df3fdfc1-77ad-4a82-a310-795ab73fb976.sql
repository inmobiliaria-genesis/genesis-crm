-- 1. Config: unidad dias
ALTER TABLE public.config DROP CONSTRAINT config_unidad_chk;
ALTER TABLE public.config ADD CONSTRAINT config_unidad_chk CHECK (unidad IS NULL OR unidad = ANY (ARRAY['soles','porcentaje','lotes','cuotas','si_no','dias']));

CREATE OR REPLACE FUNCTION private.config_def(_clave text, _fecha date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    private.config_vigente(_clave, _fecha),
    (SELECT c.valor FROM public.config c WHERE c.clave = _clave AND NOT c.anulado ORDER BY c.vigente_desde, c.creado_en LIMIT 1))
$$;

-- 2. venta.desistida
ALTER TABLE public.venta ADD COLUMN desistida boolean NOT NULL DEFAULT false;
DROP INDEX public.venta_lote_activa;
CREATE UNIQUE INDEX venta_lote_activa ON public.venta (lote_id) WHERE (NOT anulado AND NOT desistida);

-- 3. Tablas
CREATE TABLE public.desistimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.venta(id),
  estado text NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso','aceptado','devuelto','anulado')),
  fecha_inicio date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  observacion text,
  total_abonado numeric NOT NULL DEFAULT 0,
  descontar_comision boolean,
  monto_comision_descontado numeric NOT NULL DEFAULT 0,
  porcentaje_devolucion numeric CHECK (porcentaje_devolucion IS NULL OR (porcentaje_devolucion >= 0 AND porcentaje_devolucion <= 100)),
  base_calculo numeric NOT NULL DEFAULT 0,
  monto_devolver numeric NOT NULL DEFAULT 0,
  monto_retiene_empresa numeric NOT NULL DEFAULT 0,
  carta_prenotarial boolean NOT NULL DEFAULT false,
  fecha_carta_prenotarial date,
  solicitud_liberacion boolean NOT NULL DEFAULT false,
  fecha_solicitud_liberacion date,
  aceptacion_disolucion boolean NOT NULL DEFAULT false,
  fecha_aceptacion_disolucion date,
  fecha_limite_devolucion date,
  motivo_cambio text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.desistimiento TO authenticated;
GRANT ALL ON public.desistimiento TO service_role;
ALTER TABLE public.desistimiento ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX desistimiento_uno_vigente ON public.desistimiento (venta_id) WHERE NOT anulado;

CREATE TABLE public.desistimiento_devolucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desistimiento_id uuid NOT NULL REFERENCES public.desistimiento(id),
  fecha date NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  forma_pago text NOT NULL CHECK (forma_pago IN ('efectivo','transferencia','cheque','tarjeta')),
  numero_operacion text,
  observacion text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.desistimiento_devolucion TO authenticated;
GRANT ALL ON public.desistimiento_devolucion TO service_role;
ALTER TABLE public.desistimiento_devolucion ENABLE ROW LEVEL SECURITY;
CREATE INDEX desistimiento_devolucion_des ON public.desistimiento_devolucion (desistimiento_id);

-- Visibilidad
CREATE OR REPLACE FUNCTION private.puede_ver_desistimiento(_venta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN private.tiene_rol(array['admin','gerente_ventas','socio','cobranza']::app_rol[]) THEN true
    WHEN private.tiene_rol(array['asesor']::app_rol[]) THEN EXISTS (
      SELECT 1 FROM public.venta v JOIN public.vendedor vd ON vd.id = v.encargado_id
      WHERE v.id = _venta_id AND vd.usuario_id = auth.uid() AND NOT vd.anulado)
    ELSE false END
$$;

CREATE POLICY desistimiento_select ON public.desistimiento FOR SELECT TO authenticated USING (private.puede_ver_desistimiento(venta_id));
CREATE POLICY desistimiento_insert ON public.desistimiento FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY desistimiento_update ON public.desistimiento FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());
CREATE POLICY devolucion_select ON public.desistimiento_devolucion FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.id = desistimiento_id AND private.puede_ver_desistimiento(d.venta_id)));
CREATE POLICY devolucion_insert ON public.desistimiento_devolucion FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY devolucion_update ON public.desistimiento_devolucion FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());

-- 4. Cálculo (invoker)
CREATE OR REPLACE FUNCTION private.calc_desistimiento(_venta_id uuid, _fecha date, _porcentaje numeric, _descontar boolean)
RETURNS TABLE(total_abonado numeric, descontar_comision boolean, monto_comision_descontado numeric,
              porcentaje_devolucion numeric, base_calculo numeric, monto_devolver numeric, monto_retiene_empresa numeric)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_total numeric; v_desc boolean; v_pct numeric; v_com numeric := 0; v_base numeric; v_dev numeric; v_firma date;
BEGIN
  SELECT coalesce(sum(p.monto),0) INTO v_total FROM public.pago p WHERE p.venta_id = _venta_id AND NOT p.anulado;
  SELECT fecha_firma INTO v_firma FROM public.venta WHERE id = _venta_id;
  v_desc := coalesce(_descontar, coalesce(private.config_def('descontar_comision_devolucion', _fecha), 1) <> 0);
  v_pct := coalesce(_porcentaje, private.config_def('porcentaje_devolucion', _fecha), 0);
  IF v_desc THEN v_com := coalesce(private.config_def('monto_comision', coalesce(v_firma, _fecha)), 0); END IF;
  v_base := greatest(v_total - v_com, 0);
  v_dev := round(v_base * v_pct / 100, 2);
  RETURN QUERY SELECT v_total, v_desc, CASE WHEN v_desc THEN v_com ELSE 0 END, v_pct, v_base, v_dev, v_base - v_dev;
END $$;

CREATE OR REPLACE FUNCTION public.simular_desistimiento(_venta_id uuid, _fecha date, _porcentaje numeric, _descontar boolean)
RETURNS TABLE(total_abonado numeric, descontar_comision boolean, monto_comision_descontado numeric,
              porcentaje_devolucion numeric, base_calculo numeric, monto_devolver numeric, monto_retiene_empresa numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM private.calc_desistimiento(_venta_id, coalesce(_fecha, (now() AT TIME ZONE 'America/Lima')::date), _porcentaje, _descontar)
$$;

-- 5. Trigger de desistimiento
CREATE OR REPLACE FUNCTION public.fn_desistimiento_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v record; c record; v_devuelto numeric; v_cambia boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v FROM public.venta WHERE id = NEW.venta_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
    IF v.anulado THEN RAISE EXCEPTION 'La venta está anulada.'; END IF;
    IF v.desistida THEN RAISE EXCEPTION 'La venta ya está desistida.'; END IF;
    IF EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.venta_id AND NOT d.anulado) THEN
      RAISE EXCEPTION 'La venta ya tiene un desistimiento vigente.'; END IF;
    NEW.aceptacion_disolucion := false; NEW.fecha_aceptacion_disolucion := NULL; NEW.motivo_cambio := NULL;
    SELECT * INTO c FROM private.calc_desistimiento(NEW.venta_id, NEW.fecha_inicio, NEW.porcentaje_devolucion, NEW.descontar_comision);
    NEW.total_abonado := c.total_abonado; NEW.descontar_comision := c.descontar_comision;
    NEW.monto_comision_descontado := c.monto_comision_descontado; NEW.porcentaje_devolucion := c.porcentaje_devolucion;
    NEW.base_calculo := c.base_calculo; NEW.monto_devolver := c.monto_devolver; NEW.monto_retiene_empresa := c.monto_retiene_empresa;
    NEW.estado := 'en_proceso';
    RETURN NEW;
  END IF;

  NEW.venta_id := OLD.venta_id; NEW.total_abonado := OLD.total_abonado; NEW.fecha_inicio := OLD.fecha_inicio;
  IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Un desistimiento anulado no puede reactivarse.'; END IF;
  IF NEW.anulado AND NOT OLD.anulado AND OLD.estado <> 'en_proceso' THEN
    RAISE EXCEPTION 'El desistimiento ya fue aceptado; no se puede anular.'; END IF;
  IF OLD.anulado THEN
    IF NEW.observacion IS DISTINCT FROM OLD.observacion OR NEW.porcentaje_devolucion IS DISTINCT FROM OLD.porcentaje_devolucion THEN
      RAISE EXCEPTION 'El desistimiento está anulado.'; END IF;
  END IF;
  IF OLD.aceptacion_disolucion AND NOT NEW.aceptacion_disolucion THEN
    RAISE EXCEPTION 'La aceptación de disolución no se puede revertir.'; END IF;

  v_cambia := NEW.porcentaje_devolucion IS DISTINCT FROM OLD.porcentaje_devolucion
    OR NEW.descontar_comision IS DISTINCT FROM OLD.descontar_comision
    OR NEW.observacion IS DISTINCT FROM OLD.observacion
    OR NEW.carta_prenotarial IS DISTINCT FROM OLD.carta_prenotarial
    OR NEW.fecha_carta_prenotarial IS DISTINCT FROM OLD.fecha_carta_prenotarial
    OR NEW.solicitud_liberacion IS DISTINCT FROM OLD.solicitud_liberacion
    OR NEW.fecha_solicitud_liberacion IS DISTINCT FROM OLD.fecha_solicitud_liberacion
    OR NEW.fecha_limite_devolucion IS DISTINCT FROM OLD.fecha_limite_devolucion;

  IF OLD.aceptacion_disolucion THEN
    -- cálculo y pasos bloqueados tras la aceptación (salvo fecha límite)
    NEW.porcentaje_devolucion := OLD.porcentaje_devolucion; NEW.descontar_comision := OLD.descontar_comision;
    NEW.carta_prenotarial := OLD.carta_prenotarial; NEW.fecha_carta_prenotarial := OLD.fecha_carta_prenotarial;
    NEW.solicitud_liberacion := OLD.solicitud_liberacion; NEW.fecha_solicitud_liberacion := OLD.fecha_solicitud_liberacion;
    NEW.fecha_aceptacion_disolucion := OLD.fecha_aceptacion_disolucion;
  END IF;

  IF v_cambia AND NOT (NEW.anulado AND NOT OLD.anulado) THEN
    IF coalesce(btrim(NEW.motivo_cambio),'') = '' OR NEW.motivo_cambio IS NOT DISTINCT FROM OLD.motivo_cambio AND NEW.modificado_en IS NOT DISTINCT FROM OLD.modificado_en AND false THEN
      RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
  END IF;

  IF NEW.aceptacion_disolucion AND NOT OLD.aceptacion_disolucion THEN
    IF OLD.estado <> 'en_proceso' OR NEW.anulado THEN RAISE EXCEPTION 'Solo un desistimiento en proceso puede aceptarse.'; END IF;
    IF NEW.fecha_aceptacion_disolucion IS NULL THEN RAISE EXCEPTION 'Indica la fecha de aceptación de disolución.'; END IF;
  END IF;

  IF NOT OLD.aceptacion_disolucion THEN
    SELECT * INTO c FROM private.calc_desistimiento(NEW.venta_id, NEW.fecha_inicio, NEW.porcentaje_devolucion, NEW.descontar_comision);
    -- se conserva el total abonado al iniciar
    NEW.descontar_comision := c.descontar_comision; NEW.porcentaje_devolucion := c.porcentaje_devolucion;
    NEW.monto_comision_descontado := c.monto_comision_descontado;
    NEW.base_calculo := greatest(NEW.total_abonado - NEW.monto_comision_descontado, 0);
    NEW.monto_devolver := round(NEW.base_calculo * NEW.porcentaje_devolucion / 100, 2);
    NEW.monto_retiene_empresa := NEW.base_calculo - NEW.monto_devolver;
  ELSE
    NEW.monto_comision_descontado := OLD.monto_comision_descontado; NEW.base_calculo := OLD.base_calculo;
    NEW.monto_devolver := OLD.monto_devolver; NEW.monto_retiene_empresa := OLD.monto_retiene_empresa;
  END IF;

  IF NEW.anulado THEN NEW.estado := 'anulado';
  ELSIF NEW.aceptacion_disolucion THEN
    SELECT coalesce(sum(monto),0) INTO v_devuelto FROM public.desistimiento_devolucion WHERE desistimiento_id = NEW.id AND NOT anulado;
    NEW.estado := CASE WHEN NEW.monto_devolver > 0 AND v_devuelto >= NEW.monto_devolver - 0.005 THEN 'devuelto' ELSE 'aceptado' END;
  ELSE NEW.estado := 'en_proceso';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_desistimiento_acepta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.aceptacion_disolucion AND NOT OLD.aceptacion_disolucion THEN
    UPDATE public.venta SET desistida = true WHERE id = NEW.venta_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER desistimiento_aa_valida BEFORE INSERT OR UPDATE ON public.desistimiento FOR EACH ROW EXECUTE FUNCTION public.fn_desistimiento_valida();
CREATE TRIGGER desistimiento_auditoria BEFORE INSERT OR UPDATE ON public.desistimiento FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER desistimiento_bitacora AFTER INSERT OR UPDATE ON public.desistimiento FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER desistimiento_no_borrar BEFORE DELETE ON public.desistimiento FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();
CREATE TRIGGER desistimiento_zz_acepta AFTER UPDATE ON public.desistimiento FOR EACH ROW EXECUTE FUNCTION public.fn_desistimiento_acepta();

-- 6. Devoluciones
CREATE OR REPLACE FUNCTION public.fn_devolucion_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d record; v_suma numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.desistimiento_id := OLD.desistimiento_id;
    IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Una devolución anulada no puede reactivarse.'; END IF;
    IF OLD.anulado THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO d FROM public.desistimiento WHERE id = NEW.desistimiento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Desistimiento no encontrado.'; END IF;
  IF TG_OP = 'INSERT' AND d.estado <> 'aceptado' THEN
    RAISE EXCEPTION 'Solo se registran devoluciones con el desistimiento aceptado y saldo por devolver.'; END IF;
  IF NOT NEW.anulado THEN
    SELECT coalesce(sum(monto),0) INTO v_suma FROM public.desistimiento_devolucion
     WHERE desistimiento_id = NEW.desistimiento_id AND NOT anulado AND id <> NEW.id;
    IF v_suma + NEW.monto > d.monto_devolver + 0.005 THEN
      RAISE EXCEPTION 'La devolución supera el monto pendiente (pendiente S/ %).', d.monto_devolver - v_suma; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_devolucion_estado()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.desistimiento SET estado = estado WHERE id = NEW.desistimiento_id;
  RETURN NULL;
END $$;

CREATE TRIGGER devolucion_aa_valida BEFORE INSERT OR UPDATE ON public.desistimiento_devolucion FOR EACH ROW EXECUTE FUNCTION public.fn_devolucion_valida();
CREATE TRIGGER devolucion_auditoria BEFORE INSERT OR UPDATE ON public.desistimiento_devolucion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER devolucion_bitacora AFTER INSERT OR UPDATE ON public.desistimiento_devolucion FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER devolucion_no_borrar BEFORE DELETE ON public.desistimiento_devolucion FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();
CREATE TRIGGER devolucion_zz_estado AFTER INSERT OR UPDATE ON public.desistimiento_devolucion FOR EACH ROW EXECUTE FUNCTION public.fn_devolucion_estado();

-- 7. Proteger venta.desistida
CREATE OR REPLACE FUNCTION public.fn_venta_desistida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.desistida := false; RETURN NEW; END IF;
  IF OLD.desistida AND NOT NEW.desistida THEN RAISE EXCEPTION 'Una venta desistida no puede volver a estar activa.'; END IF;
  IF NEW.desistida AND NOT OLD.desistida AND NOT EXISTS (
    SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.id AND NOT d.anulado AND d.aceptacion_disolucion) THEN
    RAISE EXCEPTION 'La venta solo se marca desistida al aceptar la disolución de su desistimiento.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER venta_desistida BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_desistida();

-- 8. Pagos bloqueados
CREATE OR REPLACE FUNCTION public.fn_valida_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aplicado numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.venta WHERE id = NEW.venta_id AND desistida) THEN
      RAISE EXCEPTION 'La venta está desistida; no se pueden registrar pagos.'; END IF;
    IF EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.venta_id AND NOT d.anulado AND d.estado = 'en_proceso') THEN
      RAISE EXCEPTION 'La venta está en proceso de desistimiento; no se pueden registrar pagos.'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.monto <> OLD.monto THEN
    SELECT coalesce(sum(pa.monto_aplicado), 0) INTO v_aplicado
    FROM public.pago_aplicacion pa WHERE pa.pago_id = NEW.id AND NOT pa.anulado;
    IF v_aplicado > NEW.monto + 0.005 THEN
      RAISE EXCEPTION 'El pago ya tiene % aplicado, no puede reducirse a %.', v_aplicado, NEW.monto;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 9. Vistas (columnas añadidas al final)
CREATE OR REPLACE VIEW public.cuota_estado WITH (security_invoker = true) AS
 SELECT c.id AS cuota_id,
    c.monto_vigente,
    COALESCE(pa.total, 0::numeric) AS monto_pagado,
    c.monto_vigente - COALESCE(pa.total, 0::numeric) AS saldo,
    CASE
      WHEN c.monto_vigente - COALESCE(pa.total, 0::numeric) <= 0::numeric THEN 'pagada'
      WHEN v.desistida THEN 'no_exigible'
      WHEN COALESCE(pa.total, 0::numeric) > 0::numeric THEN 'parcial'
      ELSE 'pendiente'
    END AS estado,
    (c.fecha_vencimiento < CURRENT_DATE AND c.monto_vigente - COALESCE(pa.total, 0::numeric) > 0::numeric
       AND NOT v.desistida AND NOT v.anulado AND NOT dp.en_proceso) AS vencida,
    (NOT v.desistida AND NOT v.anulado AND NOT dp.en_proceso) AS exigible
   FROM public.cuota c
   JOIN public.venta v ON v.id = c.venta_id
   LEFT JOIN LATERAL (SELECT sum(a.monto_aplicado) AS total FROM public.pago_aplicacion a JOIN public.pago p ON p.id = a.pago_id
          WHERE a.cuota_id = c.id AND NOT a.anulado AND NOT p.anulado) pa ON true
   LEFT JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = c.venta_id AND NOT d.anulado AND d.estado = 'en_proceso') AS en_proceso) dp ON true
  WHERE NOT c.anulado;

CREATE OR REPLACE VIEW public.lote_estado WITH (security_invoker = true) AS
 SELECT l.id AS lote_id,
   CASE
     WHEN EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) THEN 'vendido'
     WHEN EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = l.id AND NOT r.anulado AND r.fecha_limite >= CURRENT_DATE) THEN 'apartado'
     ELSE 'disponible'
   END AS estado,
   (SELECT sum(GREATEST(ce.saldo, 0::numeric)) FROM public.venta v
      JOIN public.cuota c ON c.venta_id = v.id AND NOT c.anulado
      JOIN public.cuota_estado ce ON ce.cuota_id = c.id
     WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) AS saldo_pendiente,
   EXISTS (SELECT 1 FROM public.venta v JOIN public.desistimiento d ON d.venta_id = v.id
     WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida AND NOT d.anulado AND d.estado = 'en_proceso') AS en_desistimiento
  FROM public.lote l
 WHERE NOT l.anulado;

-- 10. Reglas de venta activa
CREATE OR REPLACE FUNCTION public.fn_valida_reserva()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.vigencia_dias IS NULL THEN
    NEW.vigencia_dias := coalesce(private.config_vigente('vigencia_apartado_dias')::int, 15);
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = NEW.lote_id AND NOT v.anulado AND NOT v.desistida) THEN
      RAISE EXCEPTION 'El lote ya tiene una venta activa.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = NEW.lote_id AND NOT r.anulado
        AND r.convertida_a_venta_id IS NULL AND r.fecha_limite >= CURRENT_DATE) THEN
      RAISE EXCEPTION 'El lote ya tiene un apartado vigente.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_valida_venta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_precio numeric; v_min numeric; v_max numeric;
BEGIN
  IF NEW.encargado_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND tipo = 'encargado' AND NOT anulado) THEN
      RAISE EXCEPTION 'El encargado debe ser un vendedor de tipo encargado.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El encargado no está activo.'; END IF;
  END IF;
  IF NEW.promotor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND tipo = 'promotor' AND NOT anulado) THEN
      RAISE EXCEPTION 'El promotor debe ser un vendedor de tipo promotor.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El promotor no está activo.'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = NEW.lote_id AND NOT v.anulado AND NOT v.desistida) THEN
      RAISE EXCEPTION 'El lote ya tiene una venta activa.'; END IF;
    SELECT precio_lista INTO v_precio FROM public.lote WHERE id = NEW.lote_id;
    NEW.precio_lista_momento := coalesce(NEW.precio_lista_momento, v_precio);
    IF NEW.condicion = 'contado' THEN NEW.plazo_meses := 1;
    ELSE
      v_max := coalesce(private.config_vigente('max_cuotas'), 120);
      IF NEW.plazo_meses > v_max THEN RAISE EXCEPTION 'El plazo no puede superar % cuotas.', v_max::int; END IF;
    END IF;
    IF NEW.fecha_primera_cuota IS NULL THEN NEW.fecha_primera_cuota := NEW.fecha_venta + 30; END IF;
    v_min := coalesce(private.config_vigente('inicial_minima'), 0);
    IF NEW.condicion = 'financiado' AND NEW.inicial < v_min THEN RAISE EXCEPTION 'La inicial debe ser por lo menos %.', v_min; END IF;
    IF NEW.inicial > NEW.precio_acordado THEN RAISE EXCEPTION 'La inicial no puede superar el precio acordado.'; END IF;
    IF NEW.precio_acordado IS DISTINCT FROM NEW.precio_lista_momento
       AND (NEW.motivo_diferencia_precio IS NULL OR btrim(NEW.motivo_diferencia_precio) = '') THEN
      RAISE EXCEPTION 'Debe indicar el motivo de la diferencia de precio.'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- 11. Incentivos y comisiones
CREATE OR REPLACE FUNCTION private.incentivos_calificados(_enc uuid, _mes date)
RETURNS TABLE(venta_id uuid, monto numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT v.id, v.fecha_firma, row_number() OVER (ORDER BY v.fecha_firma, v.creado_en, v.id) AS rn
    FROM public.venta v
    WHERE v.encargado_id = _enc AND NOT v.anulado AND NOT v.desistida AND NOT v.es_historica
      AND v.fecha_firma >= date_trunc('month', _mes)::date
      AND v.fecha_firma < (date_trunc('month', _mes) + interval '1 month')::date
      AND EXISTS (SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                  WHERE cu.venta_id = v.id AND cu.numero = 0 AND NOT cu.anulado AND ce.saldo <= 0.005))
  SELECT e.id, private.config_vigente('monto_incentivo', e.fecha_firma) FROM e
  WHERE e.rn >= coalesce(private.config_vigente('lote_minimo_incentivo', e.fecha_firma), 6)
$$;

CREATE OR REPLACE FUNCTION private.recalc_incentivos(_enc uuid, _mes date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date := date_trunc('month', _mes)::date; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date; r record;
BEGIN
  IF _enc IS NULL OR _mes IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.id, v.anulado AS v_anulado, v.desistida AS v_desistida, v.motivo_anulacion AS v_motivo
    FROM public.comision c JOIN public.venta v ON v.id = c.venta_id
    WHERE c.tipo = 'incentivo' AND c.encargado_id = _enc AND c.mes = v_ini AND c.estado IN ('retenido','por_pagar')
      AND c.venta_id NOT IN (SELECT q.venta_id FROM private.incentivos_calificados(_enc, v_ini) q)
  LOOP
    IF r.v_desistida THEN
      CONTINUE; -- el desistimiento ya decidió (retenido → perdida; por pagar se mantiene)
    ELSIF r.v_anulado THEN
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
     AND NOT EXISTS (SELECT 1 FROM public.venta v WHERE v.id = c.venta_id AND v.desistida)
     AND c.estado <> CASE WHEN private.retencion_cumplida(c.venta_id) THEN 'por_pagar' ELSE 'retenido' END;
END $$;

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
    IF NEW.desistida AND NOT OLD.desistida THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = 'desistimiento'
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado = 'pendiente';
      UPDATE public.comision SET estado = 'perdida', motivo_estado = 'desistimiento'
       WHERE venta_id = NEW.id AND tipo = 'incentivo' AND estado = 'retenido';
    END IF;
    IF NEW.es_historica AND NOT OLD.es_historica THEN
      UPDATE public.comision SET estado = 'anulada', motivo_anulacion = NEW.motivo_cambio_historica
       WHERE venta_id = NEW.id AND tipo = 'comision' AND estado NOT IN ('anulada','pagada');
    END IF;
  END IF;

  IF NOT NEW.anulado AND NOT NEW.desistida AND NOT NEW.es_historica AND NEW.encargado_id IS NOT NULL AND NEW.fecha_firma IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = NEW.id AND c.tipo = 'comision' AND c.estado <> 'anulada') THEN
    v_monto := private.config_vigente('monto_comision', NEW.fecha_firma);
    IF v_monto IS NULL THEN RAISE EXCEPTION 'Falta configurar monto_comision vigente a la fecha de firma.'; END IF;
    INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, fecha_generada)
    VALUES (NEW.id, NEW.encargado_id, 'comision', v_monto, 'pendiente', v_hoy);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.encargado_id IS NOT NULL AND OLD.fecha_firma IS NOT NULL
     AND (OLD.encargado_id IS DISTINCT FROM NEW.encargado_id OR NEW.fecha_firma IS NULL
          OR date_trunc('month', OLD.fecha_firma) <> date_trunc('month', NEW.fecha_firma)) THEN
    PERFORM private.recalc_incentivos(OLD.encargado_id, OLD.fecha_firma);
  END IF;
  IF NEW.encargado_id IS NOT NULL AND NEW.fecha_firma IS NOT NULL THEN
    PERFORM private.recalc_incentivos(NEW.encargado_id, NEW.fecha_firma);
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION private.puede_ver_desistimiento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.puede_ver_desistimiento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.calc_desistimiento(uuid, date, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.config_def(text, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.simular_desistimiento(uuid, date, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simular_desistimiento(uuid, date, numeric, boolean) TO authenticated;