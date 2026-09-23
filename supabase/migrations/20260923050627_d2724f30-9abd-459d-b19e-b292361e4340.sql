
CREATE OR REPLACE FUNCTION public.simular_cronograma(
  _precio_acordado numeric,
  _inicial numeric,
  _plazo_meses integer,
  _fecha_venta date,
  _fecha_primera_cuota date,
  _condicion text
)
RETURNS TABLE (numero integer, fecha_vencimiento date, monto numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_saldo numeric;
  v_base numeric;
  v_dia int;
  v_mes date;
  v_ultimo date;
  i int;
BEGIN
  IF _condicion = 'contado' THEN
    RETURN QUERY SELECT 0, _fecha_venta, _precio_acordado;
    RETURN;
  END IF;

  RETURN QUERY SELECT 0, _fecha_venta, _inicial;

  v_saldo := _precio_acordado - _inicial;
  v_base := round(v_saldo / _plazo_meses, 2);
  v_dia := extract(day FROM _fecha_primera_cuota)::int;

  FOR i IN 1.._plazo_meses LOOP
    v_mes := (date_trunc('month', _fecha_primera_cuota::timestamp) + ((i - 1) * interval '1 month'))::date;
    v_ultimo := (date_trunc('month', v_mes::timestamp) + interval '1 month' - interval '1 day')::date;
    RETURN QUERY SELECT
      i,
      least(v_mes + (v_dia - 1), v_ultimo),
      CASE WHEN i < _plazo_meses THEN v_base ELSE v_saldo - (v_base * (_plazo_meses - 1)) END;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.simular_cronograma(numeric, numeric, integer, date, date, text) TO authenticated;
