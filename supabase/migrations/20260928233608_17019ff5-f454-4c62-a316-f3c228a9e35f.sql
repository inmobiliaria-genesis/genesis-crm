ALTER TYPE public.app_rol RENAME VALUE 'cobranza' TO 'contabilidad';

CREATE OR REPLACE FUNCTION private.puede_cobrar() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select private.es_gestion() $$;
CREATE OR REPLACE FUNCTION private.puede_ver_desistimiento(_venta_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.tiene_rol(array['admin','gerente_ventas','socio','contabilidad']::app_rol[]) $$;
CREATE OR REPLACE FUNCTION private.puede_gastos() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.tiene_rol(array['admin','socio','contabilidad']::app_rol[]) $$;

CREATE OR REPLACE FUNCTION public.fn_anular_solo_cobranza() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.anulado AND NOT OLD.anulado AND NOT private.puede_cobrar() THEN
    RAISE EXCEPTION 'Solo administración, gerencia de ventas o socio puede anular un pago.';
  END IF;
  RETURN NEW; END $$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.regularizar_venta(uuid,text,date,text,text)'::regprocedure);
  d := replace(d, 'ARRAY[''admin''::app_rol,''cobranza''::app_rol]', 'ARRAY[''admin''::app_rol]');
  d := replace(d, 'Solo administración o cobranza puede', 'Solo administración puede');
  EXECUTE d;
END $do$;

DROP POLICY IF EXISTS bitacora_select ON public.bitacora;
CREATE POLICY bitacora_select ON public.bitacora FOR SELECT USING (private.tiene_rol(ARRAY['admin','socio','contabilidad']::app_rol[]));
DROP POLICY IF EXISTS comision_select ON public.comision;
CREATE POLICY comision_select ON public.comision FOR SELECT USING (
  private.tiene_rol(ARRAY['admin','gerente_ventas','socio','contabilidad']::app_rol[])
  OR (private.tiene_rol(ARRAY['asesor']::app_rol[]) AND EXISTS (SELECT 1 FROM vendedor v WHERE v.id = comision.encargado_id AND v.usuario_id = auth.uid() AND NOT v.anulado)));

-- Fuentes
ALTER TABLE public.lead DROP CONSTRAINT lead_fuente_check;
ALTER TABLE public.cliente DROP CONSTRAINT cliente_fuente_check;
ALTER TABLE public.venta DROP CONSTRAINT venta_fuente_check;
ALTER TABLE public.lead ADD CONSTRAINT lead_fuente_check CHECK (fuente IS NULL OR fuente = ANY (ARRAY['facebook','instagram','tiktok','google','radio','influencer','impresos','oficina','referido','otros']));
ALTER TABLE public.cliente ADD CONSTRAINT cliente_fuente_check CHECK (fuente IS NULL OR fuente = ANY (ARRAY['facebook','instagram','tiktok','google','radio','influencer','impresos','oficina','referido','otros']));
ALTER TABLE public.venta ADD CONSTRAINT venta_fuente_check CHECK (fuente IS NULL OR fuente = ANY (ARRAY['facebook','instagram','tiktok','google','radio','influencer','impresos','oficina','referido','otros']));

-- Categorías
CREATE TABLE public.gasto_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal','planilla','automatica','reembolso','otros')),
  manual boolean NOT NULL DEFAULT true,
  tope numeric CHECK (tope IS NULL OR tope >= 0),
  anulado boolean NOT NULL DEFAULT false, motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gasto_categoria_nombre_uq ON public.gasto_categoria (lower(nombre)) WHERE NOT anulado;
CREATE TABLE public.gasto_subcategoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.gasto_categoria(id),
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  tope numeric CHECK (tope IS NULL OR tope >= 0),
  exige_nota boolean NOT NULL DEFAULT false,
  anulado boolean NOT NULL DEFAULT false, motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gasto_subcategoria_nombre_uq ON public.gasto_subcategoria (categoria_id, lower(nombre)) WHERE NOT anulado;

CREATE TABLE public.gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  categoria_id uuid NOT NULL REFERENCES public.gasto_categoria(id),
  subcategoria_id uuid REFERENCES public.gasto_subcategoria(id),
  monto numeric NOT NULL CHECK (monto > 0),
  metodo text NOT NULL CHECK (metodo IN ('transferencia','efectivo','yape','plin')),
  numero_operacion text,
  comprobante_path text,
  notas text,
  trabajador text,
  dias numeric,
  persona text,
  descripcion text,
  pagado_por text,
  reembolso_estado text CHECK (reembolso_estado IN ('por_reembolsar','reembolsado')),
  reembolso_fecha date,
  reembolso_metodo text CHECK (reembolso_metodo IN ('transferencia','efectivo','yape','plin')),
  reembolso_operacion text,
  anulado boolean NOT NULL DEFAULT false, motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gasto_fecha_idx ON public.gasto (fecha);

CREATE TABLE public.personal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  dni text,
  cargo text,
  monto_mensual numeric NOT NULL CHECK (monto_mensual >= 0),
  activo boolean NOT NULL DEFAULT true,
  anulado boolean NOT NULL DEFAULT false, motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.planilla_linea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes date NOT NULL,
  personal_id uuid NOT NULL REFERENCES public.personal(id),
  monto numeric NOT NULL CHECK (monto >= 0),
  pagado boolean NOT NULL DEFAULT false,
  fecha_pago date,
  metodo text CHECK (metodo IN ('transferencia','efectivo','yape','plin')),
  numero_operacion text,
  comprobante_path text,
  notas text,
  anulado boolean NOT NULL DEFAULT false, motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX planilla_linea_uq ON public.planilla_linea (mes, personal_id) WHERE NOT anulado;

GRANT SELECT, INSERT, UPDATE ON public.gasto_categoria, public.gasto_subcategoria, public.gasto, public.personal, public.planilla_linea TO authenticated;
GRANT ALL ON public.gasto_categoria, public.gasto_subcategoria, public.gasto, public.personal, public.planilla_linea TO service_role;
ALTER TABLE public.gasto_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasto_subcategoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilla_linea ENABLE ROW LEVEL SECURITY;

CREATE POLICY gasto_categoria_select ON public.gasto_categoria FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY gasto_categoria_insert ON public.gasto_categoria FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY gasto_categoria_update ON public.gasto_categoria FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());
CREATE POLICY gasto_subcategoria_select ON public.gasto_subcategoria FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY gasto_subcategoria_insert ON public.gasto_subcategoria FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY gasto_subcategoria_update ON public.gasto_subcategoria FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());
CREATE POLICY gasto_select ON public.gasto FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY gasto_insert ON public.gasto FOR INSERT TO authenticated WITH CHECK (private.puede_gastos());
CREATE POLICY gasto_update ON public.gasto FOR UPDATE TO authenticated USING (private.puede_gastos()) WITH CHECK (private.puede_gastos());
CREATE POLICY personal_select ON public.personal FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY personal_insert ON public.personal FOR INSERT TO authenticated WITH CHECK (private.puede_gastos());
CREATE POLICY personal_update ON public.personal FOR UPDATE TO authenticated USING (private.puede_gastos()) WITH CHECK (private.puede_gastos());
CREATE POLICY planilla_select ON public.planilla_linea FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY planilla_insert ON public.planilla_linea FOR INSERT TO authenticated WITH CHECK (private.puede_gastos());
CREATE POLICY planilla_update ON public.planilla_linea FOR UPDATE TO authenticated USING (private.puede_gastos()) WITH CHECK (private.puede_gastos());

-- Solo admin anula (borrado suave)
CREATE OR REPLACE FUNCTION public.fn_anular_solo_admin() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.anulado AND NOT OLD.anulado AND NOT private.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar este registro.';
  END IF;
  RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.fn_valida_gasto() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE c record; s record;
BEGIN
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
END $$;

CREATE OR REPLACE FUNCTION public.fn_valida_planilla() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  NEW.mes := date_trunc('month', NEW.mes)::date;
  IF NEW.pagado THEN
    IF NEW.fecha_pago IS NULL OR NEW.metodo IS NULL THEN RAISE EXCEPTION 'Indica fecha y método del pago.'; END IF;
    IF NEW.metodo = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  ELSE
    NEW.fecha_pago := NULL; NEW.metodo := NULL; NEW.numero_operacion := NULL;
  END IF;
  RETURN NEW; END $$;

DO $t$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gasto_categoria','gasto_subcategoria','gasto','personal','planilla_linea'] LOOP
    EXECUTE format('CREATE TRIGGER %1$s_auditoria BEFORE INSERT OR UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria()', t);
    EXECUTE format('CREATE TRIGGER %1$s_solo_admin BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.fn_anular_solo_admin()', t);
    EXECUTE format('CREATE TRIGGER %1$s_bitacora AFTER INSERT OR UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora()', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_borrar BEFORE DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar()', t);
  END LOOP;
END $t$;
CREATE TRIGGER gasto_valida BEFORE INSERT OR UPDATE ON public.gasto FOR EACH ROW WHEN (NOT NEW.anulado) EXECUTE FUNCTION public.fn_valida_gasto();
CREATE TRIGGER planilla_valida BEFORE INSERT OR UPDATE ON public.planilla_linea FOR EACH ROW EXECUTE FUNCTION public.fn_valida_planilla();

-- Generar planilla del mes
CREATE OR REPLACE FUNCTION public.generar_planilla(_mes date) RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_mes date := date_trunc('month', _mes)::date; n integer;
BEGIN
  IF NOT private.puede_gastos() THEN RAISE EXCEPTION 'No tienes permiso para generar la planilla.'; END IF;
  IF EXISTS (SELECT 1 FROM public.planilla_linea WHERE mes = v_mes AND NOT anulado) THEN
    RAISE EXCEPTION 'La planilla de este mes ya fue generada.';
  END IF;
  INSERT INTO public.planilla_linea (mes, personal_id, monto)
  SELECT v_mes, id, monto_mensual FROM public.personal WHERE activo AND NOT anulado ORDER BY nombre;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'No hay personal activo.'; END IF;
  RETURN n;
END $$;

-- Resumen mensual (pagado, tope, diferencia)
CREATE OR REPLACE FUNCTION public.resumen_gastos(_mes date)
RETURNS TABLE(categoria_id uuid, categoria text, subcategoria_id uuid, subcategoria text, orden_cat integer, orden_sub integer, pagado numeric, tope numeric, diferencia numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  WITH m AS (SELECT date_trunc('month', _mes)::date AS ini, (date_trunc('month', _mes) + interval '1 month')::date AS fin),
  g AS (SELECT g.categoria_id, g.subcategoria_id, g.monto FROM public.gasto g, m WHERE NOT g.anulado AND g.fecha >= m.ini AND g.fecha < m.fin),
  pl AS (SELECT coalesce(sum(monto),0) AS total FROM public.planilla_linea p, m WHERE NOT p.anulado AND p.pagado AND p.mes = m.ini)
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
$$;

-- Lo llevado en el mes contra el tope aplicable (subcategoría o categoría)
CREATE OR REPLACE FUNCTION public.tope_gasto(_categoria_id uuid, _subcategoria_id uuid, _fecha date, _excluir uuid DEFAULT NULL)
RETURNS TABLE(llevas numeric, tope numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  WITH m AS (SELECT date_trunc('month', _fecha)::date AS ini, (date_trunc('month', _fecha) + interval '1 month')::date AS fin),
  t AS (
    SELECT s.tope, 'sub' AS nivel FROM public.gasto_subcategoria s WHERE s.id = _subcategoria_id AND s.tope IS NOT NULL
    UNION ALL
    SELECT c.tope, 'cat' FROM public.gasto_categoria c WHERE c.id = _categoria_id AND c.tope IS NOT NULL
    ORDER BY 2 DESC LIMIT 1
  )
  SELECT coalesce((SELECT sum(g.monto) FROM public.gasto g, m WHERE NOT g.anulado AND g.fecha >= m.ini AND g.fecha < m.fin
            AND (g.id IS DISTINCT FROM _excluir)
            AND CASE WHEN t.nivel = 'sub' THEN g.subcategoria_id = _subcategoria_id ELSE g.categoria_id = _categoria_id END), 0),
         t.tope
  FROM t WHERE private.puede_gastos()
$$;

REVOKE EXECUTE ON FUNCTION public.generar_planilla(date), public.resumen_gastos(date), public.tope_gasto(uuid,uuid,date,uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generar_planilla(date), public.resumen_gastos(date), public.tope_gasto(uuid,uuid,date,uuid) TO authenticated;

-- Carga de categorías
DO $c$
DECLARE cid uuid;
BEGIN
  INSERT INTO public.gasto_categoria (nombre, orden) VALUES ('Combustible', 1) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, tope) VALUES (cid,'Camioneta',1,800),(cid,'Máquinas',2,250);
  INSERT INTO public.gasto_categoria (nombre, orden) VALUES ('Mantenimiento del terreno', 2) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, tope, exige_nota) VALUES (cid,'Jornales',1,1200,false),(cid,'Herbicida',2,500,false),(cid,'Otros',3,NULL,true);
  INSERT INTO public.gasto_categoria (nombre, orden) VALUES ('Oficina', 3) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, tope, exige_nota) VALUES (cid,'Utilidades',1,400,false),(cid,'Útiles y suministros',2,NULL,false),(cid,'Otros',3,NULL,true);
  INSERT INTO public.gasto_categoria (nombre, orden, tope) VALUES ('Viáticos', 4, 150);
  INSERT INTO public.gasto_categoria (nombre, orden, tope) VALUES ('Publicidad', 5, 300) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, exige_nota) VALUES (cid,'Facebook e Instagram',1,false),(cid,'TikTok',2,false),(cid,'Google',3,false),(cid,'Influencers locales',4,false),(cid,'Radio',5,false),(cid,'Impresos',6,false),(cid,'Otros',7,true);
  INSERT INTO public.gasto_categoria (nombre, orden) VALUES ('Software', 6) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, tope, exige_nota) VALUES (cid,'CRM',1,170,false),(cid,'Otros',2,NULL,true);
  INSERT INTO public.gasto_categoria (nombre, orden) VALUES ('Obligaciones laborales', 7) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, exige_nota) VALUES (cid,'CTS',1,false),(cid,'AFP',2,false),(cid,'ESSALUD',3,false),(cid,'Gratificaciones',4,false),(cid,'Otros',5,true);
  INSERT INTO public.gasto_categoria (nombre, orden, tipo, manual) VALUES ('Comisiones e incentivos', 8, 'automatica', false) RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden) VALUES (cid,'Comisiones históricas',1),(cid,'Incentivos',2);
  INSERT INTO public.gasto_categoria (nombre, orden, tipo, manual) VALUES ('Planilla', 9, 'planilla', false);
  INSERT INTO public.gasto_categoria (nombre, orden, tipo) VALUES ('Reembolsos', 10, 'reembolso') RETURNING id INTO cid;
  INSERT INTO public.gasto_subcategoria (categoria_id, nombre, orden, exige_nota) VALUES (cid,'Pasajes',1,false),(cid,'Alimentación',2,false),(cid,'Hospedaje',3,false),(cid,'Movilidad local',4,false),(cid,'Otros',5,true);
  INSERT INTO public.gasto_categoria (nombre, orden, tipo) VALUES ('Otros', 11, 'otros');
  INSERT INTO public.personal (nombre, monto_mensual) VALUES
    ('Cajo Ramos Florentino', 1490.82), ('Morales Costa Juan Humberto', 2645.61),
    ('Tantarico Cruz Santos', 1479.00), ('Nuñez Roque Lucia', 1000.00);
END $c$;

-- Comprobantes (bucket privado creado aparte)
CREATE POLICY comprobantes_leer ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'comprobantes' AND private.puede_gastos());
CREATE POLICY comprobantes_subir ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprobantes' AND private.puede_gastos());
CREATE POLICY comprobantes_actualizar ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'comprobantes' AND private.puede_gastos()) WITH CHECK (bucket_id = 'comprobantes' AND private.puede_gastos());