
ALTER TABLE public.lead DROP CONSTRAINT IF EXISTS lead_origen_lead_check;
ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_origen_lead_chk;
ALTER TABLE public.venta DROP CONSTRAINT IF EXISTS venta_origen_lead_chk;
ALTER TABLE public.venta DROP CONSTRAINT IF EXISTS venta_origen_check;

ALTER TABLE public.lead RENAME COLUMN origen_lead TO fuente;
ALTER TABLE public.cliente RENAME COLUMN origen_lead TO fuente;
ALTER TABLE public.venta RENAME COLUMN origen_lead TO fuente;

ALTER TABLE public.lead ADD COLUMN origen text;
ALTER TABLE public.cliente ADD COLUMN origen text;
ALTER TABLE public.cliente ADD COLUMN promotor_id uuid REFERENCES public.vendedor(id);

-- Migración de datos
UPDATE public.lead SET fuente = 'otros' WHERE fuente = 'otro';
UPDATE public.cliente SET fuente = 'otros' WHERE fuente = 'otro';
UPDATE public.venta SET fuente = 'otros' WHERE fuente = 'otro';
UPDATE public.lead SET origen = 'marketing', promotor_id = NULL WHERE fuente IS NOT NULL;
UPDATE public.cliente SET origen = 'marketing' WHERE fuente IS NOT NULL;
UPDATE public.venta SET origen = 'marketing', promotor_id = NULL WHERE fuente IS NOT NULL;
UPDATE public.venta SET fuente = 'otros' WHERE origen = 'marketing' AND fuente IS NULL;
UPDATE public.lead SET origen = 'promotor' WHERE origen IS NULL AND promotor_id IS NOT NULL;

ALTER TABLE public.venta ADD CONSTRAINT venta_origen_check CHECK (origen IN ('promotor','marketing','sin_dato'));
ALTER TABLE public.venta ADD CONSTRAINT venta_sin_dato_importada CHECK (origen <> 'sin_dato' OR importada);
ALTER TABLE public.lead ADD CONSTRAINT lead_origen_check CHECK (origen IS NULL OR origen IN ('promotor','marketing'));
ALTER TABLE public.cliente ADD CONSTRAINT cliente_origen_check CHECK (origen IS NULL OR origen IN ('promotor','marketing'));
ALTER TABLE public.lead ADD CONSTRAINT lead_fuente_check CHECK (fuente IS NULL OR fuente IN ('facebook','instagram','tiktok','google','oficina','referido','otros'));
ALTER TABLE public.cliente ADD CONSTRAINT cliente_fuente_check CHECK (fuente IS NULL OR fuente IN ('facebook','instagram','tiktok','google','oficina','referido','otros'));
ALTER TABLE public.venta ADD CONSTRAINT venta_fuente_check CHECK (fuente IS NULL OR fuente IN ('facebook','instagram','tiktok','google','oficina','referido','otros'));

CREATE OR REPLACE FUNCTION public.fn_origen_lead_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.origen IS NULL OR NEW.origen = 'sin_dato' THEN
    NEW.fuente := NULL; NEW.promotor_id := NULL;
  ELSIF NEW.origen = 'promotor' THEN
    NEW.fuente := NULL;
  ELSIF NEW.origen = 'marketing' THEN
    NEW.promotor_id := NULL;
    IF NEW.fuente IS NULL THEN RAISE EXCEPTION 'Elige la fuente (origen Marketing).'; END IF;
  END IF;
  IF coalesce(NEW.fuente,'') <> 'referido' THEN NEW.referido_por_id := NULL; END IF;
  IF NEW.referido_por_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.referido_por_id IS DISTINCT FROM OLD.referido_por_id)
     AND NOT private.referido_valido(NEW.referido_por_id) THEN
    RAISE EXCEPTION 'No se encontró un cliente aprobado con este DNI';
  END IF;
  IF TG_TABLE_NAME = 'cliente' AND NEW.referido_por_id = NEW.id THEN
    RAISE EXCEPTION 'Un cliente no puede referirse a sí mismo.'; END IF;
  IF TG_TABLE_NAME = 'cliente' AND NEW.promotor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.promotor_id IS DISTINCT FROM OLD.promotor_id)
     AND NOT EXISTS (SELECT 1 FROM public.vendedor WHERE id = NEW.promotor_id AND tipo = 'promotor' AND NOT anulado) THEN
    RAISE EXCEPTION 'El promotor elegido no es válido.'; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_venta_lead_hereda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE l record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reserva_origen_id IS NOT NULL THEN
    SELECT le.* INTO l FROM public.reserva r JOIN public.lead le ON le.id = r.lead_id WHERE r.id = NEW.reserva_origen_id AND NOT le.anulado;
    IF FOUND AND l.origen IS NOT NULL THEN
      NEW.origen := l.origen;
      NEW.fuente := l.fuente;
      NEW.promotor_id := l.promotor_id;
      NEW.referido_por_id := l.referido_por_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
