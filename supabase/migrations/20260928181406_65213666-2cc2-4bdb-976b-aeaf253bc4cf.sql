-- utilidades
CREATE OR REPLACE FUNCTION private.soles_txt(_n numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'S/ ' || CASE WHEN _n = trunc(_n) THEN to_char(_n, 'FM999,999,999,990') ELSE to_char(_n, 'FM999,999,999,990.00') END
$$;

-- ===== DESISTIMIENTO: columnas =====
ALTER TABLE public.desistimiento
  ADD COLUMN monto_descontar numeric NOT NULL DEFAULT 0,
  ADD COLUMN revertido boolean NOT NULL DEFAULT false,
  ADD COLUMN motivo_reversion text,
  ADD COLUMN revertido_por uuid,
  ADD COLUMN revertido_en timestamptz;
ALTER TABLE public.desistimiento DROP CONSTRAINT desistimiento_estado_check;
ALTER TABLE public.desistimiento ADD CONSTRAINT desistimiento_estado_check
  CHECK (estado = ANY (ARRAY['en_proceso','aceptado','devuelto','anulado','revertido']));

-- cálculo nuevo
CREATE OR REPLACE FUNCTION private.calc_devolucion(_venta_id uuid, _fecha date, _descontar numeric)
RETURNS TABLE(total_abonado numeric, monto_descontar numeric, porcentaje_devolucion numeric, base_calculo numeric, monto_devolver numeric, monto_retiene_empresa numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric; v_desc numeric; v_pct numeric; v_base numeric; v_dev numeric;
BEGIN
  SELECT coalesce(sum(p.monto),0) INTO v_total FROM public.pago p WHERE p.venta_id = _venta_id AND NOT p.anulado;
  SELECT coalesce(_descontar, v.inicial, 0) INTO v_desc FROM public.venta v WHERE v.id = _venta_id;
  v_pct := coalesce(private.config_vigente('porcentaje_devolucion', _fecha), 30);
  v_base := v_total - v_desc;
  v_dev := greatest(round(v_base * v_pct / 100, 2), 0);
  RETURN QUERY SELECT v_total, v_desc, v_pct, greatest(v_base,0), v_dev, v_total - v_dev;
END $$;

DROP FUNCTION IF EXISTS public.simular_desistimiento(uuid, date, numeric, boolean);
CREATE FUNCTION public.simular_desistimiento(_venta_id uuid, _fecha date, _monto_descontar numeric DEFAULT NULL)
RETURNS TABLE(total_abonado numeric, monto_descontar numeric, porcentaje_devolucion numeric, base_calculo numeric, monto_devolver numeric, monto_retiene_empresa numeric)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF NOT private.puede_ver_desistimiento(_venta_id) THEN RAISE EXCEPTION 'Sin acceso.'; END IF;
  RETURN QUERY SELECT * FROM private.calc_devolucion(_venta_id, coalesce(_fecha, (now() AT TIME ZONE 'America/Lima')::date), _monto_descontar);
END $$;
REVOKE ALL ON FUNCTION public.simular_desistimiento(uuid, date, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.simular_desistimiento(uuid, date, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_desistimiento_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v record; c record; v_devuelto numeric; v_cambia boolean; v_rev boolean := coalesce(current_setting('app.revertir', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v FROM public.venta WHERE id = NEW.venta_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
    IF v.anulado THEN RAISE EXCEPTION 'La venta está anulada.'; END IF;
    IF v.desistida THEN RAISE EXCEPTION 'La venta ya está desistida.'; END IF;
    IF EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.venta_id AND NOT d.anulado) THEN
      RAISE EXCEPTION 'La venta ya tiene un desistimiento vigente.'; END IF;
    NEW.aceptacion_disolucion := false; NEW.fecha_aceptacion_disolucion := NULL; NEW.motivo_cambio := NULL;
    NEW.revertido := false; NEW.motivo_reversion := NULL; NEW.revertido_por := NULL; NEW.revertido_en := NULL;
    SELECT * INTO c FROM private.calc_devolucion(NEW.venta_id, NEW.fecha_inicio, NULL);
    NEW.total_abonado := c.total_abonado; NEW.monto_descontar := c.monto_descontar;
    NEW.porcentaje_devolucion := c.porcentaje_devolucion; NEW.base_calculo := c.base_calculo;
    NEW.monto_devolver := c.monto_devolver; NEW.monto_retiene_empresa := c.monto_retiene_empresa;
    NEW.descontar_comision := NULL; NEW.monto_comision_descontado := c.monto_descontar;
    NEW.estado := 'en_proceso';
    RETURN NEW;
  END IF;

  IF OLD.revertido THEN
    IF v_rev THEN RETURN NEW; END IF;
    RETURN OLD; -- un caso revertido no cambia
  END IF;
  NEW.venta_id := OLD.venta_id; NEW.total_abonado := OLD.total_abonado; NEW.fecha_inicio := OLD.fecha_inicio;
  NEW.porcentaje_devolucion := OLD.porcentaje_devolucion; NEW.descontar_comision := OLD.descontar_comision;

  IF NEW.revertido AND NOT OLD.revertido THEN
    IF NOT v_rev THEN RAISE EXCEPTION 'Usa la opción "Revertir desistimiento".'; END IF;
    NEW.anulado := true; NEW.motivo_anulacion := NEW.motivo_reversion; NEW.estado := 'revertido';
    RETURN NEW;
  END IF;
  NEW.revertido := false;

  IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Un desistimiento anulado no puede reactivarse.'; END IF;
  IF NEW.anulado AND NOT OLD.anulado AND OLD.estado <> 'en_proceso' THEN
    RAISE EXCEPTION 'El desistimiento ya fue aceptado; no se puede anular (usa Revertir).'; END IF;
  IF OLD.anulado THEN RETURN OLD; END IF;
  IF OLD.aceptacion_disolucion AND NOT NEW.aceptacion_disolucion THEN
    RAISE EXCEPTION 'La aceptación de disolución no se puede quitar (usa Revertir).'; END IF;

  v_cambia := NEW.monto_descontar IS DISTINCT FROM OLD.monto_descontar
    OR NEW.observacion IS DISTINCT FROM OLD.observacion
    OR NEW.carta_prenotarial IS DISTINCT FROM OLD.carta_prenotarial
    OR NEW.fecha_carta_prenotarial IS DISTINCT FROM OLD.fecha_carta_prenotarial
    OR NEW.solicitud_liberacion IS DISTINCT FROM OLD.solicitud_liberacion
    OR NEW.fecha_solicitud_liberacion IS DISTINCT FROM OLD.fecha_solicitud_liberacion
    OR NEW.fecha_limite_devolucion IS DISTINCT FROM OLD.fecha_limite_devolucion;

  IF OLD.aceptacion_disolucion THEN
    NEW.carta_prenotarial := OLD.carta_prenotarial; NEW.fecha_carta_prenotarial := OLD.fecha_carta_prenotarial;
    NEW.solicitud_liberacion := OLD.solicitud_liberacion; NEW.fecha_solicitud_liberacion := OLD.fecha_solicitud_liberacion;
    NEW.fecha_aceptacion_disolucion := OLD.fecha_aceptacion_disolucion;
  END IF;

  IF v_cambia AND NOT (NEW.anulado AND NOT OLD.anulado) AND coalesce(btrim(NEW.motivo_cambio),'') = '' THEN
    RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;

  IF NEW.aceptacion_disolucion AND NOT OLD.aceptacion_disolucion THEN
    IF OLD.estado <> 'en_proceso' OR NEW.anulado THEN RAISE EXCEPTION 'Solo un desistimiento en proceso puede aceptarse.'; END IF;
    IF NEW.fecha_aceptacion_disolucion IS NULL THEN RAISE EXCEPTION 'Indica la fecha de aceptación de disolución.'; END IF;
  END IF;

  IF NEW.monto_descontar IS NULL OR NEW.monto_descontar < 0 THEN RAISE EXCEPTION 'El monto a descontar no puede ser negativo.'; END IF;
  NEW.monto_comision_descontado := NEW.monto_descontar;
  NEW.base_calculo := greatest(NEW.total_abonado - NEW.monto_descontar, 0);
  NEW.monto_devolver := greatest(round((NEW.total_abonado - NEW.monto_descontar) * NEW.porcentaje_devolucion / 100, 2), 0);
  NEW.monto_retiene_empresa := NEW.total_abonado - NEW.monto_devolver;

  SELECT coalesce(sum(monto),0) INTO v_devuelto FROM public.desistimiento_devolucion WHERE desistimiento_id = NEW.id AND NOT anulado;
  IF NEW.monto_descontar IS DISTINCT FROM OLD.monto_descontar AND NEW.monto_devolver < v_devuelto - 0.005 THEN
    RAISE EXCEPTION 'El nuevo monto a devolver sería menor que lo ya devuelto (%).', private.soles_txt(v_devuelto); END IF;

  IF NEW.anulado THEN NEW.estado := 'anulado';
  ELSIF NEW.aceptacion_disolucion THEN
    NEW.estado := CASE WHEN v_devuelto >= NEW.monto_devolver - 0.005 AND v_devuelto > 0 THEN 'devuelto' ELSE 'aceptado' END;
  ELSE NEW.estado := 'en_proceso';
  END IF;
  RETURN NEW;
END $$;

-- existentes: el monto a descontar histórico es el descuento que se usó
UPDATE public.desistimiento SET monto_descontar = coalesce(monto_comision_descontado, 0) WHERE monto_descontar = 0;

-- bitácora: acción REVERTIR
CREATE OR REPLACE FUNCTION public.fn_bitacora()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_accion text; v_id text;
begin
  v_id := new.id::text;
  if TG_OP = 'INSERT' then v_accion := 'INSERT';
  elsif coalesce((to_jsonb(new)->>'revertido')::boolean, false) and not coalesce((to_jsonb(old)->>'revertido')::boolean, false) then v_accion := 'REVERTIR';
  elsif new.anulado and not old.anulado then v_accion := 'ANULAR';
  else v_accion := 'UPDATE';
  end if;
  insert into public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
  values (TG_TABLE_NAME, v_id, v_accion, case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new), auth.uid());
  return null;
end $$;

-- venta desistida puede volver solo por reversión
CREATE OR REPLACE FUNCTION public.fn_venta_desistida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.desistida := false; RETURN NEW; END IF;
  IF OLD.desistida AND NOT NEW.desistida AND coalesce(current_setting('app.revertir', true), '') <> '1' THEN
    RAISE EXCEPTION 'Una venta desistida solo vuelve a estar activa revirtiendo su desistimiento.'; END IF;
  IF NEW.desistida AND NOT OLD.desistida AND NOT EXISTS (
    SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.id AND NOT d.anulado AND d.aceptacion_disolucion) THEN
    RAISE EXCEPTION 'La venta solo se marca desistida al aceptar la disolución de su desistimiento.'; END IF;
  RETURN NEW;
END $$;

-- comisiones: la reversión puede restaurar estados previos
CREATE OR REPLACE FUNCTION public.fn_comision_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'manual' THEN NEW.estado := 'pendiente'; NEW.mes := NULL; END IF;
    RETURN NEW;
  END IF;
  NEW.venta_id := OLD.venta_id; NEW.tipo := OLD.tipo; NEW.encargado_id := OLD.encargado_id; NEW.mes := OLD.mes;
  IF coalesce(current_setting('app.revertir', true), '') = '1' THEN RETURN NEW; END IF;
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

-- reversión
CREATE OR REPLACE FUNCTION public.motivo_no_revertir(_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_lote uuid; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  SELECT * INTO d FROM public.desistimiento WHERE id = _id;
  IF NOT FOUND OR NOT private.puede_ver_desistimiento(d.venta_id) THEN RETURN 'Desistimiento no encontrado.'; END IF;
  IF d.anulado OR d.revertido THEN RETURN 'El desistimiento ya no está vigente.'; END IF;
  IF EXISTS (SELECT 1 FROM public.desistimiento_devolucion x WHERE x.desistimiento_id = _id AND NOT x.anulado) THEN
    RETURN 'No se puede revertir: ya se registraron devoluciones'; END IF;
  SELECT lote_id INTO v_lote FROM public.venta WHERE id = d.venta_id;
  IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = v_lote AND v.id <> d.venta_id AND NOT v.anulado AND NOT v.desistida)
     OR EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = v_lote AND NOT r.anulado AND r.convertida_a_venta_id IS NULL
                AND r.fecha_limite >= v_hoy
                AND r.cliente_id NOT IN (SELECT vt.cliente_id FROM public.venta_titular vt WHERE vt.venta_id = d.venta_id AND NOT vt.anulado)) THEN
    RETURN 'No se puede revertir: el lote tiene una venta o apartado de otro cliente'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.revertir_desistimiento(_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_err text;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede revertir un desistimiento.'; END IF;
  IF coalesce(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo de la reversión.'; END IF;
  SELECT * INTO d FROM public.desistimiento WHERE id = _id FOR UPDATE;
  v_err := public.motivo_no_revertir(_id);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '%', v_err; END IF;
  PERFORM set_config('app.revertir', '1', true);
  IF d.aceptacion_disolucion THEN
    UPDATE public.comision c SET estado = 'pendiente', anulado = false, motivo_anulacion = NULL, anulado_por = NULL, anulado_en = NULL
     WHERE c.venta_id = d.venta_id AND c.tipo = 'comision' AND c.estado = 'anulada' AND c.motivo_anulacion = 'desistimiento'
       AND NOT EXISTS (SELECT 1 FROM public.comision o WHERE o.venta_id = d.venta_id AND o.tipo = 'comision' AND o.estado <> 'anulada')
       AND c.id = (SELECT x.id FROM public.comision x WHERE x.venta_id = d.venta_id AND x.tipo = 'comision' AND x.motivo_anulacion = 'desistimiento' ORDER BY x.modificado_en DESC LIMIT 1);
    UPDATE public.comision c SET estado = 'retenido', motivo_estado = NULL
     WHERE c.venta_id = d.venta_id AND c.tipo = 'incentivo' AND c.estado = 'perdida' AND c.motivo_estado = 'desistimiento'
       AND NOT EXISTS (SELECT 1 FROM public.comision o WHERE o.venta_id = d.venta_id AND o.tipo = 'incentivo' AND o.estado NOT IN ('anulada','perdida'));
    UPDATE public.venta SET desistida = false WHERE id = d.venta_id;
  END IF;
  UPDATE public.desistimiento SET revertido = true, motivo_reversion = btrim(_motivo), revertido_por = auth.uid(), revertido_en = now() WHERE id = _id;
  PERFORM set_config('app.revertir', '', true);
END $$;
REVOKE ALL ON FUNCTION public.motivo_no_revertir(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.revertir_desistimiento(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.motivo_no_revertir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revertir_desistimiento(uuid, text) TO authenticated;

-- ===== DEVOLUCIONES =====
ALTER TABLE public.desistimiento_devolucion ALTER COLUMN forma_pago DROP NOT NULL;
ALTER TABLE public.desistimiento_devolucion DROP CONSTRAINT desistimiento_devolucion_forma_pago_check;
UPDATE public.desistimiento_devolucion SET forma_pago = NULL WHERE forma_pago NOT IN ('transferencia','efectivo','yape','plin');
UPDATE public.desistimiento_devolucion SET numero_operacion = NULL WHERE numero_operacion IS NOT NULL AND (forma_pago IS NULL OR forma_pago = 'efectivo');
ALTER TABLE public.desistimiento_devolucion ADD CONSTRAINT desistimiento_devolucion_forma_pago_check
  CHECK (forma_pago IS NULL OR forma_pago IN ('transferencia','efectivo','yape','plin'));
ALTER TABLE public.desistimiento_devolucion ADD CONSTRAINT desistimiento_devolucion_operacion_len
  CHECK (numero_operacion IS NULL OR char_length(numero_operacion) <= 50);

CREATE OR REPLACE FUNCTION public.fn_devolucion_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d record; v_suma numeric; v_saldo numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.desistimiento_id := OLD.desistimiento_id;
    IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Una devolución anulada no puede reactivarse.'; END IF;
  END IF;
  NEW.numero_operacion := nullif(btrim(NEW.numero_operacion), '');
  IF NEW.forma_pago IS NULL OR NEW.forma_pago = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  IF TG_OP = 'INSERT' AND NEW.forma_pago IS NULL THEN RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.forma_pago IS NOT NULL AND NEW.forma_pago IS NULL THEN RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.anulado THEN RETURN NEW; END IF;
  SELECT * INTO d FROM public.desistimiento WHERE id = NEW.desistimiento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Desistimiento no encontrado.'; END IF;
  IF TG_OP = 'INSERT' AND d.estado NOT IN ('aceptado','devuelto') THEN
    RAISE EXCEPTION 'Solo se registran devoluciones con la disolución aceptada.'; END IF;
  IF NOT NEW.anulado AND (TG_OP = 'INSERT' OR NEW.monto <> OLD.monto) THEN
    SELECT coalesce(sum(monto),0) INTO v_suma FROM public.desistimiento_devolucion
     WHERE desistimiento_id = NEW.desistimiento_id AND NOT anulado AND id <> NEW.id;
    v_saldo := d.monto_devolver - v_suma;
    IF v_saldo <= 0.005 THEN RAISE EXCEPTION 'No queda saldo por devolver en este desistimiento.'; END IF;
    IF NEW.monto > v_saldo + 0.005 THEN
      RAISE EXCEPTION 'El monto supera el saldo por devolver (%)', private.soles_txt(v_saldo); END IF;
  END IF;
  RETURN NEW;
END $$;

-- ===== PAGOS =====
ALTER TABLE public.pago ALTER COLUMN metodo DROP NOT NULL;
ALTER TABLE public.pago DROP CONSTRAINT pago_metodo_check;
UPDATE public.pago SET metodo = NULL WHERE metodo NOT IN ('transferencia','efectivo','yape','plin');
UPDATE public.pago SET numero_operacion = NULL WHERE numero_operacion IS NOT NULL AND (metodo IS NULL OR metodo = 'efectivo');
ALTER TABLE public.pago ADD CONSTRAINT pago_metodo_check CHECK (metodo IS NULL OR metodo IN ('transferencia','efectivo','yape','plin'));
ALTER TABLE public.pago ADD CONSTRAINT pago_operacion_len CHECK (numero_operacion IS NULL OR char_length(numero_operacion) <= 50);

CREATE OR REPLACE FUNCTION public.fn_pago_metodo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.metodo IN ('no_registrado', '') THEN NEW.metodo := NULL; END IF;
  NEW.numero_operacion := nullif(btrim(NEW.numero_operacion), '');
  IF NEW.metodo IS NULL OR NEW.metodo = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  IF TG_OP = 'INSERT' AND NEW.metodo IS NULL AND NEW.origen <> 'regularizacion' THEN
    RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.metodo IS NOT NULL AND NEW.metodo IS NULL THEN
    RAISE EXCEPTION 'Elige el método de pago.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pago_metodo BEFORE INSERT OR UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_pago_metodo();

-- ===== VENTA: inicial mínima =====
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
END $$;