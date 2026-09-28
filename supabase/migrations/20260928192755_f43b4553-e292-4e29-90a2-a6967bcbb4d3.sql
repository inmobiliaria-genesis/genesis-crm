-- PARTE 3: venta nace de un apartado específico
ALTER TABLE public.venta ADD COLUMN IF NOT EXISTS reserva_origen_id uuid REFERENCES public.reserva(id);

CREATE OR REPLACE FUNCTION public.fn_venta_encargado_asesor()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_enc uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.reserva_origen_id IS DISTINCT FROM OLD.reserva_origen_id THEN
    RAISE EXCEPTION 'El apartado de origen no se puede cambiar.';
  END IF;
  IF NEW.reserva_origen_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.reserva WHERE id = NEW.reserva_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apartado de origen no encontrado.'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF r.anulado OR r.estado_aprobacion <> 'aprobado' OR r.convertida_a_venta_id IS NOT NULL
       OR r.fecha_limite < (now() AT TIME ZONE 'America/Lima')::date THEN
      RAISE EXCEPTION 'El apartado de origen no está aprobado y vigente.';
    END IF;
    IF r.lote_id <> NEW.lote_id THEN RAISE EXCEPTION 'El apartado de origen es de otro lote.'; END IF;
  END IF;
  SELECT vd.id INTO v_enc FROM public.perfil p
    JOIN public.vendedor vd ON vd.usuario_id = p.user_id AND vd.tipo = 'encargado' AND NOT vd.anulado
   WHERE p.user_id = r.creado_por AND p.rol = 'asesor' LIMIT 1;
  IF v_enc IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.encargado_id IS NULL THEN NEW.encargado_id := v_enc; RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.encargado_id IS DISTINCT FROM v_enc)
     OR (TG_OP = 'UPDATE' AND NEW.encargado_id IS DISTINCT FROM OLD.encargado_id AND NEW.encargado_id IS DISTINCT FROM v_enc) THEN
    IF NOT private.es_admin() THEN
      RAISE EXCEPTION 'Esta venta viene de un apartado de asesor: solo el administrador puede cambiar el encargado.';
    END IF;
    IF nullif(trim(coalesce(NEW.motivo_cambio_encargado,'')),'') IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.motivo_cambio_encargado IS NOT DISTINCT FROM OLD.motivo_cambio_encargado) THEN
      RAISE EXCEPTION 'Indica el motivo del cambio de encargado.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_venta_convierte_origen()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reserva_origen_id IS NOT NULL THEN
    UPDATE public.reserva SET convertida_a_venta_id = NEW.id
     WHERE id = NEW.reserva_origen_id AND convertida_a_venta_id IS NULL;
  END IF;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS venta_convierte_origen ON public.venta;
CREATE TRIGGER venta_convierte_origen AFTER INSERT ON public.venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_venta_convierte_origen();
REVOKE EXECUTE ON FUNCTION public.fn_venta_convierte_origen() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_venta_encargado_asesor() FROM PUBLIC, anon, authenticated;

-- PARTE 1: el asesor no lee la tabla lote directamente
DROP POLICY IF EXISTS lote_select ON public.lote;
CREATE POLICY lote_select ON public.lote FOR SELECT TO authenticated
  USING (private.usuario_activo() AND NOT private.es_asesor());

CREATE OR REPLACE FUNCTION public.lotes_asesor()
 RETURNS TABLE(id uuid, manzana text, numero integer, area_m2 numeric, precio_lista numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT l.id, m.letra, l.numero, l.area_m2, l.precio_lista
    FROM public.lote l JOIN public.manzana m ON m.id = l.manzana_id
   WHERE private.usuario_activo() AND private.lote_libre_completo(l.id)
   ORDER BY m.letra, l.numero
$function$;

-- Etiqueta mínima (manzana y número) para mostrar los lotes de los apartados propios
CREATE OR REPLACE FUNCTION public.etiquetas_lote(_ids uuid[])
 RETURNS TABLE(id uuid, manzana text, numero integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT l.id, m.letra, l.numero FROM public.lote l JOIN public.manzana m ON m.id = l.manzana_id
   WHERE private.usuario_activo() AND l.id = ANY(_ids)
$function$;

-- PARTE 2: plano del asesor
CREATE OR REPLACE FUNCTION public.plano_asesor(_plano_id uuid)
 RETURNS TABLE(id uuid, manzana text, numero integer, forma jsonb, estado text, area_m2 numeric, precio_lista numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT l.id, m.letra, l.numero, u.forma, e.estado,
         CASE WHEN lc THEN l.area_m2 END, CASE WHEN lc THEN l.precio_lista END
    FROM public.lote_ubicacion u
    JOIN public.lote l ON l.id = u.lote_id AND NOT l.anulado
    JOIN public.manzana m ON m.id = l.manzana_id
    JOIN private.lote_estado_calc() e ON e.lote_id = l.id
    CROSS JOIN LATERAL (SELECT private.lote_libre_completo(l.id) AS lc) x
   WHERE private.usuario_activo() AND u.plano_id = _plano_id AND u.vigente AND NOT u.anulado
$function$;

-- PARTE 4: validar rol en funciones ejecutables
CREATE OR REPLACE FUNCTION public.inicial_minima()
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT CASE WHEN private.usuario_activo() THEN private.config_vigente('inicial_minima') END $function$;

-- Solo usuarios con sesión (nunca anónimos) en las funciones públicas
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.lotes_asesor()','public.etiquetas_lote(uuid[])','public.plano_asesor(uuid)','public.inicial_minima()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Funciones privadas: fuera de alcance de anónimos
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p WHERE p.pronamespace = 'private'::regnamespace LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
  END LOOP;
END $$;
-- Funciones privadas usadas solo por otras funciones/triggers
REVOKE EXECUTE ON FUNCTION private.calc_devolucion(uuid, date, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.incentivos_calificados(uuid, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.retencion_cumplida(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION private.revertir_desistimiento_impl(uuid, text) FROM authenticated;