
CREATE OR REPLACE FUNCTION private.puede_cobrar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ select private.tiene_rol(array['admin','gerente_ventas','cobranza']::app_rol[]) $$;

CREATE TABLE public.pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.venta(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  monto numeric NOT NULL CHECK (monto > 0),
  metodo text NOT NULL CHECK (metodo IN ('efectivo','transferencia','cheque','tarjeta')),
  numero_operacion text,
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
GRANT SELECT, INSERT, UPDATE ON public.pago TO authenticated;
GRANT ALL ON public.pago TO service_role;
ALTER TABLE public.pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY pago_select ON public.pago FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY pago_insert ON public.pago FOR INSERT TO authenticated WITH CHECK (private.puede_cobrar());
CREATE POLICY pago_update ON public.pago FOR UPDATE TO authenticated USING (private.puede_cobrar()) WITH CHECK (private.puede_cobrar());

CREATE INDEX idx_pago_venta ON public.pago(venta_id);

CREATE TABLE public.pago_aplicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id uuid NOT NULL REFERENCES public.pago(id),
  cuota_id uuid NOT NULL REFERENCES public.cuota(id),
  monto_aplicado numeric NOT NULL CHECK (monto_aplicado > 0),
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_por uuid,
  anulado_en timestamptz,
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  modificado_por uuid,
  modificado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pago_id, cuota_id)
);
GRANT SELECT, INSERT, UPDATE ON public.pago_aplicacion TO authenticated;
GRANT ALL ON public.pago_aplicacion TO service_role;
ALTER TABLE public.pago_aplicacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY pago_aplicacion_select ON public.pago_aplicacion FOR SELECT TO authenticated USING (private.usuario_activo());
CREATE POLICY pago_aplicacion_insert ON public.pago_aplicacion FOR INSERT TO authenticated WITH CHECK (private.puede_cobrar());
CREATE POLICY pago_aplicacion_update ON public.pago_aplicacion FOR UPDATE TO authenticated USING (private.puede_cobrar()) WITH CHECK (private.puede_cobrar());

CREATE INDEX idx_pago_aplicacion_pago ON public.pago_aplicacion(pago_id);
CREATE INDEX idx_pago_aplicacion_cuota ON public.pago_aplicacion(cuota_id);

CREATE TRIGGER pago_auditoria BEFORE INSERT OR UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER pago_bitacora AFTER INSERT OR UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER pago_no_borrar BEFORE DELETE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();
CREATE TRIGGER pago_aplicacion_auditoria BEFORE INSERT OR UPDATE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria();
CREATE TRIGGER pago_aplicacion_bitacora AFTER INSERT OR UPDATE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora();
CREATE TRIGGER pago_aplicacion_no_borrar BEFORE DELETE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_no_borrar();

CREATE OR REPLACE FUNCTION public.fn_anular_solo_cobranza()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.anulado AND NOT OLD.anulado THEN
    IF NOT private.tiene_rol(ARRAY['admin'::app_rol,'gerente_ventas'::app_rol,'cobranza'::app_rol]) THEN
      RAISE EXCEPTION 'Solo administración, gerencia de ventas o cobranza puede anular un pago.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pago_anular BEFORE UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_anular_solo_cobranza();
CREATE TRIGGER pago_aplicacion_anular BEFORE UPDATE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_anular_solo_cobranza();

CREATE OR REPLACE FUNCTION public.fn_valida_aplicacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_monto_pago numeric;
  v_pago_anulado boolean;
  v_aplicado numeric;
  v_venta_pago uuid;
  v_venta_cuota uuid;
  v_vigente numeric;
  v_cubierto numeric;
BEGIN
  SELECT p.monto, p.anulado, p.venta_id INTO v_monto_pago, v_pago_anulado, v_venta_pago
  FROM public.pago p WHERE p.id = NEW.pago_id;

  SELECT c.monto_vigente, c.venta_id INTO v_vigente, v_venta_cuota
  FROM public.cuota c WHERE c.id = NEW.cuota_id;

  IF v_venta_pago IS DISTINCT FROM v_venta_cuota THEN
    RAISE EXCEPTION 'La cuota no pertenece a la venta del pago.';
  END IF;

  IF NOT NEW.anulado THEN
    SELECT coalesce(sum(pa.monto_aplicado), 0) INTO v_aplicado
    FROM public.pago_aplicacion pa
    WHERE pa.pago_id = NEW.pago_id AND NOT pa.anulado AND pa.id <> NEW.id;

    IF v_aplicado + NEW.monto_aplicado > v_monto_pago + 0.005 THEN
      RAISE EXCEPTION 'La suma aplicada (%) supera el monto del pago (%).', v_aplicado + NEW.monto_aplicado, v_monto_pago;
    END IF;

    SELECT coalesce(sum(pa.monto_aplicado), 0) INTO v_cubierto
    FROM public.pago_aplicacion pa
    JOIN public.pago p ON p.id = pa.pago_id
    WHERE pa.cuota_id = NEW.cuota_id AND NOT pa.anulado AND NOT p.anulado AND pa.id <> NEW.id;

    IF NOT v_pago_anulado AND v_cubierto + NEW.monto_aplicado > v_vigente + 0.005 THEN
      RAISE EXCEPTION 'El monto aplicado supera el saldo de la cuota (saldo %).', v_vigente - v_cubierto;
    END IF;
  END IF;

  RETURN NEW;
END $$;
CREATE TRIGGER pago_aplicacion_valida BEFORE INSERT OR UPDATE ON public.pago_aplicacion FOR EACH ROW EXECUTE FUNCTION public.fn_valida_aplicacion();

CREATE OR REPLACE FUNCTION public.fn_valida_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aplicado numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.monto <> OLD.monto THEN
    SELECT coalesce(sum(pa.monto_aplicado), 0) INTO v_aplicado
    FROM public.pago_aplicacion pa WHERE pa.pago_id = NEW.id AND NOT pa.anulado;
    IF v_aplicado > NEW.monto + 0.005 THEN
      RAISE EXCEPTION 'El pago ya tiene % aplicado, no puede reducirse a %.', v_aplicado, NEW.monto;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pago_valida BEFORE INSERT OR UPDATE ON public.pago FOR EACH ROW EXECUTE FUNCTION public.fn_valida_pago();

CREATE OR REPLACE VIEW public.cuota_estado
WITH (security_invoker = true) AS
SELECT
  c.id AS cuota_id,
  c.monto_vigente,
  coalesce(pa.total, 0) AS monto_pagado,
  c.monto_vigente - coalesce(pa.total, 0) AS saldo,
  CASE
    WHEN c.monto_vigente - coalesce(pa.total, 0) <= 0 THEN 'pagada'
    WHEN coalesce(pa.total, 0) > 0 THEN 'parcial'
    ELSE 'pendiente'
  END AS estado,
  (c.fecha_vencimiento < CURRENT_DATE AND c.monto_vigente - coalesce(pa.total, 0) > 0) AS vencida
FROM public.cuota c
LEFT JOIN LATERAL (
  SELECT sum(a.monto_aplicado) AS total
  FROM public.pago_aplicacion a
  JOIN public.pago p ON p.id = a.pago_id
  WHERE a.cuota_id = c.id AND NOT a.anulado AND NOT p.anulado
) pa ON true
WHERE NOT c.anulado;

GRANT SELECT ON public.cuota_estado TO authenticated;
GRANT ALL ON public.cuota_estado TO service_role;

CREATE OR REPLACE VIEW public.lote_estado
WITH (security_invoker = true) AS
SELECT
  l.id AS lote_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.venta v WHERE v.lote_id = l.id AND NOT v.anulado) THEN 'vendido'
    WHEN EXISTS (SELECT 1 FROM public.reserva r WHERE r.lote_id = l.id AND NOT r.anulado AND r.fecha_limite >= CURRENT_DATE) THEN 'apartado'
    ELSE 'disponible'
  END AS estado,
  (
    SELECT sum(GREATEST(ce.saldo, 0))
    FROM public.venta v
    JOIN public.cuota c ON c.venta_id = v.id AND NOT c.anulado
    JOIN public.cuota_estado ce ON ce.cuota_id = c.id
    WHERE v.lote_id = l.id AND NOT v.anulado
  ) AS saldo_pendiente
FROM public.lote l
WHERE NOT l.anulado;

GRANT SELECT ON public.lote_estado TO authenticated;
GRANT ALL ON public.lote_estado TO service_role;
