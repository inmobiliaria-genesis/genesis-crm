
-- Históricas: permiten encargado/promotor que ya salió e inicial menor al mínimo
CREATE OR REPLACE FUNCTION public.fn_valida_venta()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_precio numeric; v_min numeric; v_max numeric; v_hist boolean;
BEGIN
  v_hist := coalesce(NEW.importada, false) OR coalesce(NEW.es_historica, false);
  IF NEW.encargado_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND tipo = 'encargado' AND NOT anulado) THEN
      RAISE EXCEPTION 'El encargado debe ser un vendedor de tipo encargado.'; END IF;
    IF NOT v_hist AND NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El encargado no está activo.'; END IF;
  END IF;
  IF NEW.promotor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND tipo = 'promotor' AND NOT anulado) THEN
      RAISE EXCEPTION 'El promotor debe ser un vendedor de tipo promotor.'; END IF;
    IF NOT v_hist AND NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El promotor no está activo.'; END IF;
  END IF;
  v_min := coalesce(private.config_vigente('inicial_minima'), 0);
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
    IF NOT v_hist AND NEW.inicial < v_min THEN RAISE EXCEPTION 'La cuota inicial mínima es %.', private.soles_txt(v_min); END IF;
    IF NEW.inicial > NEW.precio_acordado THEN RAISE EXCEPTION 'La inicial no puede superar el precio acordado.'; END IF;
    IF NEW.precio_acordado IS DISTINCT FROM NEW.precio_lista_momento
       AND (NEW.motivo_diferencia_precio IS NULL OR btrim(NEW.motivo_diferencia_precio) = '') THEN
      RAISE EXCEPTION 'Debe indicar el motivo de la diferencia de precio.'; END IF;
  ELSIF NEW.inicial IS DISTINCT FROM OLD.inicial AND NOT v_hist AND NEW.inicial < v_min THEN
    RAISE EXCEPTION 'La cuota inicial mínima es %.', private.soles_txt(v_min);
  END IF;
  RETURN NEW;
END $function$;

-- Vista previa: cronograma nuevo con los pagos vigentes reaplicados en orden
CREATE OR REPLACE FUNCTION public.simular_edicion_venta(_venta_id uuid, _precio_acordado numeric, _inicial numeric,
  _plazo_meses integer, _fecha_venta date, _fecha_primera_cuota date, _condicion text)
 RETURNS TABLE(numero integer, fecha_vencimiento date, monto numeric, pagado numeric, saldo numeric, estado text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_num int[] := '{}'; v_fec date[] := '{}'; v_mon numeric[] := '{}'; v_pag numeric[] := '{}';
  c record; p record; v_resto numeric; v_x numeric; i int; n int; v_suma numeric;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede editar ventas.'; END IF;
  FOR c IN SELECT * FROM public.simular_cronograma(_precio_acordado,
      CASE WHEN _condicion = 'contado' THEN _precio_acordado ELSE _inicial END,
      CASE WHEN _condicion = 'contado' THEN 1 ELSE _plazo_meses END, _fecha_venta, _fecha_primera_cuota, _condicion) LOOP
    v_num := v_num || c.numero; v_fec := v_fec || c.fecha_vencimiento; v_mon := v_mon || c.monto; v_pag := v_pag || 0::numeric;
  END LOOP;
  n := coalesce(array_length(v_num, 1), 0);
  FOR p IN SELECT pg.monto FROM public.pago pg WHERE pg.venta_id = _venta_id AND NOT pg.anulado
            ORDER BY pg.fecha, pg.creado_en, pg.id LOOP
    v_resto := p.monto;
    FOR i IN 1..n LOOP
      EXIT WHEN v_resto <= 0.005;
      v_x := least(v_resto, v_mon[i] - v_pag[i]);
      IF v_x > 0 THEN v_pag[i] := v_pag[i] + v_x; v_resto := round(v_resto - v_x, 2); END IF;
    END LOOP;
  END LOOP;
  FOR i IN 1..n LOOP
    numero := v_num[i]; fecha_vencimiento := v_fec[i]; monto := v_mon[i]; pagado := v_pag[i];
    saldo := v_mon[i] - v_pag[i];
    estado := CASE WHEN saldo <= 0.005 THEN 'pagada' WHEN v_pag[i] > 0 THEN 'parcial' ELSE 'pendiente' END;
    RETURN NEXT;
  END LOOP;
END $function$;

-- Edición de venta (solo admin, una transacción)
CREATE OR REPLACE FUNCTION public.editar_venta(_venta_id uuid, _cambios jsonb, _titulares uuid[], _motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.venta; v_new public.venta; k text; v_avisos jsonb := '[]'::jsonb;
  v_permitidos text[] := ARRAY['promotor_id','origen','fuente','referido_por_id','fecha_firma','forma_pago_inicial',
    'operacion_inicial','notas','fecha_venta','encargado_id','precio_acordado','inicial','plazo_meses','condicion',
    'fecha_primera_cuota','motivo_diferencia_precio','lote_id','precio_lista_momento'];
  v_crono text[] := ARRAY['precio_acordado','inicial','plazo_meses','condicion','fecha_primera_cuota'];
  v_filtrado jsonb := '{}'::jsonb; v_regen boolean := false; v_recalc boolean := false; v_lote boolean := false;
  v_tit_old uuid[]; v_desist boolean; v_suma numeric; v_min numeric; v_estado text; v_motivo text;
  c record; p record; v_resto numeric; v_x numeric; v_com record; v_monto numeric; i int;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede editar ventas.'; END IF;
  v_motivo := nullif(btrim(coalesce(_motivo, '')), '');
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'Indica el motivo de la edición.'; END IF;
  SELECT * INTO v_old FROM public.venta WHERE id = _venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_old.anulado THEN RAISE EXCEPTION 'Las ventas eliminadas no se pueden editar.'; END IF;

  FOR k IN SELECT jsonb_object_keys(coalesce(_cambios, '{}'::jsonb)) LOOP
    IF k = ANY (v_permitidos) THEN v_filtrado := v_filtrado || jsonb_build_object(k, _cambios->k); END IF;
  END LOOP;
  v_new := jsonb_populate_record(v_old, v_filtrado);
  IF v_new.condicion = 'contado' THEN v_new.plazo_meses := 1; v_new.inicial := v_new.precio_acordado; END IF;
  IF v_new.fecha_primera_cuota IS NULL THEN v_new.fecha_primera_cuota := v_new.fecha_venta + 30; END IF;

  FOREACH k IN ARRAY v_crono LOOP
    IF (to_jsonb(v_new)->k) IS DISTINCT FROM (to_jsonb(v_old)->k) THEN v_regen := true; END IF;
  END LOOP;
  v_recalc := v_new.fecha_venta IS DISTINCT FROM v_old.fecha_venta OR v_new.encargado_id IS DISTINCT FROM v_old.encargado_id;
  v_lote := v_new.lote_id IS DISTINCT FROM v_old.lote_id;

  SELECT v_old.desistida OR EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = _venta_id
     AND NOT d.anulado AND NOT d.revertido AND d.estado IN ('en_proceso','aceptado','devuelto')) INTO v_desist;
  IF v_desist AND (v_regen OR v_lote) THEN
    RAISE EXCEPTION 'No se puede modificar mientras la venta tenga un desistimiento'; END IF;

  IF v_regen THEN
    IF v_new.inicial > v_new.precio_acordado THEN RAISE EXCEPTION 'La inicial no puede superar el precio acordado.'; END IF;
    IF v_new.condicion NOT IN ('contado','financiado') OR v_new.plazo_meses < 1 THEN RAISE EXCEPTION 'Condición o plazo inválido.'; END IF;
    IF v_new.condicion = 'financiado' AND v_new.plazo_meses > coalesce(private.config_vigente('max_cuotas'), 120) THEN
      RAISE EXCEPTION 'El plazo no puede superar % cuotas.', coalesce(private.config_vigente('max_cuotas'), 120)::int; END IF;
    SELECT coalesce(sum(monto), 0) INTO v_suma FROM public.pago WHERE venta_id = _venta_id AND NOT anulado;
    IF v_suma > v_new.precio_acordado + 0.005 THEN
      RAISE EXCEPTION 'Los pagos registrados (%) superan el nuevo precio acordado', private.soles_txt(v_suma); END IF;
  END IF;

  IF v_new.inicial IS DISTINCT FROM v_old.inicial THEN
    v_min := coalesce(private.config_vigente('inicial_minima'), 0);
    IF v_new.condicion = 'financiado' AND v_new.inicial < v_min THEN
      IF v_old.es_historica OR v_old.importada THEN
        v_avisos := v_avisos || to_jsonb(format('La inicial es menor a %s', private.soles_txt(v_min)));
      ELSE RAISE EXCEPTION 'La cuota inicial mínima es %.', private.soles_txt(v_min); END IF;
    END IF;
  END IF;

  IF v_lote THEN
    PERFORM public.fn_valida_lote_comercializable(v_new.lote_id);
    SELECT le.estado INTO v_estado FROM private.lote_estado_calc() le WHERE le.lote_id = v_new.lote_id;
    IF coalesce(v_estado, '') <> 'disponible' THEN RAISE EXCEPTION 'El nuevo lote debe estar Libre.'; END IF;
  END IF;

  -- Bitácora por campo con motivo
  FOR k IN SELECT jsonb_object_keys(v_filtrado) LOOP
    IF (to_jsonb(v_new)->k) IS DISTINCT FROM (to_jsonb(v_old)->k) THEN
      INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
      VALUES ('venta', _venta_id::text, 'EDITAR', jsonb_build_object('campo', k, 'valor', to_jsonb(v_old)->k),
              jsonb_build_object('campo', k, 'valor', to_jsonb(v_new)->k, 'motivo', v_motivo), auth.uid());
    END IF;
  END LOOP;

  -- Regenerar cronograma: anular aplicaciones y cuotas vigentes (los pagos no se tocan)
  IF v_regen THEN
    UPDATE public.pago_aplicacion pa SET anulado = true, motivo_anulacion = 'Regeneración de cronograma: ' || v_motivo
      FROM public.cuota c WHERE c.id = pa.cuota_id AND c.venta_id = _venta_id AND NOT pa.anulado;
    UPDATE public.cuota SET anulado = true, motivo_anulacion = 'Regeneración de cronograma: ' || v_motivo
      WHERE venta_id = _venta_id AND NOT anulado;
  END IF;

  UPDATE public.venta SET
    promotor_id = v_new.promotor_id, origen = v_new.origen, fuente = v_new.fuente, referido_por_id = v_new.referido_por_id,
    fecha_firma = v_new.fecha_firma, forma_pago_inicial = v_new.forma_pago_inicial, operacion_inicial = v_new.operacion_inicial,
    notas = v_new.notas, fecha_venta = v_new.fecha_venta, encargado_id = v_new.encargado_id,
    motivo_cambio_encargado = CASE WHEN v_new.encargado_id IS DISTINCT FROM v_old.encargado_id THEN v_motivo ELSE motivo_cambio_encargado END,
    precio_acordado = v_new.precio_acordado, inicial = v_new.inicial, plazo_meses = v_new.plazo_meses,
    condicion = v_new.condicion, fecha_primera_cuota = v_new.fecha_primera_cuota,
    motivo_diferencia_precio = v_new.motivo_diferencia_precio, lote_id = v_new.lote_id,
    precio_lista_momento = v_new.precio_lista_momento
  WHERE id = _venta_id;

  IF v_regen THEN
    INSERT INTO public.cuota (venta_id, numero, fecha_vencimiento, monto_original, monto_vigente)
    SELECT _venta_id, s.numero, s.fecha_vencimiento, s.monto, s.monto
      FROM public.simular_cronograma(v_new.precio_acordado, v_new.inicial, v_new.plazo_meses, v_new.fecha_venta,
                                     v_new.fecha_primera_cuota, v_new.condicion) s;
    FOR p IN SELECT id, monto FROM public.pago WHERE venta_id = _venta_id AND NOT anulado ORDER BY fecha, creado_en, id LOOP
      v_resto := p.monto;
      FOR c IN SELECT cu.id, cu.monto_vigente - coalesce((SELECT sum(a.monto_aplicado) FROM public.pago_aplicacion a
                 JOIN public.pago pp ON pp.id = a.pago_id WHERE a.cuota_id = cu.id AND NOT a.anulado AND NOT pp.anulado), 0) AS saldo
                 FROM public.cuota cu WHERE cu.venta_id = _venta_id AND NOT cu.anulado ORDER BY cu.numero LOOP
        EXIT WHEN v_resto <= 0.005;
        v_x := least(v_resto, c.saldo);
        IF v_x > 0.005 THEN
          INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (p.id, c.id, v_x);
          v_resto := round(v_resto - v_x, 2);
        END IF;
      END LOOP;
    END LOOP;
  ELSIF v_new.fecha_venta IS DISTINCT FROM v_old.fecha_venta THEN
    UPDATE public.cuota SET fecha_vencimiento = v_new.fecha_venta WHERE venta_id = _venta_id AND numero = 0 AND NOT anulado;
  END IF;

  -- Titulares
  IF _titulares IS NOT NULL THEN
    IF array_length(_titulares, 1) IS NULL THEN RAISE EXCEPTION 'Elige el titular principal.'; END IF;
    SELECT array_agg(cliente_id ORDER BY es_principal DESC, creado_en) INTO v_tit_old
      FROM public.venta_titular WHERE venta_id = _venta_id AND NOT anulado;
    IF v_tit_old IS DISTINCT FROM _titulares THEN
      UPDATE public.venta_titular SET anulado = true, motivo_anulacion = v_motivo WHERE venta_id = _venta_id AND NOT anulado;
      FOR i IN 1..array_length(_titulares, 1) LOOP
        INSERT INTO public.venta_titular (venta_id, cliente_id, es_principal) VALUES (_venta_id, _titulares[i], i = 1);
      END LOOP;
      INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
      VALUES ('venta', _venta_id::text, 'EDITAR', jsonb_build_object('campo', 'titulares', 'valor', to_jsonb(v_tit_old)),
              jsonb_build_object('campo', 'titulares', 'valor', to_jsonb(_titulares), 'motivo', v_motivo), auth.uid());
    END IF;
  END IF;

  -- Comisión e incentivos
  IF v_recalc THEN
    SELECT * INTO v_com FROM public.comision WHERE venta_id = _venta_id AND tipo = 'comision' AND estado <> 'anulada' LIMIT 1;
    IF FOUND THEN
      IF v_com.estado IN ('pagada','cobrada_vendedor','pagada_antes_crm') THEN
        v_avisos := v_avisos || to_jsonb('La comisión de esta venta ya fue pagada; el cambio no la modifica'::text);
      ELSE
        v_monto := CASE WHEN v_com.modalidad = 'cobro_directo'
                        THEN coalesce(private.config_vigente('monto_comision', v_new.fecha_venta), v_com.monto) ELSE v_com.monto END;
        IF v_new.encargado_id IS DISTINCT FROM v_com.encargado_id OR v_monto <> v_com.monto THEN
          UPDATE public.comision SET anulado = true, motivo_anulacion = 'Edición de venta: ' || v_motivo WHERE id = v_com.id;
          IF v_new.encargado_id IS NOT NULL THEN
            INSERT INTO public.comision (venta_id, encargado_id, tipo, monto, estado, modalidad, fecha_generada, observacion)
            VALUES (_venta_id, v_new.encargado_id, 'comision', v_monto, v_com.estado, v_com.modalidad,
                    (now() AT TIME ZONE 'America/Lima')::date, v_com.observacion);
            PERFORM private.sync_cobro_vendedor(_venta_id);
          END IF;
        END IF;
      END IF;
    END IF;
    PERFORM public.recalcular_mes(v_old.fecha_venta);
    IF date_trunc('month', v_new.fecha_venta) <> date_trunc('month', v_old.fecha_venta) THEN
      PERFORM public.recalcular_mes(v_new.fecha_venta);
    END IF;
  END IF;

  RETURN jsonb_build_object('avisos', v_avisos);
END $function$;

REVOKE EXECUTE ON FUNCTION public.editar_venta(uuid, jsonb, uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.simular_edicion_venta(uuid, numeric, numeric, integer, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venta(uuid, jsonb, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simular_edicion_venta(uuid, numeric, numeric, integer, date, date, text) TO authenticated;
