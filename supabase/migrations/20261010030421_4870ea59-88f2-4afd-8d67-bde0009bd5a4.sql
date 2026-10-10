CREATE OR REPLACE FUNCTION public.fn_valida_venta()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_precio numeric; v_min numeric; v_max numeric; v_hist boolean; r record;
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
    IF coalesce(NEW.importada, false) AND current_setting('genesis.importacion_ventas', true) = '1' THEN
      -- Importación desde Excel: se permiten lotes con datos pendientes.
      SELECT l.anulado, m.tipo INTO r FROM public.lote l JOIN public.manzana m ON m.id = l.manzana_id WHERE l.id = NEW.lote_id;
      IF NOT FOUND OR r.anulado THEN RAISE EXCEPTION 'El lote no existe o está anulado.'; END IF;
      IF r.tipo IS DISTINCT FROM 'residencial' THEN
        RAISE EXCEPTION 'La manzana es de tipo mercado y no admite ventas ni apartados bajo este modelo.'; END IF;
    ELSE
      PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    END IF;
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

CREATE OR REPLACE FUNCTION public.importar_ventas_historicas(_filas jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f jsonb; t jsonb; v jsonb; v_lote uuid; v_tits uuid[]; v_cli uuid; v_dni text; v_nom text; w text[]; n int;
  v_ventas int := 0; v_clientes int := 0; v_precio_lote numeric; v_idx int := 0;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede importar ventas.'; END IF;
  IF jsonb_typeof(_filas) <> 'array' OR jsonb_array_length(_filas) = 0 THEN RAISE EXCEPTION 'No hay filas para importar.'; END IF;
  PERFORM set_config('genesis.importacion_ventas', '1', true);
  FOR f IN SELECT * FROM jsonb_array_elements(_filas) LOOP
    v_idx := v_idx + 1;
    v := f->'venta';
    v_lote := (v->>'lote_id')::uuid;
    IF EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = v_lote AND NOT r.anulado AND r.convertida_a_venta_id IS NULL
               AND r.estado_aprobacion IN ('aprobado','pendiente') AND r.fecha_limite >= CURRENT_DATE) THEN
      RAISE EXCEPTION 'Fila %: el lote tiene un apartado activo.', f->>'fila'; END IF;
    v_tits := ARRAY[]::uuid[];
    FOR t IN SELECT * FROM jsonb_array_elements(f->'titulares') LOOP
      v_dni := btrim(t->>'dni'); v_nom := regexp_replace(btrim(t->>'nombre'), '\s+', ' ', 'g');
      IF v_dni = '' OR v_nom = '' THEN RAISE EXCEPTION 'Fila %: falta DNI o nombre de un titular.', f->>'fila'; END IF;
      SELECT id INTO v_cli FROM public.cliente WHERE tipo_documento = 'DNI' AND numero_documento = v_dni AND NOT anulado LIMIT 1;
      IF v_cli IS NULL THEN
        w := string_to_array(initcap(lower(v_nom)), ' '); n := array_length(w, 1);
        INSERT INTO public.cliente (tipo_documento, numero_documento, apellidos, nombres, estado_aprobacion)
        VALUES ('DNI', v_dni,
          CASE WHEN n >= 3 THEN array_to_string(w[1:2], ' ') ELSE w[1] END,
          CASE WHEN n >= 3 THEN array_to_string(w[3:n], ' ') WHEN n = 2 THEN w[2] ELSE '' END,
          'aprobado')
        RETURNING id INTO v_cli;
        v_clientes := v_clientes + 1;
      END IF;
      IF v_cli = ANY(v_tits) THEN RAISE EXCEPTION 'Fila %: un titular está repetido.', f->>'fila'; END IF;
      v_tits := v_tits || v_cli;
    END LOOP;
    SELECT precio_lista INTO v_precio_lote FROM public.lote WHERE id = v_lote;
    IF v_precio_lote IS DISTINCT FROM (v->>'precio_acordado')::numeric THEN
      v := v || jsonb_build_object('motivo_diferencia_precio', 'Venta histórica importada desde Excel');
    END IF;
    PERFORM public.crear_venta_historica(v, v_tits, nullif(f->>'total_abonado','')::numeric);
    v_ventas := v_ventas + 1;
  END LOOP;
  RETURN jsonb_build_object('ventas', v_ventas, 'clientes', v_clientes);
END $function$;

REVOKE ALL ON FUNCTION public.importar_ventas_historicas(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_ventas_historicas(jsonb) TO authenticated;