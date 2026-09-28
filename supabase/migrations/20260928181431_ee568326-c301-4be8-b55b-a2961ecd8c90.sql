ALTER FUNCTION public.motivo_no_revertir(uuid) SECURITY INVOKER;
ALTER FUNCTION public.revertir_desistimiento(uuid, text) SET SCHEMA private;
ALTER FUNCTION private.revertir_desistimiento(uuid, text) RENAME TO revertir_desistimiento_impl;
REVOKE ALL ON FUNCTION private.revertir_desistimiento_impl(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.revertir_desistimiento_impl(uuid, text) TO authenticated;
CREATE FUNCTION public.revertir_desistimiento(_id uuid, _motivo text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT private.revertir_desistimiento_impl(_id, _motivo)
$$;
REVOKE ALL ON FUNCTION public.revertir_desistimiento(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revertir_desistimiento(uuid, text) TO authenticated;