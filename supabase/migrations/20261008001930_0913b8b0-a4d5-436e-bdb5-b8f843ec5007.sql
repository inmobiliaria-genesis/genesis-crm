
CREATE OR REPLACE FUNCTION private.sumar_meses(_f date, _m int, _dia int) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT least((date_trunc('month', _f::timestamp) + make_interval(months => _m))::date + (_dia - 1),
               (date_trunc('month', _f::timestamp) + make_interval(months => _m + 1) - interval '1 day')::date)
$$;

CREATE OR REPLACE FUNCTION private.cronograma_json(_venta uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('numero', cu.numero, 'fecha', cu.fecha_vencimiento, 'monto', cu.monto_vigente,
    'pagado', ce.monto_pagado, 'saldo', ce.saldo) ORDER BY cu.numero), '[]'::jsonb)
  FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
  WHERE cu.venta_id = _venta AND NOT cu.anulado
$$;

CREATE OR REPLACE FUNCTION private.venta_reprogramable(_venta uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.venta;
BEGIN
  SELECT * INTO v FROM public.venta WHERE id = _venta;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v.anulado THEN RAISE EXCEPTION 'No se puede reprogramar una venta eliminada.'; END IF;
  IF v.desistida OR EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = _venta AND NOT d.anulado
      AND NOT d.revertido AND d.estado IN ('en_proceso','aceptado','devuelto')) THEN
    RAISE EXCEPTION 'No se puede reprogramar una venta con desistimiento en proceso o aceptado.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.valida_lista_cuotas(_cuotas jsonb, _total numeric, _etiqueta text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE e jsonb; v_suma numeric := 0; v_prev date; v_f date; v_m numeric;
BEGIN
  IF _cuotas IS NULL OR jsonb_typeof(_cuotas) <> 'array' OR jsonb_array_length(_cuotas) = 0 THEN
    RAISE EXCEPTION 'Indica al menos una cuota.'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(_cuotas) LOOP
    v_f := nullif(e->>'fecha', '')::date; v_m := nullif(e->>'monto', '')::numeric;
    IF v_f IS NULL THEN RAISE EXCEPTION 'Todas las cuotas deben tener fecha.'; END IF;
    IF v_m IS NULL OR v_m <= 0 THEN RAISE EXCEPTION 'Todas las cuotas deben tener un monto mayor a cero.'; END IF;
    IF round(v_m, 2) <> v_m THEN RAISE EXCEPTION 'Los montos deben tener como máximo dos decimales.'; END IF;
    IF v_prev IS NOT NULL AND v_f < v_prev THEN RAISE EXCEPTION 'Las fechas de las cuotas deben ir en orden ascendente.'; END IF;
    v_prev := v_f; v_suma := v_suma + v_m;
  END LOOP;
  IF abs(v_suma - _total) > 0.005 THEN
    RAISE EXCEPTION 'La suma de las cuotas (%) no coincide con %(%). Diferencia: %',
      private.soles_txt(v_suma), _etiqueta, private.soles_txt(_total), private.soles_txt(v_suma - _total); END IF;
END $$;

-- Núcleo: conserva cuotas pagadas, recorta las parciales a lo pagado, anula las pendientes y crea las nuevas a continuación.
CREATE OR REPLACE FUNCTION private.reprogramar_core(_venta_id uuid, _cuotas jsonb, _motivo text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venta public.venta; v_antes jsonb; v_saldo numeric; v_ult int; c record; e jsonb; i int := 0;
BEGIN
  SELECT * INTO v_venta FROM public.venta WHERE id = _venta_id FOR UPDATE;
  PERFORM private.venta_reprogramable(_venta_id);
  v_antes := private.cronograma_json(_venta_id);
  SELECT coalesce(sum(ce.saldo), 0) INTO v_saldo FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
   WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005;
  IF v_saldo <= 0.005 THEN RAISE EXCEPTION 'La venta no tiene cuotas pendientes que reprogramar.'; END IF;
  PERFORM private.valida_lista_cuotas(_cuotas, v_saldo, 'el saldo pendiente ');
  FOR c IN SELECT cu.id, ce.monto_pagado FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
            WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 LOOP
    IF c.monto_pagado > 0.005 THEN
      UPDATE public.cuota SET monto_vigente = c.monto_pagado WHERE id = c.id;
    ELSE
      UPDATE public.cuota SET anulado = true, motivo_anulacion = 'Reprogramación: ' || _motivo WHERE id = c.id;
    END IF;
  END LOOP;
  SELECT coalesce(max(numero), 0) INTO v_ult FROM public.cuota WHERE venta_id = _venta_id AND NOT anulado;
  FOR e IN SELECT * FROM jsonb_array_elements(_cuotas) LOOP
    i := i + 1;
    INSERT INTO public.cuota (venta_id, numero, fecha_vencimiento, monto_original, monto_vigente)
    VALUES (_venta_id, v_ult + i, (e->>'fecha')::date, (e->>'monto')::numeric, (e->>'monto')::numeric);
  END LOOP;
  INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
  VALUES ('venta', _venta_id::text, 'REPROGRAMAR', jsonb_build_object('cronograma', v_antes),
          jsonb_build_object('cronograma', private.cronograma_json(_venta_id), 'motivo', _motivo), auth.uid());
  PERFORM public.recalcular_mes(v_venta.fecha_venta);
  RETURN v_ult + 1;
END $$;

-- Propuesta de cuotas nuevas por modo
CREATE OR REPLACE FUNCTION private.propuesta_reprogramacion(_venta_id uuid, _modo text, _params jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := '[]'::jsonb; c record; v_total numeric; v_n int; v_base numeric; v_desde date; v_m int; v_dia int; i int;
BEGIN
  SELECT coalesce(sum(ce.saldo), 0) INTO v_total FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
   WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005;
  IF _modo = 'manual' THEN RETURN coalesce(_params->'cuotas', '[]'::jsonb);
  ELSIF _modo = 'redistribuir' THEN
    v_n := nullif(_params->>'cuotas', '')::int; v_desde := nullif(_params->>'desde', '')::date;
    IF v_n IS NULL OR v_n < 1 THEN RAISE EXCEPTION 'Indica la cantidad de cuotas.'; END IF;
    IF v_desde IS NULL THEN RAISE EXCEPTION 'Indica la fecha de la primera cuota.'; END IF;
    v_base := round(v_total / v_n, 2); v_dia := extract(day FROM v_desde)::int;
    FOR i IN 1..v_n LOOP
      r := r || jsonb_build_object('fecha', private.sumar_meses(v_desde, i - 1, v_dia),
        'monto', CASE WHEN i < v_n THEN v_base ELSE round(v_total - v_base * (v_n - 1), 2) END);
    END LOOP;
    RETURN r;
  END IF;
  IF _modo = 'pausar' THEN
    v_m := nullif(_params->>'meses', '')::int;
    IF v_m IS NULL OR v_m < 1 THEN RAISE EXCEPTION 'Indica cuántos meses pausar.'; END IF;
  ELSIF _modo = 'cambiar_dia' THEN
    v_dia := nullif(_params->>'dia', '')::int;
    IF v_dia IS NULL OR v_dia < 1 OR v_dia > 31 THEN RAISE EXCEPTION 'Indica un día entre 1 y 31.'; END IF;
  ELSE RAISE EXCEPTION 'Modo inválido.'; END IF;
  FOR c IN SELECT cu.fecha_vencimiento f, ce.saldo s FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
            WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 ORDER BY cu.numero LOOP
    r := r || jsonb_build_object('fecha', CASE WHEN _modo = 'pausar' THEN private.sumar_meses(c.f, v_m, extract(day FROM c.f)::int)
                                               ELSE private.sumar_meses(c.f, 0, v_dia) END, 'monto', c.s);
  END LOOP;
  RETURN r;
END $$;

-- Vista previa: cuotas que se conservan + cuotas nuevas
CREATE OR REPLACE FUNCTION private.vista_reprogramacion(_venta_id uuid, _cuotas jsonb, _pagar uuid[], _anticipo numeric)
RETURNS TABLE(numero int, fecha_vencimiento date, monto numeric, pagado numeric, saldo numeric, estado text, nueva boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; v_ult int := 0; e jsonb; i int := 0;
BEGIN
  FOR c IN SELECT cu.id, cu.numero n, cu.fecha_vencimiento f, cu.monto_vigente m, ce.monto_pagado p, ce.saldo s
            FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
            WHERE cu.venta_id = _venta_id AND NOT cu.anulado ORDER BY cu.numero LOOP
    IF c.id = ANY (coalesce(_pagar, '{}')) THEN
      numero := c.n; fecha_vencimiento := c.f; monto := c.m; pagado := c.m; saldo := 0; estado := 'pagada';
    ELSIF c.n = 0 OR c.s <= 0.005 THEN
      numero := c.n; fecha_vencimiento := c.f; monto := c.m; pagado := c.p; saldo := c.s;
      estado := CASE WHEN c.s <= 0.005 THEN 'pagada' WHEN c.p > 0 THEN 'parcial' ELSE 'pendiente' END;
    ELSIF c.p > 0.005 THEN
      numero := c.n; fecha_vencimiento := c.f; monto := c.p; pagado := c.p; saldo := 0; estado := 'pagada';
    ELSE CONTINUE; END IF;
    nueva := false; v_ult := greatest(v_ult, c.n); RETURN NEXT;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_cuotas, '[]'::jsonb)) LOOP
    i := i + 1; numero := v_ult + i; fecha_vencimiento := nullif(e->>'fecha', '')::date; monto := coalesce(nullif(e->>'monto', '')::numeric, 0);
    pagado := CASE WHEN i = 1 THEN coalesce(_anticipo, 0) ELSE 0 END; saldo := monto - pagado;
    estado := CASE WHEN saldo <= 0.005 THEN 'pagada' WHEN pagado > 0 THEN 'parcial' ELSE 'pendiente' END;
    nueva := true; RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.simular_reprogramacion(_venta_id uuid, _modo text, _params jsonb)
RETURNS TABLE(numero int, fecha_vencimiento date, monto numeric, pagado numeric, saldo numeric, estado text, nueva boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede reprogramar cronogramas.'; END IF;
  RETURN QUERY SELECT * FROM private.vista_reprogramacion(_venta_id, private.propuesta_reprogramacion(_venta_id, _modo, _params), NULL, 0);
END $$;

CREATE OR REPLACE FUNCTION public.reprogramar_cronograma(_venta_id uuid, _modo text, _params jsonb, _motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede reprogramar cronogramas.'; END IF;
  v_motivo := nullif(btrim(coalesce(_motivo, '')), '');
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'Indica el motivo de la reprogramación.'; END IF;
  PERFORM private.reprogramar_core(_venta_id, private.propuesta_reprogramacion(_venta_id, _modo, _params), v_motivo);
END $$;

-- ===== Pago mayor a lo que se debe =====
CREATE OR REPLACE FUNCTION private.cuotas_exigibles(_venta_id uuid) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT cu.id, cu.numero, cu.fecha_vencimiento f FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
             WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND ce.saldo > 0.005),
       h AS (SELECT (now() AT TIME ZONE 'America/Lima')::date d)
  SELECT coalesce(array_agg(id), '{}') FROM (
    SELECT id FROM p, h WHERE p.f < h.d
    UNION ALL
    (SELECT id FROM p, h WHERE p.f >= h.d ORDER BY numero LIMIT 1)) x
$$;

CREATE OR REPLACE FUNCTION public.monto_exigible(_venta_id uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(sum(ce.saldo), 0) FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
  WHERE cu.venta_id = _venta_id AND ce.cuota_id = ANY (private.cuotas_exigibles(_venta_id))
$$;

CREATE OR REPLACE FUNCTION private.propuesta_excedente(_venta_id uuid, _monto numeric, _fecha date, _modo text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e uuid[]; v_d numeric; v_x numeric; v_sr numeric; v_resto numeric; v_n int; v_base numeric; v_cuota numeric;
  r jsonb; c record; i int := 0; v_m numeric;
BEGIN
  v_e := private.cuotas_exigibles(_venta_id);
  SELECT coalesce(sum(saldo), 0) INTO v_d FROM public.cuota_estado WHERE cuota_id = ANY (v_e);
  v_x := round(_monto - v_d, 2);
  IF v_x <= 0.005 THEN RAISE EXCEPTION 'El pago no supera lo que se debe (%).', private.soles_txt(v_d); END IF;
  SELECT count(*), coalesce(sum(ce.saldo), 0), min(cu.fecha_vencimiento) INTO v_n, v_sr, _fecha
    FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
   WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 AND NOT (cu.id = ANY (v_e))
   HAVING true;
  IF v_n = 0 THEN RAISE EXCEPTION 'No hay cuotas siguientes que reprogramar.'; END IF;
  IF v_x > v_sr + 0.005 THEN RAISE EXCEPTION 'El pago supera el saldo total de la venta.'; END IF;
  r := jsonb_build_array(jsonb_build_object('fecha', least(_fecha, coalesce($3, _fecha)), 'monto', v_x));
  v_resto := round(v_sr - v_x, 2);
  IF v_resto > 0.005 THEN
    IF _modo = 'bajar_monto' THEN
      v_base := round(v_resto / v_n, 2);
      FOR c IN SELECT cu.fecha_vencimiento f FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 AND NOT (cu.id = ANY (v_e))
                ORDER BY cu.numero LOOP
        i := i + 1;
        r := r || jsonb_build_object('fecha', c.f, 'monto', CASE WHEN i < v_n THEN v_base ELSE round(v_resto - v_base * (v_n - 1), 2) END);
      END LOOP;
    ELSIF _modo = 'reducir_cuotas' THEN
      FOR c IN SELECT cu.fecha_vencimiento f, ce.saldo s FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
                WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 AND NOT (cu.id = ANY (v_e))
                ORDER BY cu.numero LOOP
        EXIT WHEN v_resto <= 0.005;
        IF v_cuota IS NULL THEN v_cuota := c.s; END IF;
        v_m := least(v_cuota, v_resto);
        r := r || jsonb_build_object('fecha', c.f, 'monto', v_m);
        v_resto := round(v_resto - v_m, 2);
      END LOOP;
    ELSE RAISE EXCEPTION 'Opción inválida.'; END IF;
  END IF;
  RETURN jsonb_build_object('exigibles', to_jsonb(v_e), 'debe', v_d, 'excedente', v_x, 'cuotas', r);
END $$;

CREATE OR REPLACE FUNCTION public.simular_pago_excedente(_venta_id uuid, _monto numeric, _fecha date, _modo text)
RETURNS TABLE(numero int, fecha_vencimiento date, monto numeric, pagado numeric, saldo numeric, estado text, nueva boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede reprogramar cronogramas.'; END IF;
  v := private.propuesta_excedente(_venta_id, _monto, _fecha, _modo);
  RETURN QUERY SELECT * FROM private.vista_reprogramacion(_venta_id, v->'cuotas',
    ARRAY(SELECT jsonb_array_elements_text(v->'exigibles'))::uuid[], (v->>'excedente')::numeric);
END $$;

CREATE OR REPLACE FUNCTION public.registrar_pago_excedente(_venta_id uuid, _fecha date, _monto numeric, _metodo text,
  _operacion text, _notas text, _recibido_por text, _modo text, _motivo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_motivo text; v_pago uuid; c record; v_num int; v_cuota uuid;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede reprogramar cronogramas.'; END IF;
  v_motivo := nullif(btrim(coalesce(_motivo, '')), '');
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'Indica el motivo de la reprogramación.'; END IF;
  PERFORM 1 FROM public.venta WHERE id = _venta_id FOR UPDATE;
  PERFORM private.venta_reprogramable(_venta_id);
  v := private.propuesta_excedente(_venta_id, _monto, _fecha, _modo);
  INSERT INTO public.pago (venta_id, fecha, monto, metodo, numero_operacion, notas, recibido_por)
  VALUES (_venta_id, _fecha, _monto, _metodo, nullif(btrim(coalesce(_operacion, '')), ''), nullif(btrim(coalesce(_notas, '')), ''),
          coalesce(nullif(_recibido_por, ''), 'inmobiliaria'))
  RETURNING id INTO v_pago;
  FOR c IN SELECT ce.cuota_id, ce.saldo FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
            WHERE ce.cuota_id = ANY (ARRAY(SELECT jsonb_array_elements_text(v->'exigibles'))::uuid[]) ORDER BY cu.numero LOOP
    INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (v_pago, c.cuota_id, c.saldo);
  END LOOP;
  v_num := private.reprogramar_core(_venta_id, v->'cuotas', v_motivo);
  SELECT id INTO v_cuota FROM public.cuota WHERE venta_id = _venta_id AND numero = v_num AND NOT anulado;
  INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (v_pago, v_cuota, (v->>'excedente')::numeric);
  RETURN v_pago;
END $$;

-- ===== Cuotas personalizadas al crear o editar =====
CREATE OR REPLACE FUNCTION private.reemplazar_cuotas(_venta_id uuid, _cuotas jsonb, _motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.venta; v_antes jsonb; e jsonb; i int := 0; p record; c record; v_resto numeric; v_x numeric;
BEGIN
  SELECT * INTO v FROM public.venta WHERE id = _venta_id FOR UPDATE;
  PERFORM private.venta_reprogramable(_venta_id);
  IF v.condicion <> 'financiado' THEN RAISE EXCEPTION 'Solo las ventas financiadas tienen cuotas personalizables.'; END IF;
  PERFORM private.valida_lista_cuotas(_cuotas, v.precio_acordado - v.inicial, 'el precio acordado menos la inicial ');
  v_antes := private.cronograma_json(_venta_id);
  UPDATE public.pago_aplicacion pa SET anulado = true, motivo_anulacion = 'Cuotas personalizadas: ' || _motivo
    FROM public.cuota cu WHERE cu.id = pa.cuota_id AND cu.venta_id = _venta_id AND NOT pa.anulado;
  UPDATE public.cuota SET anulado = true, motivo_anulacion = 'Cuotas personalizadas: ' || _motivo
   WHERE venta_id = _venta_id AND NOT anulado AND numero >= 1;
  FOR e IN SELECT * FROM jsonb_array_elements(_cuotas) LOOP
    i := i + 1;
    INSERT INTO public.cuota (venta_id, numero, fecha_vencimiento, monto_original, monto_vigente)
    VALUES (_venta_id, i, (e->>'fecha')::date, (e->>'monto')::numeric, (e->>'monto')::numeric);
  END LOOP;
  FOR p IN SELECT id, monto FROM public.pago WHERE venta_id = _venta_id AND NOT anulado ORDER BY fecha, creado_en, id LOOP
    v_resto := p.monto;
    FOR c IN SELECT ce.cuota_id, ce.saldo FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
              WHERE cu.venta_id = _venta_id ORDER BY cu.numero LOOP
      EXIT WHEN v_resto <= 0.005;
      v_x := least(v_resto, c.saldo);
      IF v_x > 0.005 THEN
        INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (p.id, c.cuota_id, v_x);
        v_resto := round(v_resto - v_x, 2);
      END IF;
    END LOOP;
  END LOOP;
  INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
  VALUES ('venta', _venta_id::text, 'REPROGRAMAR', jsonb_build_object('cronograma', v_antes),
          jsonb_build_object('cronograma', private.cronograma_json(_venta_id), 'motivo', _motivo), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.personalizar_cuotas(_venta_id uuid, _cuotas jsonb, _motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text; v_fecha date;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede personalizar cuotas.'; END IF;
  v_motivo := nullif(btrim(coalesce(_motivo, '')), '');
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'Indica el motivo.'; END IF;
  PERFORM private.reemplazar_cuotas(_venta_id, _cuotas, v_motivo);
  SELECT fecha_venta INTO v_fecha FROM public.venta WHERE id = _venta_id;
  PERFORM public.recalcular_mes(v_fecha);
END $$;

CREATE OR REPLACE FUNCTION public.editar_venta(_venta_id uuid, _cambios jsonb, _titulares uuid[], _motivo text, _cuotas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_fecha date;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede editar ventas.'; END IF;
  r := public.editar_venta(_venta_id, _cambios, _titulares, _motivo);
  IF _cuotas IS NOT NULL THEN
    PERFORM private.reemplazar_cuotas(_venta_id, _cuotas, btrim(_motivo));
    SELECT fecha_venta INTO v_fecha FROM public.venta WHERE id = _venta_id;
    PERFORM public.recalcular_mes(v_fecha);
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.crear_venta_historica(_venta jsonb, _titulares uuid[], _total_abonado numeric, _cuotas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_resto numeric; c record; v_monto numeric; v_pago uuid; v_fecha date; v_precio numeric;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar ventas históricas.'; END IF;
  IF _cuotas IS NULL THEN RETURN public.crear_venta_historica(_venta, _titulares, _total_abonado); END IF;
  v_precio := (_venta->>'precio_acordado')::numeric;
  IF coalesce(_total_abonado, 0) < 0 THEN RAISE EXCEPTION 'El total abonado no puede ser negativo.'; END IF;
  IF coalesce(_total_abonado, 0) > v_precio + 0.005 THEN
    RAISE EXCEPTION 'El total abonado supera el precio acordado (%)', private.soles_txt(v_precio); END IF;
  v_id := public.crear_venta_historica(_venta, _titulares, 0);
  PERFORM private.reemplazar_cuotas(v_id, _cuotas, 'Cuotas personalizadas al crear la venta');
  SELECT fecha_venta INTO v_fecha FROM public.venta WHERE id = v_id;
  v_resto := coalesce(_total_abonado, 0);
  FOR c IN SELECT id, numero, fecha_vencimiento, monto_vigente FROM public.cuota WHERE venta_id = v_id AND NOT anulado ORDER BY numero LOOP
    EXIT WHEN v_resto <= 0.005;
    v_monto := least(v_resto, c.monto_vigente);
    IF v_monto <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.pago (venta_id, fecha, monto, metodo, notas, origen, recibido_por)
    VALUES (v_id, CASE WHEN c.numero = 0 THEN v_fecha ELSE c.fecha_vencimiento END, v_monto, 'sin_dato',
            'Pago histórico registrado al crear la venta', 'manual', 'inmobiliaria')
    RETURNING id INTO v_pago;
    INSERT INTO public.pago_aplicacion (pago_id, cuota_id, monto_aplicado) VALUES (v_pago, c.id, v_monto);
    v_resto := round(v_resto - v_monto, 2);
  END LOOP;
  RETURN v_id;
END $$;

-- Vista previa de cuotas personalizadas con los pagos de la venta aplicados
CREATE OR REPLACE FUNCTION public.simular_cuotas_personalizadas(_venta_id uuid, _inicial numeric, _fecha_venta date, _cuotas jsonb)
RETURNS TABLE(numero int, fecha_vencimiento date, monto numeric, pagado numeric, saldo numeric, estado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fec date[]; v_mon numeric[]; v_pag numeric[]; e jsonb; p record; v_resto numeric; v_x numeric; i int; n int;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede personalizar cuotas.'; END IF;
  v_fec := ARRAY[_fecha_venta]; v_mon := ARRAY[_inicial]; v_pag := ARRAY[0::numeric];
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_cuotas, '[]'::jsonb)) LOOP
    v_fec := v_fec || nullif(e->>'fecha', '')::date; v_mon := v_mon || coalesce(nullif(e->>'monto', '')::numeric, 0); v_pag := v_pag || 0::numeric;
  END LOOP;
  n := array_length(v_mon, 1);
  IF _venta_id IS NOT NULL THEN
    FOR p IN SELECT pg.monto FROM public.pago pg WHERE pg.venta_id = _venta_id AND NOT pg.anulado ORDER BY pg.fecha, pg.creado_en, pg.id LOOP
      v_resto := p.monto;
      FOR i IN 1..n LOOP
        EXIT WHEN v_resto <= 0.005;
        v_x := least(v_resto, v_mon[i] - v_pag[i]);
        IF v_x > 0 THEN v_pag[i] := v_pag[i] + v_x; v_resto := round(v_resto - v_x, 2); END IF;
      END LOOP;
    END LOOP;
  END IF;
  FOR i IN 1..n LOOP
    numero := i - 1; fecha_vencimiento := v_fec[i]; monto := v_mon[i]; pagado := v_pag[i]; saldo := v_mon[i] - v_pag[i];
    estado := CASE WHEN saldo <= 0.005 THEN 'pagada' WHEN v_pag[i] > 0 THEN 'parcial' ELSE 'pendiente' END;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.simular_reprogramacion(uuid, text, jsonb), public.reprogramar_cronograma(uuid, text, jsonb, text),
  public.monto_exigible(uuid), public.simular_pago_excedente(uuid, numeric, date, text),
  public.registrar_pago_excedente(uuid, date, numeric, text, text, text, text, text, text),
  public.personalizar_cuotas(uuid, jsonb, text), public.editar_venta(uuid, jsonb, uuid[], text, jsonb),
  public.crear_venta_historica(jsonb, uuid[], numeric, jsonb), public.simular_cuotas_personalizadas(uuid, numeric, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simular_reprogramacion(uuid, text, jsonb), public.reprogramar_cronograma(uuid, text, jsonb, text),
  public.monto_exigible(uuid), public.simular_pago_excedente(uuid, numeric, date, text),
  public.registrar_pago_excedente(uuid, date, numeric, text, text, text, text, text, text),
  public.personalizar_cuotas(uuid, jsonb, text), public.editar_venta(uuid, jsonb, uuid[], text, jsonb),
  public.crear_venta_historica(jsonb, uuid[], numeric, jsonb), public.simular_cuotas_personalizadas(uuid, numeric, date, jsonb)
  TO authenticated;
