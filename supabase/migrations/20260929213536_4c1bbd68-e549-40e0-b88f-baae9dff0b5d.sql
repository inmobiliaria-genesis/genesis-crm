DO $$
DECLARE src text;
BEGIN
  -- Comisión al crear la venta: usar solo fecha_venta
  SELECT pg_get_functiondef('public.fn_venta_comisiones()'::regprocedure) INTO src;
  src := replace(src,
    'private.config_vigente(''monto_comision'', coalesce(NEW.fecha_firma, NEW.fecha_venta))',
    'private.config_vigente(''monto_comision'', NEW.fecha_venta)');
  EXECUTE src;

  -- Reparto de la inicial: usar solo fecha_venta
  SELECT pg_get_functiondef('public.registrar_inicial(uuid,text,text,text,text)'::regprocedure) INTO src;
  src := replace(src,
    'private.config_vigente(''monto_comision'', coalesce(v.fecha_firma, v.fecha_venta))',
    'private.config_vigente(''monto_comision'', v.fecha_venta)');
  EXECUTE src;
END $$;