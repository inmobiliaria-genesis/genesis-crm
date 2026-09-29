
CREATE TABLE public.deuda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('obligaciones_laborales','proveedores','prestamos','impuestos','otros')),
  subtipo text CHECK (subtipo IS NULL OR subtipo IN ('CTS','AFP','ESSALUD','Gratificaciones','Otros')),
  acreedor text NOT NULL,
  concepto text NOT NULL,
  monto_total numeric(12,2) NOT NULL CHECK (monto_total > 0),
  fecha_vencimiento date,
  notas text,
  documento_path text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deuda TO authenticated;
GRANT ALL ON public.deuda TO service_role;
ALTER TABLE public.deuda ENABLE ROW LEVEL SECURITY;
CREATE POLICY deuda_select ON public.deuda FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY deuda_insert ON public.deuda FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY deuda_update ON public.deuda FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());

CREATE TABLE public.deuda_abono (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deuda_id uuid NOT NULL REFERENCES public.deuda(id),
  fecha date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  metodo text NOT NULL CHECK (metodo IN ('transferencia','efectivo','yape','plin')),
  numero_operacion text,
  comprobante_path text,
  notas text,
  gasto_id uuid REFERENCES public.gasto(id),
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  creado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid, modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deuda_abono_deuda_idx ON public.deuda_abono(deuda_id);
GRANT SELECT, INSERT, UPDATE ON public.deuda_abono TO authenticated;
GRANT ALL ON public.deuda_abono TO service_role;
ALTER TABLE public.deuda_abono ENABLE ROW LEVEL SECURITY;
CREATE POLICY deuda_abono_select ON public.deuda_abono FOR SELECT TO authenticated USING (private.puede_gastos());
CREATE POLICY deuda_abono_insert ON public.deuda_abono FOR INSERT TO authenticated WITH CHECK (private.es_admin());
CREATE POLICY deuda_abono_update ON public.deuda_abono FOR UPDATE TO authenticated USING (private.es_admin()) WITH CHECK (private.es_admin());

ALTER TABLE public.gasto ADD COLUMN deuda_abono_id uuid REFERENCES public.deuda_abono(id);

-- Resumen calculado
CREATE VIEW public.deuda_resumen WITH (security_invoker = true) AS
SELECT d.id AS deuda_id,
  coalesce(a.abonado, 0)::numeric(12,2) AS abonado,
  (d.monto_total - coalesce(a.abonado, 0))::numeric(12,2) AS saldo,
  CASE WHEN coalesce(a.abonado,0) = 0 THEN 'pendiente'
       WHEN d.monto_total - a.abonado > 0 THEN 'pagada_parte'
       ELSE 'pagada' END AS estado
FROM public.deuda d
LEFT JOIN (SELECT deuda_id, sum(monto) abonado FROM public.deuda_abono WHERE NOT anulado GROUP BY deuda_id) a ON a.deuda_id = d.id;
GRANT SELECT ON public.deuda_resumen TO authenticated;

CREATE OR REPLACE FUNCTION private.deuda_abonado(_deuda uuid, _excluir uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(sum(monto),0) FROM public.deuda_abono
   WHERE deuda_id = _deuda AND NOT anulado AND (_excluir IS NULL OR id <> _excluir) $$;
REVOKE EXECUTE ON FUNCTION private.deuda_abonado(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.deuda_abonado(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_deuda_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_abonado numeric;
BEGIN
  NEW.acreedor := btrim(coalesce(NEW.acreedor,'')); NEW.concepto := btrim(coalesce(NEW.concepto,''));
  IF NEW.acreedor = '' THEN RAISE EXCEPTION 'Indica el acreedor.'; END IF;
  IF NEW.concepto = '' THEN RAISE EXCEPTION 'Indica el concepto.'; END IF;
  IF NEW.tipo = 'obligaciones_laborales' THEN
    IF NEW.subtipo IS NULL THEN RAISE EXCEPTION 'Elige el subtipo de la obligación laboral.'; END IF;
  ELSE NEW.subtipo := NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_abonado := private.deuda_abonado(NEW.id);
    IF NEW.anulado AND NOT OLD.anulado AND v_abonado > 0 THEN
      RAISE EXCEPTION 'La deuda tiene abonos vigentes; anúlalos antes de eliminarla.'; END IF;
    IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Una deuda eliminada no puede reactivarse.'; END IF;
    IF v_abonado > 0 AND (NEW.tipo, NEW.subtipo) IS DISTINCT FROM (OLD.tipo, OLD.subtipo) THEN
      RAISE EXCEPTION 'No se puede cambiar el tipo de una deuda con abonos.'; END IF;
    IF NEW.monto_total < v_abonado THEN
      RAISE EXCEPTION 'El monto total no puede ser menor que lo ya abonado (S/ %)', to_char(v_abonado, 'FM999,999,990.00'); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deuda_aa_valida BEFORE INSERT OR UPDATE ON public.deuda FOR EACH ROW EXECUTE FUNCTION public.fn_deuda_valida();
CREATE TRIGGER deuda_auditoria BEFORE INSERT OR UPDATE ON public.deuda FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER deuda_bitacora AFTER INSERT OR UPDATE ON public.deuda FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER deuda_no_borrar BEFORE DELETE ON public.deuda FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();
CREATE TRIGGER deuda_solo_admin BEFORE UPDATE ON public.deuda FOR EACH ROW EXECUTE FUNCTION public.fn_anular_solo_admin();

CREATE OR REPLACE FUNCTION public.fn_abono_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_saldo numeric; v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.deuda_id := OLD.deuda_id;
    IF coalesce(current_setting('app.gasto_auto', true), '') <> '1' THEN NEW.gasto_id := OLD.gasto_id; END IF;
    IF OLD.anulado AND NOT NEW.anulado THEN RAISE EXCEPTION 'Un abono anulado no puede reactivarse.'; END IF;
    IF OLD.anulado THEN RETURN NEW; END IF;
    IF NEW.anulado THEN RETURN NEW; END IF;
  ELSE
    NEW.gasto_id := NULL;
  END IF;
  SELECT * INTO d FROM public.deuda WHERE id = NEW.deuda_id FOR UPDATE;
  IF NOT FOUND OR d.anulado THEN RAISE EXCEPTION 'La deuda no existe o fue eliminada.'; END IF;
  IF NEW.fecha IS NULL OR NEW.fecha > v_hoy THEN RAISE EXCEPTION 'La fecha del abono no puede ser futura.'; END IF;
  IF NEW.metodo = 'efectivo' THEN NEW.numero_operacion := NULL; END IF;
  NEW.numero_operacion := nullif(btrim(NEW.numero_operacion), '');
  v_saldo := d.monto_total - private.deuda_abonado(d.id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.id END);
  IF NEW.monto > v_saldo THEN
    RAISE EXCEPTION 'El abono supera el saldo pendiente (S/ %)', to_char(v_saldo, 'FM999,999,990.00'); END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_abono_valida() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_abono_gasto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_cat uuid; v_sub uuid; v_gasto uuid; v_nombre text; v_notas text;
BEGIN
  SELECT * INTO d FROM public.deuda WHERE id = NEW.deuda_id;
  PERFORM set_config('app.gasto_auto', '1', true);
  IF TG_OP = 'INSERT' THEN
    v_nombre := CASE d.tipo WHEN 'obligaciones_laborales' THEN 'obligaciones laborales' WHEN 'proveedores' THEN 'proveedores'
      WHEN 'prestamos' THEN 'préstamos' WHEN 'impuestos' THEN 'impuestos' ELSE 'otros' END;
    SELECT id INTO v_cat FROM public.gasto_categoria WHERE lower(nombre) = v_nombre AND NOT anulado LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Falta la categoría "%" en Gastos.', initcap(v_nombre); END IF;
    IF d.tipo = 'obligaciones_laborales' THEN
      SELECT id INTO v_sub FROM public.gasto_subcategoria WHERE categoria_id = v_cat AND NOT anulado AND lower(nombre) = lower(d.subtipo) LIMIT 1;
      IF v_sub IS NULL THEN RAISE EXCEPTION 'Falta la subcategoría "%" en Obligaciones laborales.', d.subtipo; END IF;
    END IF;
    v_notas := CASE WHEN d.tipo = 'otros' THEN d.concepto ELSE 'Abono a deuda — ' || d.acreedor || ' — ' || d.concepto END
               || CASE WHEN coalesce(btrim(NEW.notas),'') <> '' THEN ' · ' || NEW.notas ELSE '' END;
    INSERT INTO public.gasto (fecha, categoria_id, subcategoria_id, monto, metodo, numero_operacion, comprobante_path, notas, persona, deuda_abono_id)
    VALUES (NEW.fecha, v_cat, v_sub, NEW.monto, NEW.metodo, NEW.numero_operacion, NEW.comprobante_path, v_notas, d.acreedor, NEW.id)
    RETURNING id INTO v_gasto;
    UPDATE public.deuda_abono SET gasto_id = v_gasto WHERE id = NEW.id;
  ELSIF NEW.anulado AND NOT OLD.anulado THEN
    UPDATE public.gasto SET anulado = true, motivo_anulacion = coalesce(NEW.motivo_anulacion, 'Abono anulado')
     WHERE id = NEW.gasto_id AND NOT anulado;
  ELSIF NOT NEW.anulado AND NEW.gasto_id IS NOT NULL THEN
    UPDATE public.gasto SET fecha = NEW.fecha, monto = NEW.monto, metodo = NEW.metodo,
      numero_operacion = NEW.numero_operacion, comprobante_path = NEW.comprobante_path
     WHERE id = NEW.gasto_id AND NOT anulado
       AND (fecha, monto, metodo, numero_operacion, comprobante_path) IS DISTINCT FROM (NEW.fecha, NEW.monto, NEW.metodo, NEW.numero_operacion, NEW.comprobante_path);
  END IF;
  PERFORM set_config('app.gasto_auto', '', true);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_abono_gasto() FROM public, anon, authenticated;

CREATE TRIGGER deuda_abono_aa_valida BEFORE INSERT OR UPDATE ON public.deuda_abono FOR EACH ROW EXECUTE FUNCTION public.fn_abono_valida();
CREATE TRIGGER deuda_abono_auditoria BEFORE INSERT OR UPDATE ON public.deuda_abono FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER deuda_abono_bitacora AFTER INSERT OR UPDATE ON public.deuda_abono FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER deuda_abono_no_borrar BEFORE DELETE ON public.deuda_abono FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();
CREATE TRIGGER deuda_abono_solo_admin BEFORE UPDATE ON public.deuda_abono FOR EACH ROW EXECUTE FUNCTION public.fn_anular_solo_admin();
CREATE TRIGGER deuda_abono_zz_gasto AFTER INSERT OR UPDATE OF anulado, fecha, monto, metodo, numero_operacion, comprobante_path ON public.deuda_abono
  FOR EACH ROW EXECUTE FUNCTION public.fn_abono_gasto();

-- Gastos: bloquear edición manual de gastos creados por abonos
CREATE OR REPLACE FUNCTION public.fn_valida_gasto()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE c record; s record; v_auto boolean := coalesce(current_setting('app.gasto_auto', true), '') = '1';
BEGIN
  IF (NEW.comision_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.comision_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde una comisión o incentivo; modifícalo desde Comisiones.';
  END IF;
  IF (NEW.deuda_abono_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.deuda_abono_id IS NOT NULL)) AND NOT v_auto THEN
    RAISE EXCEPTION 'Este gasto se creó desde un abono a una deuda; modifícalo desde Deudas.';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.comision_id := OLD.comision_id; NEW.deuda_abono_id := OLD.deuda_abono_id; END IF;
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

-- Archivos de deudas: solo admin sube o reemplaza (lectura: admin/socio/contabilidad por la política existente)
CREATE POLICY comprobantes_deudas_subir_admin ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'comprobantes' OR name NOT LIKE 'deudas/%' OR private.es_admin());
CREATE POLICY comprobantes_deudas_actualizar_admin ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'comprobantes' OR name NOT LIKE 'deudas/%' OR private.es_admin());
