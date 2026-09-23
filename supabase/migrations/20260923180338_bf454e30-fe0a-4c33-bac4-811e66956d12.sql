
CREATE TABLE public.vendedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('encargado','promotor')),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  apodo text CHECK (apodo IS NULL OR btrim(apodo) <> ''),
  dni text,
  telefono text,
  encargado_id uuid REFERENCES public.vendedor(id),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','salio')),
  usuario_id uuid UNIQUE,
  notas text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendedor_encargado_solo_promotor CHECK (encargado_id IS NULL OR tipo = 'promotor')
);
CREATE UNIQUE INDEX vendedor_apodo_unico ON public.vendedor (lower(btrim(apodo))) WHERE apodo IS NOT NULL;
CREATE INDEX vendedor_encargado_idx ON public.vendedor(encargado_id);

GRANT SELECT, INSERT, UPDATE ON public.vendedor TO authenticated;
GRANT ALL ON public.vendedor TO service_role;
ALTER TABLE public.vendedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendedor_select ON public.vendedor FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY vendedor_insert ON public.vendedor FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY vendedor_update ON public.vendedor FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE OR REPLACE FUNCTION public.fn_valida_vendedor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.apodo := nullif(btrim(NEW.apodo), '');
  IF NEW.encargado_id IS NOT NULL THEN
    IF NEW.tipo <> 'promotor' THEN
      RAISE EXCEPTION 'Solo un promotor puede tener encargado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendedor v WHERE v.id = NEW.encargado_id AND v.tipo = 'encargado' AND NOT v.anulado) THEN
      RAISE EXCEPTION 'El encargado indicado no existe o no es de tipo encargado.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo = 'promotor' AND OLD.tipo = 'encargado'
     AND EXISTS (SELECT 1 FROM public.vendedor v WHERE v.encargado_id = NEW.id AND NOT v.anulado) THEN
    RAISE EXCEPTION 'Este encargado tiene promotores asignados; no puede pasar a promotor.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER vendedor_valida BEFORE INSERT OR UPDATE ON public.vendedor FOR EACH ROW EXECUTE FUNCTION public.fn_valida_vendedor();
CREATE TRIGGER vendedor_auditoria BEFORE INSERT OR UPDATE ON public.vendedor FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER vendedor_bitacora AFTER INSERT OR UPDATE ON public.vendedor FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER vendedor_no_borrar BEFORE DELETE ON public.vendedor FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

-- Venta: nuevas columnas
ALTER TABLE public.venta
  ADD COLUMN encargado_id uuid REFERENCES public.vendedor(id),
  ADD COLUMN promotor_id uuid REFERENCES public.vendedor(id),
  ADD COLUMN origen text NOT NULL DEFAULT 'promotor' CHECK (origen IN ('promotor','marketing')),
  ADD COLUMN importada boolean NOT NULL DEFAULT false;
CREATE INDEX venta_encargado_idx ON public.venta(encargado_id);
CREATE INDEX venta_promotor_idx ON public.venta(promotor_id);

-- Migración de datos: un encargado por cada vendedor actual
INSERT INTO public.vendedor (tipo, nombre, estado, usuario_id)
SELECT DISTINCT 'encargado', p.nombre, 'activo', p.user_id
FROM public.venta v JOIN public.perfil p ON p.id = v.vendedor_id;

UPDATE public.venta v SET encargado_id = ve.id, origen = 'promotor', promotor_id = NULL
FROM public.perfil p JOIN public.vendedor ve ON ve.usuario_id = p.user_id
WHERE p.id = v.vendedor_id;

ALTER TABLE public.venta ALTER COLUMN origen DROP DEFAULT;
ALTER TABLE public.venta ADD CONSTRAINT venta_encargado_obligatorio CHECK (importada OR encargado_id IS NOT NULL);
ALTER TABLE public.venta ADD CONSTRAINT venta_marketing_sin_promotor CHECK (origen <> 'marketing' OR promotor_id IS NULL);

-- Permisos: asesor solo con encargado vinculado a su cuenta
CREATE OR REPLACE FUNCTION private.encargado_permitido(_encargado_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN private.tiene_rol(array['admin','gerente_ventas']::app_rol[]) THEN true
    WHEN private.tiene_rol(array['asesor']::app_rol[]) THEN EXISTS (
      SELECT 1 FROM public.vendedor v WHERE v.id = _encargado_id AND v.usuario_id = auth.uid() AND NOT v.anulado)
    ELSE false END
$$;
GRANT EXECUTE ON FUNCTION private.encargado_permitido(uuid) TO authenticated;

DROP POLICY venta_insert ON public.venta;
DROP POLICY venta_update ON public.venta;
CREATE POLICY venta_insert ON public.venta FOR INSERT TO authenticated
  WITH CHECK (private.puede_comercial() AND private.encargado_permitido(encargado_id));
CREATE POLICY venta_update ON public.venta FOR UPDATE TO authenticated
  USING (private.puede_comercial())
  WITH CHECK (private.puede_comercial() AND (importada AND encargado_id IS NULL OR private.encargado_permitido(encargado_id)));

DROP FUNCTION private.vendedor_permitido(uuid);
ALTER TABLE public.venta DROP COLUMN vendedor_id;

-- Validación de tipos/estado de vendedores en venta
CREATE OR REPLACE FUNCTION public.fn_valida_venta()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_precio numeric; v_min numeric; v_max numeric;
BEGIN
  IF NEW.encargado_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND tipo = 'encargado' AND NOT anulado) THEN
      RAISE EXCEPTION 'El encargado debe ser un vendedor de tipo encargado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.encargado_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El encargado no está activo.';
    END IF;
  END IF;
  IF NEW.promotor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND tipo = 'promotor' AND NOT anulado) THEN
      RAISE EXCEPTION 'El promotor debe ser un vendedor de tipo promotor.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'El promotor no está activo.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = NEW.lote_id AND NOT v.anulado) THEN
      RAISE EXCEPTION 'El lote ya tiene una venta activa.';
    END IF;
    SELECT precio_lista INTO v_precio FROM public.lote WHERE id = NEW.lote_id;
    NEW.precio_lista_momento := coalesce(NEW.precio_lista_momento, v_precio);
    IF NEW.condicion = 'contado' THEN
      NEW.plazo_meses := 1;
    ELSE
      v_max := coalesce(private.config_vigente('max_cuotas'), 120);
      IF NEW.plazo_meses > v_max THEN
        RAISE EXCEPTION 'El plazo no puede superar % cuotas.', v_max::int;
      END IF;
    END IF;
    IF NEW.fecha_primera_cuota IS NULL THEN
      NEW.fecha_primera_cuota := NEW.fecha_venta + 30;
    END IF;
    v_min := coalesce(private.config_vigente('inicial_minima'), 0);
    IF NEW.condicion = 'financiado' AND NEW.inicial < v_min THEN
      RAISE EXCEPTION 'La inicial debe ser por lo menos %.', v_min;
    END IF;
    IF NEW.inicial > NEW.precio_acordado THEN
      RAISE EXCEPTION 'La inicial no puede superar el precio acordado.';
    END IF;
    IF NEW.precio_acordado IS DISTINCT FROM NEW.precio_lista_momento
       AND (NEW.motivo_diferencia_precio IS NULL OR btrim(NEW.motivo_diferencia_precio) = '') THEN
      RAISE EXCEPTION 'Debe indicar el motivo de la diferencia de precio.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Importación de vendedores (una sola transacción)
CREATE OR REPLACE FUNCTION public.importar_vendedores(p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  f jsonb; v_creados int := 0; v_omitidos int := 0; v_enc uuid; v_tipo text; v_estado text; v_apodo text;
  pasada text;
BEGIN
  IF NOT private.es_admin() THEN RAISE EXCEPTION 'Solo un administrador puede importar vendedores'; END IF;
  FOREACH pasada IN ARRAY ARRAY['encargado','promotor'] LOOP
    FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_filas,'[]'::jsonb)) LOOP
      v_tipo := lower(btrim(coalesce(f->>'tipo','')));
      CONTINUE WHEN v_tipo <> pasada;
      v_estado := lower(btrim(coalesce(nullif(f->>'estado',''),'activo')));
      v_apodo := nullif(btrim(coalesce(f->>'apodo','')),'');
      IF v_estado NOT IN ('activo','salio') THEN RAISE EXCEPTION 'Estado inválido: %', f->>'estado'; END IF;
      IF coalesce(btrim(f->>'nombre'),'') = '' THEN RAISE EXCEPTION 'Falta el nombre en una fila.'; END IF;
      IF v_apodo IS NOT NULL AND EXISTS (SELECT 1 FROM public.vendedor WHERE lower(btrim(apodo)) = lower(v_apodo)) THEN
        v_omitidos := v_omitidos + 1; CONTINUE;
      END IF;
      v_enc := NULL;
      IF v_tipo = 'promotor' AND nullif(btrim(coalesce(f->>'encargado_apodo','')),'') IS NOT NULL THEN
        SELECT id INTO v_enc FROM public.vendedor
        WHERE lower(btrim(apodo)) = lower(btrim(f->>'encargado_apodo')) AND tipo = 'encargado' AND NOT anulado;
        IF v_enc IS NULL THEN RAISE EXCEPTION 'Encargado no encontrado: %', f->>'encargado_apodo'; END IF;
      END IF;
      INSERT INTO public.vendedor (tipo, nombre, apodo, dni, telefono, encargado_id, estado, notas)
      VALUES (v_tipo, btrim(f->>'nombre'), v_apodo, nullif(btrim(coalesce(f->>'dni','')),''),
              nullif(btrim(coalesce(f->>'telefono','')),''), v_enc, v_estado, nullif(btrim(coalesce(f->>'notas','')),''));
      v_creados := v_creados + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos);
END $$;
REVOKE EXECUTE ON FUNCTION public.importar_vendedores(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_vendedores(jsonb) TO authenticated;
