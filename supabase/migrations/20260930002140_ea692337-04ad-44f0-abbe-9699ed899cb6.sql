
-- PARTE 1: ESSALUD en planilla
ALTER TABLE public.planilla_linea ADD COLUMN tipo text NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona','essalud'));
ALTER TABLE public.planilla_linea ALTER COLUMN personal_id DROP NOT NULL;
ALTER TABLE public.planilla_linea ADD COLUMN gasto_id uuid REFERENCES public.gasto(id);
ALTER TABLE public.gasto ADD COLUMN planilla_linea_id uuid REFERENCES public.planilla_linea(id);
CREATE UNIQUE INDEX planilla_linea_essalud_mes_uq ON public.planilla_linea(mes) WHERE tipo = 'essalud' AND NOT anulado;

CREATE OR REPLACE FUNCTION public.fn_valida_planilla()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN
  NEW.mes := date_trunc('month', NEW.mes)::date;
  IF TG_OP = 'UPDATE' THEN
    NEW.tipo := OLD.tipo; NEW.personal_id := OLD.personal_id;
    IF coalesce(current_setting('app.gasto_auto', true), '') <> '1' THEN NEW.gasto_id := OLD.gasto_id; END IF;
  ELSE
    NEW.gasto_id := NULL;
  END IF;
  IF NEW.tipo = 'persona' AND NEW.personal_id IS NULL THEN RAISE EXCEPTION 'Indica la persona.'; END IF;
  IF NEW.tipo = 'essalud' THEN NEW.personal_id := NULL; END IF;
  IF NEW.pagado THEN
    IF NEW.fecha_pago IS NULL OR NEW.metodo IS NULL THEN RAISE EXCEPTION 'Indica fecha y método del pago.'; END IF;
    IF NEW.metodo = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  ELSE
    NEW.fecha_pago := NULL; NEW.metodo := NULL; NEW.numero_operacion := NULL;
  END IF;
  RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.generar_planilla(_mes date)
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_mes date := date_trunc('month', _mes)::date; n integer; v_essalud numeric;
BEGIN
  IF NOT private.puede_gastos() THEN RAISE EXCEPTION 'No tienes permiso para generar la planilla.'; END IF;
  IF EXISTS (SELECT 1 FROM public.planilla_linea WHERE mes = v_mes AND NOT anulado) THEN
    RAISE EXCEPTION 'La planilla de este mes ya fue generada.';
  END IF;
  INSERT INTO public.planilla_linea (mes, personal_id, monto, tipo)
  SELECT v_mes, id, monto_mensual, 'persona' FROM public.personal WHERE activo AND NOT anulado ORDER BY nombre;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'No hay personal activo.'; END IF;
  SELECT valor INTO v_essalud FROM public.config
   WHERE clave = 'essalud_mensual' AND activo AND NOT anulado
     AND vigente_desde <= (v_mes + interval '1 month' - interval '1 day')::date
   ORDER BY vigente_desde DESC, creado_en DESC LIMIT 1;
  IF v_essalud IS NULL THEN RAISE EXCEPTION 'Falta el ajuste "ESSALUD mensual" en Configuración.'; END IF;
  INSERT INTO public.planilla_linea (mes, personal_id, monto, tipo) VALUES (v_mes, NULL, v_essalud, 'essalud');
  RETURN n + 1;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_planilla_essalud_gasto()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cat uuid; v_sub uuid; v_gasto uuid; v_pagada boolean := NEW.pagado AND NOT NEW.anulado;
BEGIN
  IF NEW.tipo <> 'essalud' THEN RETURN NULL; END IF;
  PERFORM set_config('app.gasto_auto', '1', true);
  IF v_pagada AND NEW.gasto_id IS NULL THEN
    SELECT id INTO v_cat FROM public.gasto_categoria WHERE lower(nombre) = 'obligaciones laborales' AND NOT anulado LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Falta la categoría "Obligaciones laborales" en Gastos.'; END IF;
    SELECT id INTO v_sub FROM public.gasto_subcategoria WHERE categoria_id = v_cat AND lower(nombre) = 'essalud' AND NOT anulado LIMIT 1;
    IF v_sub IS NULL THEN RAISE EXCEPTION 'Falta la subcategoría "ESSALUD" en Obligaciones laborales.'; END IF;
    INSERT INTO public.gasto (fecha, categoria_id, subcategoria_id, monto, metodo, numero_operacion, comprobante_path, notas, planilla_linea_id)
    VALUES (NEW.fecha_pago, v_cat, v_sub, NEW.monto, NEW.metodo, NEW.numero_operacion, NEW.comprobante_path,
            'ESSALUD de planilla ' || to_char(NEW.mes, 'MM/YYYY'), NEW.id)
    RETURNING id INTO v_gasto;
    UPDATE public.planilla_linea SET gasto_id = v_gasto WHERE id = NEW.id;
  ELSIF NOT v_pagada AND NEW.gasto_id IS NOT NULL THEN
    UPDATE public.gasto SET anulado = true, motivo_anulacion = 'Pago de ESSALUD anulado en Planilla'
     WHERE id = NEW.gasto_id AND NOT anulado;
    UPDATE public.planilla_linea SET gasto_id = NULL WHERE id = NEW.id;
  ELSIF v_pagada AND NEW.gasto_id IS NOT NULL THEN
    UPDATE public.gasto SET fecha = NEW.fecha_pago, monto = NEW.monto, metodo = NEW.metodo,
      numero_operacion = NEW.numero_operacion, comprobante_path = NEW.comprobante_path
     WHERE id = NEW.gasto_id AND NOT anulado
       AND (fecha, monto, metodo, numero_operacion, comprobante_path) IS DISTINCT FROM (NEW.fecha_pago, NEW.monto, NEW.metodo, NEW.numero_operacion, NEW.comprobante_path);
  END IF;
  PERFORM set_config('app.gasto_auto', '', true);
  RETURN NULL;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_planilla_essalud_gasto() FROM public, anon, authenticated;
CREATE TRIGGER planilla_linea_zz_essalud_gasto AFTER INSERT OR UPDATE OF pagado, anulado, fecha_pago, monto, metodo, numero_operacion, comprobante_path
  ON public.planilla_linea FOR EACH ROW EXECUTE FUNCTION public.fn_planilla_essalud_gasto();

-- El gasto automático se anula junto con el pago aunque lo haga contabilidad
CREATE OR REPLACE FUNCTION public.fn_anular_solo_admin()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN
  IF NEW.anulado AND NOT OLD.anulado AND NOT private.es_admin()
     AND NOT (TG_TABLE_NAME = 'gasto' AND coalesce(current_setting('app.gasto_auto', true), '') = '1') THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar este registro.';
  END IF;
  RETURN NEW; END $function$;

-- Gastos automáticos de planilla no se editan desde Gastos
CREATE OR REPLACE FUNCTION public.fn_valida_gasto()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE c record; s record; v_auto boolean := coalesce(current_setting('app.gasto_auto', true), '') = '1';
BEGIN
  IF (NEW.comision_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.comision_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde una comisión o incentivo; modifícalo desde Comisiones.';
  END IF;
  IF (NEW.deuda_abono_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.deuda_abono_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde un abono a una deuda; modifícalo desde Deudas.';
  END IF;
  IF (NEW.planilla_linea_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.planilla_linea_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde la Planilla; modifícalo desde Planilla.';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.comision_id := OLD.comision_id; NEW.deuda_abono_id := OLD.deuda_abono_id; NEW.planilla_linea_id := OLD.planilla_linea_id; END IF;
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

-- La categoría Planilla suma solo sueldos netos
CREATE OR REPLACE FUNCTION public.resumen_gastos(_mes date)
 RETURNS TABLE(categoria_id uuid, categoria text, subcategoria_id uuid, subcategoria text, orden_cat integer, orden_sub integer, pagado numeric, tope numeric, diferencia numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH m AS (SELECT date_trunc('month', _mes)::date AS ini, (date_trunc('month', _mes) + interval '1 month')::date AS fin),
  g AS (SELECT g.categoria_id, g.subcategoria_id, g.monto FROM public.gasto g, m WHERE NOT g.anulado AND g.fecha >= m.ini AND g.fecha < m.fin),
  pl AS (SELECT coalesce(sum(monto),0) AS total FROM public.planilla_linea p, m WHERE NOT p.anulado AND p.pagado AND p.tipo = 'persona' AND p.mes = m.ini)
  SELECT c.id, c.nombre, NULL::uuid, NULL::text, c.orden, -1,
    CASE WHEN c.tipo = 'planilla' THEN (SELECT total FROM pl) ELSE coalesce((SELECT sum(monto) FROM g WHERE g.categoria_id = c.id),0) END,
    c.tope,
    c.tope - CASE WHEN c.tipo = 'planilla' THEN (SELECT total FROM pl) ELSE coalesce((SELECT sum(monto) FROM g WHERE g.categoria_id = c.id),0) END
  FROM public.gasto_categoria c WHERE NOT c.anulado AND private.puede_gastos()
  UNION ALL
  SELECT c.id, c.nombre, s.id, s.nombre, c.orden, s.orden,
    coalesce((SELECT sum(monto) FROM g WHERE g.subcategoria_id = s.id),0), s.tope,
    s.tope - coalesce((SELECT sum(monto) FROM g WHERE g.subcategoria_id = s.id),0)
  FROM public.gasto_subcategoria s JOIN public.gasto_categoria c ON c.id = s.categoria_id
  WHERE NOT s.anulado AND NOT c.anulado AND private.puede_gastos()
  ORDER BY 5, 6
$function$;

-- PARTE 3: ONP como subtipo de deuda
ALTER TABLE public.deuda DROP CONSTRAINT deuda_subtipo_check;
ALTER TABLE public.deuda ADD CONSTRAINT deuda_subtipo_check CHECK (subtipo IS NULL OR subtipo IN ('CTS','AFP','ONP','ESSALUD','Gratificaciones','Otros'));
