GRANT EXECUTE ON FUNCTION private.calc_devolucion(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.revertir_desistimiento_impl(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.mi_perfil_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.puede_cobrar() TO authenticated;
GRANT EXECUTE ON FUNCTION private.puede_comercial() TO authenticated;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure f FROM pg_proc p WHERE p.pronamespace='private'::regnamespace AND p.proname='soles_txt' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.f);
  END LOOP;
END $$;