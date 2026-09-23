
-- ============ CLIENTE ============
CREATE TABLE public.cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento text NOT NULL CHECK (tipo_documento IN ('DNI','CE','Pasaporte','RUC')),
  numero_documento text NOT NULL,
  nombres text NOT NULL,
  apellidos text NOT NULL,
  telefono1 text NOT NULL DEFAULT '+51',
  telefono2 text,
  email text,
  distrito text,
  provincia text,
  departamento text,
  estado_civil text,
  regimen_patrimonial text,
  ocupacion text,
  lugar_nacimiento text,
  fecha_nacimiento date,
  notas text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_documento_unico UNIQUE (tipo_documento, numero_documento)
);
GRANT SELECT, INSERT, UPDATE ON public.cliente TO authenticated;
GRANT ALL ON public.cliente TO service_role;
ALTER TABLE public.cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY cliente_select ON public.cliente FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY cliente_insert ON public.cliente FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY cliente_update ON public.cliente FOR UPDATE TO authenticated USING (private.usuario_activo()) WITH CHECK (private.usuario_activo());

-- ============ VENTA ============
CREATE TABLE public.venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.lote(id),
  fecha_venta date NOT NULL DEFAULT CURRENT_DATE,
  fecha_firma date,
  vendedor_id uuid NOT NULL REFERENCES public.perfil(id),
  condicion text NOT NULL CHECK (condicion IN ('contado','financiado')),
  precio_lista_momento numeric,
  precio_acordado numeric NOT NULL CHECK (precio_acordado > 0),
  motivo_diferencia_precio text,
  inicial numeric NOT NULL CHECK (inicial >= 0),
  forma_pago_inicial text NOT NULL CHECK (forma_pago_inicial IN ('efectivo','transferencia','cheque','tarjeta')),
  plazo_meses integer NOT NULL CHECK (plazo_meses >= 1),
  fecha_primera_cuota date,
  notas text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX venta_lote_activa ON public.venta (lote_id) WHERE NOT anulado;
GRANT SELECT, INSERT, UPDATE ON public.venta TO authenticated;
GRANT ALL ON public.venta TO service_role;
ALTER TABLE public.venta ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_select ON public.venta FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY venta_insert ON public.venta FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY venta_update ON public.venta FOR UPDATE TO authenticated USING (private.usuario_activo()) WITH CHECK (private.usuario_activo());

-- ============ RESERVA ============
CREATE TABLE public.reserva (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.lote(id),
  cliente_id uuid NOT NULL REFERENCES public.cliente(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias integer NOT NULL,
  fecha_limite date GENERATED ALWAYS AS (fecha + vigencia_dias) STORED,
  monto_anticipo numeric,
  convertida_a_venta_id uuid REFERENCES public.venta(id),
  notas text,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reserva TO authenticated;
GRANT ALL ON public.reserva TO service_role;
ALTER TABLE public.reserva ENABLE ROW LEVEL SECURITY;
CREATE POLICY reserva_select ON public.reserva FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY reserva_insert ON public.reserva FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY reserva_update ON public.reserva FOR UPDATE TO authenticated USING (private.usuario_activo()) WITH CHECK (private.usuario_activo());

-- ============ VENTA_TITULAR ============
CREATE TABLE public.venta_titular (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.venta(id),
  cliente_id uuid NOT NULL REFERENCES public.cliente(id),
  es_principal boolean NOT NULL DEFAULT false,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX venta_titular_principal_unico ON public.venta_titular (venta_id) WHERE es_principal AND NOT anulado;
CREATE UNIQUE INDEX venta_titular_cliente_unico ON public.venta_titular (venta_id, cliente_id) WHERE NOT anulado;
GRANT SELECT, INSERT, UPDATE ON public.venta_titular TO authenticated;
GRANT ALL ON public.venta_titular TO service_role;
ALTER TABLE public.venta_titular ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_titular_select ON public.venta_titular FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY venta_titular_insert ON public.venta_titular FOR INSERT TO authenticated WITH CHECK (private.usuario_activo());
CREATE POLICY venta_titular_update ON public.venta_titular FOR UPDATE TO authenticated USING (private.usuario_activo()) WITH CHECK (private.usuario_activo());

-- ============ CUOTA ============
CREATE TABLE public.cuota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.venta(id),
  numero integer NOT NULL CHECK (numero >= 0),
  fecha_vencimiento date NOT NULL,
  monto_original numeric NOT NULL,
  monto_vigente numeric NOT NULL,
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cuota_venta_numero ON public.cuota (venta_id, numero) WHERE NOT anulado;
GRANT SELECT, INSERT, UPDATE ON public.cuota TO authenticated;
GRANT ALL ON public.cuota TO service_role;
ALTER TABLE public.cuota ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuota_select ON public.cuota FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY cuota_insert ON public.cuota FOR INSERT TO authenticated WITH CHECK (private.tiene_rol(ARRAY['admin'::app_rol,'gerente_ventas'::app_rol]));
CREATE POLICY cuota_update ON public.cuota FOR UPDATE TO authenticated USING (private.tiene_rol(ARRAY['admin'::app_rol,'gerente_ventas'::app_rol])) WITH CHECK (private.tiene_rol(ARRAY['admin'::app_rol,'gerente_ventas'::app_rol]));

-- ============ REGLA DE ANULACIÓN ============
CREATE OR REPLACE FUNCTION public.fn_anular_solo_gerencia()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.anulado AND NOT OLD.anulado THEN
    IF NOT private.tiene_rol(ARRAY['admin'::app_rol,'gerente_ventas'::app_rol]) THEN
      RAISE EXCEPTION 'Solo un administrador o gerente de ventas puede anular este registro.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ============ VALIDACIÓN DE LOTE ============
CREATE OR REPLACE FUNCTION public.fn_valida_lote_comercializable(_lote_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  SELECT l.anulado, l.area_m2, l.precio_lista, m.tipo
    INTO r
  FROM public.lote l JOIN public.manzana m ON m.id = l.manzana_id
  WHERE l.id = _lote_id;

  IF NOT FOUND OR r.anulado THEN
    RAISE EXCEPTION 'El lote no existe o está anulado.';
  END IF;
  IF r.tipo IS DISTINCT FROM 'residencial' THEN
    RAISE EXCEPTION 'La manzana es de tipo mercado y no admite ventas ni apartados bajo este modelo.';
  END IF;
  IF r.area_m2 IS NULL OR r.precio_lista IS NULL THEN
    RAISE EXCEPTION 'El lote tiene datos pendientes';
  END IF;
END $$;

-- ============ TRIGGERS RESERVA ============
CREATE OR REPLACE FUNCTION public.fn_valida_reserva()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.vigencia_dias IS NULL THEN
    NEW.vigencia_dias := coalesce(private.config_vigente('vigencia_apartado_dias')::int, 15);
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_valida_lote_comercializable(NEW.lote_id);
    IF EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = NEW.lote_id AND NOT v.anulado) THEN
      RAISE EXCEPTION 'El lote ya tiene una venta activa.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reserva r
      WHERE r.lote_id = NEW.lote_id AND NOT r.anulado
        AND r.convertida_a_venta_id IS NULL
        AND r.fecha_limite >= CURRENT_DATE
    ) THEN
      RAISE EXCEPTION 'El lote ya tiene un apartado vigente.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ============ TRIGGERS VENTA ============
CREATE OR REPLACE FUNCTION public.fn_valida_venta()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_precio numeric;
  v_min numeric;
  v_max numeric;
BEGIN
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
END $$;

CREATE OR REPLACE FUNCTION public.fn_genera_cuotas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_saldo numeric;
  v_base numeric;
  v_monto numeric;
  v_dia int;
  v_mes date;
  v_ultimo date;
  v_fecha date;
  i int;
BEGIN
  INSERT INTO public.cuota (venta_id, numero, fecha_vencimiento, monto_original, monto_vigente)
  VALUES (
    NEW.id, 0, NEW.fecha_venta,
    CASE WHEN NEW.condicion = 'contado' THEN NEW.precio_acordado ELSE NEW.inicial END,
    CASE WHEN NEW.condicion = 'contado' THEN NEW.precio_acordado ELSE NEW.inicial END
  );

  IF NEW.condicion = 'financiado' THEN
    v_saldo := NEW.precio_acordado - NEW.inicial;
    v_base := round(v_saldo / NEW.plazo_meses, 2);
    v_dia := extract(day FROM NEW.fecha_primera_cuota)::int;
    FOR i IN 1..NEW.plazo_meses LOOP
      v_mes := (date_trunc('month', NEW.fecha_primera_cuota::timestamp) + ((i - 1) * interval '1 month'))::date;
      v_ultimo := (date_trunc('month', v_mes::timestamp) + interval '1 month' - interval '1 day')::date;
      v_fecha := least(v_mes + (v_dia - 1), v_ultimo);
      IF i < NEW.plazo_meses THEN
        v_monto := v_base;
      ELSE
        v_monto := v_saldo - (v_base * (NEW.plazo_meses - 1));
      END IF;
      INSERT INTO public.cuota (venta_id, numero, fecha_vencimiento, monto_original, monto_vigente)
      VALUES (NEW.id, i, v_fecha, v_monto, v_monto);
    END LOOP;
  END IF;

  UPDATE public.reserva r
     SET convertida_a_venta_id = NEW.id
   WHERE r.lote_id = NEW.lote_id
     AND NOT r.anulado
     AND r.convertida_a_venta_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.venta_titular vt
       WHERE vt.venta_id = NEW.id AND vt.cliente_id = r.cliente_id AND NOT vt.anulado
     );

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fn_marca_reserva_convertida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.reserva r
     SET convertida_a_venta_id = NEW.venta_id
    FROM public.venta v
   WHERE v.id = NEW.venta_id
     AND r.lote_id = v.lote_id
     AND r.cliente_id = NEW.cliente_id
     AND NOT r.anulado
     AND r.convertida_a_venta_id IS NULL;
  RETURN NULL;
END $$;

-- ============ TRIGGERS COMUNES ============
CREATE TRIGGER cliente_auditoria BEFORE INSERT OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER cliente_anular BEFORE UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION fn_anular_solo_gerencia();
CREATE TRIGGER cliente_bitacora AFTER INSERT OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION fn_bitacora();
CREATE TRIGGER cliente_no_borrar BEFORE DELETE ON public.cliente FOR EACH ROW EXECUTE FUNCTION fn_no_borrar();

CREATE TRIGGER reserva_valida BEFORE INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION fn_valida_reserva();
CREATE TRIGGER reserva_auditoria BEFORE INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER reserva_anular BEFORE UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION fn_anular_solo_gerencia();
CREATE TRIGGER reserva_bitacora AFTER INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION fn_bitacora();
CREATE TRIGGER reserva_no_borrar BEFORE DELETE ON public.reserva FOR EACH ROW EXECUTE FUNCTION fn_no_borrar();

CREATE TRIGGER venta_valida BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_valida_venta();
CREATE TRIGGER venta_auditoria BEFORE INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER venta_anular BEFORE UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_anular_solo_gerencia();
CREATE TRIGGER venta_bitacora AFTER INSERT OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_bitacora();
CREATE TRIGGER venta_cuotas AFTER INSERT ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_genera_cuotas();
CREATE TRIGGER venta_no_borrar BEFORE DELETE ON public.venta FOR EACH ROW EXECUTE FUNCTION fn_no_borrar();

CREATE TRIGGER venta_titular_auditoria BEFORE INSERT OR UPDATE ON public.venta_titular FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER venta_titular_anular BEFORE UPDATE ON public.venta_titular FOR EACH ROW EXECUTE FUNCTION fn_anular_solo_gerencia();
CREATE TRIGGER venta_titular_bitacora AFTER INSERT OR UPDATE ON public.venta_titular FOR EACH ROW EXECUTE FUNCTION fn_bitacora();
CREATE TRIGGER venta_titular_reserva AFTER INSERT ON public.venta_titular FOR EACH ROW EXECUTE FUNCTION fn_marca_reserva_convertida();
CREATE TRIGGER venta_titular_no_borrar BEFORE DELETE ON public.venta_titular FOR EACH ROW EXECUTE FUNCTION fn_no_borrar();

CREATE TRIGGER cuota_auditoria BEFORE INSERT OR UPDATE ON public.cuota FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER cuota_bitacora AFTER INSERT OR UPDATE ON public.cuota FOR EACH ROW EXECUTE FUNCTION fn_bitacora();
CREATE TRIGGER cuota_no_borrar BEFORE DELETE ON public.cuota FOR EACH ROW EXECUTE FUNCTION fn_no_borrar();

-- ============ VISTA DE ESTADO ============
DROP VIEW IF EXISTS public.lote_estado;
CREATE VIEW public.lote_estado WITH (security_invoker = on) AS
SELECT l.id AS lote_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = l.id AND NOT v.anulado) THEN 'vendido'
    WHEN EXISTS (
      SELECT 1 FROM public.reserva r
      WHERE r.lote_id = l.id AND NOT r.anulado AND r.fecha_limite >= CURRENT_DATE
    ) THEN 'apartado'
    ELSE 'disponible'
  END AS estado
FROM public.lote l
WHERE NOT l.anulado;
GRANT SELECT ON public.lote_estado TO authenticated;
