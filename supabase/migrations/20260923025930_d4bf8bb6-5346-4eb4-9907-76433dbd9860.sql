CREATE OR REPLACE FUNCTION public.fn_lote_solo_residencial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tipo text;
BEGIN
  SELECT tipo INTO v_tipo FROM public.manzana WHERE id = NEW.manzana_id;
  IF v_tipo IS DISTINCT FROM 'residencial' THEN
    RAISE EXCEPTION 'La manzana seleccionada es de tipo mercado y no puede recibir lotes bajo el modelo de venta a plazos.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lote_solo_residencial
BEFORE INSERT OR UPDATE OF manzana_id ON public.lote
FOR EACH ROW EXECUTE FUNCTION public.fn_lote_solo_residencial();