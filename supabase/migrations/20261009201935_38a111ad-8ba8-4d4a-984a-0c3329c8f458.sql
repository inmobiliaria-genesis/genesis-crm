
CREATE OR REPLACE FUNCTION private.propuesta_excedente(_venta_id uuid, _monto numeric, _fecha date, _modo text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e uuid[]; v_d numeric; v_x numeric; v_sr numeric; v_resto numeric; v_n int; v_base numeric; v_cuota numeric;
  r jsonb; c record; i int := 0; v_m numeric; v_min date;
BEGIN
  v_e := private.cuotas_exigibles(_venta_id);
  SELECT coalesce(sum(saldo), 0) INTO v_d FROM public.cuota_estado WHERE cuota_id = ANY (v_e);
  v_x := round(_monto - v_d, 2);
  IF v_x <= 0.005 THEN RAISE EXCEPTION 'El pago no supera lo que se debe (%).', private.soles_txt(v_d); END IF;
  SELECT count(*), coalesce(sum(ce.saldo), 0), min(cu.fecha_vencimiento) INTO v_n, v_sr, v_min
    FROM public.cuota cu JOIN public.cuota_estado ce ON ce.cuota_id = cu.id
   WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND cu.numero >= 1 AND ce.saldo > 0.005 AND NOT (cu.id = ANY (v_e));
  IF v_n = 0 THEN RAISE EXCEPTION 'No hay cuotas siguientes que reprogramar.'; END IF;
  IF v_x > v_sr + 0.005 THEN RAISE EXCEPTION 'El pago supera el saldo total de la venta.'; END IF;
  r := jsonb_build_array(jsonb_build_object('fecha', least(coalesce(_fecha, v_min), v_min), 'monto', v_x));
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
