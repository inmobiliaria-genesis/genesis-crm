REVOKE EXECUTE ON FUNCTION public.fn_pago_cobro_vendedor() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_comision_gasto() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION private.sync_cobro_vendedor(uuid) FROM anon, authenticated, public;