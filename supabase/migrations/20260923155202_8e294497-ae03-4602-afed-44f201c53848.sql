ALTER TABLE public.pago
  ADD COLUMN origen text NOT NULL DEFAULT 'manual',
  ADD COLUMN regularizacion_id uuid;
ALTER TABLE public.pago ADD CONSTRAINT pago_origen_check CHECK (origen IN ('manual','regularizacion'));
ALTER TABLE public.pago DROP CONSTRAINT pago_metodo_check;
ALTER TABLE public.pago ADD CONSTRAINT pago_metodo_check
  CHECK (metodo IN ('efectivo','transferencia','cheque','tarjeta','no_registrado'));
CREATE INDEX IF NOT EXISTS pago_regularizacion_idx ON public.pago(regularizacion_id) WHERE regularizacion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.regularizar_venta(
  _venta_id uuid, _modo text, _fecha date, _metodo text, _notas text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_venta record;
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  v_reg uuid := gen_random_uuid();
  v_total numeric;
  v_pago uuid;
  v_metodo text := coalesce(nullif(_metodo,''), 'no_registrado');
  c record;
BEGIN
  IF NOT private.tiene_rol(ARRAY['admin'::app_rol,'cobranza'::app_rol]) THEN
    RAISE EXCEPTION 'Solo administración o cobranza puede marcar una venta como pagada.';
  END IF;
  SELECT * INTO v_venta FROM public.venta WHERE id = _venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF v_venta.anulado THEN RAISE EXCEPTION 'La venta está anulada.'; END IF;
  IF _modo NOT IN ('unico','por_cuota') THEN RAISE EXCEPTION 'Modo inválido.'; END IF;

  SELECT coalesce(sum(ce.saldo),0) INTO v_total
  FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
  WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND ce.saldo > 0;
  IF v_total <= 0 THEN RAISE EXCEPTION 'La venta no tiene saldo pendiente.'; END IF;

  IF _modo = 'unico' THEN
    IF _fecha IS NULL THEN RAISE EXCEPTION 'Indica la fecha del pago.'; END IF;
    IF _fecha > v_hoy THEN RAISE EXCEPTION 'La fecha no puede ser futura.'; END IF;
    IF _fecha < v_venta.fecha_venta THEN RAISE EXCEPTION 'La fecha no puede ser anterior a la fecha de venta.'; END IF;
    INSERT INTO public.pago(venta_id, fecha, monto, metodo, notas, origen, regularizacion_id)
    VALUES (_venta_id, _fecha, v_total, v_metodo, nullif(_notas,''), 'regularizacion', v_reg)
    RETURNING id INTO v_pago;
    FOR c IN SELECT ce.cuota_id, ce.saldo FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
             WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND ce.saldo > 0 ORDER BY cu.numero LOOP
      INSERT INTO public.pago_aplicacion(pago_id, cuota_id, monto_aplicado) VALUES (v_pago, c.cuota_id, c.saldo);
    END LOOP;
  ELSE
    FOR c IN SELECT ce.cuota_id, ce.saldo, cu.fecha_vencimiento FROM public.cuota_estado ce JOIN public.cuota cu ON cu.id = ce.cuota_id
             WHERE cu.venta_id = _venta_id AND NOT cu.anulado AND ce.saldo > 0 ORDER BY cu.numero LOOP
      INSERT INTO public.pago(venta_id, fecha, monto, metodo, notas, origen, regularizacion_id)
      VALUES (_venta_id, LEAST(c.fecha_vencimiento, v_hoy), c.saldo, v_metodo, nullif(_notas,''), 'regularizacion', v_reg)
      RETURNING id INTO v_pago;
      INSERT INTO public.pago_aplicacion(pago_id, cuota_id, monto_aplicado) VALUES (v_pago, c.cuota_id, c.saldo);
    END LOOP;
  END IF;
  RETURN v_reg;
END $$;

CREATE OR REPLACE FUNCTION public.anular_regularizacion(_regularizacion_id uuid, _motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF coalesce(trim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo de la anulación.'; END IF;
  IF NOT private.puede_cobrar() THEN RAISE EXCEPTION 'No tienes permiso para anular pagos.'; END IF;
  UPDATE public.pago_aplicacion SET anulado = true, motivo_anulacion = trim(_motivo)
  WHERE NOT anulado AND pago_id IN (SELECT id FROM public.pago WHERE regularizacion_id = _regularizacion_id);
  UPDATE public.pago SET anulado = true, motivo_anulacion = trim(_motivo)
  WHERE regularizacion_id = _regularizacion_id AND NOT anulado;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'No hay pagos activos en esa regularización.'; END IF;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.regularizar_venta(uuid,text,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.anular_regularizacion(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regularizar_venta(uuid,text,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_regularizacion(uuid,text) TO authenticated;