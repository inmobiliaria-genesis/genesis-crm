-- ============ plano ============
CREATE TABLE public.plano (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.etapa(id),
  nombre text NOT NULL,
  imagen_path text NOT NULL,
  ancho_px integer NOT NULL,
  alto_px integer NOT NULL,
  vigente boolean NOT NULL DEFAULT true,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX plano_unico_vigente_por_etapa
  ON public.plano (etapa_id)
  WHERE vigente AND NOT anulado;

GRANT SELECT, INSERT, UPDATE ON public.plano TO authenticated;
GRANT ALL ON public.plano TO service_role;
ALTER TABLE public.plano ENABLE ROW LEVEL SECURITY;

CREATE POLICY plano_select ON public.plano FOR SELECT TO authenticated
  USING (private.usuario_activo());
CREATE POLICY plano_insert ON public.plano FOR INSERT TO authenticated
  WITH CHECK (private.es_admin());
CREATE POLICY plano_update ON public.plano FOR UPDATE TO authenticated
  USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE TRIGGER plano_auditoria BEFORE INSERT OR UPDATE ON public.plano
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER plano_bitacora AFTER INSERT OR UPDATE ON public.plano
  FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER plano_no_borrar BEFORE DELETE ON public.plano
  FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

-- ============ lote_ubicacion ============
CREATE TABLE public.lote_ubicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.lote(id),
  plano_id uuid NOT NULL REFERENCES public.plano(id),
  forma jsonb NOT NULL,
  vigente boolean NOT NULL DEFAULT true,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lote_ubicacion_unica_vigente
  ON public.lote_ubicacion (lote_id)
  WHERE vigente AND NOT anulado;

CREATE INDEX lote_ubicacion_plano_idx ON public.lote_ubicacion (plano_id);

GRANT SELECT, INSERT, UPDATE ON public.lote_ubicacion TO authenticated;
GRANT ALL ON public.lote_ubicacion TO service_role;
ALTER TABLE public.lote_ubicacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY lote_ubicacion_select ON public.lote_ubicacion FOR SELECT TO authenticated
  USING (private.usuario_activo());
CREATE POLICY lote_ubicacion_insert ON public.lote_ubicacion FOR INSERT TO authenticated
  WITH CHECK (private.es_admin());
CREATE POLICY lote_ubicacion_update ON public.lote_ubicacion FOR UPDATE TO authenticated
  USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE OR REPLACE FUNCTION public.fn_valida_ubicacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo text;
  v_forma jsonb := NEW.forma;
  v_tipo_forma text := v_forma->>'tipo';
BEGIN
  SELECT m.tipo INTO v_tipo
  FROM public.lote l
  JOIN public.manzana m ON m.id = l.manzana_id
  WHERE l.id = NEW.lote_id;

  IF v_tipo IS DISTINCT FROM 'residencial' THEN
    RAISE EXCEPTION 'Solo se pueden ubicar lotes de manzanas residenciales.';
  END IF;

  IF v_tipo_forma = 'punto' THEN
    IF (v_forma->>'x') IS NULL OR (v_forma->>'y') IS NULL
       OR (v_forma->>'x')::numeric < 0 OR (v_forma->>'x')::numeric > 1
       OR (v_forma->>'y')::numeric < 0 OR (v_forma->>'y')::numeric > 1 THEN
      RAISE EXCEPTION 'Coordenadas del punto fuera de rango (0 a 1).';
    END IF;
  ELSIF v_tipo_forma = 'rect' THEN
    IF (v_forma->>'x1') IS NULL OR (v_forma->>'y1') IS NULL
       OR (v_forma->>'x2') IS NULL OR (v_forma->>'y2') IS NULL
       OR (v_forma->>'x1')::numeric < 0 OR (v_forma->>'x1')::numeric > 1
       OR (v_forma->>'y1')::numeric < 0 OR (v_forma->>'y1')::numeric > 1
       OR (v_forma->>'x2')::numeric < 0 OR (v_forma->>'x2')::numeric > 1
       OR (v_forma->>'y2')::numeric < 0 OR (v_forma->>'y2')::numeric > 1 THEN
      RAISE EXCEPTION 'Coordenadas del rectángulo fuera de rango (0 a 1).';
    END IF;
  ELSE
    RAISE EXCEPTION 'La forma debe ser de tipo punto o rect.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER lote_ubicacion_valida BEFORE INSERT OR UPDATE ON public.lote_ubicacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_valida_ubicacion();
CREATE TRIGGER lote_ubicacion_auditoria BEFORE INSERT OR UPDATE ON public.lote_ubicacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER lote_ubicacion_bitacora AFTER INSERT OR UPDATE ON public.lote_ubicacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER lote_ubicacion_no_borrar BEFORE DELETE ON public.lote_ubicacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

-- ============ color_estado ============
CREATE TABLE public.color_estado (
  estado text PRIMARY KEY,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  color text NOT NULL,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.color_estado TO authenticated;
GRANT ALL ON public.color_estado TO service_role;
ALTER TABLE public.color_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY color_estado_select ON public.color_estado FOR SELECT TO authenticated
  USING (private.usuario_activo());
CREATE POLICY color_estado_insert ON public.color_estado FOR INSERT TO authenticated
  WITH CHECK (private.es_admin());
CREATE POLICY color_estado_update ON public.color_estado FOR UPDATE TO authenticated
  USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE TRIGGER color_estado_auditoria BEFORE INSERT OR UPDATE ON public.color_estado
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER color_estado_bitacora AFTER INSERT OR UPDATE ON public.color_estado
  FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER color_estado_no_borrar BEFORE DELETE ON public.color_estado
  FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

INSERT INTO public.color_estado (estado, color) VALUES ('disponible', '#2563eb');
