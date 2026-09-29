
-- PARTE 1: recibido_por
ALTER TABLE public.pago ADD COLUMN recibido_por text NOT NULL DEFAULT 'inmobiliaria';
ALTER TABLE public.pago ADD CONSTRAINT pago_recibido_por_check CHECK (recibido_por IN ('vendedor','inmobiliaria'));

-- Comisión: columnas nuevas
ALTER TABLE public.comision ADD COLUMN modalidad text;
ALTER TABLE public.comision ADD CONSTRAINT comision_modalidad_check CHECK (modalidad IS NULL OR modalidad IN ('cobro_directo','historica'));
ALTER TABLE public.comision ADD COLUMN numero_operacion text;
ALTER TABLE public.comision ADD COLUMN comprobante_path text;
ALTER TABLE public.comision DROP CONSTRAINT comision_estado_check;
ALTER TABLE public.comision ADD CONSTRAINT comision_estado_check CHECK (estado IN
  ('pendiente','retenido','por_pagar','pagada','perdida','anulada','pendiente_cobro_vendedor','cobrada_vendedor','pagada_antes_crm'));

ALTER TABLE public.gasto ADD COLUMN comision_id uuid REFERENCES public.comision(id);
ALTER TABLE public.comision ADD COLUMN gasto_id uuid REFERENCES public.gasto(id);

-- Comisiones existentes de ventas: eran deuda de la empresa
UPDATE public.comision SET modalidad = 'historica' WHERE tipo = 'comision' AND modalidad IS NULL;

-- Sincroniza el estado de cobro del vendedor
CREATE OR REPLACE FUNCTION private.sync_cobro_vendedor(_venta uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_suma numeric;
BEGIN
  IF _venta IS NULL THEN RETURN; END IF;
  SELECT coalesce(sum(monto),0) INTO v_suma FROM public.pago
   WHERE venta_id = _venta AND NOT anulado AND recibido_por = 'vendedor';
  PERFORM set_config('app.sync_cobro', '1', true);
  UPDATE public.comision c
     SET estado = CASE WHEN v_suma >= c.monto - 0.005 THEN 'cobrada_vendedor' ELSE 'pendiente_cobro_vendedor' END
   WHERE c.venta_id = _venta AND c.modalidad = 'cobro_directo'
     AND c.estado IN ('pendiente_cobro_vendedor','cobrada_vendedor')
     AND c.estado <> CASE WHEN v_suma >= c.monto - 0.005 THEN 'cobrada_vendedor' ELSE 'pendiente_cobro_vendedor' END;
  PERFORM set_config('app.sync_cobro', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.fn_pago_cobro_vendedor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.sync_cobro_vendedor(NEW.venta_id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_pago_cobro_vendedor AFTER INSERT OR UPDATE ON public.pago
  FOR EACH ROW EXECUTE FUNCTION public.fn_pago_cobro_vendedor();

-- Validación de comisión
CREATE OR REPLACE FUNCTION public.fn_comision_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
        v_sync boolean := coalesce(current_setting('app.sync_cobro', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'manual' THEN NEW.estado := 'pendiente'; NEW.mes := NULL; NEW.modalidad := NULL; END IF;
    IF NEW.tipo = 'incentivo' THEN NEW.modalidad := NULL; END IF;
    IF NEW.tipo = 'comision' THEN
      IF NEW.modalidad IS NULL THEN NEW.modalidad := 'cobro_directo'; END IF;
      IF NEW.modalidad = 'cobro_directo' THEN NEW.estado := 'pendiente_cobro_vendedor'; END IF;
      IF NEW.modalidad = 'historica' AND NEW.estado NOT IN ('pendiente','pagada_antes_crm') THEN
        RAISE EXCEPTION 'Estado inválido para una comisión histórica.'; END IF;
    END IF;
    NEW.gasto_id := NULL;
    RETURN NEW;
  END IF;
  NEW.venta_id := OLD.venta_id; NEW.tipo := OLD.tipo; NEW.encargado_id := OLD.encargado_id; NEW.mes := OLD.mes;
  NEW.modalidad := OLD.modalidad;
  IF coalesce(current_setting('app.revertir', true), '') = '1' THEN RETURN NEW; END IF;
  IF coalesce(current_setting('app.gasto_auto', true), '') <> '1' THEN NEW.gasto_id := OLD.gasto_id; END IF;
  IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Una comisión anulada no puede reactivarse.'; END IF;
  IF NEW.anulado AND NOT OLD.anulado THEN NEW.estado := 'anulada'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado = 'anulada' THEN RAISE EXCEPTION 'Una comisión anulada no puede cambiar de estado.'; END IF;
    IF NEW.estado IN ('pendiente_cobro_vendedor','cobrada_vendedor') OR (OLD.estado IN ('pendiente_cobro_vendedor','cobrada_vendedor') AND NEW.estado <> 'anulada') THEN
      IF NOT v_sync THEN RAISE EXCEPTION 'El cobro del vendedor se actualiza solo con los pagos recibidos por el vendedor.'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.estado = 'pagada_antes_crm' AND NEW.estado <> 'anulada' THEN RAISE EXCEPTION 'Una comisión pagada antes del CRM no puede cambiar de estado.'; END IF;
    IF NEW.estado = 'pagada_antes_crm' THEN RAISE EXCEPTION 'Estado inválido.'; END IF;
    IF OLD.estado = 'pagada' AND NEW.estado NOT IN ('anulada','pendiente','por_pagar') THEN
      RAISE EXCEPTION 'Una comisión pagada no puede cambiar a ese estado.'; END IF;
    IF OLD.estado = 'pagada' AND NEW.estado IN ('pendiente','por_pagar') THEN
      IF (NEW.tipo = 'incentivo') <> (NEW.estado = 'por_pagar') THEN RAISE EXCEPTION 'Estado inválido.'; END IF;
      IF coalesce(btrim(NEW.motivo_estado),'') = '' THEN RAISE EXCEPTION 'Indica el motivo de la anulación del pago.'; END IF;
      NEW.fecha_pago := NULL; NEW.forma_pago := NULL; NEW.numero_operacion := NULL; NEW.comprobante_path := NULL;
    END IF;
    IF OLD.estado = 'perdida' AND NEW.estado <> 'anulada' THEN RAISE EXCEPTION 'Un incentivo perdido no puede cambiar de estado.'; END IF;
    IF NEW.estado = 'pagada' THEN
      IF OLD.estado NOT IN ('pendiente','por_pagar') THEN RAISE EXCEPTION 'Solo se puede pagar una comisión pendiente o por pagar.'; END IF;
      IF NEW.fecha_pago IS NULL THEN RAISE EXCEPTION 'Indica la fecha de pago.'; END IF;
      IF NEW.fecha_pago > v_hoy THEN RAISE EXCEPTION 'La fecha de pago no puede ser futura.'; END IF;
      IF NEW.forma_pago IS NULL OR NEW.forma_pago NOT IN ('transferencia','efectivo','yape','plin') THEN
        RAISE EXCEPTION 'Elige el método de pago.'; END IF;
      IF NEW.forma_pago = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
      NEW.numero_operacion := nullif(btrim(NEW.numero_operacion), '');
    END IF;
    IF NEW.estado = 'perdida' THEN
      IF NEW.tipo <> 'incentivo' THEN RAISE EXCEPTION 'Solo un incentivo puede marcarse como perdido.'; END IF;
      IF coalesce(btrim(NEW.motivo_estado),'') = '' THEN RAISE EXCEPTION 'Indica el motivo.'; END IF;
    END IF;
    IF NEW.estado = 'anulada' THEN NEW.anulado := true; END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Gasto automático al pagar comisión histórica o incentivo
CREATE OR REPLACE FUNCTION public.fn_comision_gasto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cat uuid; v_sub uuid; v_gasto uuid; v_nombre text;
BEGIN
  IF NEW.estado = 'pagada' AND OLD.estado <> 'pagada' AND (NEW.modalidad = 'historica' OR NEW.tipo = 'incentivo') THEN
    SELECT id INTO v_cat FROM public.gasto_categoria WHERE lower(nombre) = 'comisiones e incentivos' AND NOT anulado LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Falta la categoría "Comisiones e incentivos" en Gastos.'; END IF;
    SELECT id INTO v_sub FROM public.gasto_subcategoria WHERE categoria_id = v_cat AND NOT anulado
      AND lower(nombre) = CASE WHEN NEW.tipo = 'incentivo' THEN 'incentivos' ELSE 'comisiones históricas' END LIMIT 1;
    IF v_sub IS NULL THEN RAISE EXCEPTION 'Falta la subcategoría en "Comisiones e incentivos".'; END IF;
    SELECT coalesce(apodo, nombre) INTO v_nombre FROM public.vendedor WHERE id = NEW.encargado_id;
    PERFORM set_config('app.gasto_auto', '1', true);
    INSERT INTO public.gasto (fecha, categoria_id, subcategoria_id, monto, metodo, numero_operacion, comprobante_path, notas, persona, comision_id)
    VALUES (NEW.fecha_pago, v_cat, v_sub, NEW.monto, NEW.forma_pago, NEW.numero_operacion, NEW.comprobante_path,
            CASE WHEN NEW.tipo = 'incentivo' THEN 'Incentivo' ELSE 'Comisión histórica' END || ' — ' || coalesce(v_nombre, ''),
            v_nombre, NEW.id)
    RETURNING id INTO v_gasto;
    UPDATE public.comision SET gasto_id = v_gasto WHERE id = NEW.id;
    PERFORM set_config('app.gasto_auto', '', true);
  ELSIF OLD.estado = 'pagada' AND NEW.estado <> 'pagada' AND OLD.gasto_id IS NOT NULL THEN
    PERFORM set_config('app.gasto_auto', '1', true);
    UPDATE public.gasto SET anulado = true, anulado_en = now(), anulado_por = auth.uid(),
      motivo_anulacion = coalesce(NEW.motivo_anulacion, NEW.motivo_estado, 'Pago anulado')
     WHERE id = OLD.gasto_id AND NOT anulado;
    UPDATE public.comision SET gasto_id = NULL WHERE id = NEW.id;
    PERFORM set_config('app.gasto_auto', '', true);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_comision_gasto AFTER UPDATE OF estado ON public.comision
  FOR EACH ROW EXECUTE FUNCTION public.fn_comision_gasto();

-- Gastos: permitir los automáticos y bloquear su edición manual
CREATE OR REPLACE FUNCTION public.fn_valida_gasto()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE c record; s record; v_auto boolean := coalesce(current_setting('app.gasto_auto', true), '') = '1';
BEGIN
  IF (NEW.comision_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.comision_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde una comisión o incentivo; modifícalo desde Comisiones.';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.comision_id := OLD.comision_id; END IF;
  IF v_auto THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.gasto_categoria WHERE id = NEW.categoria_id;
  IF NOT FOUND OR c.anulado THEN RAISE EXCEPTION 'Categoría inválida.'; END IF;
  IF NOT c.manual AND (TG_OP = 'INSERT' OR NEW.categoria_id <> OLD.categoria_id) THEN
    RAISE EXCEPTION 'La categoría % no admite registros manuales.', c.nombre;
  END IF;
  IF NEW.subcategoria_id IS NOT NULL THEN
    SELECT * INTO s FROM public.gasto_subcategoria WHERE id = NEW.subcategoria_id;
    IF NOT FOUND OR s.categoria_id <> NEW.categoria_id THEN RAISE EXCEPTION 'La subcategoría no pertenece a la categoría.'; END IF;
  ELSIF EXISTS (SELECT 1 FROM public.gasto_subcategoria WHERE categoria_id = NEW.categoria_id AND NOT anulado) THEN
    RAISE EXCEPTION 'Elige una subcategoría.';
  END IF;
  IF NEW.metodo = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  IF (c.tipo = 'otros' OR coalesce(s.exige_nota, false)) AND btrim(coalesce(NEW.notas,'')) = '' THEN
    RAISE EXCEPTION 'La nota es obligatoria para esta categoría.';
  END IF;
  IF lower(c.nombre) = 'publicidad' AND btrim(coalesce(NEW.descripcion,'')) = '' THEN
    RAISE EXCEPTION 'Indica para qué fue la publicidad.';
  END IF;
  IF lower(coalesce(s.nombre,'')) = 'jornales' AND (btrim(coalesce(NEW.trabajador,'')) = '' OR coalesce(NEW.dias,0) <= 0) THEN
    RAISE EXCEPTION 'Indica el trabajador y el número de días.';
  END IF;
  IF lower(c.nombre) = 'viáticos' AND btrim(coalesce(NEW.persona,'')) = '' THEN
    RAISE EXCEPTION 'Indica la persona del viático.';
  END IF;
  IF c.tipo = 'reembolso' THEN
    IF btrim(coalesce(NEW.pagado_por,'')) = '' THEN RAISE EXCEPTION 'Indica quién pagó.'; END IF;
    IF TG_OP = 'INSERT' THEN NEW.reembolso_estado := 'por_reembolsar'; END IF;
    IF NEW.reembolso_estado IS DISTINCT FROM coalesce(OLD.reembolso_estado, 'por_reembolsar')
       OR (NEW.reembolso_estado = 'reembolsado' AND (NEW.reembolso_fecha, NEW.reembolso_metodo, NEW.reembolso_operacion) IS DISTINCT FROM (OLD.reembolso_fecha, OLD.reembolso_metodo, OLD.reembolso_operacion)) THEN
      IF TG_OP = 'UPDATE' AND NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede marcar un reembolso como devuelto.'; END IF;
    END IF;
    IF NEW.reembolso_estado = 'reembolsado' THEN
      IF NEW.reembolso_fecha IS NULL OR NEW.reembolso_metodo IS NULL THEN RAISE EXCEPTION 'Indica fecha y método de la devolución.'; END IF;
      IF NEW.reembolso_metodo = 'efectivo' THEN NEW.reembolso_operacion := NULL; END IF;
    ELSE
      NEW.reembolso_fecha := NULL; NEW.reembolso_metodo := NULL; NEW.reembolso_operacion := NULL;
    END IF;
  ELSE
    NEW.pagado_por := NULL; NEW.reembolso_estado := NULL; NEW.reembolso_fecha := NULL; NEW.reembolso_metodo := NULL; NEW.reembolso_operacion := NULL;
  END IF;
  RETURN NEW;
END $function$;

-- PARTE 3: ventas nuevas no históricas
CREATE OR REPLACE FUNCTION public.fn_venta_historica()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.es_historica := coalesce(NEW.importada, false); NEW.motivo_cambio_historica := NULL; RETURN NEW;
  END IF;
  IF NEW.es_historica IS DISTINCT FROM OLD.es_historica THEN
    IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar si una venta es histórica.'; END IF;
    IF coalesce(btrim(NEW.motivo_cambio_historica),'') = '' THEN RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
    IF NEW.es_historica AND EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = NEW.id AND c.tipo = 'comision' AND c.estado IN ('pagada','cobrada_vendedor')) THEN
      RAISE EXCEPTION 'No se puede volver a marcar como histórica: la comisión de esta venta ya fue pagada o cobrada.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_venta_comisiones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  IF TG_OP = 'UPDATE' AND OLD.encargado_id IS NOT NULL AND OLD.fecha_firma IS NOT NULL
     AND (OLD.encargado_id IS DISTINCT FROM NEW.encargado_id OR NEW.fecha_firma IS NULL
          OR date_trunc('month', OLD.fecha_firma) <> date_trunc('month', NEW.fecha_firma)) THEN
    PERFORM private.recalc_incentivos(OLD.encargado_id, OLD.fecha_firma);
  END IF;
  IF NEW.encargado_id IS NOT NULL AND NEW.fecha_firma IS NOT NULL THEN
    PERFORM private.recalc_incentivos(NEW.encargado_id, NEW.fecha_firma);
  END IF;
  RETURN NULL;
END $function$;

-- PARTE 4: quitar marca histórica con monto y estado
DROP FUNCTION IF EXISTS public.cambiar_historica(uuid, boolean, text);
CREATE FUNCTION public.cambiar_historica(_venta_id uuid, _es_historica boolean, _motivo text,
  _monto numeric DEFAULT NULL, _estado text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar si una venta es histórica.'; END IF;
  IF coalesce(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
  SELECT * INTO v FROM public.venta WHERE id = _venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v.es_historica = _es_historica THEN RAISE EXCEPTION 'La venta ya tiene ese valor.'; END IF;
  IF NOT _es_historica THEN
    IF v.anulado OR v.desistida THEN RAISE EXCEPTION 'La venta está anulada o desistida.'; END IF;
    IF v.encargado_id IS NULL THEN RAISE EXCEPTION 'La venta no tiene encargado; asígnalo antes.'; END IF;
    IF _monto IS NULL OR _monto <= 0 THEN RAISE EXCEPTION 'Indica el monto de la comisión.'; END IF;
    IF _estado NOT IN ('pagada_antes_crm','pendiente') THEN RAISE EXCEPTION 'Elige el estado de la comisión.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.comision c WHERE c.venta_id = _venta_id AND c.tipo = 'comision' AND c.estado <> 'anulada') THEN
      INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, modalidad, fecha_generada, observacion)
      VALUES (_venta_id, v.encargado_id, 'comision', round(_monto, 2), _estado, 'historica',
              (now() AT TIME ZONE 'America/Lima')::date, btrim(_motivo));
    END IF;
  END IF;
  UPDATE public.venta SET es_historica = _es_historica, motivo_cambio_historica = btrim(_motivo) WHERE id = _venta_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.cambiar_historica(uuid, boolean, text, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cambiar_historica(uuid, boolean, text, numeric, text) TO authenticated;

-- PARTE 2: inicial dividida
CREATE OR REPLACE FUNCTION public.registrar_inicial(_venta_id uuid, _metodo_comision text, _operacion_comision text,
  _metodo_resto text, _operacion_resto text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; cu record; v_com numeric; v_resto numeric; v_pago uuid;
BEGIN
  SELECT * INTO v FROM public.venta WHERE id = _venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF NOT (private.puede_cobrar() OR v.creado_por = auth.uid()) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF v.anulado OR v.importada THEN RAISE EXCEPTION 'No aplica a esta venta.'; END IF;
  SELECT c.id, c.monto_vigente INTO cu FROM public.cuota c WHERE c.venta_id = _venta_id AND c.numero = 0 AND NOT c.anulado;
  IF NOT FOUND THEN RAISE EXCEPTION 'La venta no tiene inicial.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pago_aplicacion a JOIN public.pago p ON p.id = a.pago_id
             WHERE a.cuota_id = cu.id AND NOT a.anulado AND NOT p.anulado) THEN
    RAISE EXCEPTION 'La inicial ya tiene pagos registrados.'; END IF;
  v_com := least(coalesce(private.config_vigente('monto_comision', coalesce(v.fecha_firma, v.fecha_venta)), 0), cu.monto_vigente);
  v_resto := round(cu.monto_vigente - v_com, 2);
  IF v_com > 0 THEN
    IF _metodo_comision IS NULL THEN RAISE EXCEPTION 'Elige el método de la comisión al vendedor.'; END IF;
    INSERT INTO public.pago (venta_id, fecha, monto, metodo, numero_operacion, notas, recibido_por)
    VALUES (_venta_id, v.fecha_venta, v_com, _metodo_comision,
            CASE WHEN _metodo_comision = 'efectivo' THEN NULL ELSE nullif(btrim(_operacion_comision),'') END,
            'Comisión al vendedor', 'vendedor') RETURNING id INTO v_pago;
    INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (v_pago, cu.id, v_com);
  END IF;
  IF v_resto > 0.005 THEN
    IF _metodo_resto IS NULL THEN RAISE EXCEPTION 'Elige el método del resto a la inmobiliaria.'; END IF;
    INSERT INTO public.pago (venta_id, fecha, monto, metodo, numero_operacion, notas, recibido_por)
    VALUES (_venta_id, v.fecha_venta, v_resto, _metodo_resto,
            CASE WHEN _metodo_resto = 'efectivo' THEN NULL ELSE nullif(btrim(_operacion_resto),'') END,
            'Resto a la inmobiliaria', 'inmobiliaria') RETURNING id INTO v_pago;
    INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (v_pago, cu.id, v_resto);
  END IF;
  PERFORM private.sync_cobro_vendedor(_venta_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_inicial(uuid, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.registrar_inicial(uuid, text, text, text, text) TO authenticated;

-- PARTE 5: incentivo solo ventas no importadas
CREATE OR REPLACE FUNCTION private.incentivos_calificados(_enc uuid, _mes date)
RETURNS TABLE(venta_id uuid, monto numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH e AS (
    SELECT v.id, v.fecha_firma, row_number() OVER (ORDER BY v.fecha_firma, v.creado_en, v.id) AS rn
    FROM public.venta v
    WHERE v.encargado_id = _enc AND NOT v.anulado AND NOT v.desistida AND NOT v.es_historica AND NOT v.importada
      AND v.fecha_firma >= date_trunc('month', _mes)::date
      AND v.fecha_firma < (date_trunc('month', _mes) + interval '1 month')::date
      AND EXISTS (SELECT 1 FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                  WHERE cu.venta_id = v.id AND cu.numero = 0 AND NOT cu.anulado AND ce.saldo <= 0.005))
  SELECT e.id, private.config_vigente('monto_incentivo', e.fecha_firma) FROM e
  WHERE e.rn >= coalesce(private.config_vigente('lote_minimo_incentivo', e.fecha_firma), 6)
$function$;

-- Resumen con nuevos estados
CREATE OR REPLACE VIEW public.comision_resumen WITH (security_invoker = true) AS
 SELECT encargado_id,
    COALESCE(sum(monto) FILTER (WHERE estado = 'pendiente'), 0) AS pendiente,
    COALESCE(sum(monto) FILTER (WHERE estado = 'retenido'), 0) AS retenido,
    COALESCE(sum(monto) FILTER (WHERE estado = 'por_pagar'), 0) AS por_pagar,
    COALESCE(sum(monto) FILTER (WHERE estado = 'pagada'), 0) AS pagado,
    COALESCE(sum(monto) FILTER (WHERE estado = 'pendiente_cobro_vendedor'), 0) AS pendiente_cobro,
    COALESCE(sum(monto) FILTER (WHERE estado = 'cobrada_vendedor'), 0) AS cobrada_vendedor,
    COALESCE(sum(monto) FILTER (WHERE estado = 'pagada_antes_crm'), 0) AS pagada_antes_crm
   FROM public.comision
  GROUP BY encargado_id;
