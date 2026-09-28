-- permitir borrado controlado
CREATE OR REPLACE FUNCTION public.fn_no_borrar() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if coalesce(current_setting('app.eliminar', true), '') = '1' then return old; end if;
  raise exception 'No se permite borrar registros. Use la anulación con motivo.';
end $$;

-- forma de pago de la inicial
ALTER TABLE public.venta ALTER COLUMN forma_pago_inicial DROP NOT NULL;
ALTER TABLE public.venta ADD COLUMN IF NOT EXISTS operacion_inicial text;
ALTER TABLE public.venta DROP CONSTRAINT IF EXISTS venta_forma_pago_inicial_check;
UPDATE public.venta SET forma_pago_inicial = NULL WHERE forma_pago_inicial NOT IN ('transferencia','efectivo','yape','plin');
ALTER TABLE public.venta ADD CONSTRAINT venta_forma_pago_inicial_check CHECK (forma_pago_inicial IS NULL OR forma_pago_inicial IN ('transferencia','efectivo','yape','plin'));
ALTER TABLE public.venta ADD CONSTRAINT venta_operacion_inicial_len CHECK (operacion_inicial IS NULL OR char_length(operacion_inicial) <= 50);

CREATE OR REPLACE FUNCTION public.fn_venta_metodo_inicial() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.forma_pago_inicial IS NULL THEN RAISE EXCEPTION 'Elige la forma de pago de la inicial.'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.forma_pago_inicial IS NULL AND OLD.forma_pago_inicial IS NOT NULL THEN
    RAISE EXCEPTION 'Elige la forma de pago de la inicial.'; END IF;
  IF NEW.forma_pago_inicial IS NULL OR NEW.forma_pago_inicial = 'efectivo' THEN NEW.operacion_inicial := NULL; END IF;
  NEW.operacion_inicial := nullif(btrim(NEW.operacion_inicial), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS venta_metodo_inicial ON public.venta;
CREATE TRIGGER venta_metodo_inicial BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_venta_metodo_inicial();

-- desistimiento: respetar monto a descontar al iniciar; solo admin lo cambia
CREATE OR REPLACE FUNCTION public.fn_desistimiento_valida()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v record; c record; v_devuelto numeric; v_cambia boolean; v_rev boolean := coalesce(current_setting('app.revertir', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v FROM public.venta WHERE id = NEW.venta_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
    IF v.anulado THEN RAISE EXCEPTION 'La venta está anulada.'; END IF;
    IF v.desistida THEN RAISE EXCEPTION 'La venta ya está desistida.'; END IF;
    IF EXISTS (SELECT 1 FROM public.desistimiento d WHERE d.venta_id = NEW.venta_id AND NOT d.anulado) THEN
      RAISE EXCEPTION 'La venta ya tiene un desistimiento vigente.'; END IF;
    IF NEW.monto_descontar IS NOT NULL AND NEW.monto_descontar < 0 THEN RAISE EXCEPTION 'El monto a descontar no puede ser negativo.'; END IF;
    IF NEW.monto_descontar IS NOT NULL AND abs(NEW.monto_descontar - v.inicial) > 0.005 THEN
      IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede cambiar el monto a descontar.'; END IF;
      IF coalesce(btrim(NEW.motivo_cambio),'') = '' THEN RAISE EXCEPTION 'Indica el motivo del cambio.'; END IF;
    ELSE
      NEW.motivo_cambio := NULL;
    END IF;
    NEW.aceptacion_disolucion := false; NEW.fecha_aceptacion_disolucion := NULL;
    NEW.revertido := false; NEW.motivo_reversion := NULL; NEW.revertido_por := NULL; NEW.revertido_en := NULL;
    SELECT * INTO c FROM private.calc_devolucion(NEW.venta_id, NEW.fecha_inicio, NEW.monto_descontar);
    NEW.total_abonado := c.total_abonado; NEW.monto_descontar := c.monto_descontar;
    NEW.porcentaje_devolucion := c.porcentaje_devolucion; NEW.base_calculo := c.base_calculo;
    NEW.monto_devolver := c.monto_devolver; NEW.monto_retiene_empresa := c.monto_retiene_empresa;
    NEW.descontar_comision := NULL; NEW.monto_comision_descontado := c.monto_descontar;
    NEW.estado := 'en_proceso';
    RETURN NEW;
  END IF;

  IF OLD.revertido THEN
    IF v_rev THEN RETURN NEW; END IF;
    RETURN OLD;
  END IF;
  NEW.venta_id := OLD.venta_id; NEW.total_abonado := OLD.total_abonado; NEW.fecha_inicio := OLD.fecha_inicio;
  NEW.porcentaje_devolucion := OLD.porcentaje_devolucion; NEW.descontar_comision := OLD.descontar_comision;

  IF NEW.revertido AND NOT OLD.revertido THEN
    IF NOT v_rev THEN RAISE EXCEPTION 'Usa la opción "Revertir desistimiento".'; END IF;
    NEW.anulado := true; NEW.motivo_anulacion := NEW.motivo_reversion; NEW.estado := 'revertido';
    RETURN NEW;
  END IF;
  NEW.revertido := false;

  IF NEW.monto_descontar IS DISTINCT FROM OLD.monto_descontar AND NOT private.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el monto a descontar.'; END IF;

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
END $function$;

-- inicial mínima visible para todos
CREATE OR REPLACE FUNCTION public.inicial_minima() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.config_vigente('inicial_minima')
$$;
REVOKE ALL ON FUNCTION public.inicial_minima() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inicial_minima() TO authenticated;

-- eliminar venta
CREATE OR REPLACE FUNCTION public.eliminar_venta(_venta_id uuid, _motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_copia jsonb; v_des uuid[];
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede eliminar ventas.'; END IF;
  IF coalesce(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo.'; END IF;
  SELECT * INTO v FROM public.venta WHERE id = _venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.comision WHERE venta_id = _venta_id AND estado = 'pagada' AND tipo IN ('comision','manual')) THEN
    RAISE EXCEPTION 'No se puede eliminar: la venta tiene una comisión ya pagada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.comision WHERE venta_id = _venta_id AND estado = 'pagada' AND tipo = 'incentivo') THEN
    RAISE EXCEPTION 'No se puede eliminar: la venta tiene un incentivo ya pagado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.desistimiento_devolucion x JOIN public.desistimiento d ON d.id = x.desistimiento_id
             WHERE d.venta_id = _venta_id AND NOT x.anulado) THEN
    RAISE EXCEPTION 'No se puede eliminar: la venta tiene un desistimiento con devoluciones registradas.'; END IF;

  SELECT array_agg(id) INTO v_des FROM public.desistimiento WHERE venta_id = _venta_id;
  v_copia := jsonb_build_object(
    'motivo', _motivo,
    'venta', to_jsonb(v),
    'titulares', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.venta_titular t WHERE t.venta_id = _venta_id),
    'cuotas', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.numero), '[]') FROM public.cuota c WHERE c.venta_id = _venta_id),
    'pagos', (SELECT coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('aplicaciones',
               (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM public.pago_aplicacion a WHERE a.pago_id = p.id))), '[]')
              FROM public.pago p WHERE p.venta_id = _venta_id),
    'desistimientos', (SELECT coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('devoluciones',
               (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM public.desistimiento_devolucion x WHERE x.desistimiento_id = d.id))), '[]')
              FROM public.desistimiento d WHERE d.venta_id = _venta_id),
    'comisiones', (SELECT coalesce(jsonb_agg(to_jsonb(k)), '[]') FROM public.comision k WHERE k.venta_id = _venta_id)
  );
  INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
  VALUES ('venta', _venta_id::text, 'ELIMINAR', v_copia, jsonb_build_object('motivo', _motivo), auth.uid());

  PERFORM set_config('app.eliminar', '1', true);
  DELETE FROM public.pago_aplicacion WHERE pago_id IN (SELECT id FROM public.pago WHERE venta_id = _venta_id)
     OR cuota_id IN (SELECT id FROM public.cuota WHERE venta_id = _venta_id);
  DELETE FROM public.pago WHERE venta_id = _venta_id;
  DELETE FROM public.cuota WHERE venta_id = _venta_id;
  IF v_des IS NOT NULL THEN
    DELETE FROM public.desistimiento_devolucion WHERE desistimiento_id = ANY(v_des);
    DELETE FROM public.desistimiento WHERE id = ANY(v_des);
  END IF;
  DELETE FROM public.comision WHERE venta_id = _venta_id;
  UPDATE public.reserva SET convertida_a_venta_id = NULL, anulado = true,
         motivo_anulacion = coalesce(motivo_anulacion, 'Venta eliminada: ' || _motivo)
   WHERE convertida_a_venta_id = _venta_id;
  DELETE FROM public.venta_titular WHERE venta_id = _venta_id;
  DELETE FROM public.venta WHERE id = _venta_id;
  PERFORM set_config('app.eliminar', '', true);

  IF v.fecha_firma IS NOT NULL THEN PERFORM public.recalcular_mes(v.fecha_firma); END IF;
END $$;
REVOKE ALL ON FUNCTION public.eliminar_venta(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_venta(uuid, text) TO authenticated;

-- eliminar cliente
CREATE OR REPLACE FUNCTION public.eliminar_cliente(_cliente_id uuid, _motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede eliminar clientes.'; END IF;
  IF coalesce(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo.'; END IF;
  SELECT * INTO c FROM public.cliente WHERE id = _cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.venta_titular WHERE cliente_id = _cliente_id)
     OR EXISTS (SELECT 1 FROM public.reserva WHERE cliente_id = _cliente_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el cliente tiene ventas o apartados registrados.'; END IF;
  INSERT INTO public.bitacora (tabla, registro_id, accion, valores_antes, valores_despues, usuario_id)
  VALUES ('cliente', _cliente_id::text, 'ELIMINAR', to_jsonb(c), jsonb_build_object('motivo', _motivo), auth.uid());
  PERFORM set_config('app.eliminar', '1', true);
  DELETE FROM public.cliente WHERE id = _cliente_id;
  PERFORM set_config('app.eliminar', '', true);
END $$;
REVOKE ALL ON FUNCTION public.eliminar_cliente(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_cliente(uuid, text) TO authenticated;