ALTER TABLE public.venta DROP CONSTRAINT venta_forma_pago_inicial_check;
ALTER TABLE public.venta ADD CONSTRAINT venta_forma_pago_inicial_check CHECK (forma_pago_inicial IS NULL OR forma_pago_inicial = ANY (ARRAY['transferencia','efectivo','yape','plin','sin_dato']));
ALTER TABLE public.pago DROP CONSTRAINT pago_metodo_check;
ALTER TABLE public.pago ADD CONSTRAINT pago_metodo_check CHECK (metodo IS NULL OR metodo = ANY (ARRAY['transferencia','efectivo','yape','plin','sin_dato']));

CREATE OR REPLACE FUNCTION public.fn_venta_metodo_inicial()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.forma_pago_inicial IS NULL THEN RAISE EXCEPTION 'Elige la forma de pago de la inicial.'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.forma_pago_inicial IS NULL AND OLD.forma_pago_inicial IS NOT NULL THEN
    RAISE EXCEPTION 'Elige la forma de pago de la inicial.'; END IF;
  IF NEW.forma_pago_inicial = 'sin_dato' AND NOT NEW.importada
     AND (TG_OP = 'INSERT' OR NEW.forma_pago_inicial IS DISTINCT FROM OLD.forma_pago_inicial) THEN
    RAISE EXCEPTION 'El método "Sin dato" solo se permite en ventas históricas.'; END IF;
  IF NEW.forma_pago_inicial IS NULL OR NEW.forma_pago_inicial IN ('efectivo','sin_dato') THEN NEW.operacion_inicial := NULL; END IF;
  NEW.operacion_inicial := nullif(btrim(NEW.operacion_inicial), '');
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_pago_metodo()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.metodo IN ('no_registrado', '') THEN NEW.metodo := NULL; END IF;
  NEW.numero_operacion := nullif(btrim(NEW.numero_operacion), '');
  IF NEW.metodo IS NULL OR NEW.metodo IN ('efectivo','sin_dato') THEN NEW.numero_operacion := NULL; END IF;
  IF NEW.metodo = 'sin_dato' AND (TG_OP = 'INSERT' OR NEW.metodo IS DISTINCT FROM OLD.metodo)
     AND NOT EXISTS (SELECT 1 FROM public.venta v WHERE v.id = NEW.venta_id AND (v.es_historica OR v.importada)) THEN
    RAISE EXCEPTION 'El método "Sin dato" solo se permite en pagos de ventas históricas.'; END IF;
  IF TG_OP = 'INSERT' AND NEW.metodo IS NULL AND NEW.origen <> 'regularizacion' THEN
    RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.metodo IS NOT NULL AND NEW.metodo IS NULL THEN
    RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_valida_venta()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_precio numeric; v_min numeric; v_max numeric;
BEGIN
  IF NEW.encargado_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND tipo = 'encargado' AND NOT anulado) THEN
      RAISE EXCEPTION 'El encargado debe ser un vendedor de tipo encargado.'; END IF;
    IF NOT NEW.importada AND NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El encargado no está activo.'; END IF;
  END IF;
  IF NEW.promotor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND tipo = 'promotor' AND NOT anulado) THEN
      RAISE EXCEPTION 'El promotor debe ser un vendedor de tipo promotor.'; END IF;
    IF NOT NEW.importada AND NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND estado = 'activo') THEN
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
    IF NOT NEW.importada AND NEW.inicial < v_min THEN RAISE EXCEPTION 'La cuota inicial mínima es %.', private.soles_txt(v_min); END IF;
    IF NEW.inicial > NEW.precio_acordado THEN RAISE EXCEPTION 'La inicial no puede superar el precio acordado.'; END IF;
    IF NEW.precio_acordado IS DISTINCT FROM NEW.precio_lista_momento
       AND (NEW.motivo_diferencia_precio IS NULL OR btrim(NEW.motivo_diferencia_precio) = '') THEN
      RAISE EXCEPTION 'Debe indicar el motivo de la diferencia de precio.'; END IF;
  ELSIF NEW.inicial IS DISTINCT FROM OLD.inicial AND NOT NEW.importada AND NEW.inicial < v_min THEN
    RAISE EXCEPTION 'La cuota inicial mínima es %.', private.soles_txt(v_min);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.crear_venta_historica(_venta jsonb, _titulares uuid[], _total_abonado numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_precio numeric; v_resto numeric; c record; v_monto numeric; v_pago uuid; v_fecha date; i int;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede registrar ventas históricas.'; END IF;
  IF _titulares IS NULL OR array_length(_titulares, 1) IS NULL THEN RAISE EXCEPTION 'Elige el titular principal.'; END IF;
  v_precio := (_venta->>'precio_acordado')::numeric;
  IF coalesce(_total_abonado, 0) < 0 THEN RAISE EXCEPTION 'El total abonado no puede ser negativo.'; END IF;
  IF coalesce(_total_abonado, 0) > v_precio + 0.005 THEN
    RAISE EXCEPTION 'El total abonado supera el precio acordado (%)', private.soles_txt(v_precio); END IF;

  INSERT INTO public.venta (lote_id, fecha_venta, fecha_firma, encargado_id, promotor_id, origen, fuente, referido_por_id,
    condicion, precio_acordado, motivo_diferencia_precio, inicial, forma_pago_inicial, plazo_meses, fecha_primera_cuota, notas, importada)
  VALUES ((_venta->>'lote_id')::uuid, (_venta->>'fecha_venta')::date, nullif(_venta->>'fecha_firma','')::date,
    nullif(_venta->>'encargado_id','')::uuid, nullif(_venta->>'promotor_id','')::uuid, _venta->>'origen',
    nullif(_venta->>'fuente',''), nullif(_venta->>'referido_por_id','')::uuid, _venta->>'condicion', v_precio,
    nullif(btrim(coalesce(_venta->>'motivo_diferencia_precio','')),''), (_venta->>'inicial')::numeric, 'sin_dato',
    (_venta->>'plazo_meses')::int, nullif(_venta->>'fecha_primera_cuota','')::date, nullif(btrim(coalesce(_venta->>'notas','')),''), true)
  RETURNING id, fecha_venta INTO v_id, v_fecha;

  FOR i IN 1..array_length(_titulares, 1) LOOP
    INSERT INTO public.venta_titular (venta_id, cliente_id, es_principal) VALUES (v_id, _titulares[i], i = 1);
  END LOOP;

  v_resto := coalesce(_total_abonado, 0);
  FOR c IN SELECT id, numero, fecha_vencimiento, monto_vigente FROM public.cuota
            WHERE venta_id = v_id AND NOT anulado ORDER BY numero LOOP
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
END $function$;
REVOKE ALL ON FUNCTION public.crear_venta_historica(jsonb, uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_venta_historica(jsonb, uuid[], numeric) TO authenticated;